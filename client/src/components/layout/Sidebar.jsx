import { NavLink } from 'react-router';

// Left navigation rail: logo, collapse toggle, page links, crash badge.
export default function Sidebar({ pages, collapsed, crashedCount, onToggle }) {
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
          </NavLink>
        ))}
      </nav>
      {!collapsed && <div className="mt-auto p-2.5 text-[11px] text-muted">localhost only</div>}
    </aside>
  );
}
