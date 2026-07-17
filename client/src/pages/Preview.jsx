import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { consumePendingPreview } from '../lib/bus.js';

function normalize(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : 'http://' + url;
}

function FrameTab({ tab, visible }) {
  const [check, setCheck] = useState(null);

  useEffect(() => {
    setCheck(null);
    api(`/preview/check?url=${encodeURIComponent(tab.url)}`).then(setCheck).catch(() => {});
  }, [tab.url, tab.reloadKey]);

  const problem = check && (!check.reachable || check.blocked);

  return (
    <div style={{ display: visible ? 'flex' : 'none' }} className="preview-frame-wrap">
      {problem && (
        <div className="row preview-notice">
          {!check.reachable && <span className="chip red">not reachable — is the service running?</span>}
          {check.blocked && <span className="chip red">blocks iframes ({check.reason}) — use ↗</span>}
        </div>
      )}
      {check?.blocked ? (
        <div className="card empty" style={{ flex: 1 }}>
          This app refuses to render inside an iframe ({check.reason}).
          Use ↗ to open it in a new tab, or remove the header in the app's dev config.
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

export default function Preview() {
  const [projects, setProjects] = useState([]);
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const counter = useRef(0);

  useEffect(() => {
    api('/projects').then(setProjects).catch(() => {});
  }, []);

  function openTab(label, url) {
    const norm = normalize(url);
    if (!norm) return;
    const existing = tabs.find((t) => t.url === norm);
    if (existing) { setActiveTab(existing.id); return; }
    const id = ++counter.current;
    setTabs((t) => [...t, { id, label: label || norm.replace(/^https?:\/\//, ''), url: norm, reloadKey: 0 }]);
    setActiveTab(id);
  }

  // Preview requests coming from other pages (Dashboard "Preview" buttons)
  useEffect(() => {
    function onOpen() {
      const p = consumePendingPreview();
      if (p) openTab(p.label, p.url);
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
    setTabs((t) => t.map((tab) => (tab.id === activeTab ? { ...tab, reloadKey: tab.reloadKey + 1 } : tab)));
  }

  const quickLinks = projects.flatMap((p) =>
    (p.previews || []).map((pr) => ({ label: `${p.name}/${pr.name}`, url: pr.url }))
  );
  const active = tabs.find((t) => t.id === activeTab);

  return (
    <div className="preview-page">
      <div className="row preview-toolbar">
        {quickLinks.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const q = quickLinks.find((x) => x.label === e.target.value);
              if (q) openTab(q.label, q.url);
            }}
          >
            <option value="" disabled>Open service…</option>
            {quickLinks.map((q) => <option key={q.label} value={q.label}>{q.label}</option>)}
          </select>
        )}
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { openTab(null, urlInput); setUrlInput(''); } }}
          placeholder="localhost:4000"
          style={{ width: 160, marginTop: 0 }}
        />
        <button className="btn small" onClick={() => { openTab(null, urlInput); setUrlInput(''); }} disabled={!urlInput.trim()}>Open</button>

        {tabs.map((t) => (
          <div key={t.id} className={'tab' + (activeTab === t.id ? ' active' : '')} onClick={() => setActiveTab(t.id)} title={t.url}>
            {t.label}
            <span className="tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>✕</span>
          </div>
        ))}

        <span className="spacer" />
        {active && (
          <>
            <button className="btn small" onClick={reloadActive} title="Reload">⟳</button>
            <a className="btn small" href={active.url} target="_blank" rel="noreferrer" title="Open in new tab">↗</a>
          </>
        )}
      </div>

      {tabs.length === 0 && (
        <div className="card empty">
          Open any local URL, or set preview URLs on your projects (Dashboard → Edit) and pick them from "Open service…".
          Your browser's DevTools (Console / Network) work on the embedded app — pick its frame in the Console's context dropdown.
        </div>
      )}

      <div className="preview-area">
        {tabs.map((t) => (
          <FrameTab key={t.id} tab={t} visible={activeTab === t.id} />
        ))}
      </div>
    </div>
  );
}
