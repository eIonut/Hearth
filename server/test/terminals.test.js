import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import * as terminals from '../lib/terminals.js';

// node-pty is an optional dependency and needs native build tooling, so the
// tests that spawn a real shell are skipped when it isn't available. The
// registry bookkeeping around it is exercised regardless.
const withPty = terminals.available() ? describe : describe.skip;

function waitFor(predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error('timed out'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

afterEach(() => {
  terminals.killAll();
});

describe('terminal session routes', () => {
  it('lists sessions with the concurrency cap', async () => {
    const res = await request(app).get('/api/terminals').expect(200);
    expect(res.body.max).toBe(terminals.MAX_SESSIONS);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });

  it('404s when killing a session that does not exist', async () => {
    const res = await request(app).delete('/api/terminals/nope').expect(404);
    expect(res.body.error).toMatch(/no such terminal/i);
  });
});

withPty('terminal sessions', () => {
  beforeEach(() => {
    terminals.killAll();
  });

  it('keeps the shell alive with no socket attached and buffers its output', async () => {
    const { session, error } = terminals.createSession({ id: 'a', cwd: '', label: 'test' });
    expect(error).toBeUndefined();

    session.term.write('echo persisted-marker\r');
    await waitFor(() => session.buffer.join('').includes('persisted-marker'));

    // Nothing was ever attached, and the shell is still running.
    expect(session.ws).toBeNull();
    expect(session.alive).toBe(true);
    expect(terminals.listSessions().find((s) => s.id === 'a').attached).toBe(false);
  });

  it('reports a session as orphaned-but-listed so it can be reclaimed', () => {
    terminals.createSession({ id: 'b', cwd: '', label: 'test' });
    const listed = terminals.listSessions().find((s) => s.id === 'b');
    expect(listed).toBeDefined();
    expect(listed.attached).toBe(false);
    expect(listed.cwd).toBeTruthy();
  });

  it('kills a session by id and drops it from the registry', async () => {
    terminals.createSession({ id: 'c', cwd: '', label: 'test' });
    await request(app).delete('/api/terminals/c').expect(200);
    expect(terminals.listSessions().some((s) => s.id === 'c')).toBe(false);
  });

  it('leaves a busy detached shell alone but reaps an idle one', async () => {
    const { session: idle } = terminals.createSession({ id: 'idle', cwd: '', label: 'idle' });
    const { session: busy } = terminals.createSession({ id: 'busy', cwd: '', label: 'busy' });

    busy.term.write('sleep 30\r');
    // Wait until the pty reports something other than the shell in the foreground.
    await waitFor(() => !terminals.listSessions().find((s) => s.id === 'busy').atPrompt);

    // Pretend both detached and went quiet two days ago.
    const longAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    for (const s of [idle, busy]) {
      s.detachedAt = longAgo;
      s.lastActivity = longAgo;
    }

    const reaped = terminals.reapIdle();
    expect(reaped).toContain('idle');
    expect(reaped).not.toContain('busy');
  });
});

// The scrollback ring is pure bookkeeping, so it's driven directly rather than
// by pushing hundreds of KB through a real pty (slow, and it proves less).
describe('scrollback buffer', () => {
  const blank = () => ({ buffer: [], bufferBytes: 0, lastActivity: 0, ws: null });

  it('keeps the buffer under the cap across many chunks', () => {
    const s = blank();
    for (let i = 0; i < 500; i++) terminals.pushOutput(s, 'x'.repeat(2000) + '\n');
    expect(s.bufferBytes).toBeLessThanOrEqual(terminals.BUFFER_BYTES);
    expect(s.buffer.join('').length).toBe(s.bufferBytes);
  });

  it('keeps the most recent output, dropping the oldest', () => {
    const s = blank();
    terminals.pushOutput(s, 'oldest\n');
    for (let i = 0; i < 200; i++) terminals.pushOutput(s, 'x'.repeat(2000) + '\n');
    terminals.pushOutput(s, 'newest\n');
    const text = s.buffer.join('');
    expect(text).toContain('newest');
    expect(text).not.toContain('oldest');
  });

  it('cuts an oversized single chunk at a newline boundary', () => {
    const s = blank();
    const line = 'y'.repeat(999) + '\n';
    terminals.pushOutput(s, line.repeat(400)); // one chunk, ~400KB
    expect(s.bufferBytes).toBeLessThanOrEqual(terminals.BUFFER_BYTES);
    expect(s.buffer[0].startsWith('y')).toBe(true); // starts at a line, not mid-line
    expect(s.buffer[0].endsWith('\n')).toBe(true);
  });

  it('tracks activity time so the reaper can tell quiet from busy', () => {
    const s = blank();
    terminals.pushOutput(s, 'hello');
    expect(s.lastActivity).toBeGreaterThan(0);
  });
});
