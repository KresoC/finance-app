import { useState } from 'react';

const PRIMARY = [
  { id: 'dashboard', icon: '📊', label: 'Pregled' },
  { id: 'plan', icon: '📋', label: 'Plan' },
  { id: 'actual', icon: '💰', label: 'Stvarno' },
  { id: 'monthly', icon: '📅', label: 'Mjeseci' },
];

const MORE = [
  { id: 'trezor', icon: '📈', label: 'Ulaganja' },
  { id: 'mirovina', icon: '🎯', label: 'Mirovina' },
  { id: 'settings', icon: '⚙️', label: 'Postavke' },
];

// Mobilno: 4 glavna taba + "Više" koje otvara preostale u sheetu — 7 tabova
// u jednom redu ne staje na 320-375px sirini (izmjereno: sadrzaj sirok 383px
// na 320px ekranu). Desktop nema taj problem pa tamo svih 7 stoji u redu;
// stavke iz MORE su u markupu dvaput i CSS breakpoint (768px) bira koje se vide.
export default function Navigation({ activeTab, onTabChange }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some(t => t.id === activeTab);

  function selectMore(id) {
    setMoreOpen(false);
    onTabChange(id);
  }

  return (
    <>
      {moreOpen && <div className="nav-more-backdrop" onClick={() => setMoreOpen(false)} />}
      <nav className="bottom-nav">
        {PRIMARY.map(t => (
          <button
            key={t.id}
            className={'nav-btn' + (activeTab === t.id ? ' active' : '')}
            onClick={() => onTabChange(t.id)}
          >
            <span className="icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}

        {MORE.map(t => (
          <button
            key={t.id}
            className={'nav-btn nav-more-item' + (activeTab === t.id ? ' active' : '')}
            onClick={() => onTabChange(t.id)}
          >
            <span className="icon">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}

        <button
          className={'nav-btn nav-more-btn' + (moreOpen || moreActive ? ' active' : '')}
          onClick={() => setMoreOpen(o => !o)}
        >
          <span className="icon">⋯</span>
          <span>Više</span>
        </button>

        {moreOpen && (
          <div className="nav-more-sheet">
            {MORE.map(t => (
              <button
                key={t.id}
                className={'nav-more-sheet-item' + (activeTab === t.id ? ' active' : '')}
                onClick={() => selectMore(t.id)}
              >
                <span className="icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}
