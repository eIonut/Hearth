import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function SkillsPage() {
  const [repoPath, setRepoPath] = useState('');
  const [saved, setSaved] = useState(false);
  const [skillsInfo, setSkillsInfo] = useState({ configured: false, skills: [] });
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [installed, setInstalled] = useState([]);
  const [selected, setSelected] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function loadSkills() {
    setSkillsInfo(await api('/skills'));
  }

  useEffect(() => {
    api('/skills/settings').then((s) => setRepoPath(s.skillsRepoPath || ''));
    loadSkills();
    api('/projects').then((ps) => {
      setProjects(ps);
      if (ps.length) setProjectId(ps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api(`/skills/installed/${projectId}`).then((r) => setInstalled(r.installed)).catch(() => setInstalled([]));
  }, [projectId, msg]);

  async function savePath() {
    setError(''); setSaved(false);
    try {
      await api('/skills/settings', { method: 'PUT', body: { skillsRepoPath: repoPath } });
      setSaved(true);
      loadSkills();
    } catch (e) { setError(e.message); }
  }

  async function install() {
    setError(''); setMsg('');
    const names = Object.keys(selected).filter((n) => selected[n]);
    if (!names.length) return;
    try {
      const r = await api('/skills/install', { method: 'POST', body: { projectId, names } });
      setMsg(`Installed: ${r.installed.join(', ')}${r.errors.length ? ` · Errors: ${r.errors.join('; ')}` : ''}`);
      setSelected({});
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="page">
      <h2>AI Skills</h2>
      <p className="muted">Your reusable skills repo, installable into any project's <span className="mono">.claude/skills</span> with one click.</p>

      <div className="card">
        <h3>Skills repo location</h3>
        <div className="row">
          <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/Users/you/code/my-ai-skills" />
          <button className="btn primary" onClick={savePath}>Save</button>
        </div>
        {saved && <div className="success">Saved.</div>}
        <div className="muted small-text">A skill is a subfolder containing SKILL.md, or a loose .md file.</div>
      </div>

      {skillsInfo.configured && (
        <div className="card">
          <div className="row space-between">
            <h3>Skills ({skillsInfo.skills.length})</h3>
            {projects.length > 0 && (
              <div className="row">
                <span className="muted">Install into:</span>
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn primary" onClick={install} disabled={!Object.values(selected).some(Boolean)}>
                  Install selected
                </button>
              </div>
            )}
          </div>

          {skillsInfo.missing && <div className="error">Configured path no longer exists.</div>}
          {skillsInfo.skills.length === 0 && !skillsInfo.missing && (
            <div className="muted">No skills found in the repo yet.</div>
          )}

          {skillsInfo.skills.map((s) => (
            <div className="service-row" key={s.name}>
              <input
                type="checkbox"
                style={{ width: 'auto', margin: 0 }}
                checked={!!selected[s.name]}
                onChange={(e) => setSelected((sel) => ({ ...sel, [s.name]: e.target.checked }))}
              />
              <span className="service-name">{s.name}</span>
              {installed.includes(s.name) && <span className="tag">installed</span>}
              <span className="muted small-text">{s.description}</span>
            </div>
          ))}

          {msg && <div className="success">{msg}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}
