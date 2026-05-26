import { useState, useEffect } from 'react';
import { AppProvider, useApp, getSyncConfig, pullFromCloud, setSyncStatusCallback } from './store/AppContext.jsx';
import { ensurePlanArrays } from './store/state.js';
import Header from './components/Header.jsx';
import Navigation from './components/Navigation.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import PlanPage from './pages/PlanPage.jsx';
import ActualsPage from './pages/ActualsPage.jsx';
import MonthlyPage from './pages/MonthlyPage.jsx';
import AssistantPage from './pages/AssistantPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

function AppInner() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [syncMsg, setSyncMsg] = useState(null);
  const { setStateSilent } = useApp();

  useEffect(() => {
    setSyncStatusCallback((msg, type) => setSyncMsg({ msg, type }));
    const cfg = getSyncConfig();
    if (cfg.apiKey && cfg.binId) {
      pullFromCloud(true, remote => {
        ensurePlanArrays(remote);
        setStateSilent({ ...remote });
      }).catch(() => {});
    }
    const interval = setInterval(() => {
      const c = getSyncConfig();
      if (c.apiKey && c.binId) {
        pullFromCloud(true, remote => {
          ensurePlanArrays(remote);
          setStateSilent({ ...remote });
        }).catch(() => {});
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  function handleTabChange(tab) {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div>
      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />
      <Header syncMsg={syncMsg} />
      <main className="content">
        {activeTab === 'dashboard' && <DashboardPage />}
        {activeTab === 'plan' && <PlanPage />}
        {activeTab === 'actual' && <ActualsPage />}
        {activeTab === 'monthly' && <MonthlyPage />}
        {activeTab === 'asistent' && <AssistantPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
