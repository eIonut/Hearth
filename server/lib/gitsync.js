import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { MANIFEST } from './sync.js';
import { ValidationError } from './errors.js';

// Git-backed sync into a repository the user owns. Unlike the read-only status
// probe in git.js, this performs writes and network operations (push/pull/
// clone), so it needs a longer budget and — critically — must never block on an
// interactive credential prompt.

const LOCAL_TIMEOUT_MS = 5000;
const NET_TIMEOUT_MS = 30000;

// GIT_TERMINAL_PROMPT=0 turns a missing-credential prompt into an immediate
// error instead of a hang. GIT_SSH_COMMAND disables SSH's interactive host-key
// and passphrase prompts for the same reason. Auth must be pre-configured
// (SSH agent / credential helper); we surface a clear error when it isn't.
const NET_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new',
};

function git(cwd, args, { net = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: net ? NET_TIMEOUT_MS : LOCAL_TIMEOUT_MS,
      env: net ? NET_ENV : process.env,
    });
  } catch (err) {
    if (err.code === 'ENOENT') throw new ValidationError('git is not installed');
    if (err.signal === 'SIGTERM') {
      throw new ValidationError(
        net
          ? 'git timed out — check the remote URL and that your credentials (SSH key or token) are set up'
          : 'git command timed out',
      );
    }
    const stderr = (err.stderr || '').toString().trim();
    throw new ValidationError(stderr || err.message || 'git command failed');
  }
}

// Set a repo-local committer identity only if none is resolvable, so `git
// commit` can't fail for lack of user.name/user.email. Never writes global
// config.
function ensureIdentity(repoDir) {
  for (const [key, value] of [
    ['user.name', 'dev-hub'],
    ['user.email', 'dev-hub@localhost'],
  ]) {
    let has;
    try {
      has = git(repoDir, ['config', key]).trim().length > 0;
    } catch {
      has = false;
    }
    if (!has) git(repoDir, ['config', key, value]);
  }
}

// True only when `dir` is the TOP of its own git repo — not merely inside some
// ancestor repo's working tree. This distinction is critical: if the sync repo
// sits inside another git repo (e.g. the app repo), a plain "is inside a work
// tree" check is true for the parent, and every add/commit/remote command would
// operate on the parent repo instead. Comparing the toplevel to `dir` forces us
// to create and use an independent repo.
function isRepo(dir) {
  try {
    const top = git(dir, ['rev-parse', '--show-toplevel']).trim();
    return !!top && fs.realpathSync(top) === fs.realpathSync(dir);
  } catch {
    return false;
  }
}

// Prepare `repoDir` as a git repo wired to the user's remote. Idempotent: safe
// to call on an already-initialized repo (updates the remote if it changed).
function init(repoDir, remote) {
  if (!remote) throw new ValidationError('a remote URL is required');
  fs.mkdirSync(repoDir, { recursive: true });
  if (!isRepo(repoDir)) {
    git(repoDir, ['init']);
    git(repoDir, ['checkout', '-B', 'main']);
    // A local identity so commits never fail on a machine without global git
    // config. Scoped to this repo only; the user's global config is untouched.
    ensureIdentity(repoDir);
  }
  const remotes = git(repoDir, ['remote'])
    .split('\n')
    .map((r) => r.trim());
  if (remotes.includes('origin')) git(repoDir, ['remote', 'set-url', 'origin', remote]);
  else git(repoDir, ['remote', 'add', 'origin', remote]);
  return { repoDir, remote };
}

// Write the collected files into the repo, commit, and push. Returns a summary
// including whether there was anything to commit.
function push(repoDir, files, manifest, message) {
  if (!isRepo(repoDir)) throw new ValidationError('sync repo is not initialized');

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(repoDir, name + '.json'), content);
  }
  fs.writeFileSync(path.join(repoDir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');

  git(repoDir, ['add', '-A']);
  const staged = git(repoDir, ['status', '--porcelain']).trim();
  let committed = false;
  if (staged) {
    ensureIdentity(repoDir);
    git(repoDir, ['commit', '-m', message || `dev-hub sync ${manifest.exportedAt}`]);
    committed = true;
  }
  // Push even when nothing new committed, in case a prior commit never made it
  // up (e.g. earlier auth failure). --set-upstream on first push.
  git(repoDir, ['push', '-u', 'origin', 'main'], { net: true });
  return { committed, files: Object.keys(files) };
}

// Ensure the repo exists locally and is current with the remote, then read the
// bundle files back out for a restore. Clones on first use.
function restore(repoDir, remote) {
  if (!remote) throw new ValidationError('a remote URL is required');
  if (!isRepo(repoDir)) {
    const parent = path.dirname(repoDir);
    fs.mkdirSync(parent, { recursive: true });
    // Clone into the target dir. It must be empty/absent for a clean clone.
    if (fs.existsSync(repoDir) && fs.readdirSync(repoDir).length > 0) {
      throw new ValidationError(`${repoDir} exists and is not a dev-hub sync repo`);
    }
    git(parent, ['clone', remote, path.basename(repoDir)], { net: true });
  } else {
    git(repoDir, ['pull', '--ff-only', 'origin', 'main'], { net: true });
  }

  const files = {};
  for (const e of fs.readdirSync(repoDir)) {
    if (!e.endsWith('.json') || e === MANIFEST) continue;
    files[e.replace(/\.json$/, '')] = fs.readFileSync(path.join(repoDir, e), 'utf8');
  }
  if (Object.keys(files).length === 0) throw new ValidationError('remote has no backup files yet');
  return files;
}

function status(repoDir) {
  if (!repoDir || !isRepo(repoDir)) return { initialized: false };
  const result = { initialized: true, repoDir };
  try {
    result.remote = git(repoDir, ['remote', 'get-url', 'origin']).trim();
  } catch {
    result.remote = null;
  }
  try {
    const last = git(repoDir, ['log', '-1', '--format=%cI %h']).trim();
    if (last) {
      const [when, hash] = last.split(' ');
      result.lastCommit = { when, hash };
    }
  } catch {
    /* no commits yet */
  }
  result.dirty = git(repoDir, ['status', '--porcelain']).trim().length > 0;
  return result;
}

export { init, push, restore, status, isRepo };
