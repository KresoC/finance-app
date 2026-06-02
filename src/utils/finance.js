import { ALL_MONTHS, MONTHS_HR, MONTHS_LONG } from '../store/state.js';

export { MONTHS_HR, MONTHS_LONG, ALL_MONTHS };

export function fmtEUR(n) {
  if (n === null || n === undefined || isNaN(n)) n = 0;
  const rounded = Math.round(n);
  if (rounded === 0) return '0 EUR';
  const sign = rounded < 0 ? '-' : '';
  return sign + Math.abs(rounded).toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' EUR';
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

export function currentMonthIdx(state) {
  const today = new Date();
  if (today.getFullYear() < state.year) return 0;
  if (today.getFullYear() > state.year) return 11;
  return today.getMonth();
}

// "Billing month" — do 15. u mjesecu prikazuj i unosi prethodni mjesec
// (plaća stiže ~15., pa se troškovi s početka mjeseca bilježe u prethodni ciklus)
export function activeBillingMonth(state) {
  const today = new Date();
  const cm    = currentMonthIdx(state);
  if (state.year === today.getFullYear() && today.getDate() <= 15 && cm > 0) {
    return cm - 1;
  }
  return cm;
}

export function dayOfMonthFraction(state) {
  const today = new Date();
  if (today.getFullYear() !== state.year) return today.getFullYear() < state.year ? 0 : 1;
  const m = today.getMonth();
  const dim = new Date(state.year, m+1, 0).getDate();
  return today.getDate() / dim;
}

export function startMonthIdx(state) {
  const d = new Date(state.startDate);
  return d.getFullYear() === state.year ? d.getMonth() : -1;
}

export function startIsThisYear(state) {
  return new Date(state.startDate).getFullYear() === state.year;
}

export function isPlacaCat(c) { return /pla[cć]a/i.test(c.name); }
export function isBudgetCat(c) { return /redovni/i.test(c.name); }

export function plannedMonthByType(state, type, m) {
  let sum = 0;
  const seenGroups = new Set();
  state.categories[type].forEach(c => {
    const g = c.group;
    if (g && state.useGroupPlan && state.useGroupPlan[g]) {
      if (!seenGroups.has(g)) {
        sum += (state.groupPlan && state.groupPlan[g] && state.groupPlan[g][m]) || 0;
        seenGroups.add(g);
      }
    } else {
      sum += (state.plan[c.id] && state.plan[c.id][m]) || 0;
    }
  });
  return sum;
}

export function plannedIncomeMonth(state, m) { return plannedMonthByType(state, 'income', m); }
export function plannedExpenseMonth(state, m) { return plannedMonthByType(state, 'expense', m); }
export function plannedNetMonth(state, m) { return plannedIncomeMonth(state, m) - plannedExpenseMonth(state, m); }

export function actualIncomeMonth(state, m) {
  return state.categories.income.reduce((s, c) => s + (state.actual[c.id]?.[m] || 0), 0);
}
export function actualExpenseMonth(state, m) {
  return state.categories.expense.reduce((s, c) => s + (state.actual[c.id]?.[m] || 0), 0);
}
export function actualNetMonth(state, m) { return actualIncomeMonth(state, m) - actualExpenseMonth(state, m); }

export function plannedNetCumulative(state, t) {
  let s = 0;
  for (let m = 0; m <= t; m++) s += plannedNetMonth(state, m);
  return s;
}

export function plannedBalanceEndMonth(state, m) {
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  if (sIsThis && m < sm) return null;
  const fromM = sIsThis ? sm : 0;
  let sum = state.initialBalance;
  for (let mm = fromM; mm <= m; mm++) sum += plannedNetMonth(state, mm);
  return sum;
}

export function actualBalanceEndMonth(state, m) {
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  if (sIsThis && m < sm) return null;
  const fromM = sIsThis ? sm : 0;
  let sum = state.initialBalance;
  for (let mm = fromM; mm <= m; mm++) sum += actualNetMonth(state, mm);
  return sum;
}

export function currentBalance(state) {
  const cm = currentMonthIdx(state);
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  const fromM = sIsThis ? sm : 0;
  let sum = state.initialBalance;
  for (let m = fromM; m <= cm; m++) sum += actualNetMonth(state, m);
  return sum;
}

export function plannedBalanceToday(state) {
  const today = new Date();
  if (today.getTime() < new Date(state.startDate).getTime()) return state.initialBalance;
  const cm = currentMonthIdx(state);
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  const fromM = sIsThis ? sm : 0;
  let sum = state.initialBalance;
  for (let m = fromM; m < cm; m++) sum += plannedNetMonth(state, m);
  return sum;
}

export function effectiveIncomeMonth(state, m) {
  let sum = 0;
  state.categories.income.forEach(c => {
    let a = 0;
    if (isPlacaCat(c)) {
      if (m < 11) {
        a = (state.actual[c.id] && state.actual[c.id][m+1]) || 0;
      } else {
        const ny = state.yearsData && state.yearsData[state.year + 1];
        a = (ny && ny.actual && ny.actual[c.id] && ny.actual[c.id][0]) || 0;
      }
    } else {
      a = (state.actual[c.id] && state.actual[c.id][m]) || 0;
    }
    const p = (state.plan[c.id] && state.plan[c.id][m]) || 0;
    sum += a > 0 ? a : p;
  });
  return sum;
}

export function effectiveExpenseMonth(state, m) {
  const cm = currentMonthIdx(state);
  const isCurrent = m === cm;
  let sum = 0;
  const seenG = new Set();
  state.categories.expense.forEach(c => {
    const g = c.group;
    if (g && state.useGroupPlan && state.useGroupPlan[g]) {
      if (seenG.has(g)) return;
      seenG.add(g);
      let actualSum = 0;
      state.categories.expense.forEach(cc => {
        if (cc.group === g) actualSum += (state.actual[cc.id] && state.actual[cc.id][m]) || 0;
      });
      const planG = (state.groupPlan[g] && state.groupPlan[g][m]) || 0;
      if (isCurrent) sum += Math.max(actualSum, planG);
      else sum += actualSum > 0 ? actualSum : planG;
    } else {
      const a = (state.actual[c.id] && state.actual[c.id][m]) || 0;
      const p = (state.plan[c.id] && state.plan[c.id][m]) || 0;
      if (isCurrent && isBudgetCat(c)) sum += Math.max(a, p);
      else sum += a > 0 ? a : p;
    }
  });
  return sum;
}

export function projectionYearEnd(state) {
  const sm = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  const cm = currentMonthIdx(state);
  let sum = state.initialBalance;

  // Korak 1: standardna monthly effective logika za sve kategorije
  for (let m = fromM; m < 12; m++) {
    sum += effectiveIncomeMonth(state, m) - effectiveExpenseMonth(state, m);
  }

  // Korak 2: ukloni doprinos fleksibilnih kategorija iz monthly zbroja
  for (let m = fromM; m < 12; m++) {
    // Ukloni fleksibilne prihode (što je effectiveIncomeMonth ubrojio)
    state.categories.income.forEach(c => {
      if (!c.flexible) return;
      let a;
      if (isPlacaCat(c)) {
        a = m < 11
          ? (state.actual[c.id]?.[m + 1] || 0)
          : (state.yearsData?.[state.year + 1]?.actual?.[c.id]?.[0] || 0);
      } else {
        a = state.actual[c.id]?.[m] || 0;
      }
      const p = state.plan[c.id]?.[m] || 0;
      sum -= a > 0 ? a : p;
    });

    // Vrati fleksibilne troškove (što je effectiveExpenseMonth oduzeo)
    // Preskačemo kategorije koje koriste groupPlan — tamo flexible nema smisla
    state.categories.expense.forEach(c => {
      if (!c.flexible || (c.group && state.useGroupPlan?.[c.group])) return;
      const a = state.actual[c.id]?.[m] || 0;
      const p = state.plan[c.id]?.[m] || 0;
      if (m === cm && isBudgetCat(c)) sum += Math.max(a, p);
      else sum += a > 0 ? a : p;
    });
  }

  // Korak 3: dodaj fleksibilne kategorije s godišnjom logikom
  // Forecast = max(godišnji plan, godišnji actuals) → nema dvostrukog brojanja
  state.categories.income.forEach(c => {
    if (!c.flexible) return;
    const annualPlan = (state.plan[c.id] || []).reduce((s, v) => s + v, 0);
    const annualActual = (state.actual[c.id] || []).reduce((s, v) => s + v, 0);
    sum += Math.max(annualPlan, annualActual);
  });
  state.categories.expense.forEach(c => {
    if (!c.flexible || (c.group && state.useGroupPlan?.[c.group])) return;
    const annualPlan = (state.plan[c.id] || []).reduce((s, v) => s + v, 0);
    const annualActual = (state.actual[c.id] || []).reduce((s, v) => s + v, 0);
    sum -= Math.max(annualPlan, annualActual);
  });

  return sum;
}

export function plannedEndOfYear(state) {
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  const fromM = sIsThis ? sm : 0;
  let sum = state.initialBalance;
  for (let m = fromM; m < 12; m++) sum += plannedNetMonth(state, m);
  return sum;
}

export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// Kao projectionYearEnd, ali za buduće godine koristi live projekciju prethodne
// godine kao početno stanje (umjesto statičkog initialBalance).
// Npr. na 2027 viewu — početno stanje = live projectionYearEnd(2026 state).
export function chainedProjectionYearEnd(state) {
  const prevYear = state.year - 1;
  const prevData = state.yearsData?.[prevYear];
  if (!prevData?.plan) return projectionYearEnd(state); // nema prethodne godine — koristi standard

  const prevState = {
    ...state,
    year: prevYear,
    initialBalance: prevData.initialBalance ?? 0,
    startDate: prevData.startDate ?? (prevYear + '-01-01'),
    plan: prevData.plan ?? {},
    actual: prevData.actual ?? {},
    groupPlan: prevData.groupPlan ?? {},
    useGroupPlan: prevData.useGroupPlan ?? {},
  };

  const chainedStart = projectionYearEnd(prevState);
  return projectionYearEnd({ ...state, initialBalance: chainedStart });
}

// Generira plan za novu godinu na temelju actuals prethodne godine.
// categories = state.categories ({ income: [...], expense: [...] })
// prevYearData = state.yearsData[prevYear] ({ actual: {...}, plan: {...} })
export function generatePlanFromActuals(categories, prevYearData) {
  if (!prevYearData?.actual) return {};
  const actual = prevYearData.actual;
  const prevPlan = prevYearData.plan || {};
  const newPlan = {};

  [...(categories.income || []), ...(categories.expense || [])].forEach(c => {
    const actArr = actual[c.id];
    if (!actArr) return;
    const nonZero = actArr.filter(v => v > 0);
    if (nonZero.length === 0) return;

    const avg = Math.round(nonZero.reduce((s, v) => s + v, 0) / nonZero.length);
    const isPlaca = /pla[cć]a/i.test(c.name);

    if (isPlaca) {
      // Plaća: flat iznos (zadnja vrijednost) za sve aktivne mjesece
      const lastVal = nonZero[nonZero.length - 1];
      const planArr = prevPlan[c.id] || new Array(12).fill(0);
      const result = planArr.map((v, i) => (v > 0 || actArr[i] > 0) ? lastVal : 0);
      newPlan[c.id] = result.some(v => v > 0) ? result : new Array(12).fill(lastVal);
    } else if (nonZero.length <= 2) {
      // Jednokratni (bonus, regres, božićnica): kopija exact actuals (isti mjeseci, isti iznos)
      newPlan[c.id] = actArr.slice();
    } else {
      // Redovni troškovi / Režije: per-month iznosi, prazne mjesece popuni prosjekom
      newPlan[c.id] = actArr.map(v => v > 0 ? v : avg);
    }
  });

  return newPlan;
}
