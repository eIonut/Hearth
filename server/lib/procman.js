import fs from 'fs';
import { spawn } from 'child_process';
import { read, write } from './store.js';

const MAX_LINES = 800;
const MAX_AUTO_RESTARTS = 3;
const STATE = 'servicestate';
const procs = new Map(); // key -> { child, lines, running, exitCode, startedAt, stoppedByUser, crashed, restarts }

function key(projectId, service) {
  return `${projectId}::${service}`;
}

// A service name could in principle contain "::", the project id cannot.
function splitKey(k) {
  const at = k.indexOf('::');
  return [k.slice(0, at), k.slice(at + 2)];
}

// Recording stops while the hub itself is shutting down: stopAll() would
// otherwise walk the list and erase exactly the record we need to restore from.
// start() switches it back on — anything starting a service means we are live
// again, so the flag can never get stuck off.
let recording = true;

function persist() {
  if (!recording) return;
  const running = [...procs.entries()].filter(([, e]) => e.running).map(([k]) => k);
  write(STATE, { running, updatedAt: Date.now() });
}

function pushLines(entry, chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line === '') continue;
    entry.lines.push(line);
  }
  if (entry.lines.length > MAX_LINES) {
    entry.lines.splice(0, entry.lines.length - MAX_LINES);
  }
}

function start(project, service, _restarts = 0) {
  recording = true;
  const k = key(project.id, service.name);
  const existing = procs.get(k);
  if (existing && existing.running) return { ok: true, alreadyRunning: true };

  const entry = {
    child: null,
    // keep previous log history when auto-restarting
    lines: _restarts > 0 && existing ? existing.lines : [],
    running: true,
    exitCode: null,
    startedAt: Date.now(),
    stoppedByUser: false,
    crashed: false,
    restarts: _restarts,
  };
  entry.lines.push(`$ ${service.cmd}  (cwd: ${project.path})`);

  let child;
  try {
    child = spawn(service.cmd, {
      cwd: project.path,
      shell: true,
      detached: true,
      env: process.env,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  entry.child = child;
  child.stdout.on('data', (d) => pushLines(entry, d));
  child.stderr.on('data', (d) => pushLines(entry, d));
  child.on('error', (err) => {
    entry.running = false;
    entry.crashed = true;
    entry.lines.push(`[hearth] failed to start: ${err.message}`);
  });
  child.on('exit', (code) => {
    entry.running = false;
    entry.exitCode = code;
    entry.crashed = !entry.stoppedByUser && code !== 0 && code !== null;
    entry.lines.push(`[hearth] process exited with code ${code}${entry.crashed ? ' (crash)' : ''}`);
    persist();

    if (entry.crashed && service.autoRestart && entry.restarts < MAX_AUTO_RESTARTS) {
      const next = entry.restarts + 1;
      entry.lines.push(`[hearth] auto-restarting in 2s (${next}/${MAX_AUTO_RESTARTS})…`);
      setTimeout(() => {
        const cur = procs.get(k);
        // don't restart if the user started/stopped it manually in the meantime
        if (cur === entry && !cur.running && !cur.stoppedByUser) {
          start(project, service, next);
        }
      }, 2000);
    }
  });

  procs.set(k, entry);
  persist();
  return { ok: true };
}

function stop(projectId, serviceName) {
  const k = key(projectId, serviceName);
  const entry = procs.get(k);
  if (!entry) return { ok: true, wasRunning: false };
  entry.stoppedByUser = true;
  entry.crashed = false; // stopping acknowledges a crash
  if (!entry.running) {
    persist();
    return { ok: true, wasRunning: false };
  }
  try {
    // negative pid kills the whole process group (yarn + its children)
    process.kill(-entry.child.pid, 'SIGTERM');
  } catch {
    try {
      entry.child.kill('SIGTERM');
    } catch {
      /* process already gone */
    }
  }
  return { ok: true, wasRunning: true };
}

function status() {
  const out = {};
  for (const [k, entry] of procs.entries()) {
    out[k] = {
      running: entry.running,
      exitCode: entry.exitCode,
      startedAt: entry.startedAt,
      crashed: entry.crashed,
      restarts: entry.restarts,
    };
  }
  return out;
}

function logs(projectId, serviceName) {
  const entry = procs.get(key(projectId, serviceName));
  if (!entry) return { lines: [], running: false, exitCode: null, crashed: false };
  return {
    lines: entry.lines,
    running: entry.running,
    exitCode: entry.exitCode,
    crashed: entry.crashed,
  };
}

// Shutdown path. The snapshot is taken first and recording is switched off, so
// what gets written is "what was running when the hub went down" rather than
// the empty set stopAll() is about to produce.
function stopAll() {
  // Only if something actually ran this session. A hub that booted, touched no
  // services, and shut down must not overwrite the previous snapshot with an
  // empty list — that is exactly what happens when auto-restart is switched
  // off, and it would silently destroy the record it is meant to preserve.
  if (procs.size) persist();
  recording = false;
  for (const [k] of procs.entries()) {
    const [projectId, serviceName] = splitKey(k);
    stop(projectId, serviceName);
  }
}

// Bring back the services that were up when the hub last went down. Anything
// whose project, service definition, or folder has since disappeared is skipped
// with a reason rather than failing the boot.
function restore() {
  const { running = [] } = read(STATE, {});
  const restored = [];
  const skipped = [];
  if (!running.length) return { restored, skipped };

  const projects = read('projects');
  for (const k of running) {
    const [projectId, serviceName] = splitKey(k);
    const project = projects.find((p) => p.id === projectId);
    const service = (project?.services || []).find((s) => s.name === serviceName);

    if (!project) {
      skipped.push({ key: k, reason: 'project no longer exists' });
      continue;
    }
    if (!service) {
      skipped.push({ key: k, reason: `service "${serviceName}" is no longer defined` });
      continue;
    }
    if (!fs.existsSync(project.path)) {
      skipped.push({ key: k, reason: `project folder is missing: ${project.path}` });
      continue;
    }

    const result = start(project, service);
    if (result.ok) {
      procs.get(key(projectId, serviceName))?.lines.push('[hearth] restored after hub restart');
      restored.push(k);
    } else {
      skipped.push({ key: k, reason: result.error });
    }
  }
  return { restored, skipped };
}

export { start, stop, status, logs, stopAll, restore, key };
