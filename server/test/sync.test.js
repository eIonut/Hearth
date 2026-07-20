import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import app from '../app.js';
import { tick } from '../lib/autosync.js';

let dataDir;
let scratch;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-sync-'));
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-scratch-'));
  process.env.DEV_HUB_DATA_DIR = dataDir;
  // Seed a couple of portable collections.
  fs.writeFileSync(path.join(dataDir, 'notes.json'), JSON.stringify([{ id: 'n1', body: 'hi' }]));
  fs.writeFileSync(
    path.join(dataDir, 'snippets.json'),
    JSON.stringify([{ id: 's1', code: 'echo hi' }]),
  );
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  delete process.env.DEV_HUB_DATA_DIR;
});

describe('sync API', () => {
  it('reports eligible collections and default config', async () => {
    const res = await request(app).get('/api/sync/status');
    expect(res.status).toBe(200);
    expect(res.body.eligible).toContain('snippets');
    expect(res.body.eligible).toContain('projects');
    // projects is off by default (local paths)
    expect(res.body.config.enabled).not.toContain('projects');
    expect(res.body.config.enabled).toContain('notes');
  });

  it('saves the enabled selection and drops ineligible names', async () => {
    const res = await request(app)
      .put('/api/sync/config')
      .send({ enabled: ['notes', 'settings', 'bogus'] });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toEqual(['notes']); // settings/bogus stripped
  });

  // Machine-local runtime state must not travel. `workspace` holds absolute
  // paths and terminal session ids; restoring another machine's `servicestate`
  // would auto-spawn its services on the next boot.
  it('never offers or accepts machine-local state as a sync collection', async () => {
    const res = await request(app).get('/api/sync/status');
    for (const name of ['settings', 'patchstate', 'workspace', 'servicestate']) {
      expect(res.body.eligible).not.toContain(name);
    }

    const saved = await request(app)
      .put('/api/sync/config')
      .send({ enabled: ['notes', 'workspace', 'servicestate'] });
    expect(saved.body.enabled).toEqual(['notes']);
  });

  // Patch ops embed literal env values in `value`/`revert`, making `patches` a
  // carrier for the same material envs/ is kept out of sync to protect.
  it('never offers or accepts patches as a sync collection', async () => {
    const res = await request(app).get('/api/sync/status');
    expect(res.body.eligible).not.toContain('patches');
    expect(res.body.config.enabled).not.toContain('patches');

    const saved = await request(app)
      .put('/api/sync/config')
      .send({ enabled: ['notes', 'patches'] });
    expect(saved.body.enabled).toEqual(['notes']);
  });

  it('does not push patches, and ignores them in a bundle that carries them', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'patches.json'),
      JSON.stringify([
        {
          id: 'p1',
          ops: [{ type: 'env-set', file: 'api/.env', key: 'STRIPE_KEY', value: 'sk_live_abc123' }],
        },
      ]),
    );
    const cloudDir = path.join(scratch, 'nopatch');
    fs.mkdirSync(cloudDir);
    await request(app).put('/api/sync/config').send({ cloudDir });

    await request(app).post('/api/sync/cloud/push').send({}).expect(200);
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub', 'patches.json'))).toBe(false);

    // A bundle written by an older version still carries patches.json. Restoring
    // it must not overwrite the local patches with another machine's env values.
    fs.writeFileSync(
      path.join(cloudDir, 'dev-hub', 'patches.json'),
      JSON.stringify([{ id: 'other', ops: [] }]),
    );
    const restore = await request(app).post('/api/sync/cloud/restore').send({});
    expect(restore.status).toBe(200);
    expect(restore.body.restored).not.toContain('patches');
    const local = JSON.parse(fs.readFileSync(path.join(dataDir, 'patches.json'), 'utf8'));
    expect(local[0].id).toBe('p1');
  });

  it('refuses to restore machine-local state out of a backup bundle', async () => {
    const cloudDir = path.join(scratch, 'cloud');
    const bundle = path.join(cloudDir, 'dev-hub'); // pull() reads the bundle subfolder
    fs.mkdirSync(bundle, { recursive: true });
    fs.writeFileSync(path.join(bundle, 'notes.json'), JSON.stringify([{ id: 'n9', body: 'ok' }]));
    // A bundle that also carries state it should never be able to hand over.
    fs.writeFileSync(
      path.join(bundle, 'servicestate.json'),
      JSON.stringify({ running: ['other-machine::web'] }),
    );
    fs.writeFileSync(
      path.join(bundle, 'workspace.json'),
      JSON.stringify({ tabs: [{ id: 1, kind: 'term', cwd: '/somewhere/else' }] }),
    );
    fs.writeFileSync(
      path.join(bundle, 'dev-hub.manifest.json'),
      JSON.stringify({ app: 'dev-hub', version: 1, files: ['notes', 'servicestate', 'workspace'] }),
    );

    await request(app).put('/api/sync/config').send({ cloudDir });
    const res = await request(app).post('/api/sync/cloud/restore').send({});
    expect(res.status).toBe(200);
    expect(res.body.restored).toEqual(['notes']);
    // The dangerous files were ignored, not written into the local data dir.
    expect(fs.existsSync(path.join(dataDir, 'servicestate.json'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'workspace.json'))).toBe(false);
  });

  it('normalizes a pasted, shell-escaped or quoted cloud path', async () => {
    const res = await request(app)
      .put('/api/sync/config')
      .send({ cloudDir: '  "/tmp/My\\ Cloud Folder"  ' });
    expect(res.status).toBe(200);
    expect(res.body.cloud.dir).toBe('/tmp/My Cloud Folder');
  });

  it('flags a planted secret in the scan', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'snippets.json'),
      JSON.stringify([{ id: 's1', code: 'AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE' }]),
    );
    const res = await request(app).get('/api/sync/scan');
    expect(res.body.findings.length).toBeGreaterThan(0);
    expect(res.body.findings[0].file).toBe('snippets');
  });

  // collect() pretty-prints, which puts a name and its value on separate lines.
  // A line-at-a-time scan sees a keyword with nothing after the colon on one
  // line and an opaque value with a boring name on the next, and clears both.
  it('flags a secret split across lines by pretty-printing', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'snippets.json'),
      JSON.stringify([
        {
          id: 's1',
          name: 'stripe',
          fields: [{ key: 'STRIPE_SECRET_KEY', value: 'sk_live_9xQ2eZvKYlo2C' }],
        },
      ]),
    );
    const res = await request(app).get('/api/sync/scan');
    expect(res.body.findings.length).toBeGreaterThan(0);
    expect(res.body.findings[0].file).toBe('snippets');
    // The secret itself must never be echoed back in the finding.
    expect(JSON.stringify(res.body.findings)).not.toContain('sk_live_9xQ2eZvKYlo2C');
  });

  it('flags a credential under a secret-named property', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'notes.json'),
      JSON.stringify([{ id: 'n1', apiKey: 'AIzaSyD1234567890abcdefg' }]),
    );
    const res = await request(app).get('/api/sync/scan');
    expect(res.body.findings.length).toBeGreaterThan(0);
  });

  it('flags a well-known token shape whatever the field is called', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'notes.json'),
      JSON.stringify([{ id: 'n1', body: 'ghp_abcdefghij0123456789' }]),
    );
    const res = await request(app).get('/api/sync/scan');
    expect(res.body.findings[0].reason).toBe('GitHub token');
  });

  // The gate blocks a push, so a scan that cries wolf on ordinary content makes
  // people reach for `force` by reflex and stop reading findings at all.
  it('leaves ordinary content unflagged', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'notes.json'),
      JSON.stringify([{ id: 'n1', body: 'remember to rotate the token next week' }]),
    );
    fs.writeFileSync(
      path.join(dataDir, 'snippets.json'),
      JSON.stringify([{ id: 's1', url: 'iam-a-dev-1.infra.al:30374', cwd: '~/Work/billing' }]),
    );
    const res = await request(app).get('/api/sync/scan');
    expect(res.body.findings).toEqual([]);
  });

  it('cloud push round-trips through a folder and restores', async () => {
    const cloudDir = path.join(scratch, 'iCloud');
    fs.mkdirSync(cloudDir);
    await request(app).put('/api/sync/config').send({ cloudDir });

    const push = await request(app).post('/api/sync/cloud/push').send({});
    expect(push.status).toBe(200);
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub', 'notes.json'))).toBe(true);
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub', 'dev-hub.manifest.json'))).toBe(true);

    // Wipe local notes, then restore from the cloud folder.
    fs.writeFileSync(path.join(dataDir, 'notes.json'), JSON.stringify([]));
    const restore = await request(app).post('/api/sync/cloud/restore').send({});
    expect(restore.status).toBe(200);
    expect(restore.body.restored).toContain('notes');
    const notes = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'));
    expect(notes).toEqual([{ id: 'n1', body: 'hi' }]);
  });

  it('blocks a cloud push on secrets, then allows it with force', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'notes.json'),
      JSON.stringify([{ id: 'n1', body: 'token=ABCDEFGH123456789' }]),
    );
    const cloudDir = path.join(scratch, 'drop');
    fs.mkdirSync(cloudDir);
    await request(app).put('/api/sync/config').send({ cloudDir });

    const blocked = await request(app).post('/api/sync/cloud/push').send({});
    expect(blocked.status).toBe(400);
    expect(blocked.body.findings.length).toBeGreaterThan(0);

    const forced = await request(app).post('/api/sync/cloud/push').send({ force: true });
    expect(forced.status).toBe(200);
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub', 'notes.json'))).toBe(true);
  });

  it('git init/push/restore round-trips through a local bare repo', async () => {
    // A bare repo stands in for the user's private remote — no network/auth.
    // The default branch is pinned so the test does not depend on whatever
    // init.defaultBranch the machine running it happens to have configured.
    const bare = path.join(scratch, 'origin.git');
    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', '--bare', bare]);
    const repoDir = path.join(scratch, 'sync');
    await request(app).put('/api/sync/config').send({ gitRepoDir: repoDir, gitRemote: bare });

    const init = await request(app).post('/api/sync/git/init').send({});
    expect(init.status).toBe(200);

    const push = await request(app).post('/api/sync/git/push').send({});
    expect(push.status).toBe(200);
    expect(push.body.committed).toBe(true);

    // Restore into a fresh clone location by wiping the working repo, then
    // wiping local data and pulling it back.
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.writeFileSync(path.join(dataDir, 'notes.json'), JSON.stringify([]));
    const restore = await request(app).post('/api/sync/git/restore').send({});
    expect(restore.status).toBe(200);
    const notes = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'));
    expect(notes).toEqual([{ id: 'n1', body: 'hi' }]);
  });

  // The remote's HEAD is set when the repo is created and often still points at
  // `master`, while dev-hub always pushes `main`. A clone then succeeds with an
  // empty working tree, and a restore would claim the backup is empty while the
  // data sits safely on main — a recovery failure exactly when it matters.
  it('restores from a remote whose default branch is not main', async () => {
    const bare = path.join(scratch, 'legacy.git');
    execFileSync('git', ['-c', 'init.defaultBranch=master', 'init', '--bare', bare]);
    expect(fs.readFileSync(path.join(bare, 'HEAD'), 'utf8')).toContain('master');

    const repoDir = path.join(scratch, 'sync-legacy');
    await request(app).put('/api/sync/config').send({ gitRepoDir: repoDir, gitRemote: bare });
    await request(app).post('/api/sync/git/init').send({}).expect(200);
    await request(app).post('/api/sync/git/push').send({}).expect(200);

    // Force the clone path, then wipe local data so only a real restore can
    // bring it back.
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.writeFileSync(path.join(dataDir, 'notes.json'), JSON.stringify([]));

    const restore = await request(app).post('/api/sync/git/restore').send({});
    expect(restore.status).toBe(200);
    expect(restore.body.restored).toContain('notes');
    const notes = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'));
    expect(notes).toEqual([{ id: 'n1', body: 'hi' }]);
  });
});

describe('git sync isolation', () => {
  // Regression test for the incident where the sync repo lived inside the app
  // repo: git commands leaked into the parent, rewriting its remote and
  // committing its files. The sync repo must always be its own isolated repo.
  it('never touches a parent repo when the sync dir is nested inside one', async () => {
    const appRepo = path.join(scratch, 'app');
    const appRemote = path.join(scratch, 'app-remote.git');
    const dataRemote = path.join(scratch, 'data-remote.git');
    execFileSync('git', ['init', '--bare', appRemote]);
    execFileSync('git', ['init', '--bare', dataRemote]);

    // Stand up an "app repo" with its own remote and a commit.
    execFileSync('git', ['init', appRepo]);
    execFileSync('git', ['-C', appRepo, 'config', 'user.email', 'a@b.c']);
    execFileSync('git', ['-C', appRepo, 'config', 'user.name', 'app']);
    execFileSync('git', ['-C', appRepo, 'remote', 'add', 'origin', appRemote]);
    fs.writeFileSync(path.join(appRepo, 'app.js'), 'x');
    execFileSync('git', ['-C', appRepo, 'add', '-A']);
    execFileSync('git', ['-C', appRepo, 'commit', '-m', 'app init']);
    const headBefore = execFileSync('git', ['-C', appRepo, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();

    // Point the sync repo INSIDE the app repo (the original mistake).
    const nested = path.join(appRepo, 'sync');
    await request(app).put('/api/sync/config').send({ gitRepoDir: nested, gitRemote: dataRemote });
    await request(app).post('/api/sync/git/init').send({});
    const push = await request(app).post('/api/sync/git/push').send({});
    expect(push.status).toBe(200);

    // The app repo must be completely untouched.
    const remoteAfter = execFileSync('git', ['-C', appRepo, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    }).trim();
    expect(remoteAfter).toBe(appRemote); // remote NOT hijacked
    const headAfter = execFileSync('git', ['-C', appRepo, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    expect(headAfter).toBe(headBefore); // no commit leaked into the app repo
    expect(fs.existsSync(path.join(nested, '.git'))).toBe(true); // sync is its own repo
  });
});

describe('auto-sync', () => {
  it('pushes to the cloud folder when enabled and dirty, then skips when clean', async () => {
    const cloudDir = path.join(scratch, 'auto');
    fs.mkdirSync(cloudDir);
    await request(app).put('/api/sync/config').send({ cloudDir, autoCloud: true });

    const s1 = await tick();
    expect(s1.cloud.status).toBe('ok');
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub', 'notes.json'))).toBe(true);

    // Nothing changed since — a second tick must not re-run the push.
    const s2 = await tick();
    expect(s2.cloud.at).toBe(s1.cloud.at);
  });

  it('does not auto-push when it would ship a secret; records it blocked', async () => {
    fs.writeFileSync(
      path.join(dataDir, 'notes.json'),
      JSON.stringify([{ id: 'n1', body: 'password=HUNTER2SECRETLONG' }]),
    );
    const cloudDir = path.join(scratch, 'auto2');
    fs.mkdirSync(cloudDir);
    await request(app).put('/api/sync/config').send({ cloudDir, autoCloud: true });

    const s = await tick();
    expect(s.cloud.status).toBe('blocked');
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub', 'notes.json'))).toBe(false);
  });

  it('does nothing when auto-sync is disabled', async () => {
    const cloudDir = path.join(scratch, 'auto3');
    fs.mkdirSync(cloudDir);
    await request(app).put('/api/sync/config').send({ cloudDir }); // autoCloud not set

    const s = await tick();
    expect(s.cloud).toBeFalsy();
    expect(fs.existsSync(path.join(cloudDir, 'dev-hub'))).toBe(false);
  });
});
