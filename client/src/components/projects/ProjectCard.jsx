import { useState } from 'react';
import { Pencil, Trash2, Folder } from 'lucide-react';
import SubTabs from '../common/SubTabs.jsx';
import LinkButton from './LinkButton.jsx';
import ServiceRow from './ServiceRow.jsx';
import EnvPanel from './EnvPanel.jsx';
import PatchPanel from './PatchPanel.jsx';
import GitStatus from './GitStatus.jsx';

const CARD_TABS = [
  { id: 'services', label: 'Services' },
  { id: 'env', label: 'Env presets' },
  { id: 'patches', label: 'Patches' },
];

export default function ProjectCard({
  project,
  statuses,
  gitStatus,
  onEdit,
  onRemove,
  onToggle,
  onLogs,
}) {
  // per-card UI state (which section tab is open); not navigation, stays local.
  const [section, setSection] = useState('services');

  // At-a-glance health of the project's services, summarized in the header.
  const services = project.services || [];
  const runningCount = services.filter(
    (s) => statuses[`${project.id}::${s.name}`]?.running,
  ).length;
  const hasCrashed = services.some((s) => statuses[`${project.id}::${s.name}`]?.crashed);
  const health = hasCrashed
    ? { dot: 'red', text: 'crashed', color: 'text-red' }
    : runningCount > 0
      ? { dot: 'green', text: `${runningCount} running`, color: 'text-green' }
      : { dot: 'gray', text: 'idle', color: 'text-muted' };

  return (
    <div className="card group transition-colors hover:border-muted">
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h3>{project.name}</h3>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full bg-bg-3 px-2 py-0.5 text-[11px] font-medium ${health.color}`}
          >
            <span className={'dot ' + health.dot} />
            {health.text}
          </span>
        </div>
        <div className="flex items-center">
          <button className="btn small" onClick={onEdit}>
            <Pencil size={13} />
            Edit
          </button>
          <button
            className="ml-1 shrink-0 cursor-pointer rounded p-1.5 text-muted opacity-0 transition hover:bg-bg-3 hover:text-red focus:opacity-100 group-hover:opacity-100"
            onClick={onRemove}
            title="Remove project"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[12px] text-muted">
        <Folder size={12} className="shrink-0" />
        {project.path}
      </div>
      <GitStatus status={gitStatus} />
      {(project.links || []).length > 0 && (
        <div className="my-1.5 flex flex-wrap items-center gap-2" style={{ marginTop: 6 }}>
          {project.links.map((l) => (
            <LinkButton key={l.name + l.url} project={project} link={l} />
          ))}
        </div>
      )}

      <div className="my-1.5 flex flex-wrap items-center gap-2" style={{ marginTop: 8 }}>
        <SubTabs small tabs={CARD_TABS} active={section} onChange={setSection} />
      </div>

      {section === 'services' && (
        <div className="services">
          {(project.services || []).map((s) => (
            <ServiceRow
              key={s.name}
              project={project}
              service={s}
              status={statuses[`${project.id}::${s.name}`]}
              onToggle={() => onToggle(s)}
              onLogs={() => onLogs(s)}
            />
          ))}
          {(project.services || []).length === 0 && (
            <div className="text-muted">No services defined.</div>
          )}
        </div>
      )}

      {section === 'env' && <EnvPanel projectId={project.id} />}
      {section === 'patches' && <PatchPanel projectId={project.id} />}
    </div>
  );
}
