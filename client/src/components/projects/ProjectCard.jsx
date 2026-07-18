import { useState } from 'react';
import SubTabs from '../common/SubTabs.jsx';
import LinkButton from './LinkButton.jsx';
import ServiceRow from './ServiceRow.jsx';
import EnvPanel from './EnvPanel.jsx';
import PatchPanel from './PatchPanel.jsx';

const CARD_TABS = [
  { id: 'services', label: 'Services' },
  { id: 'env', label: 'Env presets' },
  { id: 'patches', label: 'Patches' },
];

export default function ProjectCard({ project, statuses, onEdit, onRemove, onToggle, onLogs }) {
  // per-card UI state (which section tab is open); not navigation, stays local.
  const [section, setSection] = useState('services');

  return (
    <div className="card">
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <h3>{project.name}</h3>
        <div>
          <button className="btn small" onClick={onEdit}>
            Edit
          </button>
          <button className="btn small danger" onClick={onRemove}>
            ✕
          </button>
        </div>
      </div>
      <div className="font-mono text-muted">{project.path}</div>
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
