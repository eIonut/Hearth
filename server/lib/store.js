import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(import.meta.dirname, '..', '..', 'data');

function file(name) {
  return path.join(DATA_DIR, name + '.json');
}

function read(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(data, null, 2));
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export { read, write, id, DATA_DIR };
