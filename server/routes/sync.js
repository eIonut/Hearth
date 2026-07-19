import express from 'express';
import { expandHome } from '../lib/validate.js';
import {
  PORTABLE_ELIGIBLE,
  getConfig,
  saveConfig,
  enabledFiles,
  collect,
  scanSecrets,
  restore as applyRestore,
} from '../lib/sync.js';
import { runCloud, runGit } from '../lib/syncrun.js';
import * as cloud from '../lib/cloudsync.js';
import * as gitsync from '../lib/gitsync.js';

const router = express.Router();

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// --- overview ---------------------------------------------------------------
router.get('/status', (req, res) => {
  const config = getConfig();
  let secretCount = 0;
  try {
    secretCount = scanSecrets(collect(enabledFiles())).length;
  } catch {
    /* scan is best-effort for the overview */
  }
  res.json({
    eligible: PORTABLE_ELIGIBLE,
    config,
    secretCount,
    cloud: safe(() => cloud.status(config.cloud.dir), { configured: !!config.cloud.dir }),
    git: safe(() => gitsync.status(config.git.repoDir), { initialized: false }),
  });
});

router.get('/detect', (req, res) => {
  res.json({ candidates: cloud.detect() });
});

router.put('/config', (req, res) => {
  const patch = {};
  if (Array.isArray(req.body.enabled)) {
    patch.enabled = req.body.enabled.filter((n) => PORTABLE_ELIGIBLE.includes(n));
  }
  if (req.body.cloudDir !== undefined) {
    patch.cloud = { dir: req.body.cloudDir ? expandHome(req.body.cloudDir) : '' };
  }
  if (req.body.gitRemote !== undefined || req.body.gitRepoDir !== undefined) {
    const cur = getConfig().git;
    patch.git = {
      repoDir: req.body.gitRepoDir ? expandHome(req.body.gitRepoDir) : cur.repoDir,
      remote: req.body.gitRemote !== undefined ? req.body.gitRemote.trim() : cur.remote,
    };
  }
  if (req.body.autoCloud !== undefined || req.body.autoGit !== undefined) {
    const cur = getConfig().auto;
    patch.auto = {
      cloud: req.body.autoCloud !== undefined ? !!req.body.autoCloud : cur.cloud,
      git: req.body.autoGit !== undefined ? !!req.body.autoGit : cur.git,
    };
  }
  res.json(saveConfig(patch));
});

// --- secret scan (preview) ---------------------------------------------------
router.get('/scan', (req, res) => {
  res.json({ findings: scanSecrets(collect(enabledFiles())) });
});

// --- cloud folder ------------------------------------------------------------
router.post('/cloud/push', (req, res) => {
  res.json(runCloud({ force: req.body.force }));
});

router.post('/cloud/restore', (req, res) => {
  const files = cloud.pull(getConfig().cloud.dir);
  res.json(applyRestore(files));
});

// --- git remote --------------------------------------------------------------
router.post('/git/init', (req, res) => {
  const config = getConfig();
  const remote = (req.body.remote || config.git.remote || '').trim();
  const result = gitsync.init(config.git.repoDir, remote);
  saveConfig({ git: { repoDir: config.git.repoDir, remote } });
  res.json(result);
});

router.post('/git/push', (req, res) => {
  res.json(runGit({ force: req.body.force, message: req.body.message }));
});

router.post('/git/restore', (req, res) => {
  const config = getConfig();
  const remote = (config.git.remote || req.body.remote || '').trim();
  const files = gitsync.restore(config.git.repoDir, remote);
  res.json(applyRestore(files));
});

export default router;
