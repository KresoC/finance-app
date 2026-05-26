import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';
import DataGrid from '../components/DataGrid.jsx';
import { fmtEUR, plannedIncomeMonth, plannedExpenseMonth, plannedEndOfYear, startMonthIdx, startIsThisYear } from '../utils/finance.js';
import { parseQuickAdd, detectTargetMonths } from '../utils/quickAdd.js';
import { MONTHS_HR } from '../store/state.js';

function PlanSummary({ state }) {
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  const fromM = sIsThis ? sm : 0;
  let totalIncome = 0, totalExpense = 0;
  for (let m = fromM; m < 12; m++) {
    totalIncome += plannedIncomeMonth(state, m);
    totalExpense += plannedExpenseMonth(state, m);
  }
  const result = plannedEndOfYear(state);

  return (
    <div className="card plan-summary-card">
      <div className="card-title"><h2>Godisnji plan</h2></div>
      <div className="card hero-card" style={{ marginBottom: '14px' }}>
        <div className="hero-label">Planirani rezultat {state.year}</div>
        <div className="hero-value">{fmtEUR(result)}</div>
        <div className="hero-sub">pocetno stanje + planirani prihodi - planirani rashodi</div>
      </div>
      <div className="hero-grid">
        <div className="card stat-card">
          <div className="stat-label">Planirani prihodi</div>
          <div className="stat-value pos">{fmtEUR(totalIncome)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Planirani rashodi</div>
          <div className="stat-value neg">{fmtEUR(totalExpense)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Planirani rezultat</div>
          <div className={'stat-value ' + (result >= 0 ? 'pos' : 'neg')}>{fmtEUR(result)}</div>
        </div>
      </div>
    </div>
  );
}

function QuickAddPlan() {
  const { state, updateState } = useApp();
  const [value, setValue] = useState('');
  const [feedback, setFeedback] = useState(null);

  function submit() {
    const r = parseQuickAdd(value, state);
    if (r.error) { setFeedback({ type: 'bad', text: '✕ ' + r.error }); return; }
    if (!r.catId) { setFeedback({ type: 'bad', text: '✕ Nema kategorije.' }); return; }
    const months = r.months || detectTargetMonths((value || '').toLowerCase()) || [0,1,2,3,4,5,6,7,8,9,10,11];
    const newState = { ...state, plan: { ...state.plan } };
    if (!newState.plan[r.catId]) newState.plan[r.catId] = new Array(12).fill(0);
    else newState.plan[r.catId] = [...newState.plan[r.catId]];
    months.forEach(m => { newState.plan[r.catId][m] = r.amount; });
    updateState(newState);
    setValue('');
    const monthsLabel = months.length === 12 ? 'svih 12 mjeseci' : months.map(m => MONTHS_HR[m]).join(', ');
    setFeedback({ type: 'good', text: '✓ PLAN: ' + (r.type === 'income' ? 'Prihod' : 'Trosak') + ' ' + fmtEUR(r.amount) + ' u "' + r.catName + '" za ' + monthsLabel });
    setTimeout(() => setFeedback(null), 4000);
  }

  return (
    <div className="card quick-add-card">
      <div className="quick-add-title">Brzi unos plana</div>
      <div className="quick-add-row">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder='npr. "Placa 3000 svaki mjesec" ili "Skijanje 600 u veljaci"'
        />
        <button className="btn" onClick={submit}>Dodaj u plan</button>
      </div>
      <div className="quick-add-hint">Auto-detektira iznos, kategoriju i mjesece. Uvijek se sprema u plan (ne stvarno).</div>
      {feedback && <div className={'quick-add-feedback show ' + feedback.type}>{feedback.text}</div>}
    </div>
  );
}

export default function PlanPage() {
  const { state } = useApp();
  const [planType, setPlanType] = useState('income');

  return (
    <section>
      <QuickAddPlan />
      <PlanSummary state={state} />
      <div className="card">
        <div className="card-title"><h2>Godisnji plan</h2><span className="muted">EUR</span></div>
        <p className="muted" style={{ marginTop: 0 }}>
          Upisi planirane iznose za svaki mjesec. Za stalne stavke koristi gumb "Isti iznos svaki mjesec".
        </p>
        <div className={'type-toggle ' + planType}>
          <button className={planType === 'income' ? 'active' : ''} onClick={() => setPlanType('income')}>Prihodi</button>
          <button className={planType === 'expense' ? 'active' : ''} onClick={() => setPlanType('expense')}>Troskovi</button>
        </div>
        <div className="table-wrap">
          <DataGrid tableId="planTable" typeView={planType} gridKey="plan" allowFillAll={true} />
        </div>
      </div>
    </section>
  );
}
