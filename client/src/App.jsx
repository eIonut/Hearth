import React, { useState } from 'react';
import Projects from './pages/Projects.jsx';
import Workspace from './pages/Workspace.jsx';
import ContentHub from './pages/ContentHub.jsx';
import Library from './pages/Library.jsx';
import { api } from './api.js';

const PAGES = [
  { id: 'projects', label: 'Projects', component: Projects },
  { id: 'workspace', label: 'Workspace', component: Workspace },
  { id: 'content', label: 'Content', component: ContentHub },
  { id: 'library', label: 'Library', component: Library },
];

function TilBar() {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!text.trim()) return;
    await api('/tils', { method: 'POST', body: { text } });
    setText('');
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="til-bar">
      <span className="til-label">TIL</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        placeholder="What did you just learn? Log it in 3 seconds…"
      />
      <button className="btn primary small" onClick={save} disabled={!text.trim()}>
        {saved ? 'Logged ✓' : 'Log'}
      </button>
    </div>
  );
}

const KEEP_MOUNTED = ['workspace']; // shells and iframes survive page switches

export default function App() {
  const [page, setPage] = useState('projects');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hub-sidebar-collapsed') === '1');
  const Active = PAGES.find((p) => p.id === page).component;

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem('hub-sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }

  React.useEffect(() => {
    const onPreview = () => setPage('workspace');
    window.addEventListener('hub:open-preview', onPreview);
    return () => window.removeEventListener('hub:open-preview', onPreview);
  }, []);

  // crash badge: poll service statuses on every page
  const [crashedCount, setCrashedCount] = useState(0);
  React.useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const s = await api('/services/status');
        if (alive) setCrashedCount(Object.values(s).filter((x) => x.crashed).length);
      } catch {}
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="app">
      <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
        <div className="logo-row">
          <span className="logo">{collapsed ? '⚡' : '⚡ Dev Hub'}</span>
          <button className="collapse-btn" onClick={toggleSidebar} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav>
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={'nav-item' + (page === p.id ? ' active' : '')}
              onClick={() => setPage(p.id)}
              title={p.label}
            >
              {collapsed ? p.label[0] : p.label}
              {p.id === 'projects' && crashedCount > 0 && (
                <span className="crash-badge" title={`${crashedCount} crashed service${crashedCount > 1 ? 's' : ''}`}>
                  {collapsed ? '' : crashedCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        {!collapsed && <div className="sidebar-footer">localhost only</div>}
      </aside>
      <main className="content">
        <TilBar />
        <div className="page-area">
          <div style={{ display: page === 'workspace' ? 'block' : 'none', height: '100%' }}>
            <Workspace />
          </div>
          {!KEEP_MOUNTED.includes(page) && <Active />}
        </div>
      </main>
    </div>
  );
}
