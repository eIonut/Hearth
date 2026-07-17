import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

function TargetCard({ projectId, target, onChanged }) {
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function apply(preset) {
    setMsg(''); setError('');
    try {
      await api(`/env/${projectId}/apply`, { method: 'POST', body: { target: target.name, preset } });
      setMsg(`Applied "${preset}" (previous version saved in dev-hub/backups)`);
      onChanged();
    } catch (e) { setError(e.message); }
  }

  async function saveCurrent() {
    setMsg(''); setError('');
    try {
      await api(`/env/${projectId}/save`, { method: 'POST', body: { target: target.name, name: newName } });
      setMsg(`Saved current ${target.file} as "${newName}"`);
      setNewName('');
      onChanged();
    } catch (e) { setError(e.message); }
  }

  async function removePreset(preset) {
    if (!confirm(`Delete preset "${preset}" for ${target.name}?`)) return;
    await api(`/env/${projectId}/${target.name}/${preset}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="card">
      <div className="row space-between">
        <h3>{target.name}</h3>
        <span className="muted mono small-text">{target.file}{!target.exists && ' (missing)'}</span>
      </div>

      {target.presets.length === 0 && (
        <div className="muted small-text">No presets yet — save the current file below.</div>
      )}
      {target.presets.map((name) => (
        <div className="service-row" key={name}>
          <span className={'dot ' + (target.current === name ? 'green' : 'gray')} />
          <span className="service-name">{name}</span>
          {target.current === name && <span className="muted small-text">active</span>}
          <span className="spacer" />
          <button className="btn small primary" onClick={() => apply(name)} disabled={target.current === name}>Apply</button>
          <button className="btn small danger" onClick={() => removePreset(name)}>✕</button>
        </div>
      ))}

      <div className="row">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Save current as… (e.g. staging)" />
        <button className="btn primary" onClick={saveCurrent} disabled={!newName || !target.exists}>Save</button>
      </div>

      {msg && <div className="success">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default function EnvPage() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [targets, setTargets] = useState([]);

  useEffect(() => {
    api('/projects').then((ps) => {
      setProjects(ps);
      if (ps.length) setProjectId((cur) => cur || ps[0].id);
    });
  }, []);

  async function load(id = projectId) {
    if (!id) return;
    const r = await api(`/env/${id}`);
    setTargets(r.targets || []);
  }

  useEffect(() => { load(); }, [projectId]);

  return (
    <div className="page">
      <h2>Env Presets</h2>
      <p className="muted">
        One-click env swaps per service. Define env targets on the project (Dashboard → Edit) — one per service if needed.
        The current file is always backed up before a swap.
      </p>

      {projects.length === 0 ? (
        <div className="card empty">Add a project on the Dashboard first.</div>
      ) : (
        <>
          <label className="inline-label">Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {targets.map((t) => (
            <TargetCard key={t.name} projectId={projectId} target={t} onChanged={load} />
          ))}
        </>
      )}
    </div>
  );
}
