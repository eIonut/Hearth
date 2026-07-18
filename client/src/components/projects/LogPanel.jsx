import { useEffect, useRef, useState } from 'react';
import { AnsiUp } from 'ansi_up';
import { api } from '../../api.js';
import { usePoll } from '../../hooks/usePoll.js';

const ansi = new AnsiUp();

export default function LogPanel({ target, onClose }) {
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
      <div className="flex gap-2 items-center flex-wrap my-1.5 justify-between">
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
