import { useEffect, useState } from 'react';
import Projects from './pages/Projects.jsx';
import Workspace from './pages/Workspace.jsx';
import ContentHub from './pages/ContentHub.jsx';
import Library from './pages/Library.jsx';
import { api } from './api.js';
import { usePoll } from './hooks/usePoll.js';
import Sidebar from './components/layout/Sidebar.jsx';
import TilBar from './components/layout/TilBar.jsx';

const PAGES = [
  { id: 'projects', label: 'Projects', component: Projects },
  { id: 'workspace', label: 'Workspace', component: Workspace },
  { id: 'content', label: 'Content', component: ContentHub },
  { id: 'library', label: 'Library', component: Library },
];

// Workspace stays mounted across page switches so its terminals and preview
// iframes survive navigation (they'd otherwise be torn down and reconnected).
const KEEP_MOUNTED = ['workspace'];

export default function App() {
  const [page, setPage] = useState('projects');
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('hub-sidebar-collapsed') === '1',
  );
  const [crashedCount, setCrashedCount] = useState(0);
  const Active = PAGES.find((p) => p.id === page).component;

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem('hub-sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }

  useEffect(() => {
    const onPreview = () => setPage('workspace');
    window.addEventListener('hub:open-preview', onPreview);
    return () => window.removeEventListener('hub:open-preview', onPreview);
  }, []);

  // crash badge: poll service statuses on every page
  usePoll(
    () => api('/services/status'),
    (s) => setCrashedCount(Object.values(s).filter((x) => x.crashed).length),
    5000,
  );

  return (
    <div className="app">
      <Sidebar
        pages={PAGES}
        page={page}
        collapsed={collapsed}
        crashedCount={crashedCount}
        onNavigate={setPage}
        onToggle={toggleSidebar}
      />
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
