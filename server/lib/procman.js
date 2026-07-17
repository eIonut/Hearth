const { spawn } = require('child_process');

const MAX_LINES = 800;
const procs = new Map(); // key -> { child, lines, running, exitCode, startedAt }

function key(projectId, service) {
  return `${projectId}::${service}`;
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

function start(project, service) {
  const k = key(project.id, service.name);
  const existing = procs.get(k);
  if (existing && existing.running) return { ok: true, alreadyRunning: true };

  const entry = {
    child: null,
    lines: [`$ ${service.cmd}  (cwd: ${project.path})`],
    running: true,
    exitCode: null,
    startedAt: Date.now(),
  };

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
    entry.lines.push(`[dev-hub] failed to start: ${err.message}`);
  });
  child.on('exit', (code) => {
    entry.running = false;
    entry.exitCode = code;
    entry.lines.push(`[dev-hub] process exited with code ${code}`);
  });

  procs.set(k, entry);
  return { ok: true };
}

function stop(projectId, serviceName) {
  const k = key(projectId, serviceName);
  const entry = procs.get(k);
  if (!entry || !entry.running) return { ok: true, wasRunning: false };
  try {
    // negative pid kills the whole process group (yarn + its children)
    process.kill(-entry.child.pid, 'SIGTERM');
  } catch {
    try { entry.child.kill('SIGTERM'); } catch {}
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
    };
  }
  return out;
}

function logs(projectId, serviceName) {
  const entry = procs.get(key(projectId, serviceName));
  if (!entry) return { lines: [], running: false, exitCode: null };
  return { lines: entry.lines, running: entry.running, exitCode: entry.exitCode };
}

function stopAll() {
  for (const [k] of procs.entries()) {
    const [projectId, serviceName] = k.split('::');
    stop(projectId, serviceName);
  }
}

module.exports = { start, stop, status, logs, stopAll, key };
