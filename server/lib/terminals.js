import { WebSocketServer } from 'ws';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let pty = null;
let ptyVersion = null;
let helperInfo = [];

// Find every spawn-helper binary anywhere inside the node-pty package
// (1.0.0 kept it in build/Release, 1.1.0 ships it in prebuilds/<platform>/).
function findSpawnHelpers(dir) {
  const found = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === 'spawn-helper') found.push(p);
    }
  }
  return found;
}

try {
  pty = require('node-pty');
  try {
    const ptyDir = path.dirname(require.resolve('node-pty/package.json'));
    ptyVersion = require('node-pty/package.json').version;
    // "posix_spawnp failed" on macOS is almost always the spawn-helper binary
    // being non-executable, quarantined, or badly signed. Repair all of that.
    for (const helper of findSpawnHelpers(ptyDir)) {
      try {
        fs.chmodSync(helper, 0o755);
      } catch {
        /* chmod best-effort */
      }
      if (process.platform === 'darwin') {
        try {
          execFileSync('xattr', ['-d', 'com.apple.quarantine', helper], { stdio: 'ignore' });
        } catch {
          /* quarantine attr may be absent */
        }
        try {
          execFileSync('codesign', ['--force', '--sign', '-', helper], { stdio: 'ignore' });
        } catch {
          /* codesign best-effort */
        }
      }
      const mode = fs.statSync(helper).mode;
      helperInfo.push({ path: helper, executable: !!(mode & 0o100) });
    }
    if (helperInfo.length === 0) {
      console.warn(
        '[dev-hub] node-pty is installed but no spawn-helper binary was found — terminals will fail. Run: npm rebuild node-pty --build-from-source',
      );
    }
  } catch {
    /* spawn-helper diagnostics best-effort */
  }
} catch {
  console.warn('[dev-hub] node-pty not installed — embedded terminals disabled.');
}

function expandHome(p) {
  if (typeof p === 'string' && (p === '~' || p.startsWith('~/'))) {
    return os.homedir() + p.slice(1);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Session registry
//
// A pty outlives the WebSocket that opened it. Closing the browser tab (or
// refreshing) detaches the socket and leaves the shell running, so the user
// comes back to the same shell with its scrollback, its `cd`s, and whatever
// long-running process they left in it. A shell dies only when the user closes
// the tab, the shell exits, the idle reaper collects it, or the server stops.
//
// The cost of that is sessions nothing references anymore, so every session is
// enumerable via listSessions() and killable by id — see routes/terminals.js.
// ---------------------------------------------------------------------------

const sessions = new Map();

const MAX_SESSIONS = 20;
const BUFFER_BYTES = 256 * 1024; // replayed to the client on reattach
const IDLE_REAP_MS = 24 * 60 * 60 * 1000;
const REAP_INTERVAL_MS = 5 * 60 * 1000;
const KILL_ESCALATE_MS = 3000;

// Foreground process names that mean "sitting at a prompt, doing nothing".
// Anything else is real work and is never reaped on a timer.
const PROMPT_SHELLS = new Set(['zsh', 'bash', 'sh', 'fish', 'ksh', 'dash', 'tcsh', 'csh']);

// node-pty reports the pty's foreground process; login shells show up as "-zsh".
function foregroundName(session) {
  try {
    const raw = (session.term.process || '').trim();
    return raw ? path.basename(raw.replace(/^-/, '')) : '';
  } catch {
    return ''; // process is a getter over the tty — it throws once the pty is gone
  }
}

function isAtPrompt(session) {
  const name = foregroundName(session);
  return name === '' || PROMPT_SHELLS.has(name);
}

// Scrollback ring. Trimming drops whole chunks first, then cuts the survivor at
// a newline so we're less likely to replay a half-eaten escape sequence.
function pushOutput(session, text) {
  session.buffer.push(text);
  session.bufferBytes += text.length;
  session.lastActivity = Date.now();

  while (session.bufferBytes > BUFFER_BYTES && session.buffer.length > 1) {
    session.bufferBytes -= session.buffer.shift().length;
  }
  if (session.bufferBytes > BUFFER_BYTES) {
    const only = session.buffer[0];
    let cut = only.length - BUFFER_BYTES;
    const nl = only.indexOf('\n', cut);
    if (nl !== -1) cut = nl + 1;
    session.buffer[0] = only.slice(cut);
    session.bufferBytes = session.buffer[0].length;
  }
}

function send(session, text) {
  if (!session.ws) return;
  try {
    session.ws.send(text);
  } catch {
    /* client socket gone — the buffer still has it for the next attach */
  }
}

// Notices are written into the scrollback rather than straight to the socket so
// they survive a reattach, like anything else the shell printed.
function notify(session, text) {
  pushOutput(session, text);
  send(session, text);
}

function listSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    label: s.label,
    cwd: s.cwd,
    attached: !!s.ws,
    foreground: foregroundName(s),
    atPrompt: isAtPrompt(s),
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
    detachedAt: s.detachedAt,
  }));
}

// Every process descended from the shell, deepest included.
//
// Killing the shell's process group is NOT enough: an interactive shell with
// job control puts each background job in its own process group, so `sleep 30 &`
// survives a kill(-shellpid) and ends up reparented to launchd — the invisible
// orphan this whole design is meant to prevent. Walking ppid catches those.
// (macOS pgrep has no -s, and `ps -o sess=` reports 0, so session id is out.)
function descendantPids(rootPid) {
  let out;
  try {
    out = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const children = new Map();
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    const [pid, ppid] = [Number(m[1]), Number(m[2])];
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }

  const found = [];
  const seen = new Set([rootPid]);
  const stack = [rootPid];
  while (stack.length) {
    for (const child of children.get(stack.pop()) || []) {
      if (seen.has(child)) continue;
      seen.add(child);
      found.push(child);
      stack.push(child);
    }
  }
  return found;
}

function signalAll(pids, signal) {
  for (const pid of pids) {
    if (pid <= 1 || pid === process.pid) continue;
    try {
      process.kill(pid, signal);
    } catch {
      /* already exited */
    }
  }
}

function killSession(id, { escalateMs = KILL_ESCALATE_MS } = {}) {
  const session = sessions.get(id);
  if (!session) return false;
  sessions.delete(id);
  session.alive = false;

  const pid = session.term.pid;
  // Snapshot before signalling — after the shell dies its children are
  // reparented and the ppid trail to them is gone.
  const tree = [pid, ...descendantPids(pid)];

  // SIGHUP first: it's the "your terminal went away" signal a job-control shell
  // is built to handle, and it tears down jobs the way the shell wants to.
  // SIGTERM next for everything else — an interactive zsh ignores it outright,
  // which is why the SIGKILL escalation below is load-bearing, not a formality.
  signalAll(tree, 'SIGHUP');
  signalAll(tree, 'SIGTERM');
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    /* group may already be gone */
  }
  setTimeout(() => signalAll(tree, 'SIGKILL'), escalateMs).unref();

  if (session.ws) {
    try {
      session.ws.close();
    } catch {
      /* socket may already be closed */
    }
  }
  return true;
}

// On shutdown the caller is about to exit, so the escalation window is short —
// the default 3s would never elapse before process.exit. See SHUTDOWN_GRACE_MS.
function killAll({ escalateMs = KILL_ESCALATE_MS } = {}) {
  for (const id of [...sessions.keys()]) killSession(id, { escalateMs });
}

// How long index.js should stay alive after killAll() so the SIGKILL lands.
const SHUTDOWN_GRACE_MS = 600;
const SHUTDOWN_ESCALATE_MS = 400;

// Only collects shells that are detached, parked at a prompt, and quiet. A
// session running anything at all is left alone and surfaced in the UI instead:
// reaping someone's build is far worse than keeping an idle shell around.
function reapIdle(now = Date.now()) {
  const reaped = [];
  for (const session of [...sessions.values()]) {
    if (session.ws) continue;
    if (now - (session.detachedAt || now) < IDLE_REAP_MS) continue;
    if (now - session.lastActivity < IDLE_REAP_MS) continue;
    if (!isAtPrompt(session)) continue;
    killSession(session.id);
    reaped.push(session.id);
  }
  return reaped;
}

const reapTimer = setInterval(() => reapIdle(), REAP_INTERVAL_MS);
reapTimer.unref();

function pickShell() {
  const candidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/sh',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* stat may fail — try next candidate */
    }
  }
  return null;
}

function spawnPty(shellPath, args, cwd) {
  return pty.spawn(shellPath, args, {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' },
  });
}

// Try a quick spawn and report whether it works. Used by /api/termdiag.
function spawnTest(cmd, args, cwd) {
  return new Promise((resolve) => {
    if (!pty) return resolve({ ok: false, error: 'node-pty not installed' });
    let done = false;
    try {
      const t = spawnPty(cmd, args, cwd);
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          try {
            t.kill();
          } catch {
            /* probe cleanup */
          }
          resolve({ ok: true, note: 'spawned ok' });
        }
      }, 1500);
      t.onExit(({ exitCode }) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve({ ok: true, exitCode });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

async function diagnose(rawCwd) {
  const home = os.homedir();
  const cwd = expandHome(rawCwd) || null;
  const shell = pickShell();

  const out = {
    node: process.version,
    arch: process.arch,
    platform: process.platform,
    execPath: process.execPath,
    shell,
    SHELL_env: process.env.SHELL || null,
    ptyInstalled: !!pty,
    ptyVersion,
    spawnHelpers: helperInfo,
    home,
  };

  if (!pty) return out;

  out.spawn_true_in_home = await spawnTest('/usr/bin/true', [], home);
  out.spawn_shell_in_home = await spawnTest(shell, ['-c', 'exit 0'], home);

  if (cwd) {
    out.cwd = cwd;
    out.cwd_exists = fs.existsSync(cwd);
    if (out.cwd_exists) {
      try {
        fs.accessSync(cwd, fs.constants.R_OK | fs.constants.X_OK);
        out.cwd_accessible = true;
      } catch (e) {
        out.cwd_accessible = false;
        out.cwd_access_error = e.message;
      }
      out.spawn_shell_in_cwd = await spawnTest(shell, ['-c', 'exit 0'], cwd);
    }
  }

  return out;
}

// Spawns a shell and registers it. Returns { session } or { error } — the
// caller owns telling the client, since at spawn time nobody is attached yet.
function createSession({ id, cwd: rawCwd, cmd, label }) {
  const home = process.env.HOME || os.homedir();
  let cwd = expandHome(rawCwd) || home;
  const notices = [];

  if (!fs.existsSync(cwd)) {
    notices.push(`\r\n[dev-hub] folder not found: ${cwd} — opening in home folder instead.\r\n`);
    cwd = home;
  }

  const shell = pickShell();
  if (!shell) return { error: '\r\n[dev-hub] no usable shell found on this system.\r\n' };

  // Attempt ladder: preferred shell in requested cwd, then fallbacks,
  // then the same ladder in the home folder so the user at least gets a shell.
  const attempts = [
    { cmd: shell, args: ['-l'], dir: cwd },
    { cmd: shell, args: [], dir: cwd },
    { cmd: '/bin/sh', args: [], dir: cwd },
  ];
  if (cwd !== home) {
    attempts.push(
      { cmd: shell, args: ['-l'], dir: home, fallback: true },
      { cmd: '/bin/sh', args: [], dir: home, fallback: true },
    );
  }

  let term = null;
  const errors = [];
  for (const a of attempts) {
    try {
      term = spawnPty(a.cmd, a.args, a.dir);
      if (a.fallback) {
        notices.push(
          `\r\n[dev-hub] could not start a shell inside ${cwd} — opened in your home folder instead. Run: cd ${cwd}\r\n\r\n`,
        );
      }
      break;
    } catch (e) {
      errors.push(`${a.cmd} in ${a.dir}: ${e.message}`);
    }
  }

  if (!term) {
    return {
      error:
        `\r\n[dev-hub] could not spawn any shell.\r\n` +
        errors.map((e) => `  · ${e}`).join('\r\n') +
        '\r\n' +
        `\r\nnode ${process.version} (${process.arch}) · node-pty ${ptyVersion || '?'} · helpers found: ${helperInfo.length}\r\n` +
        `Try, in the dev-hub folder:  npm rebuild node-pty --build-from-source\r\n` +
        `(needs Xcode Command Line Tools: xcode-select --install)\r\n` +
        `Then restart. Diagnostics: http://localhost:5001/api/termdiag?cwd=${encodeURIComponent(cwd)}\r\n`,
    };
  }

  const now = Date.now();
  const session = {
    id,
    label: label || '',
    cwd,
    term,
    ws: null,
    buffer: [],
    bufferBytes: 0,
    alive: true,
    createdAt: now,
    lastActivity: now,
    detachedAt: now,
  };
  sessions.set(id, session);

  // Bound to the session, not to a socket: output keeps filling the scrollback
  // while nobody is attached, and reaches whoever attaches next.
  term.onData((d) => {
    const text = d.toString();
    pushOutput(session, text);
    send(session, text);
  });

  term.onExit(({ exitCode }) => {
    session.alive = false;
    sessions.delete(id);
    notify(session, `\r\n[dev-hub] shell exited (code ${exitCode}).\r\n`);
    if (session.ws) {
      try {
        session.ws.close();
      } catch {
        /* socket may already be closed */
      }
    }
  });

  for (const n of notices) pushOutput(session, n);

  if (cmd) {
    // Give the login shell a moment to print its prompt so the typed command
    // reads cleanly, then submit it as if the user had entered it.
    setTimeout(() => {
      try {
        term.write(cmd + '\r');
      } catch {
        /* terminal may already be gone */
      }
    }, 300);
  }

  return { session };
}

function attachSocket(session, ws) {
  // A second window opening the same tab takes over; the loser's close handler
  // is guarded below so it can't detach the winner.
  if (session.ws && session.ws !== ws) {
    try {
      session.ws.close();
    } catch {
      /* already closing */
    }
  }
  session.ws = ws;
  session.detachedAt = null;

  if (session.buffer.length) {
    try {
      ws.send(session.buffer.join(''));
    } catch {
      /* socket died between connect and replay */
    }
  }

  ws.on('message', (msg) => {
    const s = msg.toString();
    if (s.startsWith('\x00resize:')) {
      const [cols, rows] = s.slice(8).split(',').map(Number);
      if (cols > 0 && rows > 0) {
        try {
          session.term.resize(cols, rows);
        } catch {
          /* resize best-effort */
        }
      }
      return;
    }
    try {
      session.term.write(s);
    } catch {
      /* shell exited under us */
    }
  });

  // Detach, don't kill. This is the whole point: the shell keeps running.
  ws.on('close', () => {
    if (session.ws === ws) {
      session.ws = null;
      session.detachedAt = Date.now();
    }
  });
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/term' });

  wss.on('connection', (ws, req) => {
    if (!pty) {
      ws.send(
        '\r\n[dev-hub] node-pty is not installed.\r\nRun: npm install node-pty  (needs Xcode Command Line Tools on macOS)\r\n',
      );
      ws.close();
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    if (!id) {
      ws.send('\r\n[dev-hub] terminal session id missing.\r\n');
      ws.close();
      return;
    }

    const existing = sessions.get(id);
    if (existing && existing.alive) {
      attachSocket(existing, ws);
      return;
    }

    if (sessions.size >= MAX_SESSIONS) {
      ws.send(
        `\r\n[dev-hub] too many open terminals (${MAX_SESSIONS}). Close one, or kill an orphaned session from the Sessions list.\r\n`,
      );
      ws.close();
      return;
    }

    // Optional command to auto-run once the shell is up (used by project
    // templates / one-click scaffolding). Written as one line so a chained
    // "a && b && c" sequences correctly and interactive steps can read the tty.
    const { session, error } = createSession({
      id,
      cwd: url.searchParams.get('cwd'),
      cmd: url.searchParams.get('cmd'),
      label: url.searchParams.get('label'),
    });

    if (error) {
      ws.send(error);
      ws.close();
      return;
    }

    // The client asked to resume a session the server no longer has (a hub
    // restart, or the reaper). Say so, so a reborn shell is never mistaken for
    // the one you left running.
    if (url.searchParams.get('resume')) {
      pushOutput(session, '\r\n[dev-hub] the previous session ended — this is a fresh shell.\r\n');
    }

    attachSocket(session, ws);
  });
}

export {
  attach,
  diagnose,
  listSessions,
  killSession,
  killAll,
  reapIdle,
  createSession,
  pushOutput,
  sessions,
  MAX_SESSIONS,
  BUFFER_BYTES,
  SHUTDOWN_GRACE_MS,
  SHUTDOWN_ESCALATE_MS,
};
export const available = () => !!pty;
