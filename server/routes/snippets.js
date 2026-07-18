import express from 'express';
import { read, write, id } from '../lib/store.js';
import { requireFields } from '../lib/validate.js';
import { NotFoundError } from '../lib/errors.js';

const router = express.Router();
const NAME = 'snippets';

// Snippet shape: { id, title, language, tags: [], body, createdAt }

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { title, language, tags, body } = req.body;
  requireFields(req.body, ['title', 'body']);
  const items = read(NAME);
  const item = {
    id: id(),
    title,
    language: language || 'text',
    tags: Array.isArray(tags) ? tags : [],
    body,
    createdAt: Date.now(),
  };
  items.unshift(item);
  write(NAME, items);
  res.json(item);
});

router.put('/:id', (req, res) => {
  const items = read(NAME);
  const idx = items.findIndex((s) => s.id === req.params.id);
  if (idx === -1) throw new NotFoundError();
  const { title, language, tags, body } = req.body;
  items[idx] = {
    ...items[idx],
    ...(title !== undefined && { title }),
    ...(language !== undefined && { language }),
    ...(tags !== undefined && { tags }),
    ...(body !== undefined && { body }),
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
