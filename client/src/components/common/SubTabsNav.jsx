import { NavLink } from 'react-router';

// Route-driven variant of SubTabs: each tab is a NavLink ({ to, label }) so the
// active tab lives in the URL and is deep-linkable. Used by the hub pages
// (Library) and the Projects overview/workflows switch. The plain
// SubTabs (setState-based) stays for per-card UI state that isn't navigation.
export default function SubTabsNav({ tabs, small }) {
  return (
    <div className={'subnav' + (small ? ' small' : '')}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => 'subnav-item' + (isActive ? ' active' : '')}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
