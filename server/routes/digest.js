import express from 'express';
import { read } from '../lib/store.js';
import * as claude from '../lib/claude.js';

const router = express.Router();

function collect(days) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const tils = read('tils').filter((t) => t.createdAt >= since);
  const learningDone = read('learning').filter((l) => l.doneAt && l.doneAt >= since);
  const learningAdded = read('learning').filter((l) => l.createdAt >= since);
  const content = read('content');
  const contentPosted = content.filter((c) => c.postedAt && c.postedAt >= since);
  const contentDrafted = content.filter((c) => c.createdAt >= since && c.drafts);
  const snippetsAdded = read('snippets').filter((s) => s.createdAt >= since);
  return { tils, learningDone, learningAdded, contentPosted, contentDrafted, snippetsAdded };
}

router.get('/', (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt(req.query.days) || 7));
  const d = collect(days);
  res.json({
    days,
    counts: {
      tils: d.tils.length,
      learningDone: d.learningDone.length,
      learningAdded: d.learningAdded.length,
      contentPosted: d.contentPosted.length,
      contentDrafted: d.contentDrafted.length,
      snippetsAdded: d.snippetsAdded.length,
    },
    ...d,
  });
});

router.post('/summary', async (req, res) => {
  if (!claude.available()) {
    return res.status(503).json({ error: 'Claude Agent SDK not installed' });
  }
  const days = Math.max(1, Math.min(90, parseInt(req.body.days) || 7));
  const d = collect(days);

  const prompt = `Write a short, motivating weekly review for a full-stack developer who is building his skills, content, and income. Be concrete, no fluff. Use markdown with a couple of short sections.

Data from the last ${days} days:

Things he learned (TILs):
${d.tils.map((t) => `- ${t.text}`).join('\n') || '- none logged'}

Learning items completed:
${d.learningDone.map((l) => `- ${l.title}`).join('\n') || '- none'}

Learning items added to queue:
${d.learningAdded.map((l) => `- ${l.title}`).join('\n') || '- none'}

Content posted:
${d.contentPosted.map((c) => `- ${c.title}`).join('\n') || '- none'}

Content drafted:
${d.contentDrafted.map((c) => `- ${c.title}`).join('\n') || '- none'}

End with a section "Content ideas for next week" — 2-3 specific post ideas based on what he learned, and one honest observation about where his time went.`;

  // On failure the async throw is auto-forwarded to the error middleware (500).
  const text = await claude.runText(prompt);
  res.json({ summary: text });
});

export default router;
