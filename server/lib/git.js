import fs from 'fs';
import { execFileSync } from 'child_process';

const GIT_TIMEOUT_MS = 3000;

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_TIMEOUT_MS,
  });
}

function changedFileStatus(code) {
  if (code === '??') return 'untracked';
  if (code.includes('U')) return 'conflicted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('C')) return 'copied';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  return 'modified';
}

function changedFiles(cwd) {
  const entries = runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal'])
    .split('\0')
    .filter(Boolean);
  const files = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const code = entry.slice(0, 2);
    files.push({ path: entry.slice(3), status: changedFileStatus(code) });

    // In porcelain v1 -z output, rename/copy records include an extra source
    // path after the destination path. It is part of the same change, not a
    // second changed file for the dashboard.
    if (code.includes('R') || code.includes('C')) i += 1;
  }

  return files;
}

/**
 * Read a repository's status without ever letting one project make the whole
 * dashboard fail. `state` deliberately distinguishes a normal non-Git folder
 * from a missing Git installation or an inaccessible project folder.
 */
export function status(projectPath) {
  try {
    if (!fs.statSync(projectPath).isDirectory()) return { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }

  try {
    if (runGit(projectPath, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') {
      return { state: 'not-repository' };
    }
  } catch (err) {
    return err.code === 'ENOENT' ? { state: 'git-unavailable' } : { state: 'not-repository' };
  }

  try {
    let branch = runGit(projectPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    if (!branch) branch = 'Detached HEAD';

    let upstream = null;
    try {
      upstream = runGit(projectPath, [
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{upstream}',
      ]).trim();
    } catch {
      // Local-only branches are common, especially in small starter projects.
    }

    let ahead = 0;
    let behind = 0;
    if (upstream) {
      const [behindCount, aheadCount] = runGit(projectPath, [
        'rev-list',
        '--left-right',
        '--count',
        `${upstream}...HEAD`,
      ])
        .trim()
        .split(/\s+/)
        .map(Number);
      ahead = aheadCount || 0;
      behind = behindCount || 0;
    }

    const files = changedFiles(projectPath);
    return {
      state: 'repository',
      branch,
      upstream,
      ahead,
      behind,
      changedFiles: files,
      changedFileCount: files.length,
    };
  } catch {
    return { state: 'unavailable' };
  }
}
