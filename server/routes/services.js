import express from 'express';
import { read } from '../lib/store.js';
import * as procman from '../lib/procman.js';
import { NotFoundError } from '../lib/errors.js';

const router = express.Router();

function findProjectService(projectId, serviceName) {
  const project = read('projects').find((p) => p.id === projectId);
  if (!project) return {};
  const service = (project.services || []).find((s) => s.name === serviceName);
  return { project, service };
}

router.get('/status', (req, res) => {
  res.json(procman.status());
});

router.post('/start', (req, res) => {
  const { projectId, service: serviceName } = req.body;
  const { project, service } = findProjectService(projectId, serviceName);
  if (!project || !service) throw new NotFoundError('project or service not found');
  res.json(procman.start(project, service));
});

router.post('/stop', (req, res) => {
  const { projectId, service: serviceName } = req.body;
  res.json(procman.stop(projectId, serviceName));
});

router.get('/logs', (req, res) => {
  const { projectId, service } = req.query;
  res.json(procman.logs(projectId, service));
});

export default router;
