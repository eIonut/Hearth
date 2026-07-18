import fs from 'fs';
import path from 'path';
import { backup } from './backup.js';

const ENVS_DIR = path.join(import.meta.dirname, '..', '..', 'envs');

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

function computeTargets(project) {
  return targetsFor(project).map((t) => {
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
        } catch {
          /* skip unreadable preset */
        }
      }
    }
    return { name: t.name, file: t.file, exists, presets, current };
  });
}

function applyPreset(project, targetName, preset) {
  if (!safeName(preset)) throw new Error('invalid preset name');
  const target = targetsFor(project).find((t) => t.name === targetName);
  if (!target) throw new Error(`env target not found: ${targetName}`);
  const src = presetPath(project.id, target.name, preset);
  if (!fs.existsSync(src)) throw new Error(`preset not found: ${preset}`);
  const dest = path.join(project.path, target.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  backup(project.id, dest, target.file);
  fs.copyFileSync(src, dest);
}

function savePreset(project, targetName, name) {
  if (!safeName(name)) throw new Error('invalid preset name (letters, numbers, - _ . only)');
  const target = targetsFor(project).find((t) => t.name === targetName);
  if (!target) throw new Error(`env target not found: ${targetName}`);
  const src = path.join(project.path, target.file);
  if (!fs.existsSync(src)) throw new Error(`no ${target.file} file in project`);
  const dir = targetDir(project.id, target.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, name + '.env'));
}

function deletePreset(projectId, targetName, preset) {
  if (!safeName(targetName) || !safeName(preset)) throw new Error('invalid name');
  const file = presetPath(projectId, targetName, preset);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export { targetsFor, computeTargets, applyPreset, savePreset, deletePreset, listPresets };
