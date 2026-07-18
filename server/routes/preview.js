import express from 'express';

const router = express.Router();

// Check whether a URL is reachable and whether it allows iframe embedding.
router.get('/check', async (req, res) => {
  let { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url is required' });
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);

    const xfo = r.headers.get('x-frame-options') || '';
    const csp = r.headers.get('content-security-policy') || '';
    const cspBlocks = /frame-ancestors\s+(?!\*)/i.test(csp);
    const blocked = /deny|sameorigin/i.test(xfo) || cspBlocks;

    res.json({
      reachable: true,
      status: r.status,
      blocked,
      reason: blocked ? (xfo ? `X-Frame-Options: ${xfo}` : 'CSP frame-ancestors') : null,
    });
  } catch (e) {
    res.json({ reachable: false, blocked: false, error: e.message });
  }
});

export default router;
