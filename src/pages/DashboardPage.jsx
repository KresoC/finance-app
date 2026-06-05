import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext.jsx';
import {
  fmtEUR, currentMonthIdx, activeBillingMonth, currentBalance, projectionYearEnd, chainedProjectionYearEnd,
  plannedEndOfYear, plannedIncomeMonth, plannedExpenseMonth, actualIncomeMonth,
  actualExpenseMonth, plannedBalanceEndMonth, actualBalanceEndMonth, dayOfMonthFraction,
  startMonthIdx, startIsThisYear, isPlacaCat, MONTHS_HR, MONTHS_LONG
} from '../utils/finance.js';

function HeroCard({ state }) {
  const proj = chainedProjectionYearEnd(state);
  const goal = plannedEndOfYear(state);
  const dev = proj - goal;
  let statusCls = '';
  let statusText = '—';
  if (Math.abs(dev) < 50) { statusText = 'Na planu'; statusCls = ''; }
  else if (dev > 0) { statusText = '+' + fmtEUR(dev) + ' iznad cilja'; statusCls = 'good'; }
  else { statusText = fmtEUR(dev) + ' ispod cilja'; statusCls = 'bad'; }

  // Provjeri je li prethodna godina ulančana u forecast
  const prevYear = state.year - 1;
  const isChained = !!(state.yearsData?.[prevYear]?.plan);
  const subText = isChained
    ? `uključuje forecast ${prevYear} kao polazište`
    : 'na temelju trenutnog stanja i preostalog plana';

  return (
    <div className="card hero-card">
      <div className="hero-label">Procjena stanja 31.12.{state.year}</div>
      <div className="hero-value">{fmtEUR(proj)}</div>
      <div className="hero-sub">{subText}</div>
      <div><span className={'hero-status ' + statusCls}>{statusText}</span></div>
    </div>
  );
}

function StatGrid({ state }) {
  const cm = currentMonthIdx(state);
  const cb = currentBalance(state);
  const proj = chainedProjectionYearEnd(state);
  const goal = plannedEndOfYear(state);
  const dev = proj - goal;

  function sumRemaining(type) {
    let s = 0;
    const seen = new Set();
    state.categories[type].forEach(c => {
      const g = c.group;
      if (g && state.useGroupPlan && state.useGroupPlan[g]) {
        if (seen.has(g)) return;
        seen.add(g);
        for (let m = cm; m < 12; m++) s += (state.groupPlan[g] && state.groupPlan[g][m]) || 0;
      } else {
        for (let m = cm; m < 12; m++) s += (state.plan[c.id] && state.plan[c.id][m]) || 0;
      }
    });
    return s;
  }

  return (
    <>
      <div className="hero-grid">
        <div className="card stat-card">
          <div className="stat-label">Trenutno stanje</div>
          <div className="stat-value">{fmtEUR(cb)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Cilj 31.12.</div>
          <div className="stat-value muted">{fmtEUR(goal)}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Razlika od cilja</div>
          <div className={'stat-value ' + (dev >= 0 ? 'pos' : 'neg')}>{(dev >= 0 ? '+' : '') + fmtEUR(dev)}</div>
        </div>
      </div>
      <div className="hero-grid two">
        <div className="card stat-card">
          <div className="stat-label">Preostali planirani prihodi</div>
          <div className="stat-value pos">{fmtEUR(sumRemaining('income'))}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Preostali planirani rashodi</div>
          <div className="stat-value neg">{fmtEUR(sumRemaining('expense'))}</div>
        </div>
      </div>
    </>
  );
}

function LiveTracking({ state }) {
  const cm = currentMonthIdx(state);
  const bm = activeBillingMonth(state); // billing month: prethodni do 15., tekući od 16.

  // ── Redovni budget za billing month ──
  let redName = 'Redovni budget', redPlan = 0, redActual = 0;
  const redCat = state.categories.expense.find(c => /redovni/i.test(c.name));
  if (redCat) {
    if (redCat.group && state.useGroupPlan && state.useGroupPlan[redCat.group]) {
      redPlan = (state.groupPlan[redCat.group] && state.groupPlan[redCat.group][bm]) || 0;
      state.categories.expense.forEach(c => { if (c.group === redCat.group) redActual += (state.actual[c.id] && state.actual[c.id][bm]) || 0; });
      redName = redCat.group + ' (grupa)';
    } else {
      redPlan = (state.plan[redCat.id] && state.plan[redCat.id][bm]) || 0;
      redActual = (state.actual[redCat.id] && state.actual[redCat.id][bm]) || 0;
      redName = redCat.name;
    }
  }
  const redRem = redPlan - redActual;
  const redPct = redPlan > 0 ? Math.round((redActual / redPlan) * 100) : 0;
  const barCls = 'br-bar-fill spend' + (redPct > 100 ? ' bad' : (redPct > 85 ? ' warn' : ''));

  // ── Plaća i "Ostalo" za billing month ──
  // Plaća koja financira ovaj billing ciklus stigla je 15. tekućeg kalendarskog
  // mjeseca (cm), a odnosi se na prethodni kalendarski mjesec (cm-1).
  // Npr. na 5.6. čekamo plaću za 5.mj koja stiže 15.6.
  //       od 16.6. plaća za 5.mj je (trebala biti) unesena 15.6.
  const salaryMonth = cm > 0 ? cm - 1 : 0; // prethodni kalendarski = plaća koja financira ovaj ciklus
  const placaCat = state.categories.income.find(c => isPlacaCat(c));
  const placaA   = placaCat ? (state.actual[placaCat.id]?.[salaryMonth] || 0) : 0;
  const totalExp = actualExpenseMonth(state, bm);
  const rem      = placaA - totalExp;

  // Plaća stiže 15. tekućeg kalendarskog mjeseca
  const payDue    = new Date(state.year, cm, 15);
  const payDueStr = '15.' + (cm + 1) + '.';

  let placaDetail;
  if (!placaCat) {
    placaDetail = <span>Nema kategorije Placa</span>;
  } else if (placaA > 0) {
    placaDetail = <span><span style={{ color: '#059669', fontWeight: 600 }}>✓ Primljena</span> {fmtEUR(placaA)} − troskovi {fmtEUR(totalExp)}</span>;
  } else {
    const planSalary = state.plan[placaCat.id]?.[salaryMonth] || 0;
    const today      = new Date();
    if (planSalary > 0) {
      if (today > payDue) {
        placaDetail = <span><span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ Kasni</span>: placa {fmtEUR(planSalary)} ocekivana do {payDueStr}</span>;
      } else {
        placaDetail = <span><span style={{ color: '#d97706', fontWeight: 600 }}>⏳ Pending</span>: placa {fmtEUR(planSalary)} do {payDueStr}</span>;
      }
    } else {
      placaDetail = <span>Nema planiranih prihoda za ovaj ciklus</span>;
    }
  }

  // Label: pokazuje koji billing ciklus je aktivan
  const cycleLabel = bm !== cm
    ? MONTHS_HR[bm] + ' (ciklus)'
    : 'danas';

  return (
    <div className="card">
      <div className="card-title"><h2>Tekuca kontrola</h2><span className="muted">{cycleLabel}</span></div>
      <div className="hero-grid two">
        <div className="card stat-card live-stat">
          <div className="stat-label">{redName}</div>
          <div className={'stat-value ' + (redRem >= 0 ? 'pos' : 'neg')}>{fmtEUR(redRem)}</div>
          <div className="stat-sub">{redPlan > 0 ? ('od ' + fmtEUR(redPlan) + ' · ' + redPct + '% potroseno') : 'Nema plana za ovaj mjesec'}</div>
          <div className="br-bar" style={{ marginTop: '10px' }}>
            <div className={barCls} style={{ width: Math.min(redPct, 100) + '%' }}></div>
          </div>
        </div>
        <div className="card stat-card live-stat">
          <div className="stat-label">Ostalo od place</div>
          <div className={'stat-value ' + (rem >= 0 ? 'pos' : 'neg')}>{fmtEUR(rem)}</div>
          <div className="stat-sub">{placaDetail}</div>
        </div>
      </div>
    </div>
  );
}

function MonthlyStatus({ state }) {
  const cm = currentMonthIdx(state);
  const bm = activeBillingMonth(state);
  const planExpense = plannedExpenseMonth(state, bm);
  const actualExpense = actualExpenseMonth(state, bm);
  const dev = actualExpense - planExpense;
  const spendPct = planExpense > 0 ? Math.round((actualExpense / planExpense) * 100) : 0;

  let statusText, statusCls;
  if (actualExpense < 1 && planExpense < 1) { statusText = 'Nema podataka'; statusCls = ''; }
  else if (dev > 50) { statusText = '🔴 ' + fmtEUR(dev) + ' vise od plana'; statusCls = 'bad'; }
  else if (dev < -50) { statusText = '🟢 ' + fmtEUR(Math.abs(dev)) + ' manje od plana'; statusCls = 'good'; }
  else { statusText = '🟢 U skladu s planom'; statusCls = 'good'; }

  let brNoteCls = 'br-note';
  let brNoteText;
  if (planExpense < 1) brNoteText = 'Nema planiranih troskova za ovaj ciklus.';
  else if (spendPct > 100) { brNoteText = '🔴 Potrosio si ' + spendPct + '% budgeta ciklusa - presao si plan.'; brNoteCls += ' bad'; }
  else brNoteText = 'Potroseno: ' + fmtEUR(actualExpense) + ' / ' + fmtEUR(planExpense) + ' (' + spendPct + '% budgeta).';

  const spendBarCls = 'br-bar-fill spend' + (spendPct > 100 ? ' bad' : spendPct > 90 ? ' warn' : '');

  // Top deviations za billing month
  const items = [];
  const seen = new Set();
  state.categories.expense.forEach(c => {
    const g = c.group;
    if (g && state.useGroupPlan && state.useGroupPlan[g]) {
      if (seen.has(g)) return;
      seen.add(g);
      const plan = (state.groupPlan[g] && state.groupPlan[g][bm]) || 0;
      let actual = 0;
      state.categories.expense.forEach(cc => { if (cc.group === g) actual += (state.actual[cc.id] && state.actual[cc.id][bm]) || 0; });
      if (plan === 0 && actual === 0) return;
      items.push({ name: g + ' (grupa)', plan, actual, delta: actual - plan });
    } else {
      const plan = (state.plan[c.id] && state.plan[c.id][bm]) || 0;
      const actual = (state.actual[c.id] && state.actual[c.id][bm]) || 0;
      if (plan === 0 && actual === 0) return;
      items.push({ name: c.name, plan, actual, delta: actual - plan });
    }
  });
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = items.filter(it => Math.abs(it.delta) > 0).slice(0, 4);

  return (
    <div className="card month-status-card">
      <div className="card-title">
        <h2>
          <span>{(MONTHS_LONG[bm] || '').toUpperCase()}</span> <span>{state.year}</span>
          {bm !== cm && <span style={{ fontSize: '0.7rem', fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>billing ciklus</span>}
        </h2>
        <span className={'month-status-badge ' + statusCls}>{statusText}</span>
      </div>
      <div className="month-grid">
        <div className="month-stat">
          <div className="ms-label">Plan mjeseca</div>
          <div className="ms-value">{fmtEUR(planExpense)}</div>
        </div>
        <div className="month-stat">
          <div className="ms-label">Realizirano</div>
          <div className="ms-value">{fmtEUR(actualExpense)}</div>
        </div>
        <div className="month-stat">
          <div className="ms-label">Razlika</div>
          <div className={'ms-value ' + (dev > 0 ? 'neg' : 'pos')}>{(dev >= 0 ? '+' : '') + fmtEUR(dev)}</div>
        </div>
      </div>
      <div className="br-bar" style={{ marginTop: '14px', height: '10px' }}>
        <div className={spendBarCls} style={{ width: Math.min(spendPct, 100) + '%' }}></div>
      </div>
      <div className={brNoteCls} style={{ marginTop: '8px' }}>{brNoteText}</div>
      <div className="month-deviations">
        <div className="md-title">Top mjesecna odstupanja po kategorijama</div>
        <ul className="month-dev-list">
          {top.length === 0
            ? <li className="hero-empty">Nema odstupanja za prikazati.</li>
            : top.map((it, i) => {
                const over = it.delta > 0;
                const symbol = over ? '🔴' : '🟢';
                const sign = over ? '+' : '';
                return (
                  <li key={i}>
                    <div className="md-name">{symbol} {it.name}</div>
                    <div className={'md-value ' + (over ? 'neg' : 'pos')}>{sign}{fmtEUR(it.delta)}</div>
                  </li>
                );
              })
          }
        </ul>
      </div>
    </div>
  );
}

function InsightsCard({ state }) {
  const cm = currentMonthIdx(state);
  const sm = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  const insights = [];

  const proj = chainedProjectionYearEnd(state);
  const goal = plannedEndOfYear(state);
  const gd = proj - goal;
  if (Math.abs(gd) < 50) insights.push({ cls: 'good', icon: '🟢', text: 'Forecast tocno na godisnjem cilju (' + fmtEUR(proj) + ')' });
  else if (gd > 0) insights.push({ cls: 'good', icon: '🟢', text: 'Forecast je ' + fmtEUR(gd) + ' iznad godisnjeg cilja' });
  else insights.push({ cls: 'bad', icon: '🔴', text: 'Forecast je ' + fmtEUR(Math.abs(gd)) + ' ispod godisnjeg cilja' });

  const mExpA = actualExpenseMonth(state, cm);
  const mExpP = plannedExpenseMonth(state, cm);
  const mExpDiff = mExpA - mExpP;
  if (mExpP > 0 && Math.abs(mExpDiff) > 50) {
    if (mExpDiff > 0) insights.push({ cls: 'warn', icon: '⚠️', text: 'Troskovi ovog mjeseca su ' + fmtEUR(mExpDiff) + ' iznad plana' });
    else insights.push({ cls: 'good', icon: '🟢', text: 'Troskovi ovog mjeseca su ' + fmtEUR(Math.abs(mExpDiff)) + ' ispod plana (usteda)' });
  }

  const items = [];
  const seenG = new Set();
  state.categories.expense.forEach(c => {
    const g = c.group;
    if (g && state.useGroupPlan && state.useGroupPlan[g]) {
      if (seenG.has(g)) return; seenG.add(g);
      let plan = 0, actual = 0;
      for (let m = fromM; m <= cm; m++) {
        plan += (state.groupPlan[g] && state.groupPlan[g][m]) || 0;
        state.categories.expense.forEach(cc => { if (cc.group === g) actual += (state.actual[cc.id] && state.actual[cc.id][m]) || 0; });
      }
      if (plan === 0 && actual === 0) return;
      items.push({ name: g, plan, actual, delta: actual - plan });
    } else {
      let plan = 0, actual = 0;
      for (let m = fromM; m <= cm; m++) {
        plan += (state.plan[c.id] && state.plan[c.id][m]) || 0;
        actual += (state.actual[c.id] && state.actual[c.id][m]) || 0;
      }
      if (plan === 0 && actual === 0) return;
      items.push({ name: c.name, plan, actual, delta: actual - plan });
    }
  });
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  items.slice(0, 2).forEach(it => {
    if (Math.abs(it.delta) < 30) return;
    const pct = it.plan > 0 ? Math.round((Math.abs(it.delta) / it.plan) * 100) : 0;
    if (it.delta > 0) insights.push({ cls: 'warn', icon: '⚠️', text: it.name + ' ' + pct + '% iznad plana (+' + fmtEUR(it.delta) + ')' });
    else insights.push({ cls: 'good', icon: '🟢', text: it.name + ' ' + pct + '% ispod plana (' + fmtEUR(Math.abs(it.delta)) + ' usteda)' });
  });

  insights.push({ cls: 'info', icon: '📊', text: 'Forecast kraja godine: ' + fmtEUR(proj) });

  return (
    <div className="card">
      <div className="card-title"><h2>Kljucni uvidi</h2></div>
      <ul className="insights-list">
        {insights.length === 0
          ? <li className="hero-empty">Nema dovoljno podataka za uvide.</li>
          : insights.map((i, idx) => (
              <li key={idx} className={i.cls}>
                <div className="insight-icon">{i.icon}</div>
                <div className="insight-text">{i.text}</div>
              </li>
            ))
        }
      </ul>
    </div>
  );
}

function UpcomingCard({ state }) {
  const cm = currentMonthIdx(state);
  const upcoming = [];
  for (let m = cm + 1; m <= Math.min(cm + 3, 11); m++) {
    const items = [];
    const seen = new Set();
    state.categories.expense.forEach(c => {
      const g = c.group;
      if (g && state.useGroupPlan && state.useGroupPlan[g]) {
        if (seen.has(g)) return; seen.add(g);
        const plan = (state.groupPlan[g] && state.groupPlan[g][m]) || 0;
        if (plan > 0) items.push({ name: g, amount: plan });
      } else {
        const plan = (state.plan[c.id] && state.plan[c.id][m]) || 0;
        if (plan > 0) items.push({ name: c.name, amount: plan });
      }
    });
    items.sort((a, b) => b.amount - a.amount);
    const total = items.reduce((s, i) => s + i.amount, 0);
    if (total > 0) upcoming.push({ month: m, monthName: MONTHS_LONG[m], items: items.slice(0, 4), total });
  }

  return (
    <div className="card">
      <div className="card-title"><h2>Sljedeci planirani troskovi</h2></div>
      {upcoming.length === 0
        ? <div className="hero-empty">Nema planiranih troskova u narednim mjesecima.</div>
        : upcoming.slice(0, 2).map((u, i) => (
            <div key={i} className="upcoming-month">
              <div className="upcoming-month-name">{u.monthName}</div>
              <div className="upcoming-items">
                {u.items.map((it, j) => <div key={j}>{it.name} · {fmtEUR(it.amount)}</div>)}
              </div>
              <div className="upcoming-total">Ukupno planirano: {fmtEUR(u.total)}</div>
            </div>
          ))
      }
    </div>
  );
}

function TopDeviationsCard({ state }) {
  const cm = currentMonthIdx(state);
  const sm = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  const items = [];
  const seenGroups = new Set();

  ['income', 'expense'].forEach(type => {
    state.categories[type].forEach(c => {
      const g = c.group;
      if (g && state.useGroupPlan && state.useGroupPlan[g]) {
        const key = type + ':' + g;
        if (seenGroups.has(key)) return;
        seenGroups.add(key);
        let plan = 0, actual = 0;
        for (let m = fromM; m <= cm; m++) {
          plan += (state.groupPlan[g] && state.groupPlan[g][m]) || 0;
          state.categories[type].forEach(cc => {
            if (cc.group === g) actual += (state.actual[cc.id] && state.actual[cc.id][m]) || 0;
          });
        }
        if (plan === 0 && actual === 0) return;
        items.push({ name: g, type, plan, actual, delta: actual - plan, isGroup: true });
      } else {
        let plan = 0, actual = 0;
        for (let m = fromM; m <= cm; m++) {
          plan += (state.plan[c.id] && state.plan[c.id][m]) || 0;
          actual += (state.actual[c.id] && state.actual[c.id][m]) || 0;
        }
        if (plan === 0 && actual === 0) return;
        items.push({ name: c.name, type, plan, actual, delta: actual - plan, isGroup: false });
      }
    });
  });
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = items.filter(it => Math.abs(it.delta) > 0).slice(0, 3);

  return (
    <div className="card">
      <div className="card-title">
        <h2>Najveca odstupanja od plana (od pocetka pracenja)</h2>
        <span className="muted">do {MONTHS_LONG[cm]} {state.year}</span>
      </div>
      <ul className="deviations">
        {top.length === 0
          ? <li className="hero-empty">Sve je u skladu s planom.</li>
          : top.map((it, i) => {
              const positive = it.delta > 0;
              const good = it.type === 'income' ? positive : !positive;
              const sign = positive ? '+' : '';
              const label = it.isGroup ? (it.name + ' (grupa)') : it.name;
              return (
                <li key={i}>
                  <div>
                    <div className="dev-name">{label}</div>
                    <div className="dev-detail">Plan: {fmtEUR(it.plan)} · Stvarno: {fmtEUR(it.actual)}</div>
                  </div>
                  <div className={'dev-value ' + (good ? 'pos' : 'neg')}>{sign}{fmtEUR(it.delta)}</div>
                </li>
              );
            })
        }
      </ul>
    </div>
  );
}

function Chart({ state }) {
  const cm = currentMonthIdx(state);
  const W = 700, H = 240;
  const pad = { l: 50, r: 20, t: 16, b: 30 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const plannedPoints = [];
  const actualPoints = [];
  for (let m = 0; m < 12; m++) {
    const pb = plannedBalanceEndMonth(state, m);
    if (pb !== null) plannedPoints.push({ m, v: pb });
    if (m <= cm) {
      const ab = actualBalanceEndMonth(state, m);
      if (ab !== null) actualPoints.push({ m, v: ab });
    }
  }
  const all = plannedPoints.map(p => p.v).concat(actualPoints.map(p => p.v)).concat([state.initialBalance, 0]);
  const minVal = Math.min(...all);
  const maxVal = Math.max(...all);
  const range = maxVal - minVal || 1;
  const yMin = minVal - range * 0.05;
  const yMax = maxVal + range * 0.05;
  const xOf = i => pad.l + (i / 11) * innerW;
  const yOf = v => pad.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const plannedPath = plannedPoints.map((p, i) => (i === 0 ? 'M' : 'L') + xOf(p.m) + ',' + yOf(p.v)).join(' ');
  const actualPath = actualPoints.map((p, i) => (i === 0 ? 'M' : 'L') + xOf(p.m) + ',' + yOf(p.v)).join(' ');

  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const val = yMin + (yMax - yMin) * (i / 4);
    const y = yOf(val);
    gridLines.push(
      <g key={i}>
        <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#e2e8f0" strokeWidth="1" />
        <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">{Math.round(val).toLocaleString('hr-HR')}</text>
      </g>
    );
  }

  const xLabels = MONTHS_HR.map((mn, i) => (
    <text key={i} x={xOf(i)} y={H - pad.b + 14} textAnchor="middle" fontSize="10" fill="#64748b">{mn}</text>
  ));

  let zeroLine = null;
  if (yMin < 0 && yMax > 0) {
    const y0 = yOf(0);
    zeroLine = <line x1={pad.l} y1={y0} x2={W - pad.r} y2={y0} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2,3" />;
  }

  const dots = actualPoints.map((p, i) => (
    <circle key={i} cx={xOf(p.m)} cy={yOf(p.v)} r="3.5" fill="#14b8a6" />
  ));

  const todayX = xOf(cm + dayOfMonthFraction(state));
  const todayMarker = <line x1={todayX} y1={pad.t} x2={todayX} y2={H - pad.b} stroke="#0f766e" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />;

  let startMarker = null;
  if (startIsThisYear(state)) {
    const sd = new Date(state.startDate);
    const sm = sd.getMonth();
    const dim = new Date(state.year, sm + 1, 0).getDate();
    const sxRel = (sm - 1) + sd.getDate() / dim;
    const sx = xOf(Math.max(0, sxRel));
    const sy = yOf(state.initialBalance);
    startMarker = <circle cx={sx} cy={sy} r="5" fill="#f59e0b" stroke="white" strokeWidth="2" />;
  }

  return (
    <div className="card">
      <div className="card-title"><h2>Kretanje kroz godinu</h2></div>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {gridLines}
          {zeroLine}
          {todayMarker}
          {plannedPath && <path d={plannedPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,4" />}
          {actualPath && <path d={actualPath} fill="none" stroke="#14b8a6" strokeWidth="2.5" />}
          {dots}
          {startMarker}
          {xLabels}
        </svg>
      </div>
      <div className="chart-legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#94a3b8' }}></span>Plan (kraj mjeseca)</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#14b8a6' }}></span>Stvarno</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#f59e0b', width: '10px', height: '10px', borderRadius: '50%' }}></span>Pocetak pracenja</span>
      </div>
    </div>
  );
}

// ── useIsMobile ─────────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const fn = e => setMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

// ── buildGroups: zajednički podaci za mobile i desktop ───────────────────────
function buildGroups(state, cm) {
  const groups = [];

  // PRIHODI
  const incomeItems = [];
  state.categories.income.forEach(c => {
    const plan = state.plan[c.id]?.[cm] || 0;
    const actual = state.actual[c.id]?.[cm] || 0;
    if (plan > 0 || actual > 0) incomeItems.push({ name: c.name, plan, actual });
  });
  const incomePlan = incomeItems.reduce((s, it) => s + it.plan, 0);
  const incomeActual = incomeItems.reduce((s, it) => s + it.actual, 0);
  if (incomePlan > 0 || incomeActual > 0)
    groups.push({ name: 'Prihodi', type: 'income', plan: incomePlan, actual: incomeActual, items: incomeItems });

  // RASHODI — po grupama
  const groupOrder = [];
  const groupMap = {};
  state.categories.expense.forEach(c => {
    const gn = c.group || 'Ostalo';
    if (!groupMap[gn]) {
      groupMap[gn] = { name: gn, type: 'expense', plan: 0, actual: 0, items: [], usesGroupPlan: false };
      groupOrder.push(gn);
    }
    const grp = groupMap[gn];
    if (c.group && state.useGroupPlan?.[c.group]) {
      grp.usesGroupPlan = true;
      grp.plan = state.groupPlan?.[c.group]?.[cm] || 0;
      const act = state.actual[c.id]?.[cm] || 0;
      grp.actual += act;
      if (act > 0) grp.items.push({ name: c.name, plan: 0, actual: act });
    } else {
      const plan = state.plan[c.id]?.[cm] || 0;
      const act = state.actual[c.id]?.[cm] || 0;
      grp.plan += plan;
      grp.actual += act;
      if (plan > 0 || act > 0) grp.items.push({ name: c.name, plan, actual: act });
    }
  });
  groupOrder.forEach(gn => {
    const grp = groupMap[gn];
    if (grp.plan > 0 || grp.actual > 0) groups.push(grp);
  });

  return groups;
}

// ── barColor: boja progress bara ─────────────────────────────────────────────
function barColor(pct, isIncome) {
  if (isIncome) {
    if (pct >= 100) return 'bar-green';
    if (pct >= 50)  return 'bar-orange';
    return 'bar-red';
  }
  if (pct > 100) return 'bar-red';
  if (pct >= 80)  return 'bar-orange';
  return 'bar-green';
}

// ── MobileCategoryCards ───────────────────────────────────────────────────────
function MobileCategoryCards({ groups }) {
  const [expanded, setExpanded] = useState({});
  const toggle = name => setExpanded(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="cat-cards">
      {groups.map(grp => {
        const pct = grp.plan > 0 ? Math.round((grp.actual / grp.plan) * 100) : (grp.actual > 0 ? 999 : 0);
        const cls = barColor(pct, grp.type === 'income');
        const isOpen = !!expanded[grp.name];
        const hasItems = grp.items.length > 0;

        return (
          <div key={grp.name} className="cat-card">
            <div
              className={'cat-card-header' + (hasItems ? ' clickable' : '')}
              onClick={() => hasItems && toggle(grp.name)}
            >
              <div className="cat-card-top">
                <span className="cat-card-name">{grp.name}</span>
                <div className="cat-card-right">
                  <span className="cat-card-amounts">
                    <strong>{fmtEUR(grp.actual)}</strong>
                    {grp.plan > 0 && <span className="cat-amounts-plan"> / {fmtEUR(grp.plan)}</span>}
                  </span>
                  {hasItems && (
                    <span className={'cat-card-chevron' + (isOpen ? ' open' : '')}>›</span>
                  )}
                </div>
              </div>
              {grp.plan > 0 && (
                <div className="cat-card-bar-wrap">
                  <div className="cat-card-bar">
                    <div className={'cat-bar-fill ' + cls} style={{ width: Math.min(pct, 100) + '%' }} />
                  </div>
                  <span className={'cat-bar-pct ' + cls}>{pct}%</span>
                </div>
              )}
            </div>
            {isOpen && hasItems && (
              <div className="cat-card-items">
                {grp.items.map((it, i) => (
                  <div key={i} className="cat-subitem">
                    <span className="cat-subitem-name">↳ {it.name}</span>
                    <span className="cat-subitem-val">{fmtEUR(it.actual)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── DashCategoryTable ─────────────────────────────────────────────────────────
function DashCategoryTable({ state }) {
  const bm = activeBillingMonth(state);
  const isMobile = useIsMobile();
  const groups = buildGroups(state, bm);

  if (groups.length === 0) return null;

  // ── MOBILE: kartice ───────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="card">
        <div className="card-title"><h2>Tekuci mjesec — po kategorijama</h2></div>
        <MobileCategoryCards groups={groups} />
      </div>
    );
  }

  // ── DESKTOP: tablica + progress bar ───────────────────────────────────────
  const all = [
    ...state.categories.income.map(c => ({ ...c, type: 'income' })),
    ...state.categories.expense.map(c => ({ ...c, type: 'expense' }))
  ];
  const rows = [];
  let lastGroup = null;
  const seenGroups = new Set();

  all.forEach((c, idx) => {
    const groupLabel = c.type === 'income' ? 'Prihodi' : (c.group || 'Ostalo');
    if (groupLabel !== lastGroup) {
      rows.push(<tr key={'g-' + groupLabel + idx} className="group-row"><td colSpan={5}>{groupLabel}</td></tr>);
      lastGroup = groupLabel;
    }
    const useGroup = c.group && state.useGroupPlan && state.useGroupPlan[c.group];
    if (useGroup) {
      if (!seenGroups.has(c.group)) {
        seenGroups.add(c.group);
        const groupPlanVal = state.groupPlan?.[c.group]?.[bm] || 0;
        let groupActual = 0;
        state.categories[c.type].forEach(cc => {
          if (cc.group === c.group) groupActual += state.actual[cc.id]?.[bm] || 0;
        });
        const delta = groupActual - groupPlanVal;
        const deltaClass = c.type === 'expense'
          ? (delta > 0 ? 'delta-neg' : delta < 0 ? 'delta-pos' : '')
          : (delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : '');
        const pct = groupPlanVal > 0 ? Math.round((groupActual / groupPlanVal) * 100) : 0;
        const cls = barColor(pct, c.type === 'income');
        rows.push(
          <tr key={'ug-' + c.group} style={{ background: '#fefce8' }}>
            <td className="cat-name"><b>{c.group} UKUPNO</b></td>
            <td className="num"><b>{fmtEUR(groupPlanVal)}</b></td>
            <td className="num"><b>{fmtEUR(groupActual)}</b></td>
            <td className={'num ' + deltaClass}><b>{(delta >= 0 ? '+' : '') + fmtEUR(delta)}</b></td>
            <td className="bar-cell">
              {groupPlanVal > 0 && <div className="mini-bar"><div className={'mini-bar-fill ' + cls} style={{ width: Math.min(pct, 100) + '%' }} /></div>}
            </td>
          </tr>
        );
      }
      const actual = state.actual[c.id]?.[bm] || 0;
      if (actual > 0) {
        rows.push(
          <tr key={'ugsub-' + c.id}>
            <td className="cat-name" style={{ paddingLeft: '20px', color: '#64748b' }}>↳ {c.name}</td>
            <td className="num muted">—</td>
            <td className="num">{fmtEUR(actual)}</td>
            <td className="num"></td>
            <td className="bar-cell"></td>
          </tr>
        );
      }
      return;
    }
    const plan = state.plan[c.id]?.[bm] || 0;
    const actual = state.actual[c.id]?.[bm] || 0;
    if (plan === 0 && actual === 0) return;
    const delta = actual - plan;
    const deltaClass = c.type === 'expense'
      ? (delta > 0 ? 'delta-neg' : delta < 0 ? 'delta-pos' : '')
      : (delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : '');
    const pct = plan > 0 ? Math.round((actual / plan) * 100) : 0;
    const cls = barColor(pct, c.type === 'income');
    rows.push(
      <tr key={c.id}>
        <td className="cat-name">{c.name}</td>
        <td className="num">{fmtEUR(plan)}</td>
        <td className="num">{fmtEUR(actual)}</td>
        <td className={'num ' + deltaClass}>{(delta >= 0 ? '+' : '') + fmtEUR(delta)}</td>
        <td className="bar-cell">
          {plan > 0 && <div className="mini-bar"><div className={'mini-bar-fill ' + cls} style={{ width: Math.min(pct, 100) + '%' }} /></div>}
        </td>
      </tr>
    );
  });

  return (
    <details className="advanced-details">
      <summary className="advanced-summary">Prikazi detalje mjeseca po kategorijama</summary>
      <div className="card">
        <div className="card-title"><h2>Tekuci mjesec — po kategorijama</h2></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kategorija</th>
                <th className="num">Plan</th>
                <th className="num">Stvarno</th>
                <th className="num">Razlika</th>
                <th className="bar-cell">Status</th>
              </tr>
            </thead>
            <tbody>{rows}</tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function NextYearForecastCard({ state }) {
  const nextYear = state.year + 1;
  const nextData = state.yearsData?.[nextYear];
  const endThis  = chainedProjectionYearEnd(state);

  // Nema 2027 — pokaži poziv na kreiranje
  if (!nextData) {
    return (
      <div className="card ny-card ny-card-empty">
        <div className="card-title">
          <h2>🔭 Prognoza kraj {nextYear}</h2>
        </div>
        <div className="ny-empty-text">
          Kreiraj plan za {nextYear} da vidiš prognozu dvogodišnjeg perioda.
        </div>
        <div className="ny-empty-sub">
          Projicirani saldo 31.12.{state.year}: <strong>{fmtEUR(Math.round(endThis))}</strong> — to će biti polazna točka za {nextYear}.
        </div>
      </div>
    );
  }

  // Konstruiraj pravi next-year state da plannedIncomeMonth/plannedExpenseMonth
  // korektno rješavaju useGroupPlan (inače bi duplikali troškove)
  const nextState = {
    ...state,
    year: nextYear,
    plan:         nextData.plan         || {},
    actual:       nextData.actual       || {},
    groupPlan:    nextData.groupPlan    || {},
    useGroupPlan: nextData.useGroupPlan || {},
    initialBalance: nextData.initialBalance || 0,
    startDate: nextData.startDate || (nextYear + '-01-01'),
  };
  let totalIncome = 0, totalExpense = 0;
  for (let m = 0; m < 12; m++) {
    totalIncome  += plannedIncomeMonth(nextState, m);
    totalExpense += plannedExpenseMonth(nextState, m);
  }

  // 2027 postoji ali nema plana
  if (totalIncome === 0 && totalExpense === 0) {
    return (
      <div className="card ny-card ny-card-empty">
        <div className="card-title">
          <h2>🔭 Prognoza kraj {nextYear}</h2>
        </div>
        <div className="ny-empty-text">
          Plan za {nextYear} je prazan — unesi prihode i troškove da vidiš prognozu.
        </div>
        <div className="ny-empty-sub">
          Polazna točka: <strong>{fmtEUR(Math.round(endThis))}</strong> (procjena 31.12.{state.year})
        </div>
      </div>
    );
  }

  const netNext = totalIncome - totalExpense;
  const endNext = endThis + netNext;

  return (
    <div className="card ny-card">
      <div className="card-title">
        <h2>🔭 Prognoza kraj {nextYear}</h2>
        <span className="muted">plan {nextYear} + projekcija {state.year}</span>
      </div>
      <div className="ny-big-value">{fmtEUR(Math.round(endNext))}</div>
      <div className="ny-breakdown">
        <div className="ny-row">
          <span>Projicirani saldo 31.12.{state.year}</span>
          <span>{fmtEUR(Math.round(endThis))}</span>
        </div>
        <div className="ny-row">
          <span className="pos">Planirani prihodi {nextYear}</span>
          <span className="pos">+{fmtEUR(Math.round(totalIncome))}</span>
        </div>
        <div className="ny-row">
          <span className="neg">Planirani troškovi {nextYear}</span>
          <span className="neg">−{fmtEUR(Math.round(totalExpense))}</span>
        </div>
        <div className="ny-row ny-net-row">
          <span>Neto {nextYear}</span>
          <span className={netNext >= 0 ? 'pos' : 'neg'}>{netNext >= 0 ? '+' : ''}{fmtEUR(Math.round(netNext))}</span>
        </div>
      </div>
    </div>
  );
}

function InvestmentsWidget({ state }) {
  const active = (state.investments || []).filter(i => i.status === 'active');
  if (active.length === 0) return null;

  const today  = new Date();
  const daysRem = d => Math.round((new Date(d) - today) / 86400000);
  const fmtD    = s => { const [y,m,d] = s.split('-'); return `${d}.${m}.${y}.`; };
  const earn    = inv => inv.faceValue
    ? inv.faceValue - inv.amount
    : inv.amount * (inv.rate / 100) * (inv.days / 365);

  const locked        = active.reduce((s, i) => s + i.amount, 0);
  const totalInterest = active.reduce((s, i) => s + earn(i), 0);

  const sorted = [...active]
    .map(i => ({ ...i, dr: daysRem(i.maturityDate) }))
    .sort((a, b) => a.dr - b.dr);

  return (
    <div className="card inv-dash-card">
      <div className="card-title">
        <h2>📈 Trezorski zapisi</h2>
        <span className="muted">{fmtEUR(locked)} uloženo</span>
      </div>
      <div className="inv-dash-maturities">
        {sorted.map(inv => {
          const expired = inv.dr <= 0;
          const fv = inv.faceValue || inv.amount;
          return (
            <div key={inv.id} className={'inv-dash-row' + (expired ? ' inv-dash-expired' : '')}>
              <div className="inv-dash-left">
                <span className="inv-dash-name">{fmtEUR(Math.round(fv))}</span>
                <span className="inv-dash-days">
                  {expired ? '⏰ Dospjelo — idi na Ulaganja' : `za ${inv.dr} d · ${fmtD(inv.maturityDate)}`}
                </span>
              </div>
              <span className="inv-dash-earn pos">+{fmtEUR(Math.round(earn(inv)))}</span>
            </div>
          );
        })}
      </div>
      <div className="inv-dash-total">
        <span>Ukupni prinos</span>
        <span className="pos">{fmtEUR(Math.round(totalInterest))}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { state } = useApp();
  return (
    <section>
      <HeroCard state={state} />
      <StatGrid state={state} />
      <NextYearForecastCard state={state} />
      <InvestmentsWidget state={state} />
      <LiveTracking state={state} />
      <MonthlyStatus state={state} />
      <InsightsCard state={state} />
      <UpcomingCard state={state} />
      <TopDeviationsCard state={state} />
      <Chart state={state} />
      <DashCategoryTable state={state} />
    </section>
  );
}
