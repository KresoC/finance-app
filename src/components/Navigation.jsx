export default function Navigation({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'dashboard', icon: '📊', label: 'Pregled' },
    { id: 'plan', icon: '📋', label: 'Plan' },
    { id: 'actual', icon: '💰', label: 'Stvarno' },
    { id: 'monthly', icon: '📅', label: 'Mjeseci' },
    { id: 'asistent', icon: '🤖', label: 'Asistent' },
    { id: 'settings', icon: '⚙️', label: 'Postavke' },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(t => (
        <button
          key={t.id}
          className={'nav-btn' + (activeTab === t.id ? ' active' : '')}
          onClick={() => onTabChange(t.id)}
        >
          <span className="icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
