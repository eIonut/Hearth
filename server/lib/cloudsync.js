import fs from 'fs';
import os from 'os';
import path from 'path';
import { MANIFEST } from './sync.js';
import { ValidationError } from './errors.js';

// A "cloud folder" is just a normal directory that a sync daemon
// (iCloud/Dropbox/OneDrive/Drive) already replicates. The app never talks to
// any cloud API — it writes files here and the OS does the rest. That keeps the
// "nothing leaves your machine unless you point it somewhere" promise.

const home = os.homedir();

// Well-known local mount points for the common providers. Each is offered only
// if it actually exists on disk.
const CANDIDATES = [
  {
    provider: 'iCloud Drive',
    dir: path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs'),
  },
  { provider: 'Dropbox', dir: path.join(home, 'Dropbox') },
  { provider: 'OneDrive', dir: process.env.OneDrive || path.join(home, 'OneDrive') },
  { provider: 'Google Drive', dir: path.join(home, 'Library/CloudStorage') },
];

function detect() {
  const found = [];
  for (const c of CANDIDATES) {
    try {
      if (c.dir && fs.statSync(c.dir).isDirectory()) found.push(c);
    } catch {
      /* not present on this machine */
    }
  }
  return found;
}

// Where the bundle lives inside the chosen cloud folder.
function bundleDir(dir) {
  return path.join(dir, 'dev-hub');
}

// Atomic write: write to a temp file, then rename over the target. Same-
// directory rename is atomic, so the sync daemon never uploads a half-written
// file.
function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// Write the collected files + a manifest into the cloud folder.
function push(dir, files, manifest) {
  if (!dir) throw new ValidationError('no cloud folder configured');
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    throw new ValidationError(`cloud folder does not exist: ${dir}`);
  }
  if (!stat.isDirectory()) throw new ValidationError(`not a folder: ${dir}`);

  const out = bundleDir(dir);
  fs.mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    atomicWrite(path.join(out, name + '.json'), content);
  }
  atomicWrite(path.join(out, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return { dir: out, files: Object.keys(files) };
}

// Report what's sitting in the cloud folder, and flag provider "conflicted
// copy" siblings (created when two machines wrote at once) so the UI can warn
// rather than silently ignore them.
function status(dir) {
  if (!dir) return { configured: false };
  const out = bundleDir(dir);
  const result = { configured: true, dir: out, exists: false, conflicts: [] };
  let entries;
  try {
    entries = fs.readdirSync(out);
  } catch {
    return result; // folder chosen but nothing written yet (or not synced down)
  }
  const manifestPath = path.join(out, MANIFEST);
  if (fs.existsSync(manifestPath)) {
    result.exists = true;
    try {
      result.manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      /* manifest unreadable — treat as bare files */
    }
  }
  // iCloud/Dropbox name conflict copies like "notes (conflicted copy).json" or
  // "notes (Ion's MacBook conflicted copy 2026-07-19).json".
  result.conflicts = entries.filter((e) => /conflicted copy/i.test(e));
  return result;
}

// Read the bundle back out for a restore. Returns name → JSON text.
function pull(dir) {
  const out = bundleDir(dir);
  let entries;
  try {
    entries = fs.readdirSync(out);
  } catch {
    throw new ValidationError(`no backup found in ${out}`);
  }
  const files = {};
  for (const e of entries) {
    if (!e.endsWith('.json') || e === MANIFEST) continue;
    if (/conflicted copy/i.test(e)) continue;
    files[e.replace(/\.json$/, '')] = fs.readFileSync(path.join(out, e), 'utf8');
  }
  if (Object.keys(files).length === 0) throw new ValidationError(`no backup files in ${out}`);
  return files;
}

export { detect, push, pull, status, bundleDir };
