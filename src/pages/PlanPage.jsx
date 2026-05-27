import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';
import PlanGrid, { PlanSummaryPanel } from '../components/PlanGrid.jsx';
import { fmtEUR } from '../utils/finance.js';
import { parseQuickAdd, detectTargetMonths } from '../utils/quickAdd.js';
import { MONTHS_HR } from '../store/state.js';

function QuickAddPlan() {
  const { state, updateState } = useApp();
  const [value, setValue]       = useState('');
  const [feedback, setFeedback] = useState(null);

  function submit() {
    const r = parseQuickAdd(value, state);
    if (r.error)  { setFeedback({ type: 'bad', text: '✕ ' + r.error }); return; }
    if (!r.catId) { setFeedback({ type: 'bad', text: '✕ Nema kategorije.' }); return; }
    const months = r.months || detectTargetMonths((value || '').toLowerCase()) || [0,1,2,3,4,5,6,7,8,9,10,11];
    const newState = { ...state, plan: { ...state.plan } };
    if (!newState.plan[r.catId]) newState.plan[r.catId] = new Array(12).fill(0);
    else newState.plan[r.catId] = [...newState.plan[r.catId]];
    months.forEach(m => { newState.plan[r.catId][m] = r.amount; });
    updateState(newState);
    setValue('');
    const ml = months.length === 12 ? 'svih 12 mj.' : months.map(m => MONTHS_HR[m]).join(', ');
    setFeedback({ type: 'good', text: '✓ ' + (r.type === 'income' ? 'Prihod' : 'Trošak') + ' ' + fmtEUR(r.amount) + ' → "' + r.catName + '" za ' + ml });
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
          placeholder='npr. "Plaća 3000 svaki mjesec" ili "Skijanje 600 u veljači"'
        />
        <button className="btn" onClick={submit}>Dodaj u plan</button>
      </div>
      <div className="quick-add-hint">Auto-detektira iznos, kategoriju i mjesece. Uvijek sprema u plan.</div>
      {feedback && <div className={'quick-add-feedback show ' + feedback.type}>{feedback.text}</div>}
    </div>
  );
}

export default function PlanPage() {
  const { state }   = useApp();
  const [planType, setPlanType] = useState('income');

  return (
    <section>
      <QuickAddPlan />
      <div className="plan-page-layout">
        <div className="plan-page-main">
          <div className="card">
            <div className="card-title">
              <h2>Godišnji plan</h2>
              <span className="muted">EUR</span>
            </div>
            <div className={'type-toggle ' + planType} style={{ marginBottom: '12px' }}>
              <button className={planType === 'income'  ? 'active' : ''} onClick={() => setPlanType('income')}>Prihodi</button>
              <button className={planType === 'expense' ? 'active' : ''} onClick={() => setPlanType('expense')}>Troškovi</button>
            </div>
            <PlanGrid typeView={planType} />
          </div>
        </div>
        <PlanSummaryPanel state={state} />
      </div>
    </section>
  );
}
