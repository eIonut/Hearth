const express = require('express');
const { read, write, id } = require('../lib/store');
const procman = require('../lib/procman');
const envops = require('../lib/envops');
const patchops = require('../lib/patchops');

const router = express.Router();
const NAME = 'workflows';

// Workflow shape: { id, name, steps: [step] }
// Step shapes:
//   { type: 'start' | 'stop', projectId, service }
//   { type: 'env-apply', projectId, target, preset }
//   { type: 'patch-apply' | 'patch-revert', patchId }
//   { type: 'preview', label, url }   — executed client-side after run

const STEP_TYPES = ['start', 'stop', 'env-apply', 'patch-apply', 'patch-revert', 'preview'];

function getProject(projectId) {
  return read('projects').find((p) => p.id === projectId);
}

function describeStep(step) {
  const project = step.projectId ? getProject(step.projectId) : null;
  switch (step.type) {
    case 'start':
      return `start ${project?.name || '?'}/${step.service}`;
    case 'stop':
      return `stop ${project?.name || '?'}/${step.service}`;
    case 'env-apply':
      return `env ${project?.name || '?'}/${step.target} → ${step.preset}`;
    case 'patch-apply': {
      const patch = read('patches').find((p) => p.id === step.patchId);
      return `apply patch "${patch?.name || '?'}"`;
    }
    case 'patch-revert': {
      const patch = read('patches').find((p) => p.id === step.patchId);
      return `revert patch "${patch?.name || '?'}"`;
    }
    case 'preview':
      return `preview ${step.label || step.url}`;
    default:
      return step.type;
  }
}

function validateStep(step) {
  if (!STEP_TYPES.includes(step.type)) return `unknown step type: ${step.type}`;
  if (['start', 'stop'].includes(step.type) && (!step.projectId || !step.service))
    return `${step.type} needs projectId and service`;
  if (step.type === 'env-apply' && (!step.projectId || !step.target || !step.preset))
    return 'env-apply needs projectId, target, preset';
  if (['patch-apply', 'patch-revert'].includes(step.type) && !step.patchId)
    return `${step.type} needs patchId`;
  if (step.type === 'preview' && !step.url) return 'preview needs url';
  return null;
}

router.get('/', (req, res) => {
  res.json(
    read(NAME).map((w) => ({
      ...w,
      stepLabels: w.steps.map(describeStep),
    })),
  );
});

router.post('/', (req, res) => {
  const { name, steps } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(steps) || steps.length === 0)
    return res.status(400).json({ error: 'at least one step is required' });
  for (const s of steps) {
    const err = validateStep(s);
    if (err) return res.status(400).json({ error: err });
  }
  const workflows = read(NAME);
  const wf = { id: id(), name, steps };
  workflows.push(wf);
  write(NAME, workflows);
  res.json(wf);
});

router.put('/:id', (req, res) => {
  const workflows = read(NAME);
  const idx = workflows.findIndex((w) => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const { name, steps } = req.body;
  if (steps !== undefined) {
    if (!Array.isArray(steps) || steps.length === 0)
      return res.status(400).json({ error: 'at least one step is required' });
    for (const s of steps) {
      const err = validateStep(s);
      if (err) return res.status(400).json({ error: err });
    }
  }
  workflows[idx] = {
    ...workflows[idx],
    ...(name !== undefined && { name }),
    ...(steps !== undefined && { steps }),
  };
  write(NAME, workflows);
  res.json(workflows[idx]);
});

router.delete('/:id', (req, res) => {
  write(
    NAME,
    read(NAME).filter((w) => w.id !== req.params.id),
  );
  res.json({ ok: true });
});

// Run all server-side steps in order; preview steps are returned for the client to open.
router.post('/:id/run', (req, res) => {
  const wf = read(NAME).find((w) => w.id === req.params.id);
  if (!wf) return res.status(404).json({ error: 'not found' });

  const results = [];
  for (const step of wf.steps) {
    const label = describeStep(step);
    try {
      if (step.type === 'start' || step.type === 'stop') {
        const project = getProject(step.projectId);
        if (!project) throw new Error('project not found');
        if (step.type === 'start') {
          const service = (project.services || []).find((s) => s.name === step.service);
          if (!service) throw new Error(`service not found: ${step.service}`);
          const r = procman.start(project, service);
          if (!r.ok) throw new Error(r.error || 'failed to start');
        } else {
          procman.stop(project.id, step.service);
        }
      } else if (step.type === 'env-apply') {
        const project = getProject(step.projectId);
        if (!project) throw new Error('project not found');
        envops.applyPreset(project, step.target, step.preset);
      } else if (step.type === 'patch-apply' || step.type === 'patch-revert') {
        const patch = read('patches').find((p) => p.id === step.patchId);
        if (!patch) throw new Error('patch not found');
        const project = getProject(patch.projectId);
        if (!project) throw new Error('project not found');
        if (step.type === 'patch-apply') patchops.applyPatch(project, patch);
        else patchops.revertPatch(project, patch);
      } else if (step.type === 'preview') {
        results.push({
          label,
          ok: true,
          clientPreview: { label: step.label || step.url, url: step.url },
        });
        continue;
      }
      results.push({ label, ok: true });
    } catch (e) {
      results.push({ label, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

module.exports = router;
