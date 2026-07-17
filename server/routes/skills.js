const express = require('express');
const fs = require('fs');
const path = require('path');
const { read, write } = require('../lib/store');

const router = express.Router();

function getSettings() {
  return read('settings', {});
}

// --- settings (skills repo path) ---
router.get('/settings', (req, res) => {
  res.json(getSettings());
});

router.put('/settings', (req, res) => {
  const settings = { ...getSettings() };
  if (req.body.skillsRepoPath !== undefined) {
    const p = req.body.skillsRepoPath;
    if (p && !fs.existsSync(p)) return res.status(400).json({ error: `path does not exist: ${p}` });
    settings.skillsRepoPath = p;
  }
  write('settings', settings);
  res.json(settings);
});

// --- list skills in the repo ---
// A skill is a subfolder containing SKILL.md, or a loose .md file.
router.get('/', (req, res) => {
  const { skillsRepoPath } = getSettings();
  if (!skillsRepoPath) return res.json({ configured: false, skills: [] });
  if (!fs.existsSync(skillsRepoPath)) return res.json({ configured: true, missing: true, skills: [] });

  const skills = [];
  for (const entry of fs.readdirSync(skillsRepoPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      const skillMd = path.join(skillsRepoPath, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        let description = '';
        try {
          const content = fs.readFileSync(skillMd, 'utf8');
          const m = content.match(/^description:\s*(.+)$/m);
          description = m ? m[1].trim() : content.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---')) || '';
        } catch {}
        skills.push({ name: entry.name, type: 'dir', description: description.slice(0, 160) });
      }
    } else if (entry.name.endsWith('.md') && entry.name !== 'README.md') {
      skills.push({ name: entry.name, type: 'file', description: '' });
    }
  }
  res.json({ configured: true, skills });
});

// --- which skills a project already has ---
router.get('/installed/:projectId', (req, res) => {
  const project = read('projects').find((p) => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  const dir = path.join(project.path, '.claude', 'skills');
  if (!fs.existsSync(dir)) return res.json({ installed: [] });
  res.json({ installed: fs.readdirSync(dir).filter((f) => !f.startsWith('.')) });
});

// --- install skills into a project ---
router.post('/install', (req, res) => {
  const { projectId, names } = req.body;
  const { skillsRepoPath } = getSettings();
  if (!skillsRepoPath) return res.status(400).json({ error: 'skills repo path not configured' });

  const project = read('projects').find((p) => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'project not found' });
  if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: 'names is required' });

  const targetDir = path.join(project.path, '.claude', 'skills');
  try {
    fs.mkdirSync(targetDir, { recursive: true });
  } catch (e) {
    return res.status(400).json({ error: `cannot create ${targetDir}: ${e.message}` });
  }

  const installed = [];
  const errors = [];
  for (const name of names) {
    // guard against path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      errors.push(`invalid name: ${name}`);
      continue;
    }
    const src = path.join(skillsRepoPath, name);
    if (!fs.existsSync(src)) {
      errors.push(`not found in repo: ${name}`);
      continue;
    }
    try {
      fs.cpSync(src, path.join(targetDir, name), { recursive: true, force: true });
      installed.push(name);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  res.json({ installed, errors });
});

module.exports = router;
