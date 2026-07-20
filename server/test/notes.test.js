import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../app.js';

let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-notes-'));
  process.env.HEARTH_DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.HEARTH_DATA_DIR;
});

describe('notes API', () => {
  it('creates, lists, updates, and deletes a note', async () => {
    const create = await request(app)
      .post('/api/notes')
      .send({ title: 'Idea', body: 'Ship the notes feature' });
    expect(create.status).toBe(200);
    expect(create.body).toMatchObject({
      title: 'Idea',
      body: 'Ship the notes feature',
    });
    expect(create.body.createdAt).toBe(create.body.updatedAt); // equal on create
    const { id } = create.body;

    const list = await request(app).get('/api/notes');
    expect(list.body).toHaveLength(1);

    const update = await request(app).put(`/api/notes/${id}`).send({ body: 'Shipped it' });
    expect(update.status).toBe(200);
    expect(update.body.body).toBe('Shipped it');
    expect(update.body.title).toBe('Idea'); // untouched field survives
    expect(update.body.updatedAt).toBeGreaterThanOrEqual(update.body.createdAt);

    const del = await request(app).delete(`/api/notes/${id}`);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/notes')).body).toEqual([]);
  });

  it('defaults title to an empty string when omitted', async () => {
    const res = await request(app).post('/api/notes').send({ body: 'titleless' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('');
  });

  it('rejects a create missing the body (400)', async () => {
    const res = await request(app).post('/api/notes').send({ title: 'no body' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('returns 404 when updating a missing note', async () => {
    const res = await request(app).put('/api/notes/nope').send({ body: 'x' });
    expect(res.status).toBe(404);
  });
});
