import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import app from '../app.js';

let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-workspace-'));
  process.env.DEV_HUB_DATA_DIR = dataDir;
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DEV_HUB_DATA_DIR;
});

const termTab = { id: 1, kind: 'term', label: 'dev-hub #1', cwd: '/tmp', sessionId: 'abc' };
const previewTab = { id: 2, kind: 'preview', label: 'app', url: 'http://localhost:3000' };

const split = (a, b, extra = {}) => ({
  mode: 'vsplit',
  ratio: 0.5,
  panes: [
    { tabIds: a, activeTab: a[0] ?? null },
    { tabIds: b, activeTab: b[0] ?? null },
  ],
  ...extra,
});

const put = (body) => request(app).put('/api/workspace').send(body);

// Write a state file directly, to exercise reads of data this version didn't write.
function seed(state) {
  fs.writeFileSync(path.join(dataDir, 'workspace.json'), JSON.stringify(state));
}

describe('workspace state API', () => {
  it('returns an empty single-pane workspace before anything is saved', async () => {
    const res = await request(app).get('/api/workspace').expect(200);
    expect(res.body.tabs).toEqual([]);
    expect(res.body.layout.mode).toBe('single');
    expect(res.body.layout.panes).toHaveLength(2);
    expect(res.body.layout.panes[0].tabIds).toEqual([]);
  });

  it('round-trips tabs and a split layout', async () => {
    await put({ tabs: [termTab, previewTab], layout: split([1], [2]) }).expect(200);

    const res = await request(app).get('/api/workspace').expect(200);
    expect(res.body.tabs).toEqual([termTab, previewTab]);
    expect(res.body.layout.mode).toBe('vsplit');
    expect(res.body.layout.panes[0]).toEqual({ tabIds: [1], activeTab: 1 });
    expect(res.body.layout.panes[1]).toEqual({ tabIds: [2], activeTab: 2 });
  });

  it('drops cmd so a scaffold command is never replayed on restore', async () => {
    const res = await put({ tabs: [{ ...termTab, cmd: 'npm create vite@latest' }] }).expect(200);
    expect(res.body.tabs[0]).not.toHaveProperty('cmd');
  });

  it('keeps only known tab fields', async () => {
    const res = await put({ tabs: [{ ...termTab, evil: 'x', reloadKey: 9 }] }).expect(200);
    expect(Object.keys(res.body.tabs[0]).sort()).toEqual([
      'cwd',
      'id',
      'kind',
      'label',
      'sessionId',
    ]);
  });

  describe('layout repair', () => {
    it('places a tab no pane claimed into the first pane', async () => {
      const res = await put({ tabs: [termTab, previewTab], layout: split([1], []) }).expect(200);
      expect(res.body.layout.panes[0].tabIds).toEqual([1, 2]);
    });

    it('assigns a tab claimed by both panes to only one', async () => {
      const res = await put({ tabs: [termTab, previewTab], layout: split([1, 2], [2]) }).expect(
        200,
      );
      const [a, b] = res.body.layout.panes;
      expect(a.tabIds).toEqual([1, 2]);
      expect(b.tabIds).toEqual([]);
      expect([...a.tabIds, ...b.tabIds].filter((id) => id === 2)).toHaveLength(1);
    });

    it('drops layout references to tabs that no longer exist', async () => {
      const res = await put({ tabs: [termTab], layout: split([1], [99]) }).expect(200);
      expect(res.body.layout.panes[1].tabIds).toEqual([]);
      expect(res.body.layout.panes[0].tabIds).toEqual([1]);
    });

    it('collapses to single when the second pane ends up empty', async () => {
      const res = await put({ tabs: [termTab], layout: split([1], []) }).expect(200);
      expect(res.body.layout.mode).toBe('single');
    });

    it('repoints an activeTab that is not in its own pane', async () => {
      const layout = split([1], [2]);
      layout.panes[0].activeTab = 2; // belongs to the other pane
      const res = await put({ tabs: [termTab, previewTab], layout }).expect(200);
      expect(res.body.layout.panes[0].activeTab).toBe(1);
    });

    it('clamps an out-of-range ratio and rejects an unknown mode', async () => {
      const res = await put({
        tabs: [termTab, previewTab],
        layout: split([1], [2], { ratio: 0.99, mode: 'spiral' }),
      }).expect(200);
      expect(res.body.layout.ratio).toBe(0.5);
      expect(res.body.layout.mode).toBe('single');
    });

    it('keeps a ratio the user actually dragged to', async () => {
      const res = await put({
        tabs: [termTab, previewTab],
        layout: split([1], [2], { ratio: 0.3 }),
      }).expect(200);
      expect(res.body.layout.ratio).toBe(0.3);
    });
  });

  it('migrates a pre-split saved state with a top-level activeTab', async () => {
    seed({ tabs: [termTab, previewTab], activeTab: 2 });
    const res = await request(app).get('/api/workspace').expect(200);
    expect(res.body.layout.mode).toBe('single');
    expect(res.body.layout.panes[0].tabIds).toEqual([1, 2]);
    expect(res.body.layout.panes[0].activeTab).toBe(2);
  });

  it('survives a corrupt layout on disk without losing tabs', async () => {
    seed({ tabs: [termTab, previewTab], layout: 'not a layout' });
    const res = await request(app).get('/api/workspace').expect(200);
    expect(res.body.tabs).toHaveLength(2);
    expect(res.body.layout.panes[0].tabIds).toEqual([1, 2]);
  });

  describe('validation', () => {
    it('rejects a non-array tabs payload', async () => {
      const res = await put({ tabs: 'nope' }).expect(400);
      expect(res.body.error).toMatch(/must be an array/);
    });

    it('rejects an unknown tab kind', async () => {
      const res = await put({ tabs: [{ id: 1, kind: 'iframe-of-doom' }] }).expect(400);
      expect(res.body.error).toMatch(/unknown kind/);
    });

    it('rejects a tab without a numeric id', async () => {
      const res = await put({ tabs: [{ kind: 'term', label: 'x' }] }).expect(400);
      expect(res.body.error).toMatch(/numeric id/);
    });

    it('rejects an oversized tab list', async () => {
      const tabs = Array.from({ length: 51 }, (_, i) => ({ ...termTab, id: i }));
      const res = await put({ tabs }).expect(400);
      expect(res.body.error).toMatch(/too many tabs/);
    });
  });
});
