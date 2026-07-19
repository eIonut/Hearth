import { NavLink } from 'react-router';

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
  if (backup.autoBlocked) return { text: '⚠ Auto-sync blocked', cls: 'text-red' };
  if (!backup.configured) return { text: 'Backup not set up', cls: 'text-muted' };
  if (backup.stale) {
    const last = backup.lastBackupAt ? ` (last ${rel(backup.lastBackupAt)})` : '';
    return { text: `⚠ Backup needed${last}`, cls: 'text-orange' };
  }
  if (backup.lastBackupAt)
    return { text: `✓ Backed up ${rel(backup.lastBackupAt)}`, cls: 'text-muted' };
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
        <span className="px-1 text-base font-bold whitespace-nowrap">
          {collapsed ? '⚡' : '⚡ Dev Hub'}
        </span>
        <button
          className="size-6 shrink-0 cursor-pointer rounded-md border border-border bg-transparent text-[12px] leading-none text-muted hover:border-muted hover:text-text"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
      <nav>
        {pages.map((p) => (
          <NavLink
            key={p.path}
            to={p.path}
            className={({ isActive }) =>
              'nav-item' + (isActive ? ' active' : '') + (collapsed ? ' px-0 text-center' : '')
            }
            title={p.label}
          >
            {collapsed ? p.label[0] : p.label}
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
          <NavLink to="/backup" className={`block px-2.5 pt-2.5 text-[11px] ${status.cls}`}>
            {status.text}
          </NavLink>
        )}
        {!collapsed && <div className="p-2.5 text-[11px] text-muted">localhost only</div>}
      </div>
    </aside>
  );
}
