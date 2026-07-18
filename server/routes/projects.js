import express from 'express';
import * as projects from '../lib/projects.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(projects.list());
});

router.post('/', (req, res) => {
  res.json(projects.create(req.body));
});

router.put('/:id', (req, res) => {
  res.json(projects.update(req.params.id, req.body));
});

router.delete('/:id', (req, res) => {
  projects.remove(req.params.id);
  res.json({ ok: true });
});

export default router;
