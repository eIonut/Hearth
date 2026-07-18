import { read, write, id } from './store.js';
import { ValidationError, NotFoundError } from './errors.js';

const NAME = 'templates';

// Template shape: { id, name, commands: [string], cwd? }
// A template is a user-defined command sequence for scaffolding a new project.
// It has no server-side "run": the client runs it in a Workspace terminal by
// chaining the commands (cmd1 && cmd2 && …), so interactive scaffolders work
// and the final dev server stays alive in that tab.

function normalizeCommands(commands) {
  if (!Array.isArray(commands)) throw new ValidationError('commands must be an array');
  const cleaned = commands.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);
  if (cleaned.length === 0) throw new ValidationError('at least one command is required');
  return cleaned;
}

export function list() {
  return read(NAME);
}

export function create({ name, commands, cwd }) {
  if (!name) throw new ValidationError('name is required');
  const template = {
    id: id(),
    name,
    commands: normalizeCommands(commands),
    cwd: cwd || '',
  };
  const templates = read(NAME);
  templates.push(template);
  write(NAME, templates);
  return template;
}

export function update(templateId, { name, commands, cwd }) {
  const templates = read(NAME);
  const idx = templates.findIndex((t) => t.id === templateId);
  if (idx === -1) throw new NotFoundError();
  templates[idx] = {
    ...templates[idx],
    ...(name !== undefined && { name }),
    ...(commands !== undefined && { commands: normalizeCommands(commands) }),
    ...(cwd !== undefined && { cwd }),
  };
  write(NAME, templates);
  return templates[idx];
}

export function remove(templateId) {
  write(
    NAME,
    read(NAME).filter((t) => t.id !== templateId),
  );
}
