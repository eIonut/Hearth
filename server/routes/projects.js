const express = require('express');
const fs = require('fs');
const os = require('os');
const { read, write, id } = require('../lib/store');

function expandHome(p) {
  if (typeof p === 'string' && (p === '~' || p.startsWith('~/'))) {
    return os.homedir() + p.slice(1);
  }
  return p;
}

const router = express.Router();
const NAME = 'projects';

// Project shape: { id, name, path, envFile, services: [{ name, cmd }] }

router.get('/', (req, res) => {
  res.json(read(NAME));
});

router.post('/', (req, res) => {
  const { name, envFile, envTargets, services, previews, links } = req.body;
  const projectPath = expandHome(req.body.path);
  if (!name || !projectPath) return res.status(400).json({ error: 'name and path are required' });
  if (!fs.existsSync(projectPath))
    return res.status(400).json({ error: `path does not exist: ${projectPath}` });

  const projects = read(NAME);
  const project = {
    id: id(),
    name,
    path: projectPath,
    envFile: envFile || '.env',
    envTargets: Array.isArray(envTargets) ? envTargets : [],
    services: Array.isArray(services) ? services : [],
    previews: Array.isArray(previews) ? previews : [],
    links: Array.isArray(links) ? links : [],
  };
  projects.push(project);
  write(NAME, projects);
  res.json(project);
});

router.put('/:id', (req, res) => {
  const projects = read(NAME);
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const { name, envFile, envTargets, services, previews, links } = req.body;
  const projectPath = req.body.path !== undefined ? expandHome(req.body.path) : undefined;
  if (projectPath !== undefined && !fs.existsSync(projectPath)) {
    return res.status(400).json({ error: `path does not exist: ${projectPath}` });
  }
  projects[idx] = {
    ...projects[idx],
    ...(name !== undefined && { name }),
    ...(projectPath !== undefined && { path: projectPath }),
    ...(envFile !== undefined && { envFile }),
    ...(envTargets !== undefined && { envTargets }),
    ...(services !== undefined && { services }),
    ...(previews !== undefined && { previews }),
    ...(links !== undefined && { links }),
  };
  write(NAME, projects);
  res.json(projects[idx]);
});

router.delete('/:id', (req, res) => {
  const projects = read(NAME).filter((p) => p.id !== req.params.id);
  write(NAME, projects);
  res.json({ ok: true });
});

module.exports = router;
