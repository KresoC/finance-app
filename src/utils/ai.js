import { getAIConfig, listAvailableYears } from '../store/AppContext.jsx';
import { currentMonthIdx, currentBalance, chainedProjectionYearEnd, plannedIncomeMonth, plannedExpenseMonth } from './finance.js';
import { MONTHS_HR, MONTHS_LONG, ALL_MONTHS } from '../store/state.js';

// ── Investicije helper ──────────────────────────────────────────────────────
function calcInvInterest(inv) {
  if (inv.faceValue) return inv.faceValue - inv.amount;
  return inv.amount * (inv.rate / 100) * (inv.days / 365);
}

function fmtDate(s) {
  if (!s) return '?';
  const [y, m, d] = s.split('-');
  return d + '.' + m + '.' + y + '.';
}

// ── buildSystemPrompt ───────────────────────────────────────────────────────
export function buildSystemPrompt(state) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cm = currentMonthIdx(state);
  const cb = currentBalance(state);
  const proj = chainedProjectionYearEnd(state);

  // Kategorije
  const cats = {
    income:  state.categories.income.map(c  => ({ id: c.id,  name: c.name, months: c.months || ALL_MONTHS })),
    expense: state.categories.expense.map(c => ({ id: c.id,  name: c.name, group: c.group, months: c.months || ALL_MONTHS }))
  };

  // Plan i actuals tekuće godine
  const planData = {}, actualData = {};
  [...state.categories.income, ...state.categories.expense].forEach(c => {
    planData[c.name]   = state.plan[c.id]   || new Array(12).fill(0);
    actualData[c.name] = state.actual[c.id] || new Array(12).fill(0);
  });

  // Trezorski zapisi (investicije)
  const investments = state.investments || [];
  const activeInv   = investments.filter(i => i.status === 'active');
  const totalLocked = activeInv.reduce((s, i) => s + i.amount, 0);
  const totalYield  = activeInv.reduce((s, i) => s + calcInvInterest(i), 0);

  const invLines = activeInv.length === 0
    ? ['  (nema aktivnih ulaganja)']
    : activeInv.map(i => {
        const interest = calcInvInterest(i);
        const fv = i.faceValue || (i.amount + interest);
        const daysLeft = Math.round((new Date(i.maturityDate) - today) / 86400000);
        return '  - Uloženo: ' + Math.round(i.amount) + ' EUR | Primiš na dospijeće: ' + Math.round(fv) + ' EUR'
          + ' | Prinos: +' + Math.round(interest) + ' EUR'
          + ' | Dospijeće: ' + fmtDate(i.maturityDate) + ' (za ' + daysLeft + ' dana)'
          + ' | Stopa: ' + i.rate + '% / ' + i.days + ' dana';
      });

  const maturedInv = investments.filter(i => i.status === 'matured');
  const reinvestedInv = investments.filter(i => i.status === 'reinvested');

  // Višegodišnje praćenje
  const availableYears = listAvailableYears(state);
  const nextYear = state.year + 1;
  const nextData = state.yearsData?.[nextYear];
  let nextYearLines = ['  Nema plana za ' + nextYear + '.'];
  if (nextData?.plan) {
    let nextIncome = 0, nextExpense = 0;
    const nextState = {
      ...state,
      year: nextYear,
      plan: nextData.plan || {},
      actual: nextData.actual || {},
      groupPlan: nextData.groupPlan || {},
      useGroupPlan: nextData.useGroupPlan || {},
    };
    for (let m = 0; m < 12; m++) {
      nextIncome  += plannedIncomeMonth(nextState, m);
      nextExpense += plannedExpenseMonth(nextState, m);
    }
    const nextNet = nextIncome - nextExpense;
    const endNext = proj + nextNet;
    nextYearLines = [
      '  Plan ' + nextYear + ' postoji.',
      '  Planirani prihodi ' + nextYear + ': ' + Math.round(nextIncome) + ' EUR',
      '  Planirani troškovi ' + nextYear + ': ' + Math.round(nextExpense) + ' EUR',
      '  Neto plan ' + nextYear + ': ' + (nextNet >= 0 ? '+' : '') + Math.round(nextNet) + ' EUR',
      '  Prognoza saldo 31.12.' + nextYear + ': ' + Math.round(endNext) + ' EUR',
    ];
  }

  return [
    'Ti si pomocnik za aplikaciju kucnih financija. Korisnik komunicira na hrvatskom jeziku. Odgovaraj kratko, konkretno, na hrvatskom.',
    'Uvijek koristi SVE podatke ispod — uključujući podatke za iduću godinu ako postoje.',
    '',
    '=== FINANCIJSKI SAŽETAK — ' + todayStr + ' ===',
    'Aktivna godina u aplikaciji: ' + state.year + ' | Dostupne godine: ' + availableYears.join(', '),
    'Početno stanje (' + state.startDate + '): ' + state.initialBalance + ' EUR',
    'Trenutno stanje računa: ' + Math.round(cb) + ' EUR',
    'Projekcija 31.12.' + state.year + ': ' + Math.round(proj) + ' EUR',
    'Trenutni mjesec: ' + (cm + 1) + ' = ' + MONTHS_LONG[cm],
    '',
    '--- PROGNOZA IDUĆE GODINE (' + nextYear + ') ---',
    ...nextYearLines,
    '',
    '=== TREZORSKI ZAPISI (ulaganja u HRV državne zapise) ===',
    'Aktivna ulaganja: ' + activeInv.length + ' | Ukupno uloženo: ' + Math.round(totalLocked) + ' EUR | Ukupni prinos: +' + Math.round(totalYield) + ' EUR',
    ...invLines,
    'Dospjela (čekaju obradu): ' + maturedInv.length + ' | Reinvestirana/zatvorena: ' + reinvestedInv.length,
    '',
    '=== KATEGORIJE PRIHODA (aktivni mjeseci) ===',
    ...cats.income.map(c => '- ' + c.name + ' [' + c.months.map(m => MONTHS_HR[m]).join(',') + ']'),
    '',
    '=== KATEGORIJE TROŠKOVA ===',
    ...cats.expense.map(c => '- ' + c.name + ' (' + (c.group || 'Ostalo') + ') [' + c.months.map(m => MONTHS_HR[m]).join(',') + ']'),
    '',
    '=== PLAN ' + state.year + ' po mjesecima (Sij..Pro) ===',
    ...Object.entries(planData).map(([n, arr]) => '- ' + n + ': [' + arr.map(v => Math.round(v)).join(',') + ']'),
    '',
    '=== STVARNO ' + state.year + ' po mjesecima (Sij..Pro) ===',
    ...Object.entries(actualData).map(([n, arr]) => '- ' + n + ': [' + arr.map(v => Math.round(v)).join(',') + ']'),
    '',
    '=== PRAVILA ===',
    '1. Za unos stvarnog iznosa koristi funkciju add_actual_entry. NE pisi samo "dodano" u tekst.',
    '2. Mjeseci su 0-indeksirani (0=Sij, 11=Pro). Bez navedenog mjeseca koristi trenutni (' + cm + ' = ' + MONTHS_LONG[cm] + ').',
    '3. Iznosi su u EUR. Trezorski zapisi se ne unose ovdje — imaju vlastiti modul.',
    '4. category_name MORA biti točno kao u listi kategorija.',
    '5. Za analize — kratko, konkretno, s brojevima iz state-a.',
    '6. Ne izmišljaj podatke. Ako nešto ne znaš, reci "ne znam".',
    '7. Korisnik potvrđuje svaku akciju prije izvršavanja.',
    '8. Pitanja o ' + nextYear + ' ili idućoj godini: odgovori iz sekcije "PROGNOZA IDUĆE GODINE" iznad.',
    '   Ako piše "Nema plana za ' + nextYear + '." — korisnik još nije kreirao plan za tu godinu.',
    '9. Aplikacija prati više godina. Korisnik prebacuje godine u headeru. Svaka godina ima vlastiti plan/actuals.',
  ].join('\n');
}

export function getToolsSpec() {
  return [{
    function_declarations: [{
      name: 'add_actual_entry',
      description: 'Dodaje stvarni iznos prihoda ili troska u kategoriju za odredjeni mjesec.',
      parameters: {
        type: 'OBJECT',
        properties: {
          category_name: { type: 'STRING', description: 'Tocan naziv kategorije iz state-a' },
          amount: { type: 'NUMBER', description: 'Iznos u EUR (pozitivan broj)' },
          month: { type: 'INTEGER', description: '0-11 (0=Sijecanj, 11=Prosinac)' }
        },
        required: ['category_name', 'amount', 'month']
      }
    }]
  }];
}

export async function callGemini(history, state) {
  const cfg = getAIConfig();
  if (!cfg.apiKey) throw new Error('Nema Gemini API kljuca. Postavi u Postavke → AI Asistent.');
  const model = cfg.model || 'gemini-2.5-flash';
  const contents = history.filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt(state) }] },
    contents,
    tools: getToolsSpec(),
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(cfg.apiKey);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('Gemini API ' + resp.status + ': ' + txt.slice(0, 250));
  }
  return await resp.json();
}

export function describeAction(funcCall) {
  if (funcCall.name === 'add_actual_entry') {
    const a = funcCall.args || {};
    const monthName = MONTHS_LONG[a.month] || ('mjesec ' + a.month);
    return 'Dodati u Stvarno: ' + a.category_name + ' = ' + a.amount + ' EUR za ' + monthName + '?';
  }
  return 'Akcija: ' + funcCall.name + ' ' + JSON.stringify(funcCall.args);
}

export function executeFunctionCall(name, args, state) {
  if (name === 'add_actual_entry') {
    const cat = state.categories.income.find(c => c.name.toLowerCase() === String(args.category_name || '').toLowerCase()) ||
                state.categories.expense.find(c => c.name.toLowerCase() === String(args.category_name || '').toLowerCase());
    if (!cat) return { ok: false, msg: 'Kategorija "' + args.category_name + '" ne postoji.' };
    const m = parseInt(args.month);
    if (isNaN(m) || m < 0 || m > 11) return { ok: false, msg: 'Neispravan mjesec.' };
    const amount = parseFloat(args.amount);
    if (isNaN(amount) || amount <= 0) return { ok: false, msg: 'Neispravan iznos.' };
    const newState = { ...state, actual: { ...state.actual } };
    if (!newState.actual[cat.id]) newState.actual[cat.id] = new Array(12).fill(0);
    else newState.actual[cat.id] = [...newState.actual[cat.id]];
    const prev = newState.actual[cat.id][m] || 0;
    newState.actual[cat.id][m] = prev + amount;
    return { ok: true, msg: 'Dodano ' + amount + ' EUR (' + cat.name + ') za ' + MONTHS_LONG[m] + '. Novo stanje: ' + (prev + amount) + ' EUR.', newState };
  }
  return { ok: false, msg: 'Nepoznata funkcija: ' + name };
}
