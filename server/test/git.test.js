import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { status } from '../lib/git.js';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

describe('Git status', () => {
  it('returns a friendly non-repository state for an ordinary project folder', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-no-git-'));
    try {
      expect(status(folder)).toEqual({ state: 'not-repository' });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  it('reports branch and changed files in a repository', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-git-'));
    try {
      git(folder, ['init', '--initial-branch=main']);
      git(folder, ['config', 'user.name', 'Dev Hub Test']);
      git(folder, ['config', 'user.email', 'test@example.com']);
      fs.writeFileSync(path.join(folder, 'tracked.txt'), 'first version\n');
      git(folder, ['add', 'tracked.txt']);
      git(folder, ['commit', '-m', 'initial']);
      fs.writeFileSync(path.join(folder, 'tracked.txt'), 'changed version\n');
      fs.writeFileSync(path.join(folder, 'new.txt'), 'new file\n');

      expect(status(folder)).toMatchObject({
        state: 'repository',
        branch: 'main',
        upstream: null,
        ahead: 0,
        behind: 0,
        changedFileCount: 2,
        changedFiles: [
          { path: 'tracked.txt', status: 'modified' },
          { path: 'new.txt', status: 'untracked' },
        ],
      });
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
