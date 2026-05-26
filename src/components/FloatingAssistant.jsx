import { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext.jsx';
import { getAIConfig } from '../store/AppContext.jsx';
import {
  plannedEndOfYear, projectionYearEnd, currentBalance,
  plannedIncomeMonth, plannedExpenseMonth,
  actualIncomeMonth, actualExpenseMonth,
  currentMonthIdx, fmtEUR, MONTHS_LONG, ALL_MONTHS
} from '../utils/finance.js';

// Gradi fokusirani kontekst za pojašnjavanje izračuna
function buildExplainerPrompt(state) {
  const cm = currentMonthIdx(state);
  const today = new Date();

  const annualPlanIncome  = ALL_MONTHS.reduce((s, m) => s + plannedIncomeMonth(state, m), 0);
  const annualPlanExpense = ALL_MONTHS.reduce((s, m) => s + plannedExpenseMonth(state, m), 0);
  const annualActIncome   = ALL_MONTHS.reduce((s, m) => s + actualIncomeMonth(state, m), 0);
  const annualActExpense  = ALL_MONTHS.reduce((s, m) => s + actualExpenseMonth(state, m), 0);

  const curBalance = currentBalance(state);
  const forecast   = projectionYearEnd(state);
  const yearGoal   = plannedEndOfYear(state);

  const incomeLines = state.categories.income.map(c => {
    const plan   = (state.plan[c.id]   || []).reduce((s, v) => s + v, 0);
    const actual = (state.actual[c.id] || []).reduce((s, v) => s + v, 0);
    const tag = c.flexible ? ' [fleksibilni timing]' : '';
    return `  - ${c.name}: plan ${Math.round(plan)} EUR, stvarno ${Math.round(actual)} EUR${tag}`;
  }).join('\n');

  const expenseLines = state.categories.expense.map(c => {
    const plan   = (state.plan[c.id]   || []).reduce((s, v) => s + v, 0);
    const actual = (state.actual[c.id] || []).reduce((s, v) => s + v, 0);
    return `  - ${c.name} (${c.group || 'Ostalo'}): plan ${Math.round(plan)} EUR, stvarno ${Math.round(actual)} EUR`;
  }).join('\n');

  // Plan po mjesecima za tekući i prethodne (za kontekst)
  const planByMonth = ALL_MONTHS.map(m => {
    const pi = plannedIncomeMonth(state, m);
    const pe = plannedExpenseMonth(state, m);
    const ai = actualIncomeMonth(state, m);
    const ae = actualExpenseMonth(state, m);
    return `  ${MONTHS_LONG[m]}: plan +${Math.round(pi)}/-${Math.round(pe)}, stvarno +${Math.round(ai)}/-${Math.round(ae)}`;
  }).join('\n');

  return `Ti si financijski asistent u aplikaciji "Kućne financije".
JEDINI tvoj zadatak je pojasniti korisniku kako su izračunati podaci koje vidi u aplikaciji.
Odgovaraj kratko i jasno, na hrvatskom jeziku. Ne predlaži akcije — samo pojašnjavaj.

KAKO RADE KLJUČNI IZRAČUNI:

1. TRENUTNO STANJE = početno stanje + Σ(stvarni prihodi) - Σ(stvarni rashodi) od ${state.startDate} do danas.

2. FORECAST (procjena stanja 31.12.) = početno stanje + Σ efektivnih prihoda - Σ efektivnih rashoda za sve mjesece.
   Efektivni iznos za mjesec M:
   - Ako postoji stvarni unos → koristi stvarni iznos
   - Inače → koristi planirani iznos
   Za kategorije s "fleksibilnim timingom": forecast koristi max(godišnji plan, godišnji stvarni) — sprečava
   duplo brojanje kad prihod dođe u drugom mjesecu od planiranog (npr. bonus planiran u 5. a primljen u 3.).

3. CILJ (planirani kraj godine) = početno stanje + Σ planiranih prihoda - Σ planiranih rashoda za cijelu godinu.

4. RAZLIKA FORECAST vs CILJ: ako je forecast manji od cilja, znači da su stvarni rashodi veći od planiranih
   ili stvarni prihodi manji — ili kombinacija oboje.

TRENUTNI PODACI (${today.toLocaleDateString('hr-HR')}):

Godina: ${state.year}
Datum početka praćenja: ${state.startDate}
Početno stanje: ${Math.round(state.initialBalance)} EUR
Trenutno stanje: ${Math.round(curBalance)} EUR
Tekući mjesec: ${MONTHS_LONG[cm]} ${state.year}

GODIŠNJI PLAN:
  Prihodi: ${Math.round(annualPlanIncome)} EUR
  Rashodi: ${Math.round(annualPlanExpense)} EUR
  Planirani neto: ${Math.round(annualPlanIncome - annualPlanExpense)} EUR

GODIŠNJE STVARNO (do danas):
  Prihodi: ${Math.round(annualActIncome)} EUR
  Rashodi: ${Math.round(annualActExpense)} EUR
  Neto: ${Math.round(annualActIncome - annualActExpense)} EUR

FORECAST (kraj ${state.year}): ${Math.round(forecast)} EUR
CILJ (planirani kraj): ${Math.round(yearGoal)} EUR
RAZLIKA: ${Math.round(forecast - yearGoal)} EUR

KATEGORIJE PRIHODA (godišnji iznosi):
${incomeLines}

KATEGORIJE RASHODA (godišnji iznosi):
${expenseLines}

PLAN I STVARNO PO MJESECIMA:
${planByMonth}`;
}

async function callGeminiExplainer(messages, systemPrompt) {
  const cfg = getAIConfig();
  if (!cfg.apiKey) throw new Error('Gemini API key nije konfiguriran — idi u Postavke → AI Asistent.');
  const model = cfg.model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      })),
      generationConfig: { maxOutputTokens: 800, temperature: 0.2 }
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('Gemini greška (' + resp.status + '): ' + txt.slice(0, 200));
  }
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Prazan odgovor od Gemini-ja.');
  return text;
}

export default function FloatingAssistant() {
  const { state } = useApp();
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);
  const textareaRef    = useRef(null);

  // Fokusiraj input kad se drawer otvori
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Scroll na zadnju poruku
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    setLoading(true);

    try {
      const systemPrompt = buildExplainerPrompt(state);
      const reply = await callGeminiExplainer(newMessages, systemPrompt);
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ ' + e.message }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleInput(e) {
    setInput(e.target.value);
    // Auto-grow textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  }

  function toggleOpen() {
    setOpen(o => !o);
  }

  const SUGGESTIONS = [
    'Kako si izračunao forecast?',
    'Zašto je forecast manji od cilja?',
    'Kako se računa trenutno stanje?',
  ];

  return (
    <>
      {/* Plutajući gumb */}
      <button
        className={'floating-ai-btn' + (open ? ' open' : '')}
        onClick={toggleOpen}
        title="Pitaj o podacima"
        aria-label="AI pojašnjenje"
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Backdrop */}
      {open && (
        <div className="floating-ai-backdrop" onClick={() => setOpen(false)} />
      )}

      {/* Drawer */}
      <div className={'floating-ai-drawer' + (open ? ' open' : '')} role="dialog" aria-label="AI asistent za pojašnjenja">
        <div className="floating-ai-header">
          <span>💬 Pitaj o podacima</span>
          <button onClick={() => setOpen(false)} aria-label="Zatvori">✕</button>
        </div>

        <div className="floating-ai-messages">
          {messages.length === 0 && (
            <div className="floating-ai-empty">
              <p>Pojašnjavam kako su izračunati tvoji financijski podaci.</p>
              <div className="floating-ai-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="floating-ai-suggestion" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={'floating-ai-msg ' + m.role}>
              <div className="floating-ai-bubble">{m.text}</div>
            </div>
          ))}

          {loading && (
            <div className="floating-ai-msg assistant">
              <div className="floating-ai-bubble floating-ai-thinking">
                <span>●</span><span>●</span><span>●</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="floating-ai-input-row">
          <textarea
            ref={el => { inputRef.current = el; textareaRef.current = el; }}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="Pitaj o podacima..."
            disabled={loading}
          />
          <button onClick={send} disabled={loading || !input.trim()} aria-label="Pošalji">
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
