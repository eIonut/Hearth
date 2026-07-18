import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api.js';
import { consumePendingPreview } from '../lib/bus.js';

function normalize(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : 'http://' + url;
}

function TermView({ cwd, visible }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);

  useEffect(() => {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, monospace',
      theme: { background: '#0d1117' },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(
      `${proto}://${location.host}/term?cwd=${encodeURIComponent(cwd || '')}`,
    );
    ws.onmessage = (e) => term.write(e.data);
    ws.onclose = () => term.write('\r\n[connection closed]\r\n');
    term.onData((d) => {
      if (ws.readyState === 1) ws.send(d);
    });

    function doFit() {
      fit.fit();
      if (ws.readyState === 1) ws.send(`\x00resize:${term.cols},${term.rows}`);
    }
    const onResize = () => doFit();
    window.addEventListener('resize', onResize);
    ws.onopen = () => doFit();

    termRef.current = { term, fit, ws, doFit };
    return () => {
      window.removeEventListener('resize', onResize);
      try {
        ws.close();
      } catch {
        /* socket may already be closed */
      }
      term.dispose();
    };
  }, [cwd]);

  useEffect(() => {
    if (visible && termRef.current) setTimeout(() => termRef.current.doFit(), 30);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="term-container"
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
}

function FrameTab({ tab, visible }) {
  const [check, setCheck] = useState(null);

  useEffect(() => {
    setCheck(null);
    api(`/preview/check?url=${encodeURIComponent(tab.url)}`)
      .then(setCheck)
      .catch(() => {});
  }, [tab.url, tab.reloadKey]);

  const problem = check && (!check.reachable || check.blocked);

  return (
    <div style={{ display: visible ? 'flex' : 'none' }} className="preview-frame-wrap">
      {problem && (
        <div className="row preview-notice">
          {!check.reachable && (
            <span className="chip red">not reachable — is the service running?</span>
          )}
          {check.blocked && (
            <span className="chip red">blocks iframes ({check.reason}) — use ↗</span>
          )}
        </div>
      )}
      {check?.blocked ? (
        <div className="card empty" style={{ flex: 1 }}>
          This app refuses to render inside an iframe ({check.reason}). Use ↗ to open it in a new
          tab, or remove the header in the app's dev config.
        </div>
      ) : (
        <iframe
          key={tab.reloadKey}
          src={tab.url}
          className="preview-iframe"
          title={tab.label}
          allow="clipboard-read; clipboard-write; geolocation; microphone; camera"
        />
      )}
    </div>
  );
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

  function openTerm(label, cwd) {
    const id = ++counter.current;
    setTabs((t) => [...t, { id, kind: 'term', label: `${label} #${id}`, cwd }]);
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

  // Preview requests coming from other pages (Projects "Preview" buttons, links, workflows)
  useEffect(() => {
    function onOpen() {
      const p = consumePendingPreview();
      if (p) openPreviewTab(p.label, p.url);
    }
    onOpen(); // consume anything queued before mount
    window.addEventListener('hub:open-preview', onOpen);
    return () => window.removeEventListener('hub:open-preview', onOpen);
  }, [tabs]);

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
    <div className="workspace-page">
      <div className="row workspace-toolbar">
        <select
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

        <span className="spacer" />
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
        <div className="tab-bar">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={'tab' + (activeTab === t.id ? ' active' : '')}
              onClick={() => setActiveTab(t.id)}
              title={t.kind === 'preview' ? t.url : t.cwd || 'home'}
            >
              <span className={t.kind === 'term' ? 'tab-glyph mono' : 'tab-glyph'}>
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
        <div className="card error">
          node-pty is not installed, so terminals are disabled. Run{' '}
          <span className="mono">npm install node-pty</span> in the dev-hub folder (needs Xcode
          Command Line Tools), then restart the server.
        </div>
      )}

      {tabs.length === 0 && (
        <div className="card empty">
          One surface for shells and running apps. Open a terminal in your home folder or any
          project (tip: run <span className="mono">claude</span> inside one), and open previews of
          your services next to it — set preview URLs per project (Projects → Edit) to get one-click
          entries. Tabs stay alive while you move around the hub.
        </div>
      )}

      <div className="work-area">
        {tabs.map((t) =>
          t.kind === 'term' ? (
            <TermView key={'t' + t.id} cwd={t.cwd} visible={activeTab === t.id} />
          ) : (
            <FrameTab key={'p' + t.id} tab={t} visible={activeTab === t.id} />
          ),
        )}
      </div>
    </div>
  );
}
