import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../api.js';

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
    const ws = new WebSocket(`${proto}://${location.host}/term?cwd=${encodeURIComponent(cwd || '')}`);
    ws.onmessage = (e) => term.write(e.data);
    ws.onclose = () => term.write('\r\n[connection closed]\r\n');
    term.onData((d) => { if (ws.readyState === 1) ws.send(d); });

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
      try { ws.close(); } catch {}
      term.dispose();
    };
  }, [cwd]);

  useEffect(() => {
    if (visible && termRef.current) setTimeout(() => termRef.current.doFit(), 30);
  }, [visible]);

  return <div ref={containerRef} className="term-container" style={{ display: visible ? 'block' : 'none' }} />;
}

export default function Terminals() {
  const [projects, setProjects] = useState([]);
  const [tabs, setTabs] = useState([]); // { id, label, cwd }
  const [activeTab, setActiveTab] = useState(null);
  const [ptyAvailable, setPtyAvailable] = useState(true);
  const counter = useRef(0);

  useEffect(() => {
    api('/projects').then(setProjects).catch(() => {});
    api('/health').then((h) => setPtyAvailable(h.terminals)).catch(() => {});
  }, []);

  function openTab(label, cwd) {
    const id = ++counter.current;
    setTabs((t) => [...t, { id, label: `${label} #${id}`, cwd }]);
    setActiveTab(id);
  }

  function closeTab(id) {
    setTabs((t) => t.filter((tab) => tab.id !== id));
    setActiveTab((cur) => (cur === id ? null : cur));
  }

  return (
    <div className="page terminals-page">
      <div className="row space-between">
        <h2>Terminals</h2>
        <div className="row">
          <button className="btn" onClick={() => openTab('home', '')}>+ Home</button>
          {projects.map((p) => (
            <button key={p.id} className="btn" onClick={() => openTab(p.name, p.path)}>+ {p.name}</button>
          ))}
        </div>
      </div>

      {!ptyAvailable && (
        <div className="card error">
          node-pty is not installed, so terminals are disabled.
          Run <span className="mono">npm install node-pty</span> in the dev-hub folder (needs Xcode Command Line Tools), then restart the server.
        </div>
      )}

      {tabs.length > 0 && (
        <div className="tab-bar">
          {tabs.map((t) => (
            <div key={t.id} className={'tab' + (activeTab === t.id ? ' active' : '')} onClick={() => setActiveTab(t.id)}>
              {t.label}
              <span className="tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>✕</span>
            </div>
          ))}
        </div>
      )}

      {tabs.length === 0 && ptyAvailable && (
        <div className="card empty">
          Open a terminal in your home folder or any project. Tip: run <span className="mono">claude</span> inside one to use Claude Code right here in the hub.
        </div>
      )}

      <div className="term-area">
        {tabs.map((t) => (
          <TermView key={t.id} cwd={t.cwd} visible={activeTab === t.id} />
        ))}
      </div>
    </div>
  );
}
