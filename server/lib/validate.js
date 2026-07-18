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
