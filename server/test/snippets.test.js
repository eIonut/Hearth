import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../app.js';

let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-snippets-'));
  process.env.DEV_HUB_DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DEV_HUB_DATA_DIR;
});

describe('snippets API', () => {
  it('creates, lists, updates, and deletes a snippet', async () => {
    const create = await request(app)
      .post('/api/snippets')
      .send({ title: 'grep recursive', body: 'grep -rn' });
    expect(create.status).toBe(200);
    expect(create.body).toMatchObject({
      title: 'grep recursive',
      body: 'grep -rn',
      language: 'text', // defaulted
      tags: [], // defaulted
    });
    const { id } = create.body;

    const list = await request(app).get('/api/snippets');
    expect(list.body).toHaveLength(1);

    const update = await request(app).put(`/api/snippets/${id}`).send({ language: 'bash' });
    expect(update.status).toBe(200);
    expect(update.body.language).toBe('bash');
    expect(update.body.title).toBe('grep recursive'); // untouched field survives

    const del = await request(app).delete(`/api/snippets/${id}`);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/snippets')).body).toEqual([]);
  });

  it('rejects a create missing required fields (400)', async () => {
    const res = await request(app).post('/api/snippets').send({ title: 'no body' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('returns 404 when updating a missing snippet', async () => {
    const res = await request(app).put('/api/snippets/nope').send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});
