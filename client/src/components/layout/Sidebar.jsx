import { NavLink } from 'react-router';

// Left navigation rail: logo, collapse toggle, page links, crash badge.
export default function Sidebar({ pages, collapsed, crashedCount, onToggle }) {
  return (
    <aside className={'sidebar' + (collapsed ? ' collapsed' : '')}>
      <div className="logo-row">
        <span className="logo">{collapsed ? '⚡' : '⚡ Dev Hub'}</span>
        <button
          className="collapse-btn"
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
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            title={p.label}
          >
            {collapsed ? p.label[0] : p.label}
            {p.badge && crashedCount > 0 && (
              <span
                className="crash-badge"
                title={`${crashedCount} crashed service${crashedCount > 1 ? 's' : ''}`}
              >
                {collapsed ? '' : crashedCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      {!collapsed && <div className="sidebar-footer">localhost only</div>}
    </aside>
  );
}
