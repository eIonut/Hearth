// Pill-style tab switcher used by hub pages (Content, Library, Projects) and project cards.
export default function SubTabs({ tabs, active, onChange, small }) {
  return (
    <div className={'subnav' + (small ? ' small' : '')}>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={'subnav-item' + (active === t.id ? ' active' : '')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
