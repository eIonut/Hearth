// Left navigation rail: logo, collapse toggle, page buttons, crash badge.
export default function Sidebar({ pages, page, collapsed, crashedCount, onNavigate, onToggle }) {
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
          <button
            key={p.id}
            className={'nav-item' + (page === p.id ? ' active' : '')}
            onClick={() => onNavigate(p.id)}
            title={p.label}
          >
            {collapsed ? p.label[0] : p.label}
            {p.id === 'projects' && crashedCount > 0 && (
              <span
                className="crash-badge"
                title={`${crashedCount} crashed service${crashedCount > 1 ? 's' : ''}`}
              >
                {collapsed ? '' : crashedCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      {!collapsed && <div className="sidebar-footer">localhost only</div>}
    </aside>
  );
}
