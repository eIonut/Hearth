import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../app.js';

let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-templates-'));
  process.env.HEARTH_DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.HEARTH_DATA_DIR;
});

describe('templates API', () => {
  it('creates, lists, updates, and deletes a template', async () => {
    const create = await request(app)
      .post('/api/templates')
      .send({ name: 'React (Vite)', commands: ['npm create vite@latest app', ' ', 'cd app'] });
    expect(create.status).toBe(200);
    expect(create.body).toMatchObject({
      name: 'React (Vite)',
      commands: ['npm create vite@latest app', 'cd app'], // blanks trimmed out
      cwd: '', // defaulted
    });
    const { id } = create.body;

    const list = await request(app).get('/api/templates');
    expect(list.body).toHaveLength(1);

    const update = await request(app)
      .put(`/api/templates/${id}`)
      .send({ cwd: '~/Work', commands: ['npm run dev'] });
    expect(update.status).toBe(200);
    expect(update.body.cwd).toBe('~/Work');
    expect(update.body.commands).toEqual(['npm run dev']);
    expect(update.body.name).toBe('React (Vite)'); // untouched field survives

    const del = await request(app).delete(`/api/templates/${id}`);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/templates')).body).toEqual([]);
  });

  it('rejects a create missing a name (400)', async () => {
    const res = await request(app)
      .post('/api/templates')
      .send({ commands: ['ls'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });

  it('rejects a create with no non-empty commands (400)', async () => {
    const res = await request(app)
      .post('/api/templates')
      .send({ name: 'x', commands: ['', '  '] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/command/);
  });

  it('returns 404 when updating a missing template', async () => {
    const res = await request(app).put('/api/templates/nope').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});
