import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useConfirm } from '../common/ConfirmDialog.jsx';

function TargetCard({ projectId, target, onChanged }) {
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();

  async function apply(preset) {
    setMsg('');
    setError('');
    try {
      await api(`/env/${projectId}/apply`, {
        method: 'POST',
        body: { target: target.name, preset },
      });
      setMsg(`Applied "${preset}" (previous version saved in dev-hub/backups)`);
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveCurrent() {
    setMsg('');
    setError('');
    try {
      await api(`/env/${projectId}/save`, {
        method: 'POST',
        body: { target: target.name, name: newName },
      });
      setMsg(`Saved current ${target.file} as "${newName}"`);
      setNewName('');
      onChanged();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removePreset(preset) {
    if (!(await confirm(`Delete preset "${preset}" for ${target.name}?`))) return;
    await api(`/env/${projectId}/${target.name}/${preset}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="card compact op-editor">
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <strong>{target.name}</strong>
        <span className="text-muted font-mono text-[12px]">
          {target.file}
          {!target.exists && ' (missing)'}
        </span>
      </div>

      {target.presets.length === 0 && (
        <div className="text-muted text-[12px]">No presets yet — save the current file below.</div>
      )}
      {target.presets.map((name) => (
        <div className="service-row" key={name}>
          <span className={'dot ' + (target.current === name ? 'green' : 'gray')} />
          <span className="service-name">{name}</span>
          {target.current === name && <span className="text-muted text-[12px]">active</span>}
          <span className="flex-1" />
          <button
            className="btn small primary"
            onClick={() => apply(name)}
            disabled={target.current === name}
          >
            Apply
          </button>
          <button className="btn small danger" onClick={() => removePreset(name)}>
            ✕
          </button>
        </div>
      ))}

      <div className="flex gap-2 items-center flex-wrap my-1.5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Save current as… (e.g. staging)"
        />
        <button className="btn primary" onClick={saveCurrent} disabled={!newName || !target.exists}>
          Save
        </button>
      </div>

      {msg && <div className="text-green my-1.5">{msg}</div>}
      {error && <div className="text-red my-1.5">{error}</div>}
    </div>
  );
}

// Env presets for one project, shown inside its card on the Projects page.
export default function EnvPanel({ projectId }) {
  const [targets, setTargets] = useState([]);

  async function load() {
    try {
      const r = await api(`/env/${projectId}`);
      setTargets(r.targets || []);
    } catch {
      setTargets([]);
    }
  }

  useEffect(() => {
    load();
  }, [projectId]);

  if (targets.length === 0) {
    return (
      <div className="text-muted text-[12px]" style={{ padding: '8px 0' }}>
        No env targets — add env files to this project via Edit. The current file is always backed
        up before a swap.
      </div>
    );
  }

  return targets.map((t) => (
    <TargetCard key={t.name} projectId={projectId} target={t} onChanged={load} />
  ));
}
