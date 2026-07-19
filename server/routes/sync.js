import express from 'express';
import { normalizePath } from '../lib/validate.js';
import {
  PORTABLE_ELIGIBLE,
  getConfig,
  saveConfig,
  enabledFiles,
  collect,
  scanSecrets,
  restore as applyRestore,
} from '../lib/sync.js';
import { runCloud, runGit, dirtySince } from '../lib/syncrun.js';
import * as cloud from '../lib/cloudsync.js';
import * as gitsync from '../lib/gitsync.js';

const router = express.Router();

// A cheap poll target for the sidebar backup indicator: config + file mtimes
// only, no git subprocesses or cloud stat. Reports the most recent backup, a
// per-destination pair of timestamps (so the client can name what synced), and
// whether a configured destination is stale (data changed since it last
// backed up) or its last auto-sync was blocked on a secret.
router.get('/summary', (req, res) => {
  const { cloud: cd, git: g, lastCloudAt, lastGitAt, autoState } = getConfig();
  const configured = !!(cd.dir || g.remote);
  const stale = (!!cd.dir && dirtySince(lastCloudAt)) || (!!g.remote && dirtySince(lastGitAt));
  const times = [lastCloudAt, lastGitAt].filter(Boolean).map((t) => Date.parse(t));
  res.json({
    configured,
    lastBackupAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    lastCloudAt,
    lastGitAt,
    stale: configured && stale,
    autoBlocked: autoState?.cloud?.status === 'blocked' || autoState?.git?.status === 'blocked',
  });
});

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
    patch.cloud = { dir: req.body.cloudDir ? normalizePath(req.body.cloudDir) : '' };
  }
  if (req.body.gitRemote !== undefined || req.body.gitRepoDir !== undefined) {
    const cur = getConfig().git;
    patch.git = {
      repoDir: req.body.gitRepoDir ? normalizePath(req.body.gitRepoDir) : cur.repoDir,
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
