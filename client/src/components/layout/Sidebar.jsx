import { NavLink } from 'react-router';
import { TriangleAlert, CircleCheck, ChevronsLeft, ChevronsRight } from 'lucide-react';

// Served from client/public — reference by URL, not a module import.
const markUrl = '/hearth-mark.svg';

function rel(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// The always-visible backup status shown at the bottom of the rail, so "when
// did I last back up" is answerable from any page without opening the tab.
function backupLine(backup) {
  if (!backup) return null;
  if (backup.autoBlocked)
    return { text: 'Auto-sync blocked', cls: 'text-red', Icon: TriangleAlert };
  if (!backup.configured) return { text: 'Backup not set up', cls: 'text-muted' };
  if (backup.stale) {
    const last = backup.lastBackupAt ? ` (last ${rel(backup.lastBackupAt)})` : '';
    return { text: `Backup needed${last}`, cls: 'text-orange', Icon: TriangleAlert };
  }
  if (backup.lastBackupAt)
    return {
      text: `Backed up ${rel(backup.lastBackupAt)}`,
      cls: 'text-muted',
      Icon: CircleCheck,
    };
  return { text: 'Not backed up yet', cls: 'text-muted' };
}

// Left navigation rail: logo, collapse toggle, page links, crash badge, and the
// backup status footer.
export default function Sidebar({ pages, collapsed, crashedCount, backup, onToggle }) {
  const backupDot = backup && (backup.autoBlocked ? 'bg-red' : backup.stale ? 'bg-orange' : null);
  const status = backupLine(backup);
  return (
    <aside
      className={
        'flex shrink-0 flex-col border-r border-border bg-bg-2 py-4 ' +
        (collapsed ? 'w-[52px] px-1' : 'w-[200px] px-2')
      }
    >
      <div
        className={
          'flex items-center justify-between pt-0 ' +
          (collapsed ? 'flex-col gap-2.5 px-0 pb-3' : 'px-1.5 pb-4')
        }
      >
        <span className="flex items-center gap-2 px-1 text-base font-bold whitespace-nowrap">
          <img src={markUrl} alt="Hearth" className="size-5 shrink-0" />
          {!collapsed && 'hearth'}
        </span>
        <button
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-transparent leading-none text-muted hover:border-muted hover:text-text"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>
      <nav>
        {pages.map((p) => (
          <NavLink
            key={p.path}
            to={p.path}
            className={({ isActive }) =>
              'nav-item' + (isActive ? ' active' : '') + (collapsed ? ' justify-center px-0' : '')
            }
            title={p.label}
          >
            <p.Icon size={15} className="shrink-0" />
            {!collapsed && p.label}
            {p.badge && crashedCount > 0 && (
              <span
                className="ml-1.5 inline-block h-4 min-w-2 rounded-lg bg-red px-[5px] align-middle text-[10px] leading-4 font-bold text-white"
                title={`${crashedCount} crashed service${crashedCount > 1 ? 's' : ''}`}
              >
                {collapsed ? '' : crashedCount}
              </span>
            )}
            {p.path === '/backup' && backupDot && (
              <span
                className={`ml-1.5 inline-block size-2 rounded-full align-middle ${backupDot}`}
                title={status?.text}
              />
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto">
        {!collapsed && status && (
          <NavLink
            to="/backup"
            className={`flex items-center gap-1.5 px-2.5 pt-2.5 text-[11px] ${status.cls}`}
          >
            {status.Icon && <status.Icon size={12} className="shrink-0" />}
            {status.text}
          </NavLink>
        )}
        {!collapsed && <div className="p-2.5 text-[11px] text-muted">localhost only</div>}
      </div>
    </aside>
  );
}
