import { useApp, listAvailableYears, snapshotActiveYear, loadYearIntoState, syncToCloud } from '../store/AppContext.jsx';
import { ensurePlanArrays, defaultState } from '../store/state.js';
import {
  fmtEUR, currentBalance, plannedBalanceToday, projectionYearEnd,
  chainedProjectionYearEnd, plannedEndOfYear, actualNetMonth, plannedNetMonth,
  currentMonthIdx, generatePlanFromActuals
} from '../utils/finance.js';

export default function Header({ syncMsg }) {
  const { state, updateState, setStateSilent } = useApp();
  const cm = currentMonthIdx(state);
  const cb = currentBalance(state);
  const pt = plannedBalanceToday(state);
  const ptDelta = cb - pt;
  const proj = chainedProjectionYearEnd(state);
  const projDelta = proj - plannedEndOfYear(state);

  const years = listAvailableYears(state);

  function handleYearChange(e) {
    const val = e.target.value;
    if (val === 'new') return promptNewYear();
    const newYear = parseInt(val);
    if (isNaN(newYear) || newYear === state.year) return;
    const snapped = { ...state };
    snapshotActiveYear(snapped);
    snapped.year = newYear;
    const loaded = loadYearIntoState(snapped, newYear);
    let next;
    if (loaded) {
      next = loaded;
    } else {
      next = {
        ...snapped, year: newYear,
        initialBalance: 0, startDate: newYear + '-01-01',
        plan: {}, actual: {}, groupPlan: {}, useGroupPlan: {},
        yearGoal: 0, recentEntries: []
      };
    }
    ensurePlanArrays(next);
    updateState(next);
  }

  function promptNewYear() {
    const yearStr = prompt('Unesi novu godinu (npr. 2027):', String(state.year + 1));
    if (!yearStr) return;
    const newYear = parseInt(yearStr);
    if (isNaN(newYear) || newYear < 2020 || newYear > 2100) { alert('Neispravna godina'); return; }
    if (state.yearsData && state.yearsData[newYear]) {
      const snapped = { ...state };
      snapshotActiveYear(snapped);
      snapped.year = newYear;
      const loaded = loadYearIntoState(snapped, newYear);
      ensurePlanArrays(loaded);
      updateState(loaded);
      return;
    }
    const mode = prompt(
      'Plan za ' + newYear + ':\n1 = Prazan plan\n2 = Kopiraj plan iz ' + state.year + '\n3 = Generiraj iz stvarnih podataka ' + state.year + '\n\nUnesi 1, 2 ili 3:', '2'
    );
    if (!mode) return;
    const snapped = { ...state };
    snapshotActiveYear(snapped);
    const prevData = snapped.yearsData && snapped.yearsData[state.year];
    const projBalance = Math.round(projectionYearEnd(state));
    let next = {
      ...snapped, year: newYear,
      initialBalance: projBalance, startDate: newYear + '-01-01',
      actual: {}, yearGoal: 0, recentEntries: [],
      groupPlan: JSON.parse(JSON.stringify((prevData && prevData.groupPlan) || {})),
      useGroupPlan: JSON.parse(JSON.stringify((prevData && prevData.useGroupPlan) || {}))
    };
    if (mode.trim() === '1') {
      next.plan = {}; next.groupPlan = {}; next.useGroupPlan = {};
    } else if (mode.trim() === '2') {
      next.plan = JSON.parse(JSON.stringify((prevData && prevData.plan) || {}));
    } else if (mode.trim() === '3') {
      next.plan = generatePlanFromActuals(state.categories, prevData);
    } else { alert('Neispravan izbor'); return; }
    ensurePlanArrays(next);
    updateState(next);
  }

  return (
    <header className="app-header">
      <h1>
        <span>Kucne financije</span>
        {syncMsg && (
          <span
            style={{ marginLeft: '6px', fontSize: '0.9rem', cursor: 'pointer', color: syncMsg.type === 'error' ? '#fca5a5' : syncMsg.type === 'pending' ? '#fbbf24' : '#86efac' }}
            onClick={() => syncToCloud(state).catch(() => {})}
            title="Klikni za rucnu sync"
          >
            {syncMsg.type === 'pending' ? '⟳' : syncMsg.type === 'error' ? '!' : syncMsg.type === 'ok' ? '✓' : ''}
          </span>
        )}
        <select className="year-badge year-select" value={state.year} onChange={handleYearChange}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
          <option value="new">+ Nova godina</option>
        </select>
      </h1>
      <div className="top-kpis">
        <div className="top-kpi">
          <div className="label">Trenutno stanje</div>
          <div className="value">{fmtEUR(cb)}</div>
        </div>
        <div className="top-kpi">
          <div className="label">Plan do sad</div>
          <div className="value">{fmtEUR(pt)}</div>
          <div className="sub">{(ptDelta >= 0 ? '+' : '') + fmtEUR(ptDelta)} vs plan</div>
        </div>
        <div className="top-kpi">
          <div className="label">Projekcija 31.12.</div>
          <div className="value">{fmtEUR(proj)}</div>
          <div className="sub">{(projDelta >= 0 ? '+' : '') + fmtEUR(projDelta)} vs plan</div>
        </div>
        <div className="top-kpi">
          <div className="label">Ovaj mjesec - saldo</div>
          <div className="value">{fmtEUR(actualNetMonth(state, cm))}</div>
          <div className="sub">plan {fmtEUR(plannedNetMonth(state, cm))}</div>
        </div>
      </div>
    </header>
  );
}
