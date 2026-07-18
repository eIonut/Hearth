import { read, write, id } from './store.js';
import { expandHome, requirePathExists } from './validate.js';
import { ValidationError, NotFoundError } from './errors.js';

const NAME = 'projects';

// Project shape: { id, name, path, envFile, envTargets, services, previews, links }

export function getById(projectId) {
  return read(NAME).find((p) => p.id === projectId);
}

export function list() {
  return read(NAME);
}

export function create(body) {
  const { name, envFile, envTargets, services, previews, links } = body;
  const projectPath = expandHome(body.path);
  if (!name || !projectPath) throw new ValidationError('name and path are required');
  requirePathExists(projectPath);

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
  return project;
}

export function update(projectId, body) {
  const projects = read(NAME);
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) throw new NotFoundError();
  const { name, envFile, envTargets, services, previews, links } = body;
  const projectPath = body.path !== undefined ? expandHome(body.path) : undefined;
  if (projectPath !== undefined) requirePathExists(projectPath);

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
  return projects[idx];
}

export function remove(projectId) {
  write(
    NAME,
    read(NAME).filter((p) => p.id !== projectId),
  );
}
