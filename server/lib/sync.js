import fs from 'fs';
import os from 'os';
import path from 'path';
import { read, write, dataDir } from './store.js';
import { ValidationError } from './errors.js';

// The hub root (…/dev-hub) — parent of the default data dir. Used to place the
// git sync repo by default. Never derived from DEV_HUB_DATA_DIR so tests that
// relocate the data dir don't scatter repos into temp folders.
const HUB_ROOT = path.join(import.meta.dirname, '..', '..');

// Which collections are portable knowledge worth carrying between machines.
// `projects` is eligible but off by default: it holds absolute local paths that
// rarely match on a second machine.
//
// `patches` is deliberately absent. Its `env-set` ops embed literal env values
// in `value`/`revert`, so the collection is a carrier for exactly the material
// envs/ is kept out of sync to protect — and it is barely portable anyway, as
// the ops reference file paths and source text inside one specific checkout.
const PORTABLE_ELIGIBLE = ['snippets', 'learning', 'notes', 'workflows', 'templates', 'projects'];
const DEFAULT_ENABLED = PORTABLE_ELIGIBLE.filter((n) => n !== 'projects');

// Collections that must NEVER leave the machine, no matter what a tampered
// config asks for. `settings` carries the sync config itself (remotes, paths);
// `patchstate`, `workspace` and `servicestate` are machine-local runtime state.
// The last two are the important ones to keep out: `workspace` holds absolute
// paths and terminal session ids that mean nothing on another machine, and
// restoring another machine's `servicestate` would auto-spawn its services on
// the next boot — a side effect nobody asked a restore to perform. Secrets live
// in envs/ and backups/, which are separate top-level folders and never data
// collections, so a data-file-based sync can't reach them at all.
const NEVER = ['settings', 'patchstate', 'workspace', 'servicestate'];

const MANIFEST = 'dev-hub.manifest.json';

// The git sync repo lives OUTSIDE the app tree by default (~/.dev-hub/sync).
// Placing it inside the cloned app folder means nesting git repos, and git
// commands would leak into the app repo (rewriting its remote, committing its
// files). Keeping it in the home dir makes the data repo fully independent, so
// app updates and data backups never touch each other.
const DEFAULT_REPO_DIR = path.join(os.homedir(), '.dev-hub', 'sync');

// The sync slice of settings.json, normalized with defaults filled in. This is
// the single reader both the routes and the auto-sync timer use.
function getConfig() {
  const sync = read('settings', {}).sync || {};
  return {
    enabled: Array.isArray(sync.enabled) ? sync.enabled : DEFAULT_ENABLED,
    cloud: { dir: sync.cloud?.dir || '' },
    git: { repoDir: sync.git?.repoDir || DEFAULT_REPO_DIR, remote: sync.git?.remote || '' },
    auto: { cloud: !!sync.auto?.cloud, git: !!sync.auto?.git },
    lastCloudAt: sync.lastCloudAt || null,
    lastGitAt: sync.lastGitAt || null,
    autoState: sync.autoState || { cloud: null, git: null },
  };
}

// Merge a patch into the persisted sync config. Reads settings fresh each call
// so concurrent writers (a request and the timer) don't clobber each other's
// unrelated fields.
function saveConfig(patch) {
  const settings = read('settings', {});
  settings.sync = { ...(settings.sync || {}), ...patch };
  write('settings', settings);
  return getConfig();
}

// Resolve the list of collections to sync from the saved config, always
// intersected with the eligible allowlist and stripped of the denylist. A
// missing config means "the sensible defaults".
function enabledFiles(config = read('settings', {})) {
  const chosen = Array.isArray(config?.sync?.enabled) ? config.sync.enabled : DEFAULT_ENABLED;
  return chosen.filter((n) => PORTABLE_ELIGIBLE.includes(n) && !NEVER.includes(n));
}

// Serialize each enabled collection to pretty JSON text, keyed by name. This is
// the single unit both destinations write — cloud folder and git repo alike.
function collect(names) {
  const files = {};
  for (const name of names) {
    files[name] = JSON.stringify(read(name, name === 'settings' ? {} : []), null, 2) + '\n';
  }
  return files;
}

function buildManifest(names) {
  return {
    app: 'dev-hub',
    version: 1,
    exportedAt: new Date().toISOString(),
    host: os.hostname(),
    files: names,
  };
}

// --- secret-scan gate -------------------------------------------------------
// Portable collections are user-authored text (a snippet could paste a real
// key), so scan the payload before it leaves the machine. Two passes are
// needed, because the two ways a secret shows up look nothing alike.

// Pass 1 — line scan. Catches secrets inside a *string*: a snippet holding a
// chunk of .env or shell, where the name and the value sit on one line.
const SECRET_PATTERNS = [
  { label: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { label: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/ },
  {
    label: 'assigned secret',
    re: /(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["']?[A-Za-z0-9._\-/+]{12,}/i,
  },
];

// Pass 2 — structural scan. The line scan is blind to a secret carried by the
// JSON *shape*, because collect() pretty-prints and that splits a name/value
// pair across two lines:
//
//     "key": "STRIPE_SECRET_KEY",
//     "value": "sk_live_…"
//
// Neither line trips pass 1: the first has the keyword but no value after the
// colon, the second has the value but `value` is not a flagged name. Walking
// the parsed object instead lets a name and its value be judged together.

// Names that mean "whatever sits next to me is a credential".
const SECRET_NAME_RE =
  /(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret|private[_-]?key|credential)/i;

// Values that are self-evidently credentials whatever they are called.
const SECRET_VALUE_PATTERNS = [
  { label: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { label: 'AWS access key id', re: /^AKIA[0-9A-Z]{16}$/ },
  { label: 'JWT', re: /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}$/ },
  { label: 'Stripe key', re: /^[srp]k_(?:live|test)_[A-Za-z0-9]{8,}$/ },
  { label: 'GitHub token', re: /^gh[pousr]_[A-Za-z0-9]{16,}$/ },
  { label: 'Slack token', re: /^xox[abposr]-[A-Za-z0-9-]{10,}$/ },
];

// An opaque blob: long, unbroken, no spaces. Prose and file paths with spaces
// fall out; so does anything short enough to be a flag or an identifier.
function looksOpaque(s) {
  return s.length >= 12 && /^[A-Za-z0-9._\-/+=]+$/.test(s);
}

// Walk the parsed collection, reporting [value, reason] for each string that
// reads as a credential. Three ways to qualify: the value speaks for itself,
// the property name says it is a secret, or a sibling *value* names it (the
// {key, value} pair shape that pass 1 cannot see).
function walkForSecrets(node, propName, out) {
  if (typeof node === 'string') {
    for (const { label, re } of SECRET_VALUE_PATTERNS) {
      if (re.test(node)) return out.push([node, label]);
    }
    if (propName && SECRET_NAME_RE.test(propName) && looksOpaque(node)) {
      out.push([node, 'secret-named field']);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkForSecrets(item, propName, out);
    return;
  }
  if (node && typeof node === 'object') {
    const values = Object.values(node);
    // Does some field in this object *name* a secret, e.g. {"key":"API_TOKEN"}?
    const namedHere = values.some((v) => typeof v === 'string' && SECRET_NAME_RE.test(v));
    for (const [k, v] of Object.entries(node)) {
      if (namedHere && typeof v === 'string' && !SECRET_NAME_RE.test(v) && looksOpaque(v)) {
        out.push([v, 'value beside a secret-named field']);
      }
      walkForSecrets(v, k, out);
    }
  }
}

// Locate a flagged value in the serialized text so the finding can point at a
// line. collect() pretty-prints, so each leaf sits on its own line.
function lineOf(lines, value) {
  const escaped = JSON.stringify(value).slice(1, -1);
  const i = lines.findIndex((l) => l.includes(escaped));
  return i === -1 ? 1 : i + 1;
}

function scanSecrets(files) {
  const findings = [];
  for (const [name, content] of Object.entries(files)) {
    const lines = content.split('\n');
    // One finding per line is enough to send someone looking, and it keeps the
    // two passes from double-reporting the same spot.
    const flagged = new Set();
    const add = (line, reason, preview) => {
      if (flagged.has(line)) return;
      flagged.add(line);
      findings.push({ file: name, line, reason, preview });
    };

    lines.forEach((line, i) => {
      for (const { label, re } of SECRET_PATTERNS) {
        if (re.test(line)) return add(i + 1, label, redact(line));
      }
    });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue; // not JSON — the line scan above is all we can do
    }
    const hits = [];
    walkForSecrets(parsed, null, hits);
    for (const [value, reason] of hits) {
      const line = lineOf(lines, value);
      add(line, reason, redact(lines[line - 1] ?? value));
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

// Show enough of a flagged line to locate it, without printing the secret.
function redact(line) {
  const t = line.trim().slice(0, 80);
  return t.replace(/([A-Za-z0-9._\-/+]{4})[A-Za-z0-9._\-/+]{6,}/g, '$1…');
}

// --- restore safety ---------------------------------------------------------
// Before overwriting local collections with a restored copy, snapshot whatever
// is there now, so a mistaken restore is always recoverable.
function snapshotLocal(names) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Sibling of the active data dir: dev-hub/backups/sync in production, an
  // isolated temp path under tests (which relocate the data dir).
  const dir = path.join(dataDir(), '..', 'backups', 'sync', stamp);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) {
    const src = path.join(dataDir(), name + '.json');
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, name + '.json'));
  }
  return dir;
}

// Apply restored collections into the local data dir. `files` is name → JSON
// text (as produced by collect / read from a destination). Only eligible,
// non-denylisted names are honored — a hostile bundle can't smuggle in others.
function restore(files) {
  const names = Object.keys(files).filter(
    (n) => PORTABLE_ELIGIBLE.includes(n) && !NEVER.includes(n),
  );
  if (names.length === 0) throw new ValidationError('nothing restorable in that backup');
  const snapshot = snapshotLocal(names);
  const restored = [];
  for (const name of names) {
    let parsed;
    try {
      parsed = JSON.parse(files[name]);
    } catch {
      throw new ValidationError(`backup file for "${name}" is not valid JSON`);
    }
    write(name, parsed);
    restored.push(name);
  }
  return { restored, snapshot };
}

export {
  PORTABLE_ELIGIBLE,
  DEFAULT_ENABLED,
  NEVER,
  MANIFEST,
  HUB_ROOT,
  DEFAULT_REPO_DIR,
  getConfig,
  saveConfig,
  enabledFiles,
  collect,
  buildManifest,
  scanSecrets,
  snapshotLocal,
  restore,
};
