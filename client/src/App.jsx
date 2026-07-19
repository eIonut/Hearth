import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router';
import Projects from './pages/Projects.jsx';
import Workspace from './pages/Workspace.jsx';
import Learning from './pages/Learning.jsx';
import Library from './pages/Library.jsx';
import Backup from './pages/Backup.jsx';
import { api } from './api.js';
import { usePoll } from './hooks/usePoll.js';
import { notify } from './lib/bus.js';
import Sidebar from './components/layout/Sidebar.jsx';
import Toasts from './components/common/Toasts.jsx';

const PAGES = [
  { path: '/projects', label: 'Projects', badge: true },
  { path: '/workspace', label: 'Workspace' },
  { path: '/learning', label: 'Learning' },
  { path: '/library', label: 'Library' },
  { path: '/backup', label: 'Backup' },
];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('hub-sidebar-collapsed') === '1',
  );
  const [crashedCount, setCrashedCount] = useState(0);
  const [backup, setBackup] = useState(null);
  // Remembers the last-seen backup timestamps so we only toast on a *new* one.
  const prevBackup = useRef({ cloud: null, git: null, init: false });

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem('hub-sidebar-collapsed', c ? '0' : '1');
      return !c;
    });
  }

  useEffect(() => {
    const toWorkspace = () => navigate('/workspace');
    window.addEventListener('hub:open-preview', toWorkspace);
    window.addEventListener('hub:open-term', toWorkspace);
    return () => {
      window.removeEventListener('hub:open-preview', toWorkspace);
      window.removeEventListener('hub:open-term', toWorkspace);
    };
  }, [navigate]);

  // crash badge: poll service statuses on every page
  usePoll(
    () => api('/services/status'),
    (s) => setCrashedCount(Object.values(s).filter((x) => x.crashed).length),
    5000,
  );

  // backup indicator: poll the cheap sync summary, and toast whenever a new
  // backup lands (manual or auto) so it's visible from any page.
  usePoll(
    () => api('/sync/summary'),
    (s) => {
      setBackup(s);
      const p = prevBackup.current;
      if (p.init) {
        if (s.lastCloudAt && s.lastCloudAt !== p.cloud) notify('Backed up to cloud folder');
        if (s.lastGitAt && s.lastGitAt !== p.git) notify('Pushed backup to git remote');
      }
      prevBackup.current = { cloud: s.lastCloudAt, git: s.lastGitAt, init: true };
    },
    8000,
  );

  return (
    <div className="flex h-screen">
      <Sidebar
        pages={PAGES}
        collapsed={collapsed}
        crashedCount={crashedCount}
        backup={backup}
        onToggle={toggleSidebar}
      />
      <main className="flex flex-1 flex-col overflow-y-auto">
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
            <Route path="/projects/templates" element={<Projects />} />
            <Route path="/workspace" element={null} />
            <Route path="/learning" element={<Learning />} />
            <Route path="/content/*" element={<Navigate to="/learning" replace />} />
            <Route path="/library" element={<Navigate to="/library/snippets" replace />} />
            <Route path="/library/:tab" element={<Library />} />
            <Route path="/backup" element={<Backup />} />
            {/* old location, before Backup was promoted out of Library */}
            <Route path="/library/backup" element={<Navigate to="/backup" replace />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </div>
      </main>
      <Toasts />
    </div>
  );
}
