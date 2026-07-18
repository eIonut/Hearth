import express from 'express';
import { read, write, id } from '../lib/store.js';
import { requireFields } from '../lib/validate.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';

const router = express.Router();
const NAME = 'learning';
const STATUSES = ['queued', 'learning', 'done'];

// Item shape: { id, title, url, tags: [], status, notes, createdAt, doneAt }

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { title, url, tags, notes } = req.body;
  requireFields(req.body, ['title']);
  const items = read(NAME);
  const item = {
    id: id(),
    title,
    url: url || '',
    tags: Array.isArray(tags) ? tags : [],
    status: 'queued',
    notes: notes || '',
    createdAt: Date.now(),
    doneAt: null,
  };
  items.unshift(item);
  write(NAME, items);
  res.json(item);
});

router.put('/:id', (req, res) => {
  const items = read(NAME);
  const idx = items.findIndex((s) => s.id === req.params.id);
  if (idx === -1) throw new NotFoundError();
  const { title, url, tags, notes, status } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new ValidationError(`status must be one of ${STATUSES.join(', ')}`);
  }
  items[idx] = {
    ...items[idx],
    ...(title !== undefined && { title }),
    ...(url !== undefined && { url }),
    ...(tags !== undefined && { tags }),
    ...(notes !== undefined && { notes }),
    ...(status !== undefined && { status, doneAt: status === 'done' ? Date.now() : null }),
  };
  write(NAME, items);
  res.json(items[idx]);
});

router.delete('/:id', (req, res) => {
  write(
    NAME,
    read(NAME).filter((s) => s.id !== req.params.id),
  );
  res.json({ ok: true });
});

export default router;
