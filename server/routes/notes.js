import express from 'express';
import { read, write, id } from '../lib/store.js';
import { requireFields } from '../lib/validate.js';
import { NotFoundError } from '../lib/errors.js';

const router = express.Router();
const NAME = 'notes';

// Note shape: { id, title, body, createdAt, updatedAt }
// Notes are global (not scoped to a project) — a scratch pad for anything worth
// keeping around across the whole hub.

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { title, body } = req.body;
  requireFields(req.body, ['body']);
  const now = Date.now();
  const items = read(NAME);
  const item = {
    id: id(),
    title: title || '',
    body,
    createdAt: now,
    updatedAt: now,
  };
  items.unshift(item);
  write(NAME, items);
  res.json(item);
});

router.put('/:id', (req, res) => {
  const items = read(NAME);
  const idx = items.findIndex((n) => n.id === req.params.id);
  if (idx === -1) throw new NotFoundError();
  const { title, body } = req.body;
  items[idx] = {
    ...items[idx],
    ...(title !== undefined && { title }),
    ...(body !== undefined && { body }),
    updatedAt: Date.now(),
  };
  write(NAME, items);
  res.json(items[idx]);
});

router.delete('/:id', (req, res) => {
  write(
    NAME,
    read(NAME).filter((n) => n.id !== req.params.id),
  );
  res.json({ ok: true });
});

export default router;
