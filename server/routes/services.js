const express = require('express');
const { read } = require('../lib/store');
const procman = require('../lib/procman');

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
  if (!project || !service) return res.status(404).json({ error: 'project or service not found' });
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

module.exports = router;
