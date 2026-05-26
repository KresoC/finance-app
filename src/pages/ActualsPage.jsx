import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { fmtEUR, currentMonthIdx, actualIncomeMonth, actualExpenseMonth, plannedIncomeMonth, plannedExpenseMonth, todayStr, MONTHS_LONG } from '../utils/finance.js';
import { parseQuickAdd } from '../utils/quickAdd.js';
import { MONTHS_LONG as ML } from '../store/state.js';

function QuickAdd() {
  const { state, updateState } = useApp();
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState(null);

  function submit() {
    const r = parseQuickAdd(value, state);
    if (r.error) { setFeedback({ type: 'bad', text: '✕ ' + r.error }); return; }

    if (r.mode === 'planned') {
      const newState = { ...state, plan: { ...state.plan } };
      if (!newState.plan[r.catId]) newState.plan[r.catId] = new Array(12).fill(0);
      else newState.plan[r.catId] = [...newState.plan[r.catId]];
      r.months.forEach(m => { newState.plan[r.catId][m] = r.amount; });
      updateState(newState);
      setValue('');
      const monthsLabel = r.months.length === 12 ? 'svih 12 mjeseci' : r.months.map(m => ML[m]).join(', ');
      setFeedback({ type: 'good', text: '✓ PLAN: ' + (r.type === 'income' ? 'Prihod' : 'Trosak') + ' ' + fmtEUR(r.amount) + ' u "' + r.catName + '" za ' + monthsLabel });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }

    // Cross-year placa check
    if (r.type === 'income' && /pla[cć]a/i.test(r.catName) && r.month === 0) {
      const py = state.year - 1;
      const pyd = state.yearsData && state.yearsData[py];
      if (pyd && pyd.plan && pyd.plan[r.catId] && pyd.plan[r.catId][11] > 0) {
        const prevReceived = (pyd.actual && pyd.actual[r.catId] && pyd.actual[r.catId][11]) || 0;
        if (pyd.plan[r.catId][11] > prevReceived) {
          const newState = { ...state, yearsData: { ...state.yearsData } };
          const pydCopy = { ...pyd, actual: { ...pyd.actual } };
          if (!pydCopy.actual[r.catId]) pydCopy.actual[r.catId] = new Array(12).fill(0);
          else pydCopy.actual[r.catId] = [...pydCopy.actual[r.catId]];
          pydCopy.actual[r.catId][11] += r.amount;
          newState.yearsData[py] = pydCopy;
          const entries = [...(state.recentEntries || [])];
          entries.unshift({ ts: Date.now(), date: todayStr(), type: r.type, catId: r.catId, catName: r.catName, amount: r.amount, label: r.label + ' (placa ' + py + ')' });
          newState.recentEntries = entries.slice(0, 30);
          updateState(newState);
          setValue('');
          setFeedback({ type: 'good', text: '✓ Placa ' + py + ' (prosinac) = ' + fmtEUR(r.amount) + ' upisana u ' + py });
          setTimeout(() => setFeedback(null), 4000);
          return;
        }
      }
    }

    const newState = { ...state, actual: { ...state.actual } };
    if (!newState.actual[r.catId]) newState.actual[r.catId] = new Array(12).fill(0);
    else newState.actual[r.catId] = [...newState.actual[r.catId]];
    newState.actual[r.catId][r.month] = (newState.actual[r.catId][r.month] || 0) + r.amount;
    const entries = [...(state.recentEntries || [])];
    entries.unshift({ ts: Date.now(), date: todayStr(), type: r.type, catId: r.catId, catName: r.catName, amount: r.amount, label: r.label });
    newState.recentEntries = entries.slice(0, 30);
    updateState(newState);
    setValue('');
    setFeedback({ type: 'good', text: '✓ ' + (r.type === 'income' ? 'Prihod' : 'Trosak') + ' ' + fmtEUR(r.amount) + ' u "' + r.catName + '"' });
    setTimeout(() => setFeedback(null), 4000);
  }

  return (
    <div className="card quick-add-card">
      <div className="quick-add-title">Sto se danas dogodilo?</div>
      <div className="quick-add-row">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder='npr. "Platio struju 87" ili "Placa 3000"'
        />
        <button className="btn" onClick={submit}>Dodaj</button>
      </div>
      <div className="quick-add-hint">Automatski prepoznaje iznos, kategoriju i tip (prihod/trosak).</div>
      {feedback && <div className={'quick-add-feedback show ' + feedback.type}>{feedback.text}</div>}
    </div>
  );
}

function ActivityFeed() {
  const { state, updateState } = useApp();
  const entries = (state.recentEntries || []).slice(0, 10);

  function deleteEntry(ts) {
    const e = (state.recentEntries || []).find(x => x.ts === ts);
    if (!e) return;
    if (!confirm('Ukloniti ovaj unos? Skinut ce se i s mjesecnih iznosa.')) return;
    const newState = { ...state, actual: { ...state.actual } };
    if (newState.actual[e.catId]) {
      const m = new Date(e.date).getMonth();
      newState.actual[e.catId] = [...newState.actual[e.catId]];
      newState.actual[e.catId][m] = Math.max(0, (newState.actual[e.catId][m] || 0) - e.amount);
    }
    newState.recentEntries = (state.recentEntries || []).filter(x => x.ts !== ts);
    updateState(newState);
  }

  if (entries.length === 0) {
    return <li className="hero-empty">Jos nema unosa preko quick add-a.</li>;
  }

  const groups = {};
  entries.forEach(e => { (groups[e.date] = groups[e.date] || []).push(e); });
  const today = todayStr();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yest = y.getFullYear() + '-' + String(y.getMonth()+1).padStart(2,'0') + '-' + String(y.getDate()).padStart(2,'0');
  const dateLabel = d => {
    if (d === today) return 'Danas';
    if (d === yest) return 'Jucer';
    const dt = new Date(d);
    return dt.getDate() + '. ' + (ML[dt.getMonth()] || '');
  };

  return Object.entries(groups).map(([date, items]) => (
    <span key={date}>
      <div className="activity-day">{dateLabel(date)}</div>
      {items.map(e => {
        const sign = e.type === 'income' ? '+' : '−';
        return (
          <li key={e.ts} className="activity-item">
            <div>
              <div className="activity-label">{e.label}</div>
              <div className="activity-cat">{e.catName}</div>
            </div>
            <div className="activity-right">
              <div className={'activity-amount ' + e.type}>{sign}{fmtEUR(e.amount)}</div>
              <button className="activity-delete" onClick={() => deleteEntry(e.ts)} title="Ukloni">×</button>
            </div>
          </li>
        );
      })}
    </span>
  ));
}

function MonthlyReality({ state }) {
  const cm = currentMonthIdx(state);
  const ia = actualIncomeMonth(state, cm);
  const ea = actualExpenseMonth(state, cm);
  const net = ia - ea;
  const planNet = plannedIncomeMonth(state, cm) - plannedExpenseMonth(state, cm);
  const diff = net - planNet;

  let statusText, statusCls;
  if (planNet === 0 && net === 0) { statusText = 'Nema podataka'; statusCls = ''; }
  else if (planNet === 0) { statusText = '⚠ Nema plana'; statusCls = 'warn'; }
  else if (Math.abs(diff) < 50) { statusText = '🟢 Po planu'; statusCls = 'good'; }
  else if (diff > 0) { statusText = '🟢 ' + fmtEUR(diff) + ' bolje od plana'; statusCls = 'good'; }
  else { statusText = '🔴 ' + fmtEUR(Math.abs(diff)) + ' losije od plana'; statusCls = 'bad'; }

  return (
    <div className="card">
      <div className="card-title">
        <h2>{(ML[cm] || '').toUpperCase()} {state.year}</h2>
        <span className={'month-status-badge ' + statusCls}>{statusText}</span>
      </div>
      <div className="hero-grid">
        <div className="card stat-card"><div className="stat-label">Prihodi</div><div className="stat-value pos">{fmtEUR(ia)}</div></div>
        <div className="card stat-card"><div className="stat-label">Troskovi</div><div className="stat-value neg">{fmtEUR(ea)}</div></div>
        <div className="card stat-card">
          <div className="stat-label">Neto</div>
          <div className={'stat-value ' + (net >= 0 ? 'pos' : 'neg')}>{(net >= 0 ? '+' : '') + fmtEUR(net)}</div>
        </div>
      </div>
    </div>
  );
}

export default function ActualsPage() {
  const { state } = useApp();
  const [actualType, setActualType] = useState('income');

  return (
    <section>
      <QuickAdd />
      <div className="card">
        <div className="card-title"><h2>Nedavna aktivnost</h2></div>
        <ul className="activity-feed">
          <ActivityFeed />
        </ul>
      </div>
      <MonthlyReality state={state} />
      <div className={'type-toggle ' + actualType} style={{ marginTop: '4px' }}>
        <button className={actualType === 'income' ? 'active' : ''} onClick={() => setActualType('income')}>Prihodi</button>
        <button className={actualType === 'expense' ? 'active' : ''} onClick={() => setActualType('expense')}>Troskovi</button>
      </div>
      <details className="advanced-details">
        <summary className="advanced-summary">Napredni unos (po mjesecima i kategorijama)</summary>
        <div className="card">
          <div className="card-title"><h2>Stvarni iznosi</h2><span className="muted">EUR</span></div>
          <p className="muted" style={{ marginTop: 0 }}>Direktan unos po mjesecima i kategorijama. Sive celije (-) znace da kategorija nije aktivna za taj mjesec.</p>
          <div className="table-wrap">
            <DataGrid tableId="actualTable" typeView={actualType} gridKey="actual" allowFillAll={false} />
          </div>
        </div>
      </details>
    </section>
  );
}
