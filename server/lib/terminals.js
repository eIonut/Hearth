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
    const home = process.env.HOME || os.homedir();
    let cwd = expandHome(url.searchParams.get('cwd')) || home;

    if (!fs.existsSync(cwd)) {
      ws.send(`\r\n[dev-hub] folder not found: ${cwd} — opening in home folder instead.\r\n`);
      cwd = home;
    }

    const shell = pickShell();
    if (!shell) {
      ws.send('\r\n[dev-hub] no usable shell found on this system.\r\n');
      ws.close();
      return;
    }

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
          ws.send(
            `\r\n[dev-hub] could not start a shell inside ${cwd} — opened in your home folder instead. Run: cd ${cwd}\r\n\r\n`,
          );
        }
        break;
      } catch (e) {
        errors.push(`${a.cmd} in ${a.dir}: ${e.message}`);
      }
    }

    if (!term) {
      ws.send(
        `\r\n[dev-hub] could not spawn any shell.\r\n` +
          errors.map((e) => `  · ${e}`).join('\r\n') +
          '\r\n' +
          `\r\nnode ${process.version} (${process.arch}) · node-pty ${ptyVersion || '?'} · helpers found: ${helperInfo.length}\r\n` +
          `Try, in the dev-hub folder:  npm rebuild node-pty --build-from-source\r\n` +
          `(needs Xcode Command Line Tools: xcode-select --install)\r\n` +
          `Then restart. Diagnostics: http://localhost:5001/api/termdiag?cwd=${encodeURIComponent(cwd)}\r\n`,
      );
      ws.close();
      return;
    }

    term.onData((d) => {
      try {
        ws.send(d);
      } catch {
        /* client socket gone */
      }
    });
    term.onExit(() => {
      try {
        ws.close();
      } catch {
        /* socket may already be closed */
      }
    });

    ws.on('message', (msg) => {
      const s = msg.toString();
      if (s.startsWith('\x00resize:')) {
        const [cols, rows] = s.slice(8).split(',').map(Number);
        if (cols > 0 && rows > 0) {
          try {
            term.resize(cols, rows);
          } catch {
            /* resize best-effort */
          }
        }
        return;
      }
      term.write(s);
    });

    ws.on('close', () => {
      try {
        term.kill();
      } catch {
        /* terminal may have already exited */
      }
    });
  });
}

export { attach, diagnose };
export const available = () => !!pty;
