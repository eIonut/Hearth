import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { read, write, id, dataDir } from '../lib/store.js';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-store-'));
  process.env.HEARTH_DATA_DIR = dir;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.HEARTH_DATA_DIR;
});

describe('store', () => {
  it('resolves the data dir from HEARTH_DATA_DIR', () => {
    expect(dataDir()).toBe(dir);
  });

  it('returns the fallback when a collection file is absent', () => {
    expect(read('missing')).toEqual([]);
    expect(read('missing', { a: 1 })).toEqual({ a: 1 });
  });

  it('round-trips written data and creates the file on disk', () => {
    write('things', [{ id: 1 }, { id: 2 }]);
    expect(fs.existsSync(path.join(dir, 'things.json'))).toBe(true);
    expect(read('things')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('generates distinct string ids', () => {
    const a = id();
    const b = id();
    expect(typeof a).toBe('string');
    expect(a).not.toBe(b);
  });
});
