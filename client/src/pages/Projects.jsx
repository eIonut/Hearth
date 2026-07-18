import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api.js';
import { openPreview } from '../lib/bus.js';
import { usePoll } from '../hooks/usePoll.js';
import SubTabsNav from '../components/common/SubTabsNav.jsx';
import ProjectForm from '../components/projects/ProjectForm.jsx';
import ProjectCard from '../components/projects/ProjectCard.jsx';
import LogPanel from '../components/projects/LogPanel.jsx';
import WorkflowQuickRun from '../components/projects/WorkflowQuickRun.jsx';
import Workflows from './Workflows.jsx';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

const PAGE_TABS = [
  { to: '/projects', label: 'Overview', end: true },
  { to: '/projects/workflows', label: 'Workflows' },
];

export default function Projects() {
  const pageTab = useLocation().pathname === '/projects/workflows' ? 'workflows' : 'overview';
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [workflows, setWorkflows] = useState([]);
  const [wfRunning, setWfRunning] = useState({});
  const [wfMsg, setWfMsg] = useState('');
  const [editing, setEditing] = useState(null); // null | {} | project
  const [logTarget, setLogTarget] = useState(null);
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
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
        <h2>Projects</h2>
        <SubTabsNav tabs={PAGE_TABS} />
      </div>

      {pageTab === 'workflows' ? (
        <Workflows />
      ) : (
        <>
          <div className="flex gap-2 items-center flex-wrap my-1.5">
            <WorkflowQuickRun workflows={workflows} running={wfRunning} onRun={runWorkflow} />
            <span className="flex-1" />
            <button className="btn primary" onClick={() => setEditing({})}>
              + Add project
            </button>
          </div>
          {wfMsg && <div className={wfMsg.includes('failed') ? 'text-red my-1.5' : 'text-green my-1.5'}>{wfMsg}</div>}

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
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                statuses={statuses}
                onEdit={() => setEditing(p)}
                onRemove={() => remove(p)}
                onToggle={(service) => toggle(p, service)}
                onLogs={(service) =>
                  setLogTarget({ projectId: p.id, projectName: p.name, service: service.name })
                }
              />
            ))}
          </div>

          {logTarget && <LogPanel target={logTarget} onClose={() => setLogTarget(null)} />}
        </>
      )}
    </div>
  );
}
