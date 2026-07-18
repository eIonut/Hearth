import React, { useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import EnvPage from './pages/EnvPage.jsx';
import Patches from './pages/Patches.jsx';
import Terminals from './pages/Terminals.jsx';
import Snippets from './pages/Snippets.jsx';
import Learning from './pages/Learning.jsx';
import Preview from './pages/Preview.jsx';
import Workflows from './pages/Workflows.jsx';
import ContentPage from './pages/ContentPage.jsx';
import DigestPage from './pages/DigestPage.jsx';
import SkillsPage from './pages/SkillsPage.jsx';
import { api } from './api.js';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', component: Dashboard },
  { id: 'workflows', label: 'Workflows', component: Workflows },
  { id: 'env', label: 'Env Presets', component: EnvPage },
  { id: 'patches', label: 'Patches', component: Patches },
  { id: 'terminals', label: 'Terminals', component: Terminals },
  { id: 'preview', label: 'Preview', component: Preview },
  { id: 'snippets', label: 'Snippets', component: Snippets },
  { id: 'learning', label: 'Learning Queue', component: Learning },
  { id: 'content', label: 'Content', component: ContentPage },
  { id: 'digest', label: 'Digest', component: DigestPage },
  { id: 'skills', label: 'AI Skills', component: SkillsPage },
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

const KEEP_MOUNTED = ['terminals', 'preview']; // shells and iframes survive page switches

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hub-sidebar-collapsed') === '1');
  const Active = PAGES.find((p) => p.id === page).component;

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem('hub-sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }

  React.useEffect(() => {
    const onPreview = () => setPage('preview');
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
              {p.id === 'dashboard' && crashedCount > 0 && (
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
          <div style={{ display: page === 'terminals' ? 'block' : 'none', height: '100%' }}>
            <Terminals />
          </div>
          <div style={{ display: page === 'preview' ? 'block' : 'none', height: '100%' }}>
            <Preview />
          </div>
          {!KEEP_MOUNTED.includes(page) && <Active />}
        </div>
      </main>
    </div>
  );
}
