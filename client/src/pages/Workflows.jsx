import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { openPreview } from '../lib/bus.js';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

const STEP_LABELS = {
  start: 'Start service',
  stop: 'Stop service',
  'env-apply': 'Apply env preset',
  'patch-apply': 'Apply patch',
  'patch-revert': 'Revert patch',
  preview: 'Open preview',
};

function StepEditor({ step, projects, patches, envCache, loadEnv, onChange, onRemove }) {
  const project = projects.find((p) => p.id === step.projectId);

  function set(field, value) {
    onChange({ ...step, [field]: value });
  }

  function setType(type) {
    onChange({ type, projectId: step.projectId || (projects[0]?.id ?? '') });
  }

  useEffect(() => {
    if (step.type === 'env-apply' && step.projectId) loadEnv(step.projectId);
  }, [step.type, step.projectId]);

  const envTargets = envCache[step.projectId] || [];

  return (
    <div className="card compact bg-bg">
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <select value={step.type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(STEP_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn small danger" onClick={onRemove}>
          ✕
        </button>
      </div>

      {['start', 'stop', 'env-apply'].includes(step.type) && (
        <div className="flex gap-2 items-center flex-wrap my-1.5">
          <label>
            Project
            <select value={step.projectId || ''} onChange={(e) => set('projectId', e.target.value)}>
              <option value="" disabled>
                choose…
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {['start', 'stop'].includes(step.type) && (
            <label>
              Service
              <select value={step.service || ''} onChange={(e) => set('service', e.target.value)}>
                <option value="" disabled>
                  choose…
                </option>
                {(project?.services || []).map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {step.type === 'env-apply' && (
            <>
              <label>
                Env target
                <select value={step.target || ''} onChange={(e) => set('target', e.target.value)}>
                  <option value="" disabled>
                    choose…
                  </option>
                  {envTargets.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preset
                <select value={step.preset || ''} onChange={(e) => set('preset', e.target.value)}>
                  <option value="" disabled>
                    choose…
                  </option>
                  {(envTargets.find((t) => t.name === step.target)?.presets || []).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}

      {['patch-apply', 'patch-revert'].includes(step.type) && (
        <label>
          Patch
          <select value={step.patchId || ''} onChange={(e) => set('patchId', e.target.value)}>
            <option value="" disabled>
              choose…
            </option>
            {patches.map((p) => {
              const proj = projects.find((pr) => pr.id === p.projectId);
              return (
                <option key={p.id} value={p.id}>
                  {proj?.name || '?'} · {p.name}
                </option>
              );
            })}
          </select>
        </label>
      )}

      {step.type === 'preview' && (
        <div className="flex gap-2 items-center flex-wrap my-1.5">
          <label>
            Label
            <input
              value={step.label || ''}
              onChange={(e) => set('label', e.target.value)}
              placeholder="web"
            />
          </label>
          <label>
            URL
            <input
              list="preview-urls"
              value={step.url || ''}
              onChange={(e) => set('url', e.target.value)}
              placeholder="localhost:4000"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function WorkflowForm({ projects, patches, envCache, loadEnv, initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [steps, setSteps] = useState(initial?.steps || []);
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      if (initial?.id)
        await api(`/workflows/${initial.id}`, { method: 'PUT', body: { name, steps } });
      else await api('/workflows', { method: 'POST', body: { name, steps } });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit workflow' : 'New workflow'}</h3>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="morning: billing stack"
        />
      </label>

      {steps.map((s, i) => (
        <StepEditor
          key={i}
          step={s}
          projects={projects}
          patches={patches}
          envCache={envCache}
          loadEnv={loadEnv}
          onChange={(ns) => setSteps((st) => st.map((x, j) => (j === i ? ns : x)))}
          onRemove={() => setSteps((st) => st.filter((_, j) => j !== i))}
        />
      ))}

      <button
        className="btn small"
        onClick={() => setSteps((s) => [...s, { type: 'start', projectId: projects[0]?.id ?? '' }])}
      >
        + Add step
      </button>

      {error && <div className="text-red my-1.5">{error}</div>}
      <div className="flex gap-2 items-center flex-wrap my-1.5">
        <button
          className="btn primary"
          onClick={save}
          disabled={!name.trim() || steps.length === 0}
        >
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [patches, setPatches] = useState([]);
  const [envCache, setEnvCache] = useState({});
  const [editing, setEditing] = useState(null);
  const [running, setRunning] = useState({});
  const [results, setResults] = useState(null); // { name, results }
  const confirm = useConfirm();

  async function load() {
    setWorkflows(await api('/workflows'));
    setProjects(await api('/projects'));
    setPatches(await api('/patches'));
  }
  useEffect(() => {
    load();
  }, []);

  async function loadEnv(projectId) {
    if (envCache[projectId]) return;
    try {
      const r = await api(`/env/${projectId}`);
      setEnvCache((c) => ({ ...c, [projectId]: r.targets }));
    } catch {
      /* env prefetch — best-effort */
    }
  }

  async function run(wf) {
    setRunning((r) => ({ ...r, [wf.id]: true }));
    setResults(null);
    try {
      const r = await api(`/workflows/${wf.id}/run`, { method: 'POST', body: {} });
      setResults({ name: wf.name, results: r.results });
      for (const step of r.results) {
        if (step.clientPreview) openPreview(step.clientPreview.label, step.clientPreview.url);
      }
    } catch (e) {
      setResults({ name: wf.name, results: [{ label: 'run', ok: false, error: e.message }] });
    }
    setRunning((r) => ({ ...r, [wf.id]: false }));
  }

  async function remove(wf) {
    if (!(await confirm(`Delete workflow "${wf.name}"?`))) return;
    await api(`/workflows/${wf.id}`, { method: 'DELETE' });
    load();
  }

  const previewUrls = projects.flatMap((p) => (p.previews || []).map((pr) => pr.url));

  return (
    <div>
      <datalist id="preview-urls">
        {previewUrls.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <p className="text-muted">
          Your setup rituals as one click: start services, swap env presets, apply patches, open
          previews — in order.
        </p>
        <button className="btn primary" onClick={() => setEditing({})}>
          + New workflow
        </button>
      </div>

      {editing && (
        <WorkflowForm
          projects={projects}
          patches={patches}
          envCache={envCache}
          loadEnv={loadEnv}
          initial={editing.id ? editing : null}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {results && (
        <div className="card">
          <h3>Run: {results.name}</h3>
          {results.results.map((r, i) => (
            <div className="flex items-center gap-2 border-t border-border py-1.5 [&:first-of-type]:border-t-0" key={i}>
              <span
                className={'dot ' + (r.ok ? 'green' : 'gray')}
                style={!r.ok ? { background: 'var(--color-red)' } : {}}
              />
              <span className="text-[12px]">{r.label}</span>
              {r.error && <span className="text-red my-1.5 text-[12px]">{r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {workflows.length === 0 && !editing && (
        <div className="card empty">
          No workflows yet. Create one for your morning setup — it will save you clicks every single
          day.
        </div>
      )}

      {workflows.map((wf) => (
        <div className="card" key={wf.id}>
          <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
            <h3 style={{ margin: 0 }}>{wf.name}</h3>
            <div>
              <button
                className="btn small primary"
                disabled={running[wf.id]}
                onClick={() => run(wf)}
              >
                {running[wf.id] ? 'Running…' : '▶ Run'}
              </button>
              <button className="btn small" onClick={() => setEditing(wf)}>
                Edit
              </button>
              <button className="btn small danger" onClick={() => remove(wf)}>
                ✕
              </button>
            </div>
          </div>
          <div className="text-muted text-[12px]">{wf.stepLabels.join('  →  ')}</div>
        </div>
      ))}
    </div>
  );
}
