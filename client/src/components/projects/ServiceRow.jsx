import { openPreview } from '../../lib/bus.js';

export default function ServiceRow({ project, service, status, onToggle, onLogs }) {
  const running = status?.running;
  const crashed = status?.crashed;
  const preview = (project.previews || []).find((pr) => pr.name === service.name);

  return (
    <div className="flex items-center gap-2 border-t border-border py-1.5 [&:first-of-type]:border-t-0">
      <span className={'dot ' + (running ? 'green' : crashed ? 'red' : 'gray')} />
      <span className="font-semibold">
        {service.name}
        {service.autoRestart ? ' ↻' : ''}
      </span>
      <span className="text-muted font-mono text-[12px]">{service.cmd}</span>
      {crashed && <span className="chip red">crashed ({status.exitCode})</span>}
      <span className="flex-1" />
      {preview && (
        <button
          className="btn small"
          onClick={() => openPreview(`${project.name}/${service.name}`, preview.url)}
        >
          Preview
        </button>
      )}
      <button className="btn small" onClick={onLogs}>
        Logs
      </button>
      <button className={'btn small ' + (running ? 'danger' : 'primary')} onClick={onToggle}>
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
