import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { openInBrowser } = vi.hoisted(() => ({ openInBrowser: vi.fn() }));
vi.mock('../lib/browser.js', () => ({ openInBrowser }));

const { default: app } = await import('../app.js');

let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-workflows-'));
  process.env.DEV_HUB_DATA_DIR = dataDir;
  openInBrowser.mockClear();
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DEV_HUB_DATA_DIR;
});

describe('workflows API', () => {
  it('runs generic URL and terminal steps in their saved order', async () => {
    const create = await request(app)
      .post('/api/workflows')
      .send({
        name: 'Start my day',
        steps: [
          { type: 'open-url', label: 'Jira', url: 'https://jira.example.test' },
          {
            type: 'open-url',
            label: 'Local app',
            url: 'localhost:3000',
            target: 'workspace',
          },
          { type: 'terminal', command: 'npm test' },
        ],
      });

    expect(create.status).toBe(200);
    expect(create.body.steps).toHaveLength(3);

    const run = await request(app).post(`/api/workflows/${create.body.id}/run`).send({});
    expect(run.status).toBe(200);
    expect(run.body.results).toEqual([
      {
        label: 'open Jira in browser',
        ok: true,
      },
      {
        label: 'open Local app in Workspace',
        ok: true,
        clientUrl: { label: 'Local app', url: 'localhost:3000', target: 'workspace' },
      },
      {
        label: 'run npm test',
        ok: true,
        clientTerm: { label: 'npm test', cwd: '', cmd: 'npm test' },
      },
    ]);
    expect(openInBrowser).toHaveBeenCalledWith('https://jira.example.test');
  });

  it('rejects an unknown URL destination', async () => {
    const res = await request(app)
      .post('/api/workflows')
      .send({
        name: 'Broken workflow',
        steps: [{ type: 'open-url', url: 'https://example.test', target: 'somewhere-else' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/browser or workspace/);
  });
});
