import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as procman from '../lib/procman.js';

let dataDir;
let projectDir;

const service = { name: 'web', cmd: 'sleep 30' };
const project = () => ({ id: 'p1', name: 'demo', path: projectDir, services: [service] });

function stateFile() {
  return path.join(dataDir, 'servicestate.json');
}
function savedRunning() {
  if (!fs.existsSync(stateFile())) return null;
  return JSON.parse(fs.readFileSync(stateFile(), 'utf8')).running;
}
function writeProjects(projects) {
  fs.writeFileSync(path.join(dataDir, 'projects.json'), JSON.stringify(projects));
}
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-procman-'));
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devhub-project-'));
  process.env.DEV_HUB_DATA_DIR = dataDir;
  writeProjects([project()]);
});

afterEach(async () => {
  procman.stopAll();
  await settle();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(projectDir, { recursive: true, force: true });
  delete process.env.DEV_HUB_DATA_DIR;
});

describe('service state snapshot', () => {
  it('records a service as running when it starts', async () => {
    procman.start(project(), service);
    await settle();
    expect(savedRunning()).toEqual(['p1::web']);
  });

  it('drops a service from the record when it is stopped', async () => {
    procman.start(project(), service);
    await settle();
    procman.stop('p1', 'web');
    await settle(400); // let the SIGTERM land and the exit handler run
    expect(savedRunning()).toEqual([]);
  });

  it('does not erase the record when a session ran nothing at all', async () => {
    // The auto-restart-disabled boot: services were running last time, this hub
    // deliberately started none, and shutting down must not wipe that history.
    // Needs a fresh module — procman's process map is module state, and a used
    // one would make this pass for the wrong reason.
    vi.resetModules();
    const fresh = await import('../lib/procman.js');
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['p1::web'] }));
    fresh.stopAll();
    await settle();
    expect(savedRunning()).toEqual(['p1::web']);
  });

  it('keeps the record of what was running across a shutdown', async () => {
    procman.start(project(), service);
    await settle();
    // stopAll() stops everything — the snapshot must still say it was running,
    // otherwise there is nothing to restore on the next boot.
    procman.stopAll();
    await settle(400);
    expect(savedRunning()).toEqual(['p1::web']);
  });
});

describe('restore', () => {
  it('does nothing when there is no saved state', () => {
    expect(procman.restore()).toEqual({ restored: [], skipped: [] });
  });

  it('restarts a service that was running, and marks its log', async () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['p1::web'] }));
    const { restored, skipped } = procman.restore();
    expect(restored).toEqual(['p1::web']);
    expect(skipped).toEqual([]);

    const status = procman.status();
    expect(status['p1::web'].running).toBe(true);
    expect(procman.logs('p1', 'web').lines).toContain('[dev-hub] restored after hub restart');
  });

  it('skips a service whose project is gone', () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['ghost::web'] }));
    const { restored, skipped } = procman.restore();
    expect(restored).toEqual([]);
    expect(skipped[0].reason).toMatch(/project no longer exists/);
  });

  it('skips a service that is no longer defined on its project', () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['p1::removed'] }));
    const { skipped } = procman.restore();
    expect(skipped[0].reason).toMatch(/no longer defined/);
  });

  it('skips a service whose project folder has disappeared', () => {
    writeProjects([{ ...project(), path: path.join(os.tmpdir(), 'devhub-not-here') }]);
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['p1::web'] }));
    const { skipped } = procman.restore();
    expect(skipped[0].reason).toMatch(/folder is missing/);
  });

  it('reports every skipped service rather than stopping at the first', () => {
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['ghost::a', 'p1::removed'] }));
    const { skipped } = procman.restore();
    expect(skipped).toHaveLength(2);
  });

  it('handles a service name containing the key separator', async () => {
    const odd = { name: 'a::b', cmd: 'sleep 30' };
    writeProjects([{ ...project(), services: [odd] }]);
    fs.writeFileSync(stateFile(), JSON.stringify({ running: ['p1::a::b'] }));
    const { restored, skipped } = procman.restore();
    expect(skipped).toEqual([]);
    expect(restored).toEqual(['p1::a::b']);
  });
});
