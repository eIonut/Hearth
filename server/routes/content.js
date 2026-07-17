const express = require('express');
const { read, write, id } = require('../lib/store');
const claude = require('../lib/claude');

const router = express.Router();
const NAME = 'content';
const STATUSES = ['idea', 'drafted', 'posted'];

// Item shape: { id, title, notes, sourceTilIds: [], status, drafts: {tiktok, x, linkedin}, createdAt, postedAt }

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { title, notes, sourceTilIds } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const items = read(NAME);
  const item = {
    id: id(),
    title,
    notes: notes || '',
    sourceTilIds: Array.isArray(sourceTilIds) ? sourceTilIds : [],
    status: 'idea',
    drafts: null,
    createdAt: Date.now(),
    postedAt: null,
  };
  items.unshift(item);
  write(NAME, items);
  res.json(item);
});

router.put('/:id', (req, res) => {
  const items = read(NAME);
  const idx = items.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const { title, notes, status, drafts } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  }
  items[idx] = {
    ...items[idx],
    ...(title !== undefined && { title }),
    ...(notes !== undefined && { notes }),
    ...(drafts !== undefined && { drafts }),
    ...(status !== undefined && { status, postedAt: status === 'posted' ? Date.now() : items[idx].postedAt }),
  };
  write(NAME, items);
  res.json(items[idx]);
});

router.delete('/:id', (req, res) => {
  write(NAME, read(NAME).filter((c) => c.id !== req.params.id));
  res.json({ ok: true });
});

// Generate platform drafts with Claude
router.post('/:id/generate', async (req, res) => {
  if (!claude.available()) {
    return res.status(503).json({ error: 'Claude Agent SDK not installed' });
  }
  const items = read(NAME);
  const idx = items.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const item = items[idx];

  const tils = read('tils').filter((t) => item.sourceTilIds.includes(t.id));
  const tilLines = tils.map((t) => `- ${t.text}`).join('\n');

  const prompt = `You are drafting social media content for a full-stack web developer (MERN) who teaches web development and AI to other developers. His tone: practical, no fluff, teaches from real experience.

Topic: ${item.title}
${item.notes ? `Extra notes: ${item.notes}` : ''}
${tilLines ? `Source material (things he actually learned):\n${tilLines}` : ''}

Create three drafts:
1. tiktok — a 30-45 second spoken script. Strong hook in the first sentence, one core insight, concrete example, end with a reason to follow.
2. x — a thread. Separate tweets with a line containing only "---". First tweet is the hook. 4-7 tweets, each under 280 chars.
3. linkedin — a post. Hook as the first line, short punchy paragraphs, a question to the audience at the end.

Reply with ONLY a valid JSON object (no markdown fences, no commentary):
{"tiktok": "...", "x": "...", "linkedin": "..."}`;

  try {
    const text = await claude.runText(prompt);
    const drafts = claude.extractJSON(text);
    items[idx] = { ...item, drafts, status: item.status === 'idea' ? 'drafted' : item.status };
    write(NAME, items);
    res.json(items[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
