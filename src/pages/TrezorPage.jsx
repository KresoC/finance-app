import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';
import { fmtEUR } from '../utils/finance.js';

// ─── Konstante ──────────────────────────────────────────────────────────────

const TAX_RATE = 0.10; // 10% porez na prihod od kamata (HR)

// ─── Pomoćne funkcije ───────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + parseInt(days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}

function fmtDate(dateStr) {
  if (!dateStr) return '–';
  const [y, m, d] = dateStr.split('-');
  return d + '.' + m + '.' + y + '.';
}

function fmtPct(v) {
  return Number(v).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function grossInterest(amount, rate, days) {
  return amount * (rate / 100) * (days / 365);
}
function netInterest(amount, rate, days) {
  return grossInterest(amount, rate, days) * (1 - TAX_RATE);
}
function accruedGross(inv) {
  const t = todayStr();
  const elapsed = Math.max(0, Math.min(daysBetween(inv.date, t), inv.days));
  return grossInterest(inv.amount, inv.rate, elapsed);
}

// ─── AddModal ───────────────────────────────────────────────────────────────

function AddModal({ prefill, onClose }) {
  const { state, updateState } = useApp();
  const isReinvest = !!prefill?.reinvestedFromId;

  const [amount,      setAmount]      = useState(isReinvest ? '' : '');
  const [extraAmount, setExtraAmount] = useState('');
  const [rate,        setRate]        = useState(prefill?.rate ? String(prefill.rate) : '');
  const [date,        setDate]        = useState(prefill?.date || todayStr());
  const [days,        setDays]        = useState(String(prefill?.days || 364));
  const [notes,       setNotes]       = useState('');

  // Iznos za reinvest: prikazuje se fiksno, a korisnik može dodati još
  const baseAmount   = prefill?.amount ? parseFloat(prefill.amount) : 0;
  const extraParsed  = parseFloat(extraAmount) || 0;
  const totalAmount  = isReinvest
    ? baseAmount + extraParsed
    : (parseFloat(amount) || 0);

  const daysNum      = parseInt(days) || 364;
  const rateNum      = parseFloat(rate) || 0;
  const maturityDate = date ? addDays(date, daysNum) : '';
  const previewGross = totalAmount && rateNum ? grossInterest(totalAmount, rateNum, daysNum) : null;
  const previewNet   = previewGross !== null ? previewGross * (1 - TAX_RATE) : null;

  function save() {
    if (!totalAmount || !rateNum || !date || !daysNum) return;
    const newInv = {
      id: uid(),
      date,
      amount: totalAmount,
      rate: rateNum,
      days: daysNum,
      maturityDate: addDays(date, daysNum),
      status: 'active',
      reinvestedFromId: prefill?.reinvestedFromId || null,
      notes,
    };
    const newState = { ...state, investments: [...(state.investments || [])] };
    if (prefill?.reinvestedFromId) {
      newState.investments = newState.investments.map(inv =>
        inv.id === prefill.reinvestedFromId ? { ...inv, status: 'reinvested' } : inv
      );
    }
    newState.investments.push(newInv);
    updateState(newState);
    onClose();
  }

  return (
    <div className="fill-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fill-modal">
        <div className="fill-modal-header">
          <span>{isReinvest ? '↩ Reinvestiraj' : '+ Novo ulaganje'}</span>
          <button className="fill-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="fill-modal-body">

          {/* Reinvest: prikaži iznos koji dolazi s dospijeća */}
          {isReinvest && (
            <div className="inv-reinvest-banner">
              <div className="inv-reinvest-meta">Iznos po dospijeću</div>
              <div className="inv-reinvest-val">{fmtEUR(baseAmount)}</div>
              <label className="inv-field-label" style={{ marginTop: '10px' }}>Dodaj još novaca (opcija, EUR)</label>
              <input
                type="number"
                className="inv-input"
                placeholder="0"
                value={extraAmount}
                onChange={e => setExtraAmount(e.target.value)}
                min="0"
              />
              {extraParsed > 0 && (
                <div className="inv-total-label">
                  Ukupno za ulaganje: <b>{fmtEUR(totalAmount)}</b>
                </div>
              )}
            </div>
          )}

          {/* Novo ulaganje: iznos */}
          {!isReinvest && (
            <>
              <label className="inv-field-label">Iznos (EUR)</label>
              <input
                type="number"
                className="inv-input"
                placeholder="10.000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0"
              />
            </>
          )}

          <label className="inv-field-label">Godišnji prinos (%)</label>
          <input
            type="number"
            className="inv-input"
            placeholder="3.50"
            value={rate}
            onChange={e => setRate(e.target.value)}
            min="0" max="100" step="0.01"
          />

          <label className="inv-field-label">Datum ulaganja</label>
          <input
            type="date"
            className="inv-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />

          <label className="inv-field-label">Trajanje</label>
          <div className="inv-days-row">
            {[91, 182, 364].map(d => (
              <button
                key={d}
                type="button"
                className={'inv-days-preset' + (daysNum === d ? ' active' : '')}
                onClick={() => setDays(String(d))}
              >{d}d</button>
            ))}
            <input
              type="number"
              className="inv-input"
              style={{ flex: 1, minWidth: '60px' }}
              value={days}
              onChange={e => setDays(e.target.value)}
              min="1" max="3650"
            />
          </div>
          {maturityDate && (
            <div className="inv-maturity-hint">Dospijeće: <b>{fmtDate(maturityDate)}</b></div>
          )}

          <label className="inv-field-label">Napomena (opcija)</label>
          <input
            type="text"
            className="inv-input"
            placeholder="npr. MF aukcija 03/2025"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {previewGross !== null && (
            <div className="inv-preview-box">
              <div className="inv-preview-row">
                <span>Prinos bruto</span>
                <span className="pos">{fmtEUR(previewGross)}</span>
              </div>
              <div className="inv-preview-row">
                <span>Porez (~10%)</span>
                <span className="neg">−{fmtEUR(previewGross * TAX_RATE)}</span>
              </div>
              <div className="inv-preview-row inv-preview-neto">
                <span><b>Prinos neto</b></span>
                <span className="pos"><b>{fmtEUR(previewNet)}</b></span>
              </div>
              <div className="inv-preview-row">
                <span>Vrijednost po dospijeću</span>
                <b>{fmtEUR(totalAmount + previewNet)}</b>
              </div>
            </div>
          )}
        </div>
        <div className="fill-modal-footer">
          <button className="btn ghost" onClick={onClose}>Odustani</button>
          <button className="btn" onClick={save} disabled={!totalAmount || !rateNum || !date}>
            {isReinvest ? 'Reinvestiraj' : 'Dodaj ulaganje'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InvCard ─────────────────────────────────────────────────────────────────

function InvCard({ inv, onReinvest, onMarkMatured, onDelete }) {
  const [open, setOpen] = useState(false);
  const t = todayStr();

  const daysRem     = daysBetween(t, inv.maturityDate);
  const isExpired   = daysRem <= 0 && inv.status === 'active';
  const grossM      = grossInterest(inv.amount, inv.rate, inv.days);
  const netM        = netInterest(inv.amount, inv.rate, inv.days);
  const accGross    = accruedGross(inv);
  const accNet      = accGross * (1 - TAX_RATE);

  const statusLabel = inv.status === 'reinvested'   ? '↩ Reinvestirano'
                    : inv.status === 'matured'        ? '✅ Naplaćeno'
                    : isExpired                        ? '⏰ Dospjelo'
                    :                                   '🟢 Aktivno';

  const cardCls = 'inv-card'
    + (isExpired        ? ' inv-expired'    : '')
    + (inv.status === 'reinvested' ? ' inv-done' : '')
    + (inv.status === 'matured'    ? ' inv-done' : '');

  return (
    <div className={cardCls}>
      {/* Gornji red: iznos + status, klik razvija */}
      <div className="inv-card-summary" onClick={() => setOpen(o => !o)}>
        <div className="inv-card-left">
          <div className="inv-card-amount">{fmtEUR(inv.amount)}</div>
          <div className="inv-card-meta">
            {fmtPct(inv.rate)} · {inv.days} dana · {fmtDate(inv.date)}
            {inv.notes && <span className="inv-card-note"> · {inv.notes}</span>}
          </div>
        </div>
        <div className="inv-card-right">
          <div className={'inv-status-badge inv-status-' + (isExpired ? 'expired' : inv.status)}>
            {statusLabel}
          </div>
          <div className="inv-card-due">
            {inv.status === 'active'
              ? (isExpired ? 'Čeka naplatu' : `Dospijeće za ${daysRem} d`)
              : fmtDate(inv.maturityDate)}
          </div>
        </div>
        <span className="inv-card-chevron">{open ? '▲' : '▼'}</span>
      </div>

      {/* Detalji */}
      {open && (
        <div className="inv-card-detail">
          <table className="inv-detail-table">
            <tbody>
              <tr>
                <td>Datum ulaganja</td>
                <td><b>{fmtDate(inv.date)}</b></td>
              </tr>
              <tr>
                <td>Datum dospijeća</td>
                <td><b>{fmtDate(inv.maturityDate)}</b></td>
              </tr>
              <tr>
                <td>Prinos bruto</td>
                <td className="pos">{fmtEUR(grossM)}</td>
              </tr>
              <tr>
                <td>Porez (~10%)</td>
                <td className="neg">−{fmtEUR(grossM * TAX_RATE)}</td>
              </tr>
              <tr>
                <td><b>Prinos neto</b></td>
                <td className="pos"><b>{fmtEUR(netM)}</b></td>
              </tr>
              <tr className="inv-detail-total">
                <td><b>Vrijednost po dospijeću</b></td>
                <td><b>{fmtEUR(inv.amount + netM)}</b></td>
              </tr>
              {inv.status === 'active' && !isExpired && (
                <tr>
                  <td>Obračunato danas (neto)</td>
                  <td className="pos">{fmtEUR(accNet)}</td>
                </tr>
              )}
              {inv.reinvestedFromId && (
                <tr>
                  <td>Reinvestirano od</td>
                  <td className="muted" style={{ fontSize: '0.75rem' }}>{inv.reinvestedFromId}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="inv-card-actions">
            {inv.status === 'active' && isExpired && (
              <>
                <button className="btn small" onClick={() => onReinvest(inv)}>↩ Reinvestiraj</button>
                <button className="btn secondary small" onClick={() => onMarkMatured(inv)}>✅ Označi naplaćeno</button>
              </>
            )}
            {inv.status === 'matured' && (
              <button className="btn small" onClick={() => onReinvest(inv)}>↩ Reinvestiraj</button>
            )}
            <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => onDelete(inv.id)}>Obriši</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Kalkulator ─────────────────────────────────────────────────────────────

function KalkulatorSection() {
  const [principal,  setPrincipal]  = useState('');
  const [rate,       setRate]       = useState('');
  const [years,      setYears]      = useState('10');
  const [annualAdd,  setAnnualAdd]  = useState('');
  const [applyTax,   setApplyTax]   = useState(true);
  const [result,     setResult]     = useState(null);

  function calculate() {
    const P = parseFloat(principal) || 0;
    const r = (parseFloat(rate) || 0) / 100;
    const n = parseInt(years) || 0;
    const A = parseFloat(annualAdd) || 0;
    if (!P || !r || !n) return;

    let balance = P;
    let totalInvested = P;
    let totalEarned   = 0;
    const rows = [];

    for (let y = 1; y <= n; y++) {
      const gross = balance * r;
      const net   = applyTax ? gross * (1 - TAX_RATE) : gross;
      balance += net + A;
      totalInvested += A;
      totalEarned   += net;
      rows.push({ year: y, yearEarned: net, totalInvested, totalEarned, balance });
    }
    setResult({ rows, totalInvested, totalEarned, finalBalance: balance });
  }

  const maxBalance = result ? Math.max(...result.rows.map(r => r.balance)) : 1;
  const CHART_H = 130;

  return (
    <div className="card">
      <div className="card-title"><h2>📐 Kalkulator budućih zarada</h2></div>

      <div className="inv-calc-grid">
        <div>
          <label className="inv-field-label">Početni iznos (EUR)</label>
          <input type="number" className="inv-input" value={principal}
            onChange={e => setPrincipal(e.target.value)} placeholder="10.000" min="0" />
        </div>
        <div>
          <label className="inv-field-label">Godišnji prinos (%)</label>
          <input type="number" className="inv-input" value={rate}
            onChange={e => setRate(e.target.value)} placeholder="3.50" step="0.1" min="0" max="50" />
        </div>
        <div>
          <label className="inv-field-label">Broj godina</label>
          <input type="number" className="inv-input" value={years}
            onChange={e => setYears(e.target.value)} placeholder="10" min="1" max="50" />
        </div>
        <div>
          <label className="inv-field-label">Godišnji dodatak (EUR)</label>
          <input type="number" className="inv-input" value={annualAdd}
            onChange={e => setAnnualAdd(e.target.value)} placeholder="0" min="0" />
        </div>
      </div>

      <label className="inv-calc-tax-label">
        <input type="checkbox" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} />
        Uračunaj porez na prihod (10%)
      </label>

      <button className="btn" style={{ width: '100%', marginTop: '12px' }} onClick={calculate}>
        Izračunaj
      </button>

      {result && (
        <>
          {/* Sažetak */}
          <div className="inv-summary-cards" style={{ marginTop: '20px' }}>
            <div className="card inv-stat-card">
              <div className="inv-stat-label">Ukupno uloženo</div>
              <div className="inv-stat-value">{fmtEUR(result.totalInvested)}</div>
            </div>
            <div className="card inv-stat-card">
              <div className="inv-stat-label">Ukupna zarada</div>
              <div className="inv-stat-value pos">{fmtEUR(result.totalEarned)}</div>
            </div>
            <div className="card inv-stat-card">
              <div className="inv-stat-label">Vrijednost na kraju</div>
              <div className="inv-stat-value pos">{fmtEUR(result.finalBalance)}</div>
            </div>
          </div>

          {/* Stupičasti grafikon */}
          <div className="inv-chart-scroll">
            <div className="inv-chart">
              {result.rows.map(row => {
                const invH = Math.round((row.totalInvested / maxBalance) * CHART_H);
                const earH = Math.round((row.totalEarned   / maxBalance) * CHART_H);
                return (
                  <div key={row.year} className="inv-bar-wrap"
                    title={`Godina ${row.year}\nUloženo: ${fmtEUR(row.totalInvested)}\nZarada: ${fmtEUR(row.totalEarned)}\nUkupno: ${fmtEUR(row.balance)}`}
                  >
                    <div className="inv-bar-col" style={{ height: CHART_H + 'px' }}>
                      {/* redosljed: earned prvi → iznad; invested drugi → ispod */}
                      <div className="inv-bar inv-bar-earned"   style={{ height: earH + 'px' }} />
                      <div className="inv-bar inv-bar-invested" style={{ height: invH + 'px' }} />
                    </div>
                    <div className="inv-bar-label">{row.year}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="inv-chart-legend">
            <span className="inv-legend-dot dot-invested" /> Uloženo
            <span className="inv-legend-dot dot-earned"   /> Zarada
          </div>

          {/* Tablica po godinama */}
          <div className="table-wrap" style={{ marginTop: '16px' }}>
            <table id="kalkulatorTable">
              <thead>
                <tr>
                  <th>Godina</th>
                  <th className="num">Godišnja zarada</th>
                  <th className="num">Ukupno uloženo</th>
                  <th className="num">Ukupna zarada</th>
                  <th className="num">Vrijednost portfelja</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(row => (
                  <tr key={row.year}>
                    <td>{row.year}. god.</td>
                    <td className="num pos">{fmtEUR(row.yearEarned)}</td>
                    <td className="num">{fmtEUR(row.totalInvested)}</td>
                    <td className="num pos">{fmtEUR(row.totalEarned)}</td>
                    <td className="num pos"><b>{fmtEUR(row.balance)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Glavna stranica ─────────────────────────────────────────────────────────

export default function TrezorPage() {
  const { state, updateState } = useApp();
  const investments = state.investments || [];
  const [showAdd,       setShowAdd]       = useState(false);
  const [reinvestPrefil, setReinvestPrefil] = useState(null);
  const [tab,           setTab]           = useState('portfelj');

  const t = todayStr();

  // Obogati svako ulaganje izračunatim vrijednostima
  const enriched = investments.map(inv => {
    const daysRem   = daysBetween(t, inv.maturityDate);
    const isExpired = daysRem <= 0 && inv.status === 'active';
    const netM      = netInterest(inv.amount, inv.rate, inv.days);
    return { ...inv, daysRem, isExpired, netM };
  });

  // Sažetak
  const active           = enriched.filter(i => i.status === 'active');
  const doneItems        = enriched.filter(i => i.status === 'matured' || i.status === 'reinvested');
  const totalActive      = active.reduce((s, i) => s + i.amount, 0);
  const totalNetHistoric = doneItems.reduce((s, i) => s + i.netM, 0);
  const totalNetAccrued  = active.reduce((s, i) => s + accruedGross(i) * (1 - TAX_RATE), 0);
  const totalNetEarned   = totalNetHistoric + totalNetAccrued;

  const nextMaturity     = active
    .filter(i => i.daysRem > 0)
    .sort((a, b) => a.daysRem - b.daysRem)[0];

  const expiredCount = active.filter(i => i.isExpired).length;

  function handleReinvest(inv) {
    const netM = netInterest(inv.amount, inv.rate, inv.days);
    setReinvestPrefil({
      amount: (inv.amount + netM).toFixed(2),
      rate: inv.rate,
      days: inv.days,
      date: t,
      reinvestedFromId: inv.id,
    });
  }

  function handleMarkMatured(inv) {
    if (!confirm('Označiti ovo ulaganje kao naplaćeno (bez reinvestiranja)?')) return;
    const ns = { ...state, investments: state.investments.map(i => i.id === inv.id ? { ...i, status: 'matured' } : i) };
    updateState(ns);
  }

  function handleDelete(id) {
    if (!confirm('Obrisati ovo ulaganje?')) return;
    updateState({ ...state, investments: state.investments.filter(i => i.id !== id) });
  }

  return (
    <section>

      {/* ── Sažetak ── */}
      <div className="card">
        <div className="card-title">
          <h2>📈 Trezorski zapisi</h2>
          <button className="btn small" onClick={() => setShowAdd(true)}>+ Novo ulaganje</button>
        </div>

        {expiredCount > 0 && (
          <div className="inv-alert">
            ⏰ {expiredCount === 1 ? '1 ulaganje je dospjelo' : expiredCount + ' ulaganja su dospjela'} — otvori portfelj i odaberi akciju.
          </div>
        )}

        <div className="inv-summary-cards">
          <div className="card inv-stat-card">
            <div className="inv-stat-label">Aktivno uloženo</div>
            <div className="inv-stat-value">{fmtEUR(totalActive)}</div>
          </div>
          <div className="card inv-stat-card">
            <div className="inv-stat-label">Ukupna zarada (neto)</div>
            <div className="inv-stat-value pos">{fmtEUR(totalNetEarned)}</div>
          </div>
          <div className="card inv-stat-card">
            <div className="inv-stat-label">Sljedeće dospijeće</div>
            <div className="inv-stat-value inv-next-mat">
              {nextMaturity
                ? <><b>{fmtDate(nextMaturity.maturityDate)}</b><span className="muted"> za {nextMaturity.daysRem} d</span></>
                : <span className="muted">–</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabovi ── */}
      <div className={'type-toggle income'} style={{ margin: '0 0 12px' }}>
        <button className={tab === 'portfelj'   ? 'active' : ''} onClick={() => setTab('portfelj')}>Portfelj</button>
        <button className={tab === 'kalkulator' ? 'active' : ''} onClick={() => setTab('kalkulator')}>Kalkulator</button>
      </div>

      {/* ── Portfelj ── */}
      {tab === 'portfelj' && (
        <div className="card">
          <div className="card-title"><h2>Ulaganja</h2></div>
          {enriched.length === 0 ? (
            <div className="hero-empty" style={{ padding: '24px 0' }}>
              Nema ulaganja. Klikni <b>+ Novo ulaganje</b> za početak.
            </div>
          ) : (
            <div className="inv-list">
              {[...enriched]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(inv => (
                  <InvCard
                    key={inv.id}
                    inv={inv}
                    onReinvest={handleReinvest}
                    onMarkMatured={handleMarkMatured}
                    onDelete={handleDelete}
                  />
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* ── Kalkulator ── */}
      {tab === 'kalkulator' && <KalkulatorSection />}

      {/* ── Modali ── */}
      {showAdd       && <AddModal onClose={() => setShowAdd(false)} />}
      {reinvestPrefil && <AddModal prefill={reinvestPrefil} onClose={() => setReinvestPrefil(null)} />}
    </section>
  );
}
