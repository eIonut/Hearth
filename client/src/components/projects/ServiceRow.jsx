import { RefreshCw, ScrollText, Play, Square, MonitorPlay } from 'lucide-react';
import { openPreview } from '../../lib/bus.js';

export default function ServiceRow({ project, service, status, onToggle, onLogs }) {
  const running = status?.running;
  const crashed = status?.crashed;
  const preview = (project.previews || []).find((pr) => pr.name === service.name);

  return (
    <div className="flex items-center gap-2 border-t border-border py-1.5 [&:first-of-type]:border-t-0">
      <span className={'dot ' + (running ? 'green' : crashed ? 'red' : 'gray')} />
      <span className="flex items-center gap-1 font-semibold">
        {service.name}
        {service.autoRestart && (
          <RefreshCw size={12} className="text-muted" aria-label="auto-restart" />
        )}
      </span>
      <span className="font-mono text-[12px] text-muted">{service.cmd}</span>
      {crashed && <span className="chip red">crashed ({status.exitCode})</span>}
      <span className="flex-1" />
      {preview && (
        <button
          className="btn small"
          onClick={() => openPreview(`${project.name}/${service.name}`, preview.url)}
        >
          <MonitorPlay size={13} />
          Preview
        </button>
      )}
      <button className="btn small" onClick={onLogs}>
        <ScrollText size={13} />
        Logs
      </button>
      <button className={'btn small ' + (running ? 'danger' : 'primary')} onClick={onToggle}>
        {running ? <Square size={13} /> : <Play size={13} />}
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
