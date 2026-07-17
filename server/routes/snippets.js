const express = require('express');
const { read, write, id } = require('../lib/store');

const router = express.Router();
const NAME = 'snippets';

// Snippet shape: { id, title, language, tags: [], body, createdAt }

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { title, language, tags, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
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
  if (idx === -1) return res.status(404).json({ error: 'not found' });
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
  write(NAME, read(NAME).filter((s) => s.id !== req.params.id));
  res.json({ ok: true });
});

module.exports = router;
