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

// "Billing month" — billing ciklus počinje/završava na točno 15.
// 1.6.–14.6.  → bm = Svibanj (troškovi i plaća prethodnog ciklusa)
// 15.6.–14.7. → bm = Lipanj  (nova plaća stiže 15.6., troškovi od 15.6.)
export function activeBillingMonth(state) {
  const today = new Date();
  const cm    = currentMonthIdx(state);
  if (state.year === today.getFullYear() && today.getDate() < 15 && cm > 0) {
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

// Plaća za prosinac (zarađena u prosincu, stiže 15.1. sljedeće godine)
// Koristi actual iz siječnja sljedeće godine ako postoji, inače plan[11] kao proxy.
export function decSalaryNextJan(state) {
  let sum = 0;
  const ny = state.yearsData?.[state.year + 1];
  state.categories.income.forEach(c => {
    if (!isPlacaCat(c)) return;
    const actual = ny?.actual?.[c.id]?.[0] || 0;
    const planAmt = state.plan[c.id]?.[11] || 0;
    sum += actual > 0 ? actual : planAmt;
  });
  return sum;
}

// Plan i stvarno se za SVE kategorije (i plaću) vode po mjesecu u kojem novac
// stvarno ude/izade — listopadska plaća stoji u stupcu listopada, i u planu i
// u stvarnom. Zato se oba čitaju iz istog mjeseca, bez pomaka.
//
// "Realan" prikaz: ciklus koji je zatvoren (m < billing mjesec, granica 15.)
// računa samo ono što se stvarno dogodilo — propušteni plan je tada propušten,
// ne "još će doći". Tekući i budući ciklusi: stvarno ako postoji, inače plan.
function effIncomeCat(state, c, m, bm) {
  const a = state.actual[c.id]?.[m] || 0;
  if (m < bm) return a;
  const p = state.plan[c.id]?.[m] || 0;
  return a > 0 ? a : p;
}

function effExpenseCat(state, c, m, bm) {
  const a = state.actual[c.id]?.[m] || 0;
  if (m < bm) return a;
  const p = state.plan[c.id]?.[m] || 0;
  // Redovni u tekućem ciklusu: ne dajemo "zasluge" za manju potrošnju dok ciklus traje
  if (m === bm && isBudgetCat(c)) return Math.max(a, p);
  return a > 0 ? a : p;
}

export function effectiveIncomeMonth(state, m) {
  const bm = activeBillingMonth(state);
  return state.categories.income.reduce((s, c) => s + effIncomeCat(state, c, m, bm), 0);
}

function groupActual(state, g, m) {
  return state.categories.expense.reduce((s, cc) => s + (cc.group === g ? (state.actual[cc.id]?.[m] || 0) : 0), 0);
}

function effExpenseGroup(state, g, m, bm) {
  const a = groupActual(state, g, m);
  if (m < bm) return a;
  const p = state.groupPlan?.[g]?.[m] || 0;
  if (m === bm) return Math.max(a, p);
  return a > 0 ? a : p;
}

const usesGroupPlan = (state, c) => !!(c.group && state.useGroupPlan?.[c.group]);

export function effectiveExpenseMonth(state, m) {
  const bm = activeBillingMonth(state);
  let sum = 0;
  const seenG = new Set();
  state.categories.expense.forEach(c => {
    if (usesGroupPlan(state, c)) {
      if (seenG.has(c.group)) return;
      seenG.add(c.group);
      sum += effExpenseGroup(state, c.group, m, bm);
    } else {
      sum += effExpenseCat(state, c, m, bm);
    }
  });
  return sum;
}

// Ukupni očekivani prihodi i rashodi za godinu (od početka praćenja do 31.12.,
// plus plaća koja stiže 15.1.) — stvarno za zatvorene cikluse, plan za ostalo.
function projectionParts(state) {
  const sm = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  const bm = activeBillingMonth(state);
  let income = 0, expense = 0;

  // Korak 1: mjesečna logika za sve kategorije
  for (let m = fromM; m < 12; m++) {
    income  += effectiveIncomeMonth(state, m);
    expense += effectiveExpenseMonth(state, m);
  }

  // Korak 2: izvuci fleksibilne kategorije iz mjesečnog zbroja (isti helperi
  // kao korak 1, da se oduzme točno ono što je dodano)
  for (let m = fromM; m < 12; m++) {
    state.categories.income.forEach(c => {
      if (c.flexible) income -= effIncomeCat(state, c, m, bm);
    });
    // Kategorije u groupPlanu se ne izvlače — tamo flexible nema smisla
    state.categories.expense.forEach(c => {
      if (!c.flexible || (c.group && state.useGroupPlan?.[c.group])) return;
      expense -= effExpenseCat(state, c, m, bm);
    });
  }

  // Korak 3: fleksibilne kategorije po godišnjoj logici
  // max(godišnji plan, godišnji actuals) → nema dvostrukog brojanja
  state.categories.income.forEach(c => {
    if (!c.flexible) return;
    const annualPlan = (state.plan[c.id] || []).reduce((s, v) => s + v, 0);
    const annualActual = (state.actual[c.id] || []).reduce((s, v) => s + v, 0);
    income += Math.max(annualPlan, annualActual);
  });
  state.categories.expense.forEach(c => {
    if (!c.flexible || (c.group && state.useGroupPlan?.[c.group])) return;
    const annualPlan = (state.plan[c.id] || []).reduce((s, v) => s + v, 0);
    const annualActual = (state.actual[c.id] || []).reduce((s, v) => s + v, 0);
    expense += Math.max(annualPlan, annualActual);
  });

  // Plaća za prosinački rad stiže 15.1. sljedeće godine — pripada ovoj godini
  income += decSalaryNextJan(state);

  return { income, expense };
}

export function projectionYearEnd(state) {
  const { income, expense } = projectionParts(state);
  return state.initialBalance + income - expense;
}

// Što od procjene još NIJE ušlo u trenutno stanje. Po konstrukciji vrijedi:
// trenutno stanje + preostali prihodi − preostali rashodi = procjena 31.12.
export function forecastRemaining(state) {
  const { income, expense } = projectionParts(state);
  const sm = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  const cm = currentMonthIdx(state);
  let inSoFar = 0, outSoFar = 0;
  for (let m = fromM; m <= cm; m++) {
    inSoFar  += actualIncomeMonth(state, m);
    outSoFar += actualExpenseMonth(state, m);
  }
  return { income: income - inSoFar, expense: expense - outSoFar };
}

// Raščlamba forecastRemaining po stavkama; zbroj stavki = forecastRemaining.
// Stavka: { name, month (0-11) ili null, when (tekst za godišnje/15.1.), amount, note }
export function forecastRemainingDetail(state) {
  const sm = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  const cm = currentMonthIdx(state);
  const bm = activeBillingMonth(state);
  const startM = Math.max(fromM, bm);
  const inSoFar = (c, m) => (m <= cm ? (state.actual[c.id]?.[m] || 0) : 0);
  const actualToDate = c => {
    let s = 0;
    for (let m = fromM; m <= cm; m++) s += state.actual[c.id]?.[m] || 0;
    return s;
  };
  const sumArr = arr => (arr || []).reduce((s, v) => s + (v || 0), 0);
  const keep = x => Math.abs(x) >= 0.5;

  // Fleksibilna: procjena je max(godišnji plan, godišnje primljeno), umanjeno za
  // ono što je već u stanju.
  function flexLine(c, verbIn) {
    const annualPlan = sumArr(state.plan[c.id]);
    const annualActual = sumArr(state.actual[c.id]);
    const got = actualToDate(c);
    return {
      name: c.name, month: null, when: 'godišnje (fleksibilno)',
      amount: Math.max(annualPlan, annualActual) - got,
      note: 'godišnji plan ' + fmtEUR(annualPlan) + ', ' + verbIn + ' ' + fmtEUR(got),
    };
  }

  const income = [];
  state.categories.income.forEach(c => {
    if (c.flexible) { const l = flexLine(c, 'primljeno'); if (keep(l.amount)) income.push(l); return; }
    for (let m = startM; m < 12; m++) {
      const amt = effIncomeCat(state, c, m, bm) - inSoFar(c, m);
      if (keep(amt)) income.push({ name: c.name, month: m, amount: amt });
    }
  });
  const dec = decSalaryNextJan(state);
  if (keep(dec)) income.push({ name: 'Plaća (za prosinac)', month: null, when: '15.1.' + (state.year + 1), amount: dec });

  const expense = [];
  const seenG = new Set();
  state.categories.expense.forEach(c => {
    if (usesGroupPlan(state, c)) {
      if (seenG.has(c.group)) return;
      seenG.add(c.group);
      for (let m = startM; m < 12; m++) {
        const amt = effExpenseGroup(state, c.group, m, bm) - (m <= cm ? groupActual(state, c.group, m) : 0);
        if (keep(amt)) expense.push({ name: c.group + ' (grupa)', month: m, amount: amt });
      }
      return;
    }
    if (c.flexible) { const l = flexLine(c, 'potrošeno'); if (keep(l.amount)) expense.push(l); return; }
    for (let m = startM; m < 12; m++) {
      const amt = effExpenseCat(state, c, m, bm) - inSoFar(c, m);
      if (keep(amt)) expense.push({ name: c.name, month: m, amount: amt });
    }
  });

  const order = l => (l.month === null ? (l.when.startsWith('15.1') ? 13 : -1) : l.month);
  income.sort((a, b) => order(a) - order(b));
  expense.sort((a, b) => order(a) - order(b));
  return { income, expense };
}

export function plannedEndOfYear(state) {
  const sm = startMonthIdx(state);
  const sIsThis = startIsThisYear(state);
  const fromM = sIsThis ? sm : 0;
  let sum = state.initialBalance;
  for (let m = fromM; m < 12; m++) sum += plannedNetMonth(state, m);
  // Plaća za prosinački rad stiže 15.1. sljedeće godine — pripada ovoj godini
  sum += decSalaryNextJan(state);
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

// Projekcija kraja odredene godine, bez obzira koja je godina trenutno otvorena.
// Za aktivnu godinu koristi zivo stanje (yearsData snapshot moze kasniti).
// Vraca null ako za tu godinu nema podataka.
export function projectionForYear(state, year) {
  if (year === state.year) return chainedProjectionYearEnd(state);
  const d = state.yearsData?.[year];
  if (!d) return null;
  return chainedProjectionYearEnd({
    ...state,
    year,
    initialBalance: d.initialBalance ?? 0,
    startDate: d.startDate ?? (year + '-01-01'),
    plan: d.plan ?? {},
    actual: d.actual ?? {},
    groupPlan: d.groupPlan ?? {},
    useGroupPlan: d.useGroupPlan ?? {},
  });
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
