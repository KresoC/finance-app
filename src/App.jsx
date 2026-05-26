import { useState, useEffect } from 'react';
import { AppProvider, useApp, getSyncConfig, pullFromCloud, setSyncStatusCallback } from './store/AppContext.jsx';
import { ensurePlanArrays } from './store/state.js';
import Header from './components/Header.jsx';
import Navigation from './components/Navigation.jsx';
import FloatingAssistant from './components/FloatingAssistant.jsx';
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

    function doPull() {
      const c = getSyncConfig();
      if (c.apiKey && c.binId) {
        pullFromCloud(true, remote => {
          ensurePlanArrays(remote);
          setStateSilent({ ...remote });
        }).catch(() => {});
      }
    }

    // Pull odmah pri pokretanju
    doPull();

    // Pull svake 30 sekundi
    const interval = setInterval(doPull, 30000);

    // Pull čim se vratiš na tab/app (ključno za mobitel)
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') doPull();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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
      <FloatingAssistant />
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
