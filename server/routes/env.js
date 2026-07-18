const express = require('express');
const { read } = require('../lib/store');
const envops = require('../lib/envops');

const router = express.Router();

function getProject(projectId) {
  return read('projects').find((p) => p.id === projectId);
}

router.get('/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  res.json({ targets: envops.computeTargets(project) });
});

router.post('/:projectId/apply', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  try {
    envops.applyPreset(project, req.body.target, req.body.preset);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true, applied: req.body.preset, target: req.body.target });
});

router.post('/:projectId/save', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  try {
    envops.savePreset(project, req.body.target, req.body.name);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true, saved: req.body.name, target: req.body.target });
});

router.delete('/:projectId/:target/:preset', (req, res) => {
  try {
    envops.deletePreset(req.params.projectId, req.params.target, req.params.preset);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true });
});

module.exports = router;
