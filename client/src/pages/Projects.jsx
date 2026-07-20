import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Wrench, Plus } from 'lucide-react';
import { api } from '../api.js';
import { openTerm } from '../lib/bus.js';
import { handleWorkflowClientStep } from '../lib/workflowSteps.js';
import { usePoll } from '../hooks/usePoll.js';
import SubTabsNav from '../components/common/SubTabsNav.jsx';
import ProjectForm from '../components/projects/ProjectForm.jsx';
import ProjectCard from '../components/projects/ProjectCard.jsx';
import LogPanel from '../components/projects/LogPanel.jsx';
import WorkflowQuickRun from '../components/projects/WorkflowQuickRun.jsx';
import Workflows from './Workflows.jsx';
import Templates from './Templates.jsx';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';

const PAGE_TABS = [
  { to: '/projects', label: 'Overview', end: true },
  { to: '/projects/workflows', label: 'Workflows' },
  { to: '/projects/templates', label: 'Templates' },
];

function pageTabFromPath(pathname) {
  if (pathname === '/projects/workflows') return 'workflows';
  if (pathname === '/projects/templates') return 'templates';
  return 'overview';
}

export default function Projects() {
  const pageTab = pageTabFromPath(useLocation().pathname);
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [gitStatuses, setGitStatuses] = useState({});
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [wfRunning, setWfRunning] = useState({});
  const [wfMsg, setWfMsg] = useState('');
  const [editing, setEditing] = useState(null); // null | {} | project
  const [logTarget, setLogTarget] = useState(null);
  const confirm = useConfirm();

  async function load() {
    const [projectList, gitStatusList] = await Promise.all([
      api('/projects'),
      api('/projects/git-status'),
    ]);
    setProjects(projectList);
    setGitStatuses(gitStatusList);
    api('/workflows')
      .then(setWorkflows)
      .catch(() => {});
    api('/templates')
      .then(setTemplates)
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
      r.results.forEach(handleWorkflowClientStep);
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
  usePoll(() => api('/projects/git-status'), setGitStatuses, 10000);

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
    <div className="max-w-[1100px] p-6">
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2>Projects</h2>
        <SubTabsNav tabs={PAGE_TABS} />
      </div>

      {pageTab === 'workflows' ? (
        <Workflows />
      ) : pageTab === 'templates' ? (
        <Templates />
      ) : (
        <>
          <div className="my-1.5 flex flex-wrap items-center gap-2">
            <WorkflowQuickRun workflows={workflows} running={wfRunning} onRun={runWorkflow} />
            {templates.map((t) => (
              <button
                key={t.id}
                className="btn small"
                onClick={() => openTerm(t.name, t.cwd, t.commands.join(' && '))}
                title={t.commands.join(' → ')}
              >
                <Wrench size={13} />
                {t.name}
              </button>
            ))}
            <span className="flex-1" />
            <button className="btn primary" onClick={() => setEditing({})}>
              <Plus size={14} />
              Add project
            </button>
          </div>
          {wfMsg && (
            <div className={wfMsg.includes('failed') ? 'my-1.5 text-red' : 'my-1.5 text-green'}>
              {wfMsg}
            </div>
          )}

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

          <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-2.5">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                statuses={statuses}
                gitStatus={gitStatuses[p.id]}
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
