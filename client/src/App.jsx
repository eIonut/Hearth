import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import Projects from './pages/Projects.jsx';
import Workspace from './pages/Workspace.jsx';
import ContentHub from './pages/ContentHub.jsx';
import Library from './pages/Library.jsx';
import { api } from './api.js';
import { usePoll } from './hooks/usePoll.js';
import Sidebar from './components/layout/Sidebar.jsx';
import TilBar from './components/layout/TilBar.jsx';

const PAGES = [
  { path: '/projects', label: 'Projects', badge: true },
  { path: '/workspace', label: 'Workspace' },
  { path: '/content', label: 'Content' },
  { path: '/library', label: 'Library' },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('hub-sidebar-collapsed') === '1',
  );
  const [crashedCount, setCrashedCount] = useState(0);

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem('hub-sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }

  useEffect(() => {
    const onPreview = () => navigate('/workspace');
    window.addEventListener('hub:open-preview', onPreview);
    return () => window.removeEventListener('hub:open-preview', onPreview);
  }, [navigate]);

  // crash badge: poll service statuses on every page
  usePoll(
    () => api('/services/status'),
    (s) => setCrashedCount(Object.values(s).filter((x) => x.crashed).length),
    5000,
  );

  return (
    <div className="flex h-screen">
      <Sidebar
        pages={PAGES}
        collapsed={collapsed}
        crashedCount={crashedCount}
        onToggle={toggleSidebar}
      />
      <main className="flex flex-1 flex-col overflow-y-auto">
        <TilBar />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Workspace stays mounted across navigation so its terminals and preview
              iframes survive route changes (they'd otherwise be torn down and
              reconnected). It's shown/hidden by pathname, never routed. */}
          <div
            style={{
              display: location.pathname === '/workspace' ? 'block' : 'none',
              height: '100%',
            }}
          >
            <Workspace />
          </div>
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/workflows" element={<Projects />} />
            <Route path="/workspace" element={null} />
            <Route path="/content" element={<Navigate to="/content/learning" replace />} />
            <Route path="/content/:tab" element={<ContentHub />} />
            <Route path="/library" element={<Navigate to="/library/snippets" replace />} />
            <Route path="/library/:tab" element={<Library />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
