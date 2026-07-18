import http from 'http';
import app from './app.js';
import * as terminals from './lib/terminals.js';
import * as procman from './lib/procman.js';

const server = http.createServer(app);
terminals.attach(server);

const PORT = process.env.PORT || 5001;
// Bind to localhost only — this app must never be reachable from the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-hub] server running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  procman.stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  procman.stopAll();
  process.exit(0);
});
