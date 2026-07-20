import fs from 'fs';
import path from 'path';

const DEFAULT_DIR = path.join(import.meta.dirname, '..', '..', 'data');

// Data directory, resolved on each call so tests can point it at a temp dir via
// HEARTH_DATA_DIR without having to set the env var before this module loads.
// The former DEV_HUB_DATA_DIR is still honored so existing shells keep working.
function dataDir() {
  return process.env.HEARTH_DATA_DIR || process.env.DEV_HUB_DATA_DIR || DEFAULT_DIR;
}

function file(name) {
  return path.join(dataDir(), name + '.json');
}

function read(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, data) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(data, null, 2));
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export { read, write, id, dataDir };
