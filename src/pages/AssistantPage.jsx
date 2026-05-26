import { useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext.jsx';
import { loadChat, saveChat } from '../store/AppContext.jsx';
import { callGemini, describeAction, executeFunctionCall } from '../utils/ai.js';

export default function AssistantPage() {
  const { state, updateState } = useApp();
  const [chatInput, setChatInput] = useState('');
  const [history, setHistory] = useState(() => loadChat());
  const [recognition, setRecognition] = useState(null);
  const [micActive, setMicActive] = useState(false);
  const historyRef = useRef(null);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [history]);

  function updateHistory(h) {
    saveChat(h);
    setHistory([...h]);
  }

  function useSuggestion(text) {
    setChatInput(text);
    sendChat(text);
  }

  async function sendChat(overrideText) {
    const text = (overrideText || chatInput || '').trim();
    if (!text) return;
    setChatInput('');
    const h = [...loadChat()];
    h.push({ role: 'user', content: text });
    h.push({ role: 'thinking', content: 'Razmisljam...' });
    updateHistory(h);
    try {
      const apiHistory = h.filter(m => m.role === 'user' || m.role === 'assistant');
      const result = await callGemini(apiHistory, state);
      h.pop(); // remove thinking
      const cand = result.candidates && result.candidates[0];
      if (!cand) throw new Error('Nema kandidata u odgovoru');
      const parts = (cand.content && cand.content.parts) || [];
      let textResp = '';
      let funcCall = null;
      for (const p of parts) {
        if (p.text) textResp += p.text;
        if (p.functionCall) funcCall = p.functionCall;
        if (p.function_call) funcCall = p.function_call;
      }
      if (textResp.trim()) h.push({ role: 'assistant', content: textResp.trim() });
      if (funcCall) h.push({ role: 'pending_action', description: describeAction(funcCall), functionCall: funcCall });
      if (!textResp.trim() && !funcCall) h.push({ role: 'assistant', content: '(prazan odgovor)' });
      updateHistory(h);
    } catch (e) {
      if (h.length && h[h.length-1].role === 'thinking') h.pop();
      h.push({ role: 'system', content: 'Greska: ' + e.message });
      updateHistory(h);
    }
  }

  function confirmAction(idx) {
    const h = [...loadChat()];
    const pending = h[idx];
    if (!pending || !pending.functionCall) return;
    const res = executeFunctionCall(pending.functionCall.name, pending.functionCall.args, state);
    h[idx] = { role: 'assistant', content: (res.ok ? '✓ ' : '✗ ') + res.msg };
    if (res.ok && res.newState) updateState(res.newState);
    updateHistory(h);
  }

  function cancelAction(idx) {
    const h = [...loadChat()];
    h[idx] = { role: 'assistant', content: '✗ Otkazano.' };
    updateHistory(h);
  }

  function clearChat() {
    if (!confirm('Obrisati cijelu povijest razgovora?')) return;
    updateHistory([]);
  }

  function toggleVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Glasovni unos nije podrzan u ovom pregledniku.'); return; }
    if (recognition) {
      try { recognition.stop(); } catch {}
      setRecognition(null);
      setMicActive(false);
      return;
    }
    const r = new SR();
    r.lang = 'hr-HR';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = e => { setChatInput(e.results[0][0].transcript); };
    r.onerror = () => { setRecognition(null); setMicActive(false); };
    r.onend = () => { setRecognition(null); setMicActive(false); };
    r.start();
    setRecognition(r);
    setMicActive(true);
  }

  const isEmpty = history.length === 0;

  return (
    <section>
      <div className="card chat-card">
        <div className="card-title">
          <h2>AI Asistent</h2>
          <button className="btn ghost small" onClick={clearChat}>Obrisi povijest</button>
        </div>
        <div className="chat-history" ref={historyRef}>
          {isEmpty ? (
            <div className="chat-empty">
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🤖</div>
              <div>Postavi pitanje ili unesi trosak prirodnim jezikom.</div>
              <div className="chat-suggestions">
                {['Kako stojim ovaj mjesec?', 'Dodaj struju 78 eura', 'Gdje najvise trosim?', 'Koliko mi je ostalo do regresa?'].map(s => (
                  <span key={s} className="chat-suggestion" onClick={() => useSuggestion(s)}>{s}</span>
                ))}
              </div>
            </div>
          ) : (
            history.map((m, i) => {
              if (m.role === 'pending_action') {
                return (
                  <div key={i} className="pending-action">
                    <div className="pending-text">{m.description}</div>
                    <div className="pending-buttons">
                      <button className="btn small" onClick={() => confirmAction(i)}>Da, izvedi</button>
                      <button className="btn secondary small" onClick={() => cancelAction(i)}>Otkazi</button>
                    </div>
                  </div>
                );
              }
              return <div key={i} className={'chat-msg ' + m.role}>{m.content}</div>;
            })
          )}
        </div>
        <div className="chat-input-row">
          <button className={'chat-mic-btn' + (micActive ? ' active' : '')} onClick={toggleVoice} title="Glasovni unos">🎤</button>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Pitaj asistenta..."
          />
          <button className="btn" onClick={() => sendChat()}>Posalji</button>
        </div>
      </div>
    </section>
  );
}
