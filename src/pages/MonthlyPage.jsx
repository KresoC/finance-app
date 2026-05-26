import { useApp } from '../store/AppContext.jsx';
import {
  fmtEUR, currentMonthIdx, plannedIncomeMonth, plannedExpenseMonth,
  actualIncomeMonth, actualExpenseMonth, startMonthIdx, startIsThisYear
} from '../utils/finance.js';
import { MONTHS_LONG } from '../store/state.js';

export default function MonthlyPage() {
  const { state } = useApp();
  const cm = currentMonthIdx(state);

  // PLAN
  const ip = plannedIncomeMonth(state, cm);
  const ep = plannedExpenseMonth(state, cm);
  const np = ip - ep;
  // STVARNO
  const ia = actualIncomeMonth(state, cm);
  const ea = actualExpenseMonth(state, cm);
  const na = ia - ea;
  // ODSTUPANJE
  const di = ia - ip;
  const de = ea - ep;
  const dn = na - np;

  let statusText, statusCls;
  if (np === 0 && na === 0) { statusText = 'Nema podataka'; statusCls = ''; }
  else if (Math.abs(dn) < 50) { statusText = '🟢 Po planu'; statusCls = 'good'; }
  else if (dn > 0) { statusText = '🟢 ' + fmtEUR(dn) + ' bolje'; statusCls = 'good'; }
  else { statusText = '🔴 ' + fmtEUR(Math.abs(dn)) + ' losije'; statusCls = 'bad'; }

  // Top deviations
  const items = [];
  const seenG = new Set();
  state.categories.expense.forEach(c => {
    const g = c.group;
    if (g && state.useGroupPlan && state.useGroupPlan[g]) {
      if (seenG.has(g)) return; seenG.add(g);
      const plan = (state.groupPlan[g] && state.groupPlan[g][cm]) || 0;
      let actual = 0;
      state.categories.expense.forEach(cc => { if (cc.group === g) actual += (state.actual[cc.id] && state.actual[cc.id][cm]) || 0; });
      if (plan === 0 && actual === 0) return;
      items.push({ name: g + ' (grupa)', plan, actual, delta: actual - plan });
    } else {
      const plan = (state.plan[c.id] && state.plan[c.id][cm]) || 0;
      const actual = (state.actual[c.id] && state.actual[c.id][cm]) || 0;
      if (plan === 0 && actual === 0) return;
      items.push({ name: c.name, plan, actual, delta: actual - plan });
    }
  });
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = items.filter(it => Math.abs(it.delta) > 0).slice(0, 3);

  // Monthly table
  const sm = startMonthIdx(state);
  const before = m => startIsThisYear(state) && m < sm;
  let tpn = 0, tan = 0;
  const tableRows = Array.from({ length: 12 }, (_, m) => {
    const pn = plannedIncomeMonth(state, m) - plannedExpenseMonth(state, m);
    const an = actualIncomeMonth(state, m) - actualExpenseMonth(state, m);
    const isCurrent = m === cm;
    const isBefore = before(m);
    const showActual = !isBefore && m <= cm;
    const diff = an - pn;
    tpn += pn;
    if (showActual) tan += an;
    const diffCls = showActual && Math.abs(diff) > 0 ? (diff > 0 ? 'pos' : 'neg') : '';
    return (
      <tr key={m} style={isCurrent ? { background: '#f0fdfa' } : (isBefore ? { opacity: 0.55 } : {})}>
        <td><b>{MONTHS_LONG[m]}</b></td>
        <td className="num">{fmtEUR(pn)}</td>
        <td className="num">{showActual ? fmtEUR(an) : ''}</td>
        <td className={'num ' + diffCls}>{showActual ? ((diff >= 0 ? '+' : '') + fmtEUR(diff)) : ''}</td>
      </tr>
    );
  });

  return (
    <section>
      <div className="card month-status-card">
        <div className="card-title">
          <h2>{(MONTHS_LONG[cm] || '').toUpperCase()} {state.year}</h2>
          <span className={'month-status-badge ' + statusCls}>{statusText}</span>
        </div>
        <div className="md-title" style={{ marginTop: '6px' }}>PLAN</div>
        <div className="hero-grid">
          <div className="card stat-card"><div className="stat-label">Prihodi</div><div className="stat-value">{fmtEUR(ip)}</div></div>
          <div className="card stat-card"><div className="stat-label">Troskovi</div><div className="stat-value">{fmtEUR(ep)}</div></div>
          <div className="card stat-card"><div className="stat-label">Neto</div><div className={'stat-value ' + (np >= 0 ? 'pos' : 'neg')}>{fmtEUR(np)}</div></div>
        </div>
        <div className="md-title" style={{ marginTop: '14px' }}>STVARNO</div>
        <div className="hero-grid">
          <div className="card stat-card"><div className="stat-label">Prihodi</div><div className="stat-value pos">{fmtEUR(ia)}</div></div>
          <div className="card stat-card"><div className="stat-label">Troskovi</div><div className="stat-value neg">{fmtEUR(ea)}</div></div>
          <div className="card stat-card"><div className="stat-label">Neto</div><div className={'stat-value ' + (na >= 0 ? 'pos' : 'neg')}>{fmtEUR(na)}</div></div>
        </div>
        <div className="md-title" style={{ marginTop: '14px' }}>ODSTUPANJE (stvarno vs plan)</div>
        <div className="hero-grid">
          <div className="card stat-card"><div className="stat-label">Prihodi</div><div className={'stat-value ' + (di >= 0 ? 'pos' : 'neg')}>{(di >= 0 ? '+' : '') + fmtEUR(di)}</div></div>
          <div className="card stat-card"><div className="stat-label">Troskovi</div><div className={'stat-value ' + (de > 0 ? 'neg' : 'pos')}>{(de >= 0 ? '+' : '') + fmtEUR(de)}</div></div>
          <div className="card stat-card"><div className="stat-label">Neto</div><div className={'stat-value ' + (dn >= 0 ? 'pos' : 'neg')}>{(dn >= 0 ? '+' : '') + fmtEUR(dn)}</div></div>
        </div>
        <div className="month-deviations">
          <div className="md-title">Top odstupanja ovog mjeseca</div>
          <ul className="month-dev-list">
            {top.length === 0
              ? <li className="hero-empty">Nema znacajnih odstupanja.</li>
              : top.map((it, i) => {
                  const over = it.delta > 0;
                  const sym = over ? '🔴' : '🟢';
                  const sign = over ? '+' : '';
                  return (
                    <li key={i}>
                      <div className="md-name">{sym} {it.name}</div>
                      <div className={'md-value ' + (over ? 'neg' : 'pos')}>{sign}{fmtEUR(it.delta)}</div>
                    </li>
                  );
                })
            }
          </ul>
        </div>
      </div>
      <div className="card">
        <div className="card-title"><h2>Mjesecni pregled (detalji)</h2></div>
        <div className="table-wrap">
          <table id="monthlyTable">
            <thead>
              <tr>
                <th>Mjesec</th>
                <th className="num">Plan neto</th>
                <th className="num">Stvarno neto</th>
                <th className="num">Razlika</th>
              </tr>
            </thead>
            <tbody>
              {tableRows}
              <tr className="total-row">
                <td>UKUPNO</td>
                <td className="num">{fmtEUR(tpn)}</td>
                <td className="num">{fmtEUR(tan)}</td>
                <td className="num">{(tan - tpn >= 0 ? '+' : '') + fmtEUR(tan - tpn)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
