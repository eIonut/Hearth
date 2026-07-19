import fs from 'fs';
import os from 'os';
import { ValidationError } from './errors.js';

// Expand a leading ~ to the user's home directory (e.g. "~/code" → "/Users/x/code").
export function expandHome(p) {
  if (typeof p === 'string' && (p === '~' || p.startsWith('~/'))) {
    return os.homedir() + p.slice(1);
  }
  return p;
}

// Clean up a filesystem path a user typed or pasted into a field. People often
// paste a path copied from a terminal — wrapped in quotes, or with shell-escaped
// spaces ("Mobile\ Documents") — which are escapes for the shell, not part of
// the real path. Strip those, trim, and expand ~ so the value points at the
// actual folder.
export function normalizePath(p) {
  if (typeof p !== 'string') return p;
  let s = p.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  s = s.replace(/\\ /g, ' '); // un-escape shell-escaped spaces
  return expandHome(s);
}

// Throw a 400 unless every named field on `body` is truthy. The message lists
// all required fields ("name and path are required"), matching the prior
// per-route wording.
export function requireFields(body, fields) {
  if (!fields.every((f) => body[f])) {
    const verb = fields.length > 1 ? 'are' : 'is';
    throw new ValidationError(`${fields.join(' and ')} ${verb} required`);
  }
}

// Throw a 400 if the path does not exist on disk.
export function requirePathExists(p) {
  if (!fs.existsSync(p)) {
    throw new ValidationError(`path does not exist: ${p}`);
  }
}
