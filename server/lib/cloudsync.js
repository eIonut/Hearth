import fs from 'fs';
import os from 'os';
import path from 'path';
import { MANIFEST, LEGACY_MANIFEST, MANIFEST_NAMES } from './sync.js';
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

// Where the bundle lives inside the chosen cloud folder. Pre-rename installs
// wrote to a sibling named "dev-hub"; keep resolving to it for reads/migration
// until the next push moves the bundle over.
const BUNDLE_NAME = 'hearth';
const LEGACY_BUNDLE_NAME = 'dev-hub';

function bundleDir(dir) {
  return path.join(dir, BUNDLE_NAME);
}

function legacyBundleDir(dir) {
  return path.join(dir, LEGACY_BUNDLE_NAME);
}

// Resolve the bundle folder to read from: the new "hearth" folder if present,
// else a legacy "dev-hub" folder left by a pre-rename install. Returns the new
// path when neither exists (callers then report "nothing there yet").
function resolveBundleDir(dir) {
  const out = bundleDir(dir);
  if (fs.existsSync(out)) return out;
  const legacy = legacyBundleDir(dir);
  if (fs.existsSync(legacy)) return legacy;
  return out;
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
  // One-time migration: adopt a pre-rename "dev-hub" folder in place so the
  // existing backup (and any provider version history) carries over instead of
  // being stranded beside a fresh "hearth" folder.
  const legacy = legacyBundleDir(dir);
  if (!fs.existsSync(out) && fs.existsSync(legacy)) {
    fs.renameSync(legacy, out);
  }
  fs.mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    atomicWrite(path.join(out, name + '.json'), content);
  }
  atomicWrite(path.join(out, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  // Drop a stale manifest left by a migrated legacy bundle so the folder holds
  // exactly one.
  const staleManifest = path.join(out, LEGACY_MANIFEST);
  if (fs.existsSync(staleManifest)) fs.rmSync(staleManifest);
  return { dir: out, files: Object.keys(files) };
}

// Report what's sitting in the cloud folder, and flag provider "conflicted
// copy" siblings (created when two machines wrote at once) so the UI can warn
// rather than silently ignore them.
function status(dir) {
  if (!dir) return { configured: false };
  const out = resolveBundleDir(dir);
  const result = { configured: true, dir: out, exists: false, conflicts: [] };
  let entries;
  try {
    entries = fs.readdirSync(out);
  } catch {
    return result; // folder chosen but nothing written yet (or not synced down)
  }
  const manifestName = MANIFEST_NAMES.find((m) => entries.includes(m));
  if (manifestName) {
    result.exists = true;
    try {
      result.manifest = JSON.parse(fs.readFileSync(path.join(out, manifestName), 'utf8'));
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
  const out = resolveBundleDir(dir);
  let entries;
  try {
    entries = fs.readdirSync(out);
  } catch {
    throw new ValidationError(`no backup found in ${out}`);
  }
  const files = {};
  for (const e of entries) {
    if (!e.endsWith('.json') || MANIFEST_NAMES.includes(e)) continue;
    if (/conflicted copy/i.test(e)) continue;
    files[e.replace(/\.json$/, '')] = fs.readFileSync(path.join(out, e), 'utf8');
  }
  if (Object.keys(files).length === 0) throw new ValidationError(`no backup files in ${out}`);
  return files;
}

export { detect, push, pull, status, bundleDir };
