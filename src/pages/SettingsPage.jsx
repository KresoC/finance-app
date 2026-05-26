import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';
import { getSyncConfig, setSyncConfig, getAIConfig, setAIConfigObj, syncToCloud, pullFromCloud } from '../store/AppContext.jsx';
import { ensurePlanArrays, defaultState, ALL_MONTHS, MONTHS_HR } from '../store/state.js';
import { currentMonthIdx } from '../utils/finance.js';

function CategoryList({ type }) {
  const { state, updateState } = useApp();
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState('Redovni');
  const [newMonthMode, setNewMonthMode] = useState('all');

  function toggleFlexible(catId) {
    const newState = {
      ...state,
      categories: {
        ...state.categories,
        [type]: state.categories[type].map(c =>
          c.id === catId ? { ...c, flexible: !c.flexible } : c
        )
      }
    };
    updateState(newState);
  }

  function toggleCatMonth(catId, month) {
    const cat = [...state.categories.income, ...state.categories.expense].find(c => c.id === catId);
    if (!cat) return;
    const months = cat.months ? [...cat.months] : [...ALL_MONTHS];
    const idx = months.indexOf(month);
    if (idx >= 0) months.splice(idx, 1);
    else { months.push(month); months.sort((a, b) => a - b); }
    const newState = {
      ...state,
      categories: {
        ...state.categories,
        [type]: state.categories[type].map(c => c.id === catId ? { ...c, months } : c)
      }
    };
    updateState(newState);
  }

  function setCatMonths(catId, mode) {
    const cm = currentMonthIdx(state);
    let months;
    if (mode === 'all') months = [...ALL_MONTHS];
    else if (mode === 'none') months = [];
    else months = [cm];
    const newState = {
      ...state,
      categories: {
        ...state.categories,
        [type]: state.categories[type].map(c => c.id === catId ? { ...c, months } : c)
      }
    };
    updateState(newState);
  }

  function addCategory() {
    if (!newName.trim()) return;
    const months = newMonthMode === 'current' ? [currentMonthIdx(state)] : [...ALL_MONTHS];
    const cat = { id: type.slice(0,3) + '-' + Date.now(), name: newName.trim(), months };
    if (type === 'expense') cat.group = newGroup;
    const newState = {
      ...state,
      categories: {
        ...state.categories,
        [type]: [...state.categories[type], cat]
      },
      plan: { ...state.plan, [cat.id]: new Array(12).fill(0) },
      actual: { ...state.actual, [cat.id]: new Array(12).fill(0) }
    };
    if (cat.group && !newState.groupPlan[cat.group]) {
      newState.groupPlan = { ...newState.groupPlan, [cat.group]: new Array(12).fill(0) };
    }
    ensurePlanArrays(newState);
    updateState(newState);
    setNewName('');
  }

  function deleteCategory(catId) {
    const cat = [...state.categories.income, ...state.categories.expense].find(c => c.id === catId);
    if (!cat) return;
    const hasData = (state.plan[catId] && state.plan[catId].some(v => v > 0)) || (state.actual[catId] && state.actual[catId].some(v => v > 0));
    const msg = hasData ? 'Kategorija "' + cat.name + '" ima unesene podatke. Obrisati sve. Nastaviti?' : 'Obrisati kategoriju "' + cat.name + '"?';
    if (!confirm(msg)) return;
    const newPlan = { ...state.plan };
    const newActual = { ...state.actual };
    delete newPlan[catId];
    delete newActual[catId];
    const newState = {
      ...state,
      categories: {
        ...state.categories,
        [type]: state.categories[type].filter(c => c.id !== catId)
      },
      plan: newPlan,
      actual: newActual
    };
    updateState(newState);
  }

  function renameCategory(catId) {
    const cat = [...state.categories.income, ...state.categories.expense].find(c => c.id === catId);
    if (!cat) return;
    const v = prompt('Novi naziv:', cat.name);
    if (v === null || !v.trim()) return;
    const newState = {
      ...state,
      categories: {
        ...state.categories,
        [type]: state.categories[type].map(c => c.id === catId ? { ...c, name: v.trim() } : c)
      }
    };
    updateState(newState);
  }

  const cats = state.categories[type];

  return (
    <>
      <ul className="entry-list">
        {cats.map(c => {
          const months = c.months || ALL_MONTHS;
          return (
            <li key={c.id} className="entry-item" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div className="entry-main" style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                  <div>
                    <div className="entry-cat">{c.name}{c.group ? <span className="muted"> ({c.group})</span> : null}</div>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>{months.length} aktivnih mjeseci</div>
                  </div>
                  <div>
                    <button className="entry-del" onClick={() => renameCategory(c.id)} title="Preimenuj">✏</button>
                    <button className="entry-del" onClick={() => deleteCategory(c.id)} title="Obrisi">✕</button>
                  </div>
                </div>
                <div className="quick-month-btns">
                  <button className="btn ghost small" onClick={() => setCatMonths(c.id, 'all')}>Svi</button>
                  <button className="btn ghost small" onClick={() => setCatMonths(c.id, 'none')}>Nijedan</button>
                  <button className="btn ghost small" onClick={() => setCatMonths(c.id, 'current')}>Trenutni</button>
                </div>
                <div className="month-chips">
                  {MONTHS_HR.map((mn, i) => (
                    <span
                      key={i}
                      className={'month-chip' + (months.includes(i) ? ' active' : '')}
                      onClick={() => toggleCatMonth(c.id, i)}
                    >{mn}</span>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={!!c.flexible}
                    onChange={() => toggleFlexible(c.id)}
                  />
                  <span>Fleksibilni timing</span>
                  <span className="muted" style={{ fontSize: '0.75rem' }}>— forecast koristi godišnji iznos, ne po mjesecu</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginTop: '10px' }}>
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder={type === 'income' ? 'Naziv nove kategorije prihoda' : 'Naziv nove kategorije troska'} />
        {type === 'expense' && (
          <select value={newGroup} onChange={e => setNewGroup(e.target.value)}>
            <option value="Redovni">Redovni</option>
            <option value="Rezije">Rezije</option>
            <option value="Putovanja">Putovanja</option>
            <option value="Ostalo">Ostalo</option>
          </select>
        )}
        <select value={newMonthMode} onChange={e => setNewMonthMode(e.target.value)}>
          <option value="all">Svaki mjesec (12 aktivnih)</option>
          <option value="current">Samo trenutni mjesec</option>
        </select>
        <button className="btn small" onClick={addCategory}>Dodaj kategoriju {type === 'income' ? 'prihoda' : 'troska'}</button>
      </div>
      {type === 'income' && <p className="muted" style={{ fontSize: '0.75rem', marginTop: '8px' }}>Aktivne mjesece kasnije podesavas klikom na chip-ove ispod svake kategorije.</p>}
    </>
  );
}

function BasicSettings() {
  const { state, updateState } = useApp();
  const [startDate, setStartDate] = useState(state.startDate);
  const [initialBalance, setInitialBalance] = useState(state.initialBalance);
  const [year, setYear] = useState(state.year);

  function save() {
    const newState = {
      ...state,
      initialBalance: parseFloat(initialBalance) || 0,
      year: parseInt(year) || new Date().getFullYear(),
      startDate: startDate || ((parseInt(year) || new Date().getFullYear()) + '-01-01')
    };
    updateState(newState);
    alert('Spremljeno');
  }

  return (
    <div className="card">
      <div className="card-title"><h2>Osnovne postavke</h2></div>
      <div className="form-row">
        <label>Datum pocetka pracenja</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Stanje racuna na taj datum (EUR)</label>
        <input type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} step="0.01" />
      </div>
      <div className="form-row">
        <label>Godina</label>
        <input type="number" value={year} onChange={e => setYear(e.target.value)} step="1" />
      </div>
      <button className="btn" onClick={save}>Spremi</button>
    </div>
  );
}

function SyncSettings({ syncStatus }) {
  const { state } = useApp();
  const cfg = getSyncConfig();
  const [restUrl, setRestUrl] = useState(cfg.binId || '');
  const [restToken, setRestToken] = useState(cfg.apiKey || '');
  const [status, setStatus] = useState(syncStatus || (cfg.apiKey ? 'Konfigurirano' : 'Nije konfigurirano'));

  function save() {
    const newCfg = { apiKey: restToken.trim(), binId: restUrl.trim() };
    setSyncConfig(newCfg);
    setStatus('Postavke spremljene');
    if (newCfg.apiKey && newCfg.binId) {
      setTimeout(() => pullFromCloud(false, () => setStatus('Povuceno s clouda')).catch(() => {}), 200);
    }
  }

  return (
    <div className="card">
      <div className="card-title"><h2>Sinkronizacija (Upstash Redis)</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Automatska sinkronizacija izmedju mobitela i laptopa preko Upstash Redis-a (besplatan).
        Upute: <a href="https://console.upstash.com" target="_blank" rel="noopener">console.upstash.com</a> → Sign Up → Create Database → Details → kopiraj URL i Token.
      </p>
      <div className="form-row"><label>Upstash REST URL</label><input type="text" value={restUrl} onChange={e => setRestUrl(e.target.value)} placeholder="https://xxx-eu-west-1.upstash.io" /></div>
      <div className="form-row"><label>Upstash REST Token</label><input type="password" value={restToken} onChange={e => setRestToken(e.target.value)} placeholder="AYx..." /></div>
      <div className="setting-row">
        <div><div className="label">Status</div><div className="sub">{status}</div></div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
        <button className="btn" onClick={save}>Spremi postavke</button>
        <button className="btn secondary small" onClick={() => syncToCloud(state).catch(() => {})}>↑ Push (spremi u cloud)</button>
        <button className="btn secondary small" onClick={() => pullFromCloud(false, () => setStatus('Povuceno')).catch(() => {})}>↓ Pull (povuci s clouda)</button>
      </div>
    </div>
  );
}

function AISettings() {
  const cfg = getAIConfig();
  const [apiKey, setApiKey] = useState(cfg.apiKey || '');
  const [model, setModel] = useState(cfg.model && ['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash','gemini-flash-latest'].includes(cfg.model) ? cfg.model : 'gemini-2.5-flash');
  const [customModel, setCustomModel] = useState(cfg.model && !['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash','gemini-flash-latest'].includes(cfg.model) ? cfg.model : '');
  const [status, setStatus] = useState(cfg.apiKey ? ('Konfigurirano ✓ - ' + (cfg.model || '?')) : 'Nije konfigurirano');
  const [dropdownModels, setDropdownModels] = useState(null);

  function save() {
    const m = customModel.trim() || model;
    setAIConfigObj({ apiKey: apiKey.trim(), model: m });
    setStatus(apiKey ? ('Konfigurirano ✓ - ' + m) : 'Nije konfigurirano');
    alert('AI postavke spremljene. Model: ' + m);
  }

  async function listModels() {
    const key = apiKey.trim() || cfg.apiKey || '';
    if (!key) { alert('Prvo upisi API key.'); return; }
    setStatus('Dohvacam listu modela...');
    try {
      const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key));
      if (!resp.ok) { const txt = await resp.text(); throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 200)); }
      const data = await resp.json();
      const supported = (data.models || []).filter(m => (m.supportedGenerationMethods || m.supported_generation_methods || []).includes('generateContent'));
      if (supported.length === 0) { alert('Nije pronadjen ni jedan model. Provjeri API key.'); setStatus('Nema dostupnih modela'); return; }
      setDropdownModels(supported.map(m => ({ value: (m.name || '').replace('models/', ''), label: (m.name || '').replace('models/', '') + (m.displayName && m.displayName !== m.name ? ' (' + m.displayName + ')' : '') })));
      setStatus('Pronadjeno ' + supported.length + ' modela.');
      alert('Pronadjeno ' + supported.length + ' dostupnih modela. Odaberi jedan i klikni Spremi.');
    } catch (e) { setStatus('Greska: ' + e.message); alert('Greska: ' + e.message); }
  }

  const modelOptions = dropdownModels || [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (preporuceno)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (mocan, vise quota troska)' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-flash-latest', label: 'gemini-flash-latest (alias)' }
  ];

  return (
    <div className="card">
      <div className="card-title"><h2>AI Asistent (Gemini)</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Besplatni Google Gemini API. Upute: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> → Sign in → "Create API Key" → kopiraj ovamo.
      </p>
      <div className="form-row"><label>Gemini API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza..." /></div>
      <div className="form-row">
        <label>Model</label>
        <select value={model} onChange={e => setModel(e.target.value)}>
          {modelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="form-row"><label>Ili upisi tocan naziv modela</label><input type="text" value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="npr. gemini-2.5-flash" /></div>
      <div className="setting-row"><div><div className="label">Status</div><div className="sub">{status}</div></div></div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
        <button className="btn" onClick={save}>Spremi AI postavke</button>
        <button className="btn secondary small" onClick={listModels}>Provjeri dostupne modele</button>
      </div>
    </div>
  );
}

function DataSettings() {
  const { state, updateState } = useApp();

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date(); const d = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    a.download = 'kucne-financije-' + state.year + '-' + d + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.categories) throw new Error('Neispravan format');
        if (!data.actual) data.actual = {};
        ensurePlanArrays(data);
        updateState(data);
        alert('Uvezeno');
      } catch (err) { alert('Greska: ' + err.message); }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function resetData() {
    if (!confirm('Sigurno resetirati sve podatke?')) return;
    const fresh = defaultState();
    ensurePlanArrays(fresh);
    updateState(fresh);
  }

  return (
    <div className="card">
      <div className="card-title"><h2>Podaci</h2></div>
      <div className="setting-row">
        <div><div className="label">Izvoz podataka</div><div className="sub">Preuzmi JSON datoteku za backup</div></div>
        <button className="btn secondary small" onClick={exportData}>Izvezi</button>
      </div>
      <div className="setting-row">
        <div><div className="label">Uvoz podataka</div><div className="sub">Ucitaj JSON iz backupa</div></div>
        <button className="btn secondary small" onClick={() => document.getElementById('importFileInput').click()}>Uvezi</button>
        <input type="file" id="importFileInput" accept=".json" style={{ display: 'none' }} onChange={importData} />
      </div>
      <div className="setting-row">
        <div><div className="label">Reset svih podataka</div><div className="sub">Vraca na pocetne vrijednosti</div></div>
        <button className="btn danger small" onClick={resetData}>Resetiraj</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <section>
      <BasicSettings />
      <div className="card">
        <div className="card-title"><h2>Kategorije prihoda</h2></div>
        <CategoryList type="income" />
      </div>
      <div className="card">
        <div className="card-title"><h2>Kategorije troskova</h2></div>
        <CategoryList type="expense" />
      </div>
      <AISettings />
      <SyncSettings />
      <DataSettings />
    </section>
  );
}
