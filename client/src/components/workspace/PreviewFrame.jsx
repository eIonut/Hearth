import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../../api.js';

export default function PreviewFrame({ tab, visible }) {
  const [check, setCheck] = useState(null);

  useEffect(() => {
    setCheck(null);
    api(`/preview/check?url=${encodeURIComponent(tab.url)}`)
      .then(setCheck)
      .catch(() => {});
  }, [tab.url, tab.reloadKey]);

  const problem = check && (!check.reachable || check.blocked);

  return (
    <div style={{ display: visible ? 'flex' : 'none' }} className="min-h-0 flex-1 flex-col">
      {problem && (
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {!check.reachable && (
            <span className="chip red">not reachable — is the service running?</span>
          )}
          {check.blocked && (
            <span className="chip red">
              blocks iframes ({check.reason}) — use <ExternalLink size={12} className="inline" />
            </span>
          )}
        </div>
      )}
      {check?.blocked ? (
        <div className="card empty" style={{ flex: 1 }}>
          This app refuses to render inside an iframe ({check.reason}). Use{' '}
          <ExternalLink size={12} className="inline" /> to open it in a new tab, or remove the
          header in the app's dev config.
        </div>
      ) : (
        <iframe
          key={tab.reloadKey}
          src={tab.url}
          className="w-full flex-1 rounded-md border border-border bg-white"
          title={tab.label}
          allow="clipboard-read; clipboard-write; geolocation; microphone; camera"
        />
      )}
    </div>
  );
}
