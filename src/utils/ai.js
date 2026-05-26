import { getAIConfig, setAIConfigObj } from '../store/AppContext.jsx';
import { currentMonthIdx, currentBalance, projectionYearEnd } from './finance.js';
import { MONTHS_HR, MONTHS_LONG, ALL_MONTHS } from '../store/state.js';

export function buildSystemPrompt(state) {
  const today = new Date();
  const cm = currentMonthIdx(state);
  const cb = currentBalance(state);
  const proj = projectionYearEnd(state);
  const cats = {
    income: state.categories.income.map(c => ({ id: c.id, name: c.name, months: c.months || ALL_MONTHS })),
    expense: state.categories.expense.map(c => ({ id: c.id, name: c.name, group: c.group, months: c.months || ALL_MONTHS }))
  };
  const planData = {};
  const actualData = {};
  [...state.categories.income, ...state.categories.expense].forEach(c => {
    planData[c.name] = state.plan[c.id] || new Array(12).fill(0);
    actualData[c.name] = state.actual[c.id] || new Array(12).fill(0);
  });
  return [
    'Ti si pomocnik za aplikaciju kucnih financija. Korisnik komunicira na hrvatskom jeziku. Odgovaraj kratko, konkretno, na hrvatskom.',
    '',
    'APLIKACIJA SADRZI:',
    '- Kategorije prihoda i troskova, svaka ima skup aktivnih mjeseci (0=Sij, 11=Pro)',
    '- Plan: planirani iznos po mjesecu po kategoriji',
    '- Stvarno: realizirani iznos po mjesecu po kategoriji',
    '- Pocetno stanje racuna na dan ' + state.startDate + ': ' + state.initialBalance + ' EUR',
    '- Trenutni datum: ' + today.toISOString().slice(0,10) + ' (mjesec ' + (cm+1) + ' = ' + MONTHS_LONG[cm] + ')',
    '- Trenutno stanje racuna (izracunato): ' + Math.round(cb) + ' EUR',
    '- Projekcija na 31.12.: ' + Math.round(proj) + ' EUR',
    '',
    'KATEGORIJE PRIHODA (s aktivnim mjesecima):',
    cats.income.map(c => '- ' + c.name + ' [' + c.months.map(m => MONTHS_HR[m]).join(',') + ']').join('\n'),
    '',
    'KATEGORIJE TROSKOVA:',
    cats.expense.map(c => '- ' + c.name + ' (' + (c.group||'Ostalo') + ') [' + c.months.map(m => MONTHS_HR[m]).join(',') + ']').join('\n'),
    '',
    'PLAN po mjesecima (Sij..Pro):',
    Object.entries(planData).map(([n,arr]) => '- ' + n + ': [' + arr.map(v => Math.round(v)).join(',') + ']').join('\n'),
    '',
    'STVARNO po mjesecima (Sij..Pro):',
    Object.entries(actualData).map(([n,arr]) => '- ' + n + ': [' + arr.map(v => Math.round(v)).join(',') + ']').join('\n'),
    '',
    'PRAVILA:',
    '1. Za unos stvarnog iznosa koristi funkciju add_actual_entry. NE pisi samo "dodano" u tekst - moras pozvati funkciju.',
    '2. Mjeseci su 0-indeksirani (0=Sij). Ako korisnik ne navede mjesec, koristi trenutni (' + cm + ').',
    '3. Iznosi su u EUR.',
    '4. category_name MORA biti tocno onaj iz liste kategorija (slovo do slova).',
    '5. Za analize i savjete - odgovori kratko u tekstu, koristi konkretne brojeve iz state-a.',
    '6. Ne izmislja podatke. Ako nesto ne zna, kaze "ne znam" ili pita.',
    '7. Korisnik ce potvrditi svaku akciju prije izvrsavanja.'
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
    const cat = state.categories.income.find(c => c.name.toLowerCase() === String(args.category_name||'').toLowerCase()) ||
                state.categories.expense.find(c => c.name.toLowerCase() === String(args.category_name||'').toLowerCase());
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
