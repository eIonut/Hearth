import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../app.js';

let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-projects-'));
  process.env.HEARTH_DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.HEARTH_DATA_DIR;
});

describe('projects API', () => {
  it('lists an empty collection initially', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates, updates, and removes a project', async () => {
    // dataDir is a real directory, so it passes the path-exists check.
    const create = await request(app).post('/api/projects').send({ name: 'Demo', path: dataDir });
    expect(create.status).toBe(200);
    expect(create.body).toMatchObject({ name: 'Demo', path: dataDir, envFile: '.env' });
    const { id } = create.body;
    expect(id).toBeTruthy();

    const list = await request(app).get('/api/projects');
    expect(list.body).toHaveLength(1);

    const update = await request(app).put(`/api/projects/${id}`).send({ name: 'Renamed' });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe('Renamed');
    expect(update.body.path).toBe(dataDir); // untouched fields survive

    const del = await request(app).delete(`/api/projects/${id}`);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/projects')).body).toEqual([]);
  });

  it('rejects a create with no name or path (400)', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'NoPath' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('rejects a create pointing at a nonexistent path (400)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Bad', path: '/no/such/path/here' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not exist/);
  });

  it('returns 404 when updating a missing project', async () => {
    const res = await request(app).put('/api/projects/nope').send({ name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not found');
  });
});
