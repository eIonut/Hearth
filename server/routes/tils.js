import express from 'express';
import { read, write, id } from '../lib/store.js';
import { ValidationError } from '../lib/errors.js';

const router = express.Router();
const NAME = 'tils';

// TIL shape: { id, text, tags: [], createdAt }

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { text, tags } = req.body;
  if (!text || !text.trim()) throw new ValidationError('text is required');
  const items = read(NAME);
  const item = {
    id: id(),
    text: text.trim(),
    tags: Array.isArray(tags) ? tags : [],
    createdAt: Date.now(),
  };
  items.unshift(item);
  write(NAME, items);
  res.json(item);
});

router.delete('/:id', (req, res) => {
  write(
    NAME,
    read(NAME).filter((t) => t.id !== req.params.id),
  );
  res.json({ ok: true });
});

export default router;
