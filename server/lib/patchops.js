import fs from 'fs';
import path from 'path';
import { read, write } from './store.js';
import { backup } from './backup.js';

const STATE = 'patchstate'; // { [patchId]: { [opIndex]: { prev } } }
const PH = '\x00__HUB_PH__\x00';

function fileAbs(project, rel) {
  return path.isAbsolute(rel) ? rel : path.join(project.path, rel);
}

function occurrences(hay, needle) {
  if (!needle) return 0;
  return hay.split(needle).length - 1;
}

function validateOp(op) {
  if (op.type === 'env-set') {
    if (!op.file || !op.key || op.value === undefined) return 'env-set needs file, key, value';
  } else if (op.type === 'replace') {
    if (!op.file || !op.find || !op.replace) return 'replace needs file, find, replace';
    if (op.find === op.replace) return 'find and replace are identical';
  } else {
    return `unknown op type: ${op.type}`;
  }
  return null;
}

function opStatus(project, op) {
  const abs = fileAbs(project, op.file);
  if (!fs.existsSync(abs)) return 'file-missing';
  const content = fs.readFileSync(abs, 'utf8');

  if (op.type === 'replace') {
    const appliedCount = occurrences(content, op.replace);
    const pending = occurrences(content.split(op.replace).join(''), op.find);
    if (appliedCount > 0 && pending === 0) return 'applied';
    if (pending > 0 && appliedCount === 0) return 'not-applied';
    if (pending > 0 && appliedCount > 0) return 'partial';
    return 'not-found';
  }

  if (op.type === 'env-set') {
    const line = content.split(/\r?\n/).find((l) => l.startsWith(op.key + '='));
    if (!line) return 'not-applied';
    return line === `${op.key}=${op.value}` ? 'applied' : 'not-applied';
  }

  return 'unknown';
}

function overallStatus(project, ops) {
  const statuses = ops.map((op) => opStatus(project, op));
  if (statuses.every((s) => s === 'applied')) return 'applied';
  if (statuses.every((s) => s === 'not-applied')) return 'not-applied';
  return 'mixed';
}

function applyOp(project, patchId, opIndex, op) {
  const abs = fileAbs(project, op.file);
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${op.file}`);
  let content = fs.readFileSync(abs, 'utf8');
  backup(project.id, abs, op.file);

  if (op.type === 'replace') {
    // protect already-applied occurrences so applying twice is a no-op
    let tmp = content.split(op.replace).join(PH);
    tmp = tmp.split(op.find).join(op.replace);
    content = tmp.split(PH).join(op.replace);
  } else if (op.type === 'env-set') {
    const lines = content.split(/\r?\n/);
    const idx = lines.findIndex((l) => l.startsWith(op.key + '='));
    const state = read(STATE, {});
    state[patchId] = state[patchId] || {};
    if (idx !== -1) {
      if (lines[idx] !== `${op.key}=${op.value}`) {
        state[patchId][opIndex] = { prev: lines[idx] };
      }
      lines[idx] = `${op.key}=${op.value}`;
    } else {
      state[patchId][opIndex] = { prev: null };
      lines.push(`${op.key}=${op.value}`);
    }
    write(STATE, state);
    content = lines.join('\n');
  }

  fs.writeFileSync(abs, content);
}

function revertOp(project, patchId, opIndex, op) {
  const abs = fileAbs(project, op.file);
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${op.file}`);
  let content = fs.readFileSync(abs, 'utf8');
  backup(project.id, abs, op.file);

  if (op.type === 'replace') {
    content = content.split(op.replace).join(op.find);
  } else if (op.type === 'env-set') {
    const lines = content.split(/\r?\n/);
    const idx = lines.findIndex((l) => l.startsWith(op.key + '='));
    const state = read(STATE, {});
    const saved = state[patchId] ? state[patchId][opIndex] : undefined;
    if (idx !== -1) {
      if (op.revert !== undefined && op.revert !== '') {
        lines[idx] = `${op.key}=${op.revert}`;
      } else if (saved && saved.prev) {
        lines[idx] = saved.prev;
      } else if (saved && saved.prev === null) {
        lines.splice(idx, 1);
      } else {
        throw new Error(`no saved previous value for ${op.key} — set a revert value on this op`);
      }
    }
    if (state[patchId]) {
      delete state[patchId][opIndex];
      write(STATE, state);
    }
    content = lines.join('\n');
  }

  fs.writeFileSync(abs, content);
}

function applyPatch(project, patch) {
  patch.ops.forEach((op, i) => applyOp(project, patch.id, i, op));
}

function revertPatch(project, patch) {
  patch.ops.forEach((op, i) => revertOp(project, patch.id, i, op));
}

function clearState(patchId) {
  const state = read(STATE, {});
  delete state[patchId];
  write(STATE, state);
}

export { validateOp, opStatus, overallStatus, applyPatch, revertPatch, clearState };
