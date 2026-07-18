import { read, write, id } from './store.js';
import * as procman from './procman.js';
import * as envops from './envops.js';
import * as patchops from './patchops.js';
import * as projects from './projects.js';
import { openInBrowser } from './browser.js';
import { ValidationError, NotFoundError } from './errors.js';

const NAME = 'workflows';

// Workflow shape: { id, name, steps: [step] }
// Step shapes:
//   { type: 'start' | 'stop', projectId, service }
//   { type: 'env-apply', projectId, target, preset }
//   { type: 'patch-apply' | 'patch-revert', patchId }
//   { type: 'preview', label, url }   — executed client-side after run
//   { type: 'open-url', label, url, target: 'browser' | 'workspace' }
//   { type: 'terminal', projectId?, command } — opened client-side after run

const STEP_TYPES = [
  'start',
  'stop',
  'env-apply',
  'patch-apply',
  'patch-revert',
  'preview',
  'open-url',
  'terminal',
];

function describeStep(step) {
  const project = step.projectId ? projects.getById(step.projectId) : null;
  switch (step.type) {
    case 'start':
      return `start ${project?.name || '?'}/${step.service}`;
    case 'stop':
      return `stop ${project?.name || '?'}/${step.service}`;
    case 'env-apply':
      return `env ${project?.name || '?'}/${step.target} → ${step.preset}`;
    case 'patch-apply': {
      const patch = read('patches').find((p) => p.id === step.patchId);
      return `apply patch "${patch?.name || '?'}"`;
    }
    case 'patch-revert': {
      const patch = read('patches').find((p) => p.id === step.patchId);
      return `revert patch "${patch?.name || '?'}"`;
    }
    case 'preview':
      return `open ${step.label || step.url} in Workspace`;
    case 'open-url':
      return `open ${step.label || step.url} in ${step.target === 'workspace' ? 'Workspace' : 'browser'}`;
    case 'terminal':
      return `run ${step.command}`;
    default:
      return step.type;
  }
}

function validateStep(step) {
  if (!STEP_TYPES.includes(step.type)) return `unknown step type: ${step.type}`;
  if (['start', 'stop'].includes(step.type) && (!step.projectId || !step.service))
    return `${step.type} needs projectId and service`;
  if (step.type === 'env-apply' && (!step.projectId || !step.target || !step.preset))
    return 'env-apply needs projectId, target, preset';
  if (['patch-apply', 'patch-revert'].includes(step.type) && !step.patchId)
    return `${step.type} needs patchId`;
  if (step.type === 'preview' && !step.url) return 'preview needs url';
  if (step.type === 'open-url') {
    if (!step.url) return 'open-url needs url';
    if (step.target !== undefined && !['browser', 'workspace'].includes(step.target))
      return 'open-url target must be browser or workspace';
  }
  if (step.type === 'terminal' && !step.command?.trim()) return 'terminal needs command';
  return null;
}

function assertValidSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0)
    throw new ValidationError('at least one step is required');
  for (const s of steps) {
    const err = validateStep(s);
    if (err) throw new ValidationError(err);
  }
}

export function list() {
  return read(NAME).map((w) => ({
    ...w,
    stepLabels: w.steps.map(describeStep),
  }));
}

export function create({ name, steps }) {
  if (!name) throw new ValidationError('name is required');
  assertValidSteps(steps);
  const workflows = read(NAME);
  const wf = { id: id(), name, steps };
  workflows.push(wf);
  write(NAME, workflows);
  return wf;
}

export function update(wfId, { name, steps }) {
  const workflows = read(NAME);
  const idx = workflows.findIndex((w) => w.id === wfId);
  if (idx === -1) throw new NotFoundError();
  if (steps !== undefined) assertValidSteps(steps);
  workflows[idx] = {
    ...workflows[idx],
    ...(name !== undefined && { name }),
    ...(steps !== undefined && { steps }),
  };
  write(NAME, workflows);
  return workflows[idx];
}

export function remove(wfId) {
  write(
    NAME,
    read(NAME).filter((w) => w.id !== wfId),
  );
}

// Run all server-side steps in order; URL and terminal steps are returned for
// the client to open. Per-step failures are captured instead of aborting.
export function run(wfId) {
  const wf = read(NAME).find((w) => w.id === wfId);
  if (!wf) throw new NotFoundError();

  const results = [];
  for (const step of wf.steps) {
    const label = describeStep(step);
    try {
      if (step.type === 'start' || step.type === 'stop') {
        const project = projects.getById(step.projectId);
        if (!project) throw new Error('project not found');
        if (step.type === 'start') {
          const service = (project.services || []).find((s) => s.name === step.service);
          if (!service) throw new Error(`service not found: ${step.service}`);
          const r = procman.start(project, service);
          if (!r.ok) throw new Error(r.error || 'failed to start');
        } else {
          procman.stop(project.id, step.service);
        }
      } else if (step.type === 'env-apply') {
        const project = projects.getById(step.projectId);
        if (!project) throw new Error('project not found');
        envops.applyPreset(project, step.target, step.preset);
      } else if (step.type === 'patch-apply' || step.type === 'patch-revert') {
        const patch = read('patches').find((p) => p.id === step.patchId);
        if (!patch) throw new Error('patch not found');
        const project = projects.getById(patch.projectId);
        if (!project) throw new Error('project not found');
        if (step.type === 'patch-apply') patchops.applyPatch(project, patch);
        else patchops.revertPatch(project, patch);
      } else if (step.type === 'preview') {
        results.push({
          label,
          ok: true,
          clientPreview: { label: step.label || step.url, url: step.url },
        });
        continue;
      } else if (step.type === 'open-url') {
        if ((step.target || 'browser') === 'browser') {
          openInBrowser(step.url);
          results.push({ label, ok: true });
        } else {
          results.push({
            label,
            ok: true,
            clientUrl: {
              label: step.label || step.url,
              url: step.url,
              target: 'workspace',
            },
          });
        }
        continue;
      } else if (step.type === 'terminal') {
        const project = step.projectId ? projects.getById(step.projectId) : null;
        if (step.projectId && !project) throw new Error('project not found');
        results.push({
          label,
          ok: true,
          clientTerm: {
            label: step.label || step.command,
            cwd: project?.path || '',
            cmd: step.command,
          },
        });
        continue;
      }
      results.push({ label, ok: true });
    } catch (e) {
      results.push({ label, ok: false, error: e.message });
    }
  }
  return { results };
}
