import express from 'express';
import http from 'http';
import * as terminals from './lib/terminals.js';
import * as procman from './lib/procman.js';
import projects from './routes/projects.js';
import services from './routes/services.js';
import env from './routes/env.js';
import patches from './routes/patches.js';
import preview from './routes/preview.js';
import workflows from './routes/workflows.js';
import snippets from './routes/snippets.js';
import learning from './routes/learning.js';
import skills from './routes/skills.js';
import tils from './routes/tils.js';
import content from './routes/content.js';
import digest from './routes/digest.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api/projects', projects);
app.use('/api/services', services);
app.use('/api/env', env);
app.use('/api/patches', patches);
app.use('/api/preview', preview);
app.use('/api/workflows', workflows);
app.use('/api/snippets', snippets);
app.use('/api/learning', learning);
app.use('/api/skills', skills);
app.use('/api/tils', tils);
app.use('/api/content', content);
app.use('/api/digest', digest);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, terminals: terminals.available() });
});

app.get('/api/termdiag', async (req, res) => {
  res.json(await terminals.diagnose(req.query.cwd));
});

// JSON 404 for unmatched API routes (Express 5 otherwise returns HTML).
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Terminal error handler. Express 5 auto-forwards rejected promises from async
// handlers here, so an async throw returns a clean 500 instead of hanging.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[dev-hub]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
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
