import { createContext, useContext, useState, useCallback } from 'react';
import { loadState, saveStateToStorage, ensurePlanArrays, defaultState, STORAGE_KEY } from './state.js';

const AppContext = createContext(null);

const SYNC_KEY = STORAGE_KEY + '_sync';
const AI_KEY_STORAGE = STORAGE_KEY + '_ai';
const CHAT_KEY_STORAGE = STORAGE_KEY + '_chat';

export function AppProvider({ children }) {
  const [state, setStateRaw] = useState(() => loadState());

  const updateState = useCallback((newState) => {
    newState._lastModified = Date.now();
    snapshotActiveYear(newState);
    saveStateToStorage(newState);
    setStateRaw({ ...newState });
    debounceSyncPush(newState);
  }, []);

  const setStateSilent = useCallback((newState) => {
    saveStateToStorage(newState);
    setStateRaw({ ...newState });
  }, []);

  return (
    <AppContext.Provider value={{ state, updateState, setStateSilent }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

// ===== Sync helpers (standalone, not in context) =====
export function getSyncConfig() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; }
  catch { return {}; }
}
export function setSyncConfig(c) { localStorage.setItem(SYNC_KEY, JSON.stringify(c)); }

export function getAIConfig() {
  try { return JSON.parse(localStorage.getItem(AI_KEY_STORAGE)) || {}; }
  catch { return {}; }
}
export function setAIConfigObj(c) { localStorage.setItem(AI_KEY_STORAGE, JSON.stringify(c)); }

export function loadChat() {
  try { return JSON.parse(localStorage.getItem(CHAT_KEY_STORAGE)) || []; }
  catch { return []; }
}
export function saveChat(history) { localStorage.setItem(CHAT_KEY_STORAGE, JSON.stringify(history)); }

// ===== Multi-year helpers =====
export function snapshotActiveYear(state) {
  if (!state.yearsData) state.yearsData = {};
  state.yearsData[state.year] = {
    initialBalance: state.initialBalance,
    startDate: state.startDate,
    plan: state.plan,
    actual: state.actual,
    groupPlan: state.groupPlan || {},
    useGroupPlan: state.useGroupPlan || {},
    yearGoal: state.yearGoal || 0,
    recentEntries: state.recentEntries || []
  };
}

export function loadYearIntoState(state, year) {
  const d = state.yearsData && state.yearsData[year];
  if (d) {
    return {
      ...state,
      year,
      initialBalance: d.initialBalance || 0,
      startDate: d.startDate || (year + '-01-01'),
      plan: d.plan || {},
      actual: d.actual || {},
      groupPlan: d.groupPlan || {},
      useGroupPlan: d.useGroupPlan || {},
      yearGoal: d.yearGoal || 0,
      recentEntries: d.recentEntries || []
    };
  }
  return null;
}

export function listAvailableYears(state) {
  const years = new Set();
  if (state.yearsData) Object.keys(state.yearsData).forEach(y => years.add(parseInt(y)));
  years.add(state.year);
  return [...years].sort((a, b) => a - b);
}

// ===== Debounced sync =====
let _syncTimer = null;
let _syncInFlight = false;
let _syncStatusCallback = null;

export function setSyncStatusCallback(cb) { _syncStatusCallback = cb; }

function updateSyncStatus(msg, type) {
  if (_syncStatusCallback) _syncStatusCallback(msg, type);
}

function debounceSyncPush(state) {
  const cfg = getSyncConfig();
  if (!cfg.apiKey) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { syncToCloud(state).catch(() => {}); }, 2000);
}

export async function syncToCloud(state) {
  const cfg = getSyncConfig();
  if (!cfg.apiKey || !cfg.binId) { updateSyncStatus('Treba REST URL i Token', 'error'); return; }
  if (_syncInFlight) return;
  _syncInFlight = true;
  updateSyncStatus('Spremam u cloud...', 'pending');
  try {
    const url = cfg.binId.replace(/\/$/, '') + '/set/kucne-financije';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(state)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 150));
    }
    updateSyncStatus('OK - ' + new Date().toLocaleTimeString('hr-HR'), 'ok');
  } catch (e) {
    updateSyncStatus('Greska push: ' + e.message, 'error');
    throw e;
  } finally {
    _syncInFlight = false;
  }
}

export async function pullFromCloud(silent, onSuccess) {
  const cfg = getSyncConfig();
  if (!cfg.apiKey || !cfg.binId) {
    if (!silent) updateSyncStatus('Treba REST URL i Token', 'error');
    return false;
  }
  if (_syncInFlight) return false;
  _syncInFlight = true;
  if (!silent) updateSyncStatus('Ucitavam s cloud-a...', 'pending');
  try {
    const url = cfg.binId.replace(/\/$/, '') + '/get/kucne-financije';
    const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + cfg.apiKey } });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 150));
    }
    const data = await resp.json();
    if (!data.result) {
      if (!silent) updateSyncStatus('Cloud je prazan - prvo Push', 'ok');
      return false;
    }
    let remote;
    try { remote = JSON.parse(data.result); }
    catch (e) { throw new Error('Cloud sadrzaj nije validan JSON'); }
    if (!remote || !remote.categories) throw new Error('Neispravan format u cloud-u');
    updateSyncStatus('Povuceno - ' + new Date().toLocaleTimeString('hr-HR'), 'ok');
    if (onSuccess) onSuccess(remote);
    return true;
  } catch (e) {
    updateSyncStatus('Greska pull: ' + e.message, 'error');
    return false;
  } finally {
    _syncInFlight = false;
  }
}
