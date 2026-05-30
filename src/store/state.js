export const STORAGE_KEY = 'kucneFinancije_v1';
export const MONTHS_HR = ['Sij','Velj','Ozu','Tra','Svi','Lip','Srp','Kol','Ruj','Lis','Stu','Pro'];
export const MONTHS_LONG = ['Sijecanj','Veljaca','Ozujak','Travanj','Svibanj','Lipanj','Srpanj','Kolovoz','Rujan','Listopad','Studeni','Prosinac'];
export const ALL_MONTHS = [0,1,2,3,4,5,6,7,8,9,10,11];

export function defaultState() {
  const t = new Date();
  return {
    year: 2026,
    initialBalance: 0,
    startDate: (t.getFullYear() === 2026)
      ? (t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0'))
      : '2026-01-01',
    categories: {
      income: [
        { id: 'inc-placa', name: 'Placa', months: ALL_MONTHS.slice() },
        { id: 'inc-bonus', name: 'Bonus', months: ALL_MONTHS.slice() },
        { id: 'inc-putninalozi', name: 'Putni nalozi', months: ALL_MONTHS.slice() },
        { id: 'inc-regres', name: 'Regres', months: [6] },
        { id: 'inc-bozicnica', name: 'Bozicnica', months: [11] },
        { id: 'inc-darzadjecu', name: 'Dar za djecu', months: [11] }
      ],
      expense: [
        { id: 'exp-redovni', name: 'Redovni mjesecni', group: 'Redovni', months: ALL_MONTHS.slice() },
        { id: 'exp-struja', name: 'Struja', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-voda', name: 'Voda', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-internet', name: 'Internet', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-hrt', name: 'HRT pristojba', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-komunalna', name: 'Komunalna naknada', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-smece', name: 'Odvoz smeca', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-pricuva', name: 'Pricuva', group: 'Rezije', months: ALL_MONTHS.slice() },
        { id: 'exp-skijanje', name: 'Skijanje', group: 'Putovanja', months: [1] },
        { id: 'exp-proljetno', name: 'Proljetno putovanje', group: 'Putovanja', months: [4] },
        { id: 'exp-ljetni', name: 'Ljetni godisnji', group: 'Putovanja', months: [7] },
        { id: 'exp-ljetnidodatni', name: 'Dodatni ljetni godisnji', group: 'Putovanja', months: [8] },
        { id: 'exp-dodatno', name: 'Dodatno putovanje', group: 'Putovanja', months: [9] }
      ]
    },
    plan: {},
    actual: {},
    groupPlan: {},
    useGroupPlan: {},
    entries: [],
    investments: [],
    importRules: { merchants: {}, standingOrders: {} },
    importedRefs: []
  };
}

export function ensurePlanArrays(s) {
  if (!s.plan) s.plan = {};
  if (!s.actual) s.actual = {};
  if (!s.groupPlan) s.groupPlan = {};
  if (!s.useGroupPlan) s.useGroupPlan = {};
  [...s.categories.income, ...s.categories.expense].forEach(c => {
    if (!s.plan[c.id] || s.plan[c.id].length !== 12) s.plan[c.id] = new Array(12).fill(0);
    if (!s.actual[c.id] || s.actual[c.id].length !== 12) s.actual[c.id] = new Array(12).fill(0);
    if (!c.months) c.months = ALL_MONTHS.slice();
    if (c.group && !s.groupPlan[c.group]) s.groupPlan[c.group] = new Array(12).fill(0);
  });
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.startDate) parsed.startDate = (parsed.year || 2026) + '-01-01';
      if (!parsed.actual) parsed.actual = {};
      const oneoffNames = {
        'Skijanje': [1], 'Proljetno putovanje': [4], 'Ljetni godisnji': [7],
        'Dodatni ljetni godisnji': [8], 'Dodatno putovanje': [9],
        'Regres': [6], 'Bozicnica': [11], 'Dar za djecu': [11]
      };
      [...(parsed.categories.income || []), ...(parsed.categories.expense || [])].forEach(c => {
        if (!c.months) {
          c.months = oneoffNames[c.name] ? oneoffNames[c.name].slice() : ALL_MONTHS.slice();
        }
      });
      if (parsed.entries && parsed.entries.length && !parsed._migratedV2) {
        parsed.entries.forEach(e => {
          if (!parsed.actual[e.categoryId]) parsed.actual[e.categoryId] = new Array(12).fill(0);
          const m = new Date(e.date).getMonth();
          if (m >= 0 && m < 12) parsed.actual[e.categoryId][m] += e.amount;
        });
        parsed._migratedV2 = true;
      }
      if (!parsed.investments)  parsed.investments  = [];
      if (!parsed.importRules)  parsed.importRules  = { merchants: {}, standingOrders: {} };
      if (!parsed.importedRefs) parsed.importedRefs = [];
      ensurePlanArrays(parsed);
      return parsed;
    }
  } catch (e) { console.warn('Greska:', e); }
  const fresh = defaultState();
  ensurePlanArrays(fresh);
  return fresh;
}

export function saveStateToStorage(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
