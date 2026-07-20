import express from 'express';
import * as terminals from '../lib/terminals.js';
import { NotFoundError } from '../lib/errors.js';

const router = express.Router();

// Persistent shells are only safe if you can see them. This is the hub's
// `tmux ls`: every live session, whether a browser is currently attached, and
// what its foreground process is — so a shell nothing references anymore shows
// up as an orphan you can adopt or kill instead of leaking silently.

router.get('/', (req, res) => {
  res.json({
    available: terminals.available(),
    max: terminals.MAX_SESSIONS,
    sessions: terminals.listSessions(),
  });
});

router.delete('/:id', (req, res) => {
  if (!terminals.killSession(req.params.id)) throw new NotFoundError('no such terminal session');
  res.json({ ok: true });
});

export default router;
