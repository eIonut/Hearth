import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { consumePendingPreview, consumePendingTerm } from '../lib/bus.js';
import TermView from '../components/workspace/TermView.jsx';
import PreviewFrame from '../components/workspace/PreviewFrame.jsx';

function normalize(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : 'http://' + url;
}

export default function Workspace() {
  const [projects, setProjects] = useState([]);
  const [ptyAvailable, setPtyAvailable] = useState(true);
  const [tabs, setTabs] = useState([]); // { id, kind: 'term'|'preview', label, cwd?, url?, reloadKey? }
  const [activeTab, setActiveTab] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const counter = useRef(0);

  useEffect(() => {
    api('/projects')
      .then(setProjects)
      .catch(() => {});
    api('/health')
      .then((h) => setPtyAvailable(h.terminals))
      .catch(() => {});
  }, []);

  function openTerm(label, cwd, cmd) {
    const id = ++counter.current;
    setTabs((t) => [...t, { id, kind: 'term', label: `${label} #${id}`, cwd, cmd }]);
    setActiveTab(id);
  }

  function openPreviewTab(label, url) {
    const norm = normalize(url);
    if (!norm) return;
    const existing = tabs.find((t) => t.kind === 'preview' && t.url === norm);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    const id = ++counter.current;
    setTabs((t) => [
      ...t,
      {
        id,
        kind: 'preview',
        label: label || norm.replace(/^https?:\/\//, ''),
        url: norm,
        reloadKey: 0,
      },
    ]);
    setActiveTab(id);
  }

  // Preview requests coming from other pages (Projects "Preview" buttons, links, workflows).
  // Keep the handler in a ref so the event subscription mounts once instead of
  // re-subscribing on every tabs change (openPreviewTab closes over `tabs` for dedup).
  const openPreviewRef = useRef(openPreviewTab);
  useEffect(() => {
    openPreviewRef.current = openPreviewTab;
  });
  useEffect(() => {
    function onOpen() {
      const p = consumePendingPreview();
      if (p) openPreviewRef.current(p.label, p.url);
    }
    onOpen(); // consume anything queued before mount
    window.addEventListener('hub:open-preview', onOpen);
    return () => window.removeEventListener('hub:open-preview', onOpen);
  }, []);

  // Terminal requests coming from other pages (Templates "Scaffold" buttons).
  // Same pattern as previews: keep the opener in a ref so we subscribe once.
  const openTermRef = useRef(openTerm);
  useEffect(() => {
    openTermRef.current = openTerm;
  });
  useEffect(() => {
    function onOpenTerm() {
      const t = consumePendingTerm();
      if (t) openTermRef.current(t.label, t.cwd, t.cmd);
    }
    onOpenTerm(); // consume anything queued before mount
    window.addEventListener('hub:open-term', onOpenTerm);
    return () => window.removeEventListener('hub:open-term', onOpenTerm);
  }, []);

  function closeTab(id) {
    setTabs((t) => t.filter((tab) => tab.id !== id));
    setActiveTab((cur) => (cur === id ? null : cur));
  }

  function reloadActive() {
    setTabs((t) =>
      t.map((tab) => (tab.id === activeTab ? { ...tab, reloadKey: tab.reloadKey + 1 } : tab)),
    );
  }

  const quickLinks = projects.flatMap((p) =>
    (p.previews || []).map((pr) => ({ label: `${p.name}/${pr.name}`, url: pr.url })),
  );
  const active = tabs.find((t) => t.id === activeTab);

  return (
    <div className="flex h-full max-w-none flex-col px-2 pt-1.5 pb-2">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <select
          className="mt-0 w-auto"
          value=""
          onChange={(e) => {
            if (e.target.value === '::home') openTerm('home', '');
            else {
              const p = projects.find((x) => x.id === e.target.value);
              if (p) openTerm(p.name, p.path);
            }
          }}
          disabled={!ptyAvailable}
        >
          <option value="" disabled>
            + Terminal…
          </option>
          <option value="::home">home</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {quickLinks.length > 0 && (
          <select
            className="mt-0 w-auto"
            value=""
            onChange={(e) => {
              const q = quickLinks.find((x) => x.label === e.target.value);
              if (q) openPreviewTab(q.label, q.url);
            }}
          >
            <option value="" disabled>
              + Preview…
            </option>
            {quickLinks.map((q) => (
              <option key={q.label} value={q.label}>
                {q.label}
              </option>
            ))}
          </select>
        )}
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              openPreviewTab(null, urlInput);
              setUrlInput('');
            }
          }}
          placeholder="localhost:4000"
          style={{ width: 160, marginTop: 0 }}
        />
        <button
          className="btn small"
          onClick={() => {
            openPreviewTab(null, urlInput);
            setUrlInput('');
          }}
          disabled={!urlInput.trim()}
        >
          Open
        </button>

        <span className="flex-1" />
        {active?.kind === 'preview' && (
          <>
            <button className="btn small" onClick={reloadActive} title="Reload">
              ⟳
            </button>
            <a
              className="btn small"
              href={active.url}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
            >
              ↗
            </a>
          </>
        )}
      </div>

      {tabs.length > 0 && (
        <div className="my-2 flex flex-wrap gap-1">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={'tab' + (activeTab === t.id ? ' active' : '')}
              onClick={() => setActiveTab(t.id)}
              title={t.kind === 'preview' ? t.url : t.cwd || 'home'}
            >
              <span className={t.kind === 'term' ? 'tab-glyph font-mono' : 'tab-glyph'}>
                {t.kind === 'term' ? '❯' : '⌗'}
              </span>
              {t.label}
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      )}

      {!ptyAvailable && (
        <div className="card my-1.5 text-red">
          node-pty is not installed, so terminals are disabled. Run{' '}
          <span className="font-mono">npm install node-pty</span> in the dev-hub folder (needs Xcode
          Command Line Tools), then restart the server.
        </div>
      )}

      {tabs.length === 0 && (
        <div className="card empty">
          One surface for shells and running apps. Open a terminal in your home folder or any
          project (tip: run <span className="font-mono">claude</span> inside one), and open previews
          of your services next to it — set preview URLs per project (Projects → Edit) to get
          one-click entries. Tabs stay alive while you move around the hub.
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {tabs.map((t) =>
          t.kind === 'term' ? (
            <TermView key={'t' + t.id} cwd={t.cwd} cmd={t.cmd} visible={activeTab === t.id} />
          ) : (
            <PreviewFrame key={'p' + t.id} tab={t} visible={activeTab === t.id} />
          ),
        )}
      </div>
    </div>
  );
}
