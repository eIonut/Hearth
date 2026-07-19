import fs from 'fs';
import path from 'path';
import { dataDir } from './store.js';
import {
  getConfig,
  saveConfig,
  enabledFiles,
  collect,
  buildManifest,
  scanSecrets,
} from './sync.js';
import * as cloud from './cloudsync.js';
import * as gitsync from './gitsync.js';
import { ValidationError } from './errors.js';

// The one place a "push to a destination" is orchestrated: gather the enabled
// collections, run the secret gate, write to the destination, and record the
// timestamp. Both the HTTP routes and the auto-sync timer call these so the two
// paths can never drift apart (e.g. the timer bypassing the secret gate).

// Build the payload, running the secret gate first. Throws a ValidationError
// with `.findings` attached when secrets are present and `force` is not set.
function preparePayload(force) {
  const names = enabledFiles();
  const files = collect(names);
  const findings = scanSecrets(files);
  if (findings.length && !force) {
    const err = new ValidationError('possible secrets found — review before syncing');
    err.findings = findings;
    throw err;
  }
  return { names, files, manifest: buildManifest(names), findings };
}

function runCloud({ force } = {}) {
  const { cloud: cfg } = getConfig();
  const { files, manifest, findings } = preparePayload(force);
  const result = cloud.push(cfg.dir, files, manifest);
  saveConfig({ lastCloudAt: manifest.exportedAt });
  return { ...result, exportedAt: manifest.exportedAt, findings };
}

function runGit({ force, message } = {}) {
  const { git: cfg } = getConfig();
  const { files, manifest, findings } = preparePayload(force);
  const result = gitsync.push(cfg.repoDir, files, manifest, message);
  saveConfig({ lastGitAt: manifest.exportedAt });
  return { ...result, exportedAt: manifest.exportedAt, findings };
}

// Has any enabled collection changed since the given ISO timestamp? A null
// timestamp (never synced) makes any existing file count as dirty, since a
// present file always has mtime > 0. Used by the timer to avoid pushing when
// nothing changed.
function dirtySince(iso) {
  const since = iso ? Date.parse(iso) : 0;
  for (const name of enabledFiles()) {
    try {
      const mtime = fs.statSync(path.join(dataDir(), name + '.json')).mtimeMs;
      if (mtime > since) return true;
    } catch {
      /* missing file — nothing to sync for it */
    }
  }
  return false;
}

export { preparePayload, runCloud, runGit, dirtySince };
