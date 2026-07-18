import express from 'express';
import { read } from '../lib/store.js';
import * as envops from '../lib/envops.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const router = express.Router();

function getProject(projectId) {
  const project = read('projects').find((p) => p.id === projectId);
  if (!project) throw new NotFoundError('project not found');
  return project;
}

// envops throws plain Errors for bad input (unknown preset/target, missing
// file) — surface them as 400 rather than an unexpected 500.
function asValidation(fn) {
  try {
    return fn();
  } catch (e) {
    throw new ValidationError(e.message);
  }
}

router.get('/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  res.json({ targets: envops.computeTargets(project) });
});

router.post('/:projectId/apply', (req, res) => {
  const project = getProject(req.params.projectId);
  asValidation(() => envops.applyPreset(project, req.body.target, req.body.preset));
  res.json({ ok: true, applied: req.body.preset, target: req.body.target });
});

router.post('/:projectId/save', (req, res) => {
  const project = getProject(req.params.projectId);
  asValidation(() => envops.savePreset(project, req.body.target, req.body.name));
  res.json({ ok: true, saved: req.body.name, target: req.body.target });
});

router.delete('/:projectId/:target/:preset', (req, res) => {
  asValidation(() =>
    envops.deletePreset(req.params.projectId, req.params.target, req.params.preset),
  );
  res.json({ ok: true });
});

export default router;
