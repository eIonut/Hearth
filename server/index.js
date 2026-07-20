import http from 'http';
import app from './app.js';
import * as terminals from './lib/terminals.js';
import * as procman from './lib/procman.js';
import * as autosync from './lib/autosync.js';
import { read } from './lib/store.js';

const server = http.createServer(app);
terminals.attach(server);

// Background auto-sync: pushes enabled collections to any destination the user
// has toggled on, when they change. No-op until configured.
autosync.start();

const PORT = process.env.PORT || 5001;
// Bind to localhost only — this app must never be reachable from the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[hearth] server running at http://localhost:${PORT}`);
  restoreServices();
});

// Bring back the services that were running when the hub last went down.
// Starting processes as a side effect of booting is worth being able to turn
// off, so it is gated on a setting — set "autoRestartServices": false in
// data/settings.json to boot without touching anything.
function restoreServices() {
  if (read('settings', {}).autoRestartServices === false) return;
  const { restored, skipped } = procman.restore();
  for (const { key, reason } of skipped) {
    console.warn(`[hearth] not restoring ${key}: ${reason}`);
  }
  if (restored.length) {
    console.log(`[hearth] restored ${restored.length} service(s) from the last session`);
  }
}

process.on('SIGINT', () => {
  procman.stopAll();
  // Shells would mostly die anyway once the pty master fd closes and the
  // foreground group gets SIGHUP — but anything ignoring SIGHUP would survive
  // as a true orphan, so reap them deliberately. Exiting is deferred briefly so
  // the SIGKILL escalation actually lands instead of dying with us.
  terminals.killAll({ escalateMs: terminals.SHUTDOWN_ESCALATE_MS });
  setTimeout(() => process.exit(0), terminals.SHUTDOWN_GRACE_MS);
});
process.on('SIGTERM', () => {
  procman.stopAll();
  // Shells would mostly die anyway once the pty master fd closes and the
  // foreground group gets SIGHUP — but anything ignoring SIGHUP would survive
  // as a true orphan, so reap them deliberately. Exiting is deferred briefly so
  // the SIGKILL escalation actually lands instead of dying with us.
  terminals.killAll({ escalateMs: terminals.SHUTDOWN_ESCALATE_MS });
  setTimeout(() => process.exit(0), terminals.SHUTDOWN_GRACE_MS);
});
