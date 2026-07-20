import { getConfig, saveConfig } from './sync.js';
import { runCloud, runGit, dirtySince } from './syncrun.js';
import * as gitsync from './gitsync.js';

// Background auto-sync. On an interval, if a destination has auto-sync enabled
// and its data changed since the last successful sync, push it. The secret gate
// is NOT bypassed here — auto-sync must never silently ship a secret off the
// machine, so a gated push is recorded as "blocked" and skipped until the user
// resolves it (or pushes manually with an explicit override).

const DEFAULT_INTERVAL_MS =
  Number(process.env.HEARTH_AUTOSYNC_MS || process.env.DEV_HUB_AUTOSYNC_MS) || 30000;

let timer = null;
let running = false; // guard against overlapping ticks (a slow git push)

// Run one pass. Exported so tests can drive it deterministically without waiting
// on the interval. Returns the per-destination outcomes it recorded.
async function tick() {
  if (running) return null;
  running = true;
  try {
    const config = getConfig();
    const state = { ...config.autoState };

    if (config.auto.cloud && config.cloud.dir && dirtySince(config.lastCloudAt)) {
      state.cloud = attempt(() => runCloud({ force: false }));
    }
    if (config.auto.git && config.git.remote && gitsync.isRepo(config.git.repoDir)) {
      if (dirtySince(config.lastGitAt)) {
        state.git = attempt(() => runGit({ force: false }));
      }
    }

    saveConfig({ autoState: state });
    return state;
  } finally {
    running = false;
  }
}

// Run one destination push and translate the result into a compact status the
// UI can show. A secret-gate block is distinguished from a real error so the
// user knows to review their data rather than debug a failure.
function attempt(fn) {
  const at = new Date().toISOString();
  try {
    const r = fn();
    return { at, status: 'ok', detail: `${r.files.length} files` };
  } catch (err) {
    if (err.findings) {
      return { at, status: 'blocked', detail: `${err.findings.length} possible secret(s)` };
    }
    return { at, status: 'error', detail: err.message };
  }
}

function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  // Errors inside tick are already caught per-destination; guard the tick call
  // itself so a bug can never crash the process from a timer callback.
  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  if (timer.unref) timer.unref(); // don't keep the process alive for the timer
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export { tick, start, stop };
