import { useEffect, useRef, useState } from 'react';
import { AnsiUp } from 'ansi_up';
import { api } from '../api.js';
import { openPreview } from '../lib/bus.js';
import { usePoll } from '../hooks/usePoll.js';
import SubTabs from '../components/SubTabs.jsx';
import EnvPanel from '../components/EnvPanel.jsx';
import PatchPanel from '../components/PatchPanel.jsx';
import Workflows from './Workflows.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

const ansi = new AnsiUp();

const PAGE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'workflows', label: 'Workflows' },
];

const CARD_TABS = [
  { id: 'services', label: 'Services' },
  { id: 'env', label: 'Env presets' },
  { id: 'patches', label: 'Patches' },
];

function parseServices(text) {
  // one per line: "web: yarn dev" — add * after the name for auto-restart on crash: "web*: yarn dev"
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      let name = i === -1 ? l : l.slice(0, i).trim();
      const cmd = i === -1 ? l : l.slice(i + 1).trim();
      let autoRestart = false;
      if (name.endsWith('*')) {
        autoRestart = true;
        name = name.slice(0, -1).trim();
      }
      return { name, cmd, autoRestart };
    });
}

function parseEnvTargets(text) {
  // one per line: "web: apps/web/.env" or just ".env" (named default)
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      if (i === -1) return { name: 'default', file: l };
      return { name: l.slice(0, i).trim(), file: l.slice(i + 1).trim() };
    });
}

function ProjectForm({ initial, onSaved, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [path, setPath] = useState(initial?.path || '');
  const [servicesText, setServicesText] = useState(
    (initial?.services || [])
      .map((s) => `${s.name}${s.autoRestart ? '*' : ''}: ${s.cmd}`)
      .join('\n'),
  );
  const [envText, setEnvText] = useState(
    initial?.envTargets?.length
      ? initial.envTargets.map((t) => `${t.name}: ${t.file}`).join('\n')
      : initial?.envFile
        ? `default: ${initial.envFile}`
        : 'default: .env',
  );
  const [previewsText, setPreviewsText] = useState(
    (initial?.previews || []).map((p) => `${p.name}: ${p.url}`).join('\n'),
  );
  const [linksText, setLinksText] = useState(
    (initial?.links || []).map((l) => `${l.name}: ${l.url}`).join('\n'),
  );
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const body = {
      name,
      path,
      services: parseServices(servicesText),
      envTargets: parseEnvTargets(envText),
      previews: previewsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const i = l.indexOf(':');
          if (i === -1) return { name: 'app', url: l };
          return { name: l.slice(0, i).trim(), url: l.slice(i + 1).trim() };
        }),
      links: linksText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const i = l.indexOf(':');
          if (i === -1) return { name: l, url: l };
          return { name: l.slice(0, i).trim(), url: l.slice(i + 1).trim() };
        }),
    };
    try {
      if (initial?.id) await api(`/projects/${initial.id}`, { method: 'PUT', body });
      else await api('/projects', { method: 'POST', body });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="card form-card">
      <h3>{initial?.id ? 'Edit project' : 'Add project'}</h3>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" />
      </label>
      <label>
        Absolute path
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/Users/you/code/my-app"
        />
      </label>
      <label>
        Services (one per line, "name: command" — add * for auto-restart on crash, e.g. "api*: yarn
        start")
        <textarea
          rows={3}
          value={servicesText}
          onChange={(e) => setServicesText(e.target.value)}
          placeholder={'web: yarn dev\napi*: yarn start'}
        />
      </label>
      <label>
        Env files (one per line, "name: relative/path" — one per service if needed)
        <textarea
          rows={3}
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          placeholder={'web: apps/web/.env\napi: apps/api/.env'}
        />
      </label>
      <label>
        Preview URLs (one per line, "service: url" — opens inside the hub)
        <textarea
          rows={2}
          value={previewsText}
          onChange={(e) => setPreviewsText(e.target.value)}
          placeholder={'web: localhost:4000\napi: localhost:5000/docs'}
        />
      </label>
      <label>
        Links (one per line, "name: url" — repo, MRs, pipelines, docs; embeds in the hub when the
        site allows it, otherwise opens a new tab)
        <textarea
          rows={2}
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          placeholder={
            'repo: https://github.com/you/my-app\nMRs: https://gitlab.company.com/team/my-app/-/merge_requests'
          }
        />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="btn primary" onClick={save}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// cache embeddability checks across renders (url -> true/false)
const embedCache = {};

function LinkButton({ project, link }) {
  const [embeddable, setEmbeddable] = useState(embedCache[link.url] ?? null);

  useEffect(() => {
    if (embedCache[link.url] !== undefined) return;
    api(`/preview/check?url=${encodeURIComponent(link.url)}`)
      .then((r) => {
        embedCache[link.url] = r.reachable && !r.blocked;
        setEmbeddable(embedCache[link.url]);
      })
      .catch(() => {
        embedCache[link.url] = false;
        setEmbeddable(false);
      });
  }, [link.url]);

  if (embeddable) {
    return (
      <button
        className="btn small"
        onClick={() => openPreview(`${project.name}/${link.name}`, link.url)}
      >
        {link.name}
      </button>
    );
  }
  return (
    <a className="btn small" href={link.url} target="_blank" rel="noreferrer" title={link.url}>
      {link.name} ↗
    </a>
  );
}

function LogPanel({ target, onClose }) {
  const [logs, setLogs] = useState({ lines: [], running: false, exitCode: null });
  const boxRef = useRef(null);

  usePoll(
    () =>
      api(
        `/services/logs?projectId=${target.projectId}&service=${encodeURIComponent(target.service)}`,
      ),
    setLogs,
    1500,
    [target],
  );

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [logs]);

  const html = logs.lines.map((l) => ansi.ansi_to_html(l)).join('\n') || 'No output yet…';

  return (
    <div className="card log-panel">
      <div className="row space-between">
        <h3>
          {target.projectName} / {target.service}{' '}
          {logs.running
            ? '· running'
            : logs.crashed
              ? `· crashed (${logs.exitCode})`
              : logs.exitCode !== null
                ? `· exited (${logs.exitCode})`
                : ''}
        </h3>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <pre className="logs" ref={boxRef} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default function Projects() {
  const [pageTab, setPageTab] = useState('overview');
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [workflows, setWorkflows] = useState([]);
  const [wfRunning, setWfRunning] = useState({});
  const [wfMsg, setWfMsg] = useState('');
  const [editing, setEditing] = useState(null); // null | {} | project
  const [logTarget, setLogTarget] = useState(null);
  const [cardTab, setCardTab] = useState({}); // projectId -> 'services' | 'env' | 'patches'
  const confirm = useConfirm();

  async function load() {
    setProjects(await api('/projects'));
    api('/workflows')
      .then(setWorkflows)
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  async function runWorkflow(wf) {
    setWfRunning((r) => ({ ...r, [wf.id]: true }));
    setWfMsg('');
    try {
      const r = await api(`/workflows/${wf.id}/run`, { method: 'POST', body: {} });
      const failed = r.results.filter((x) => !x.ok);
      for (const step of r.results) {
        if (step.clientPreview) openPreview(step.clientPreview.label, step.clientPreview.url);
      }
      setWfMsg(
        failed.length === 0
          ? `"${wf.name}" done — ${r.results.length} steps ✓`
          : `"${wf.name}": ${failed.length} step(s) failed — ${failed.map((f) => `${f.label}: ${f.error}`).join('; ')}`,
      );
      setStatuses(await api('/services/status'));
    } catch (e) {
      setWfMsg(`"${wf.name}" failed: ${e.message}`);
    }
    setWfRunning((r) => ({ ...r, [wf.id]: false }));
  }

  usePoll(() => api('/services/status'), setStatuses, 2000);

  async function toggle(project, service) {
    const running = statuses[`${project.id}::${service.name}`]?.running;
    await api(`/services/${running ? 'stop' : 'start'}`, {
      method: 'POST',
      body: { projectId: project.id, service: service.name },
    });
    setStatuses(await api('/services/status'));
  }

  async function remove(project) {
    if (!(await confirm(`Remove project "${project.name}" from the hub? (Files are not touched.)`)))
      return;
    await api(`/projects/${project.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="page">
      <div className="row space-between">
        <h2>Projects</h2>
        <SubTabs tabs={PAGE_TABS} active={pageTab} onChange={setPageTab} />
      </div>

      {pageTab === 'workflows' ? (
        <Workflows />
      ) : (
        <>
          <div className="row">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                className="btn small"
                disabled={wfRunning[wf.id]}
                onClick={() => runWorkflow(wf)}
                title={wf.stepLabels.join(' → ')}
              >
                {wfRunning[wf.id] ? '…' : '▶'} {wf.name}
              </button>
            ))}
            <span className="spacer" />
            <button className="btn primary" onClick={() => setEditing({})}>
              + Add project
            </button>
          </div>
          {wfMsg && <div className={wfMsg.includes('failed') ? 'error' : 'success'}>{wfMsg}</div>}

          {editing && (
            <ProjectForm
              initial={editing.id ? editing : null}
              onSaved={() => {
                setEditing(null);
                load();
              }}
              onCancel={() => setEditing(null)}
            />
          )}

          {projects.length === 0 && !editing && (
            <div className="card empty">
              No projects yet. Add your first one — name, path, and its yarn commands.
            </div>
          )}

          <div className="grid">
            {projects.map((p) => {
              const section = cardTab[p.id] || 'services';
              return (
                <div className="card" key={p.id}>
                  <div className="row space-between">
                    <h3>{p.name}</h3>
                    <div>
                      <button className="btn small" onClick={() => setEditing(p)}>
                        Edit
                      </button>
                      <button className="btn small danger" onClick={() => remove(p)}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="muted mono">{p.path}</div>
                  {(p.links || []).length > 0 && (
                    <div className="row" style={{ marginTop: 6 }}>
                      {p.links.map((l) => (
                        <LinkButton key={l.name + l.url} project={p} link={l} />
                      ))}
                    </div>
                  )}

                  <div className="row" style={{ marginTop: 8 }}>
                    <SubTabs
                      small
                      tabs={CARD_TABS}
                      active={section}
                      onChange={(id) => setCardTab((c) => ({ ...c, [p.id]: id }))}
                    />
                  </div>

                  {section === 'services' && (
                    <div className="services">
                      {(p.services || []).map((s) => {
                        const st = statuses[`${p.id}::${s.name}`];
                        const running = st?.running;
                        const crashed = st?.crashed;
                        const preview = (p.previews || []).find((pr) => pr.name === s.name);
                        return (
                          <div className="service-row" key={s.name}>
                            <span
                              className={'dot ' + (running ? 'green' : crashed ? 'red' : 'gray')}
                            />
                            <span className="service-name">
                              {s.name}
                              {s.autoRestart ? ' ↻' : ''}
                            </span>
                            <span className="muted mono small-text">{s.cmd}</span>
                            {crashed && <span className="chip red">crashed ({st.exitCode})</span>}
                            <span className="spacer" />
                            {preview && (
                              <button
                                className="btn small"
                                onClick={() => openPreview(`${p.name}/${s.name}`, preview.url)}
                              >
                                Preview
                              </button>
                            )}
                            <button
                              className="btn small"
                              onClick={() =>
                                setLogTarget({
                                  projectId: p.id,
                                  projectName: p.name,
                                  service: s.name,
                                })
                              }
                            >
                              Logs
                            </button>
                            <button
                              className={'btn small ' + (running ? 'danger' : 'primary')}
                              onClick={() => toggle(p, s)}
                            >
                              {running ? 'Stop' : 'Start'}
                            </button>
                          </div>
                        );
                      })}
                      {(p.services || []).length === 0 && (
                        <div className="muted">No services defined.</div>
                      )}
                    </div>
                  )}

                  {section === 'env' && <EnvPanel projectId={p.id} />}
                  {section === 'patches' && <PatchPanel projectId={p.id} />}
                </div>
              );
            })}
          </div>

          {logTarget && <LogPanel target={logTarget} onClose={() => setLogTarget(null)} />}
        </>
      )}
    </div>
  );
}
