import express from 'express';
import * as workflows from '../lib/workflows.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(workflows.list());
});

router.post('/', (req, res) => {
  res.json(workflows.create(req.body));
});

router.put('/:id', (req, res) => {
  res.json(workflows.update(req.params.id, req.body));
});

router.delete('/:id', (req, res) => {
  workflows.remove(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/run', (req, res) => {
  res.json(workflows.run(req.params.id));
});

export default router;
