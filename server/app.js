import express from 'express';
import * as terminals from './lib/terminals.js';
import projects from './routes/projects.js';
import services from './routes/services.js';
import env from './routes/env.js';
import patches from './routes/patches.js';
import preview from './routes/preview.js';
import workflows from './routes/workflows.js';
import templates from './routes/templates.js';
import snippets from './routes/snippets.js';
import notes from './routes/notes.js';
import learning from './routes/learning.js';
import skills from './routes/skills.js';
import sync from './routes/sync.js';

// The Express app is built here and exported without binding a port, so tests
// can drive it with supertest. Port binding, the WebSocket terminal server, and
// process signal handling all live in index.js (the bootstrap).
const app = express();
app.use(express.json({ limit: '2mb' }));

app.use('/api/projects', projects);
app.use('/api/services', services);
app.use('/api/env', env);
app.use('/api/patches', patches);
app.use('/api/preview', preview);
app.use('/api/workflows', workflows);
app.use('/api/templates', templates);
app.use('/api/snippets', snippets);
app.use('/api/notes', notes);
app.use('/api/learning', learning);
app.use('/api/skills', skills);
app.use('/api/sync', sync);

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
// handlers here, so an async throw returns a clean response instead of hanging.
// Routes and lib throw typed errors (ValidationError → 400, NotFoundError → 404);
// anything untyped is an unexpected fault → 500. Only faults are logged.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[dev-hub]', err);
  const body = { error: err.message || 'internal error' };
  // The sync secret-scan gate attaches the offending lines so the client can
  // show them and offer an explicit override.
  if (err.findings) body.findings = err.findings;
  res.status(status).json(body);
});

export default app;
