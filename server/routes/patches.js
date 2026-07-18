import express from 'express';
import { read, write, id } from '../lib/store.js';
import * as patchops from '../lib/patchops.js';
import { requireFields } from '../lib/validate.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const router = express.Router();
const NAME = 'patches';

// Patch shape: { id, projectId, name, ops: [op] }
// Op shapes:
//   { type: 'env-set',  file, key, value, revert? }   — set KEY=value, keep everything else
//   { type: 'replace',  file, find, replace }          — swap text; revert swaps back

function getProject(projectId) {
  return read('projects').find((p) => p.id === projectId);
}

router.get('/', (req, res) => {
  const { projectId } = req.query;
  let patches = read(NAME);
  if (projectId) patches = patches.filter((p) => p.projectId === projectId);
  const projects = read('projects');
  res.json(
    patches.map((p) => {
      const project = projects.find((pr) => pr.id === p.projectId);
      return {
        ...p,
        status: project ? patchops.overallStatus(project, p.ops) : 'project-missing',
        opStatuses: project ? p.ops.map((op) => patchops.opStatus(project, op)) : [],
      };
    }),
  );
});

router.post('/', (req, res) => {
  const { projectId, name, ops } = req.body;
  requireFields(req.body, ['name', 'projectId']);
  if (!getProject(projectId)) throw new NotFoundError('project not found');
  if (!Array.isArray(ops) || ops.length === 0)
    throw new ValidationError('at least one op is required');
  for (const op of ops) {
    const err = patchops.validateOp(op);
    if (err) throw new ValidationError(err);
  }
  const patches = read(NAME);
  const patch = { id: id(), projectId, name, ops };
  patches.push(patch);
  write(NAME, patches);
  res.json(patch);
});

router.put('/:id', (req, res) => {
  const patches = read(NAME);
  const idx = patches.findIndex((p) => p.id === req.params.id);
  if (idx === -1) throw new NotFoundError();
  const { name, ops } = req.body;
  if (ops !== undefined) {
    if (!Array.isArray(ops) || ops.length === 0)
      throw new ValidationError('at least one op is required');
    for (const op of ops) {
      const err = patchops.validateOp(op);
      if (err) throw new ValidationError(err);
    }
  }
  patches[idx] = {
    ...patches[idx],
    ...(name !== undefined && { name }),
    ...(ops !== undefined && { ops }),
  };
  write(NAME, patches);
  res.json(patches[idx]);
});

router.delete('/:id', (req, res) => {
  write(
    NAME,
    read(NAME).filter((p) => p.id !== req.params.id),
  );
  patchops.clearState(req.params.id);
  res.json({ ok: true });
});

function runAction(req, res, fn) {
  const patch = read(NAME).find((p) => p.id === req.params.id);
  if (!patch) throw new NotFoundError();
  const project = getProject(patch.projectId);
  if (!project) throw new NotFoundError('project not found');
  try {
    fn(project, patch);
  } catch (e) {
    // patchops throws plain Errors for bad ops (e.g. file missing) — surface as 400.
    throw new ValidationError(e.message);
  }
  res.json({ ok: true, status: patchops.overallStatus(project, patch.ops) });
}

router.post('/:id/apply', (req, res) => runAction(req, res, patchops.applyPatch));
router.post('/:id/revert', (req, res) => runAction(req, res, patchops.revertPatch));

export default router;
