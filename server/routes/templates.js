import express from 'express';
import * as templates from '../lib/templates.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json(templates.list());
});

router.post('/', (req, res) => {
  res.json(templates.create(req.body));
});

router.put('/:id', (req, res) => {
  res.json(templates.update(req.params.id, req.body));
});

router.delete('/:id', (req, res) => {
  templates.remove(req.params.id);
  res.json({ ok: true });
});

export default router;
