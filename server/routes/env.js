const express = require('express');
const fs = require('fs');
const path = require('path');
const { read } = require('../lib/store');
const { backup } = require('../lib/backup');

const router = express.Router();
const ENVS_DIR = path.join(__dirname, '..', '..', 'envs');

function getProject(projectId) {
  return read('projects').find((p) => p.id === projectId);
}

// A project can define multiple env targets (e.g. one per service).
// Falls back to the single envFile for older projects.
function targetsFor(project) {
  if (Array.isArray(project.envTargets) && project.envTargets.length) return project.envTargets;
  return [{ name: 'default', file: project.envFile || '.env' }];
}

function safeName(name) {
  return typeof name === 'string' && /^[\w.-]+$/.test(name);
}

function targetDir(projectId, targetName) {
  return path.join(ENVS_DIR, projectId, targetName);
}

function listPresets(projectId, targetName) {
  const dirs = [targetDir(projectId, targetName)];
  // legacy: presets saved before multi-target support live directly under envs/<projectId>/
  if (targetName === 'default') dirs.push(path.join(ENVS_DIR, projectId));
  const names = new Set();
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.env')) names.add(f.name.slice(0, -4));
    }
  }
  return [...names].sort();
}

function presetPath(projectId, targetName, preset) {
  const primary = path.join(targetDir(projectId, targetName), preset + '.env');
  if (fs.existsSync(primary)) return primary;
  if (targetName === 'default') {
    const legacy = path.join(ENVS_DIR, projectId, preset + '.env');
    if (fs.existsSync(legacy)) return legacy;
  }
  return primary;
}

// List all env targets for a project, with presets + which preset is active
router.get('/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });

  const targets = targetsFor(project).map((t) => {
    const abs = path.join(project.path, t.file);
    const exists = fs.existsSync(abs);
    const presets = listPresets(project.id, t.name);
    let current = null;
    if (exists) {
      const activeContent = fs.readFileSync(abs, 'utf8');
      for (const name of presets) {
        try {
          if (fs.readFileSync(presetPath(project.id, t.name, name), 'utf8') === activeContent) {
            current = name;
            break;
          }
        } catch {}
      }
    }
    return { name: t.name, file: t.file, exists, presets, current };
  });

  res.json({ targets });
});

// Apply a preset to a target's env file
router.post('/:projectId/apply', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const { target: targetName, preset } = req.body;
  if (!safeName(preset)) return res.status(400).json({ error: 'invalid preset name' });

  const target = targetsFor(project).find((t) => t.name === targetName);
  if (!target) return res.status(404).json({ error: 'env target not found' });

  const src = presetPath(project.id, target.name, preset);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'preset not found' });

  const dest = path.join(project.path, target.file);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    backup(project.id, dest, target.file);
    fs.copyFileSync(src, dest);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true, applied: preset, target: target.name });
});

// Save a target's current env file as a named preset
router.post('/:projectId/save', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const { target: targetName, name } = req.body;
  if (!safeName(name)) return res.status(400).json({ error: 'invalid preset name (letters, numbers, - _ . only)' });

  const target = targetsFor(project).find((t) => t.name === targetName);
  if (!target) return res.status(404).json({ error: 'env target not found' });

  const src = path.join(project.path, target.file);
  if (!fs.existsSync(src)) return res.status(400).json({ error: `no ${target.file} file in project` });

  const dir = targetDir(project.id, target.name);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, path.join(dir, name + '.env'));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true, saved: name, target: target.name });
});

router.delete('/:projectId/:target/:preset', (req, res) => {
  const { projectId, target, preset } = req.params;
  if (!safeName(target) || !safeName(preset)) return res.status(400).json({ error: 'invalid name' });
  const file = presetPath(projectId, target, preset);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

module.exports = router;
