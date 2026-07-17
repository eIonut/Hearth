const express = require('express');
const http = require('http');
const terminals = require('./lib/terminals');
const procman = require('./lib/procman');

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api/projects', require('./routes/projects'));
app.use('/api/services', require('./routes/services'));
app.use('/api/env', require('./routes/env'));
app.use('/api/patches', require('./routes/patches'));
app.use('/api/preview', require('./routes/preview'));
app.use('/api/snippets', require('./routes/snippets'));
app.use('/api/learning', require('./routes/learning'));
app.use('/api/skills', require('./routes/skills'));
app.use('/api/tils', require('./routes/tils'));
app.use('/api/content', require('./routes/content'));
app.use('/api/digest', require('./routes/digest'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, terminals: terminals.available() });
});

app.get('/api/termdiag', async (req, res) => {
  res.json(await terminals.diagnose(req.query.cwd));
});

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
