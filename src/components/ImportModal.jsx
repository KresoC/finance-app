import { useState } from 'react';
import { useApp } from '../store/AppContext.jsx';
import { parseEzabaXls } from '../utils/ezabaImport.js';

function fmtShortDate(dateStr) {
  if (!dateStr) return '?';
  const d = new Date(dateStr);
  return d.getDate() + '.' + (d.getMonth() + 1) + '.';
}

export default function ImportModal({ onClose }) {
  const { state, updateState } = useApp();

  const [step,        setStep]        = useState('upload');
  const [error,       setError]       = useState(null);
  const [rows,        setRows]        = useState([]);
  const [assignments, setAssignments] = useState({}); // rowIdx → catId
  const [included,    setIncluded]    = useState({}); // rowIdx → bool
  const [result,      setResult]      = useState(null);
  const [dragging,    setDragging]    = useState(false);

  // ── Parse file ─────────────────────────────────────────────────────────────
  function processFile(file) {
    if (!file) return;
    if (!file.name.match(/\.(xls|xlsx)$/i)) {
      setError('Odaberi .xls ili .xlsx datoteku.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError('Greška pri čitanju datoteke.');
    reader.onload  = e => {
      try {
        const rules    = state.importRules  || { merchants: {}, standingOrders: {} };
        const imported = state.importedRefs || [];
        const parsed   = parseEzabaXls(e.target.result, rules, imported, state.categories);

        // Keep only current year + auto-skips (for display)
        const filtered = parsed.filter(tx =>
          tx.action === 'skip' || new Date(tx.date).getFullYear() === state.year
        );

        setRows(filtered);

        const inc = {}, asgn = {};
        filtered.forEach((tx, i) => {
          inc[i]  = tx.action !== 'skip';
          if (tx.action === 'auto') asgn[i] = tx.catId;
        });
        setIncluded(inc);
        setAssignments(asgn);
        setStep('preview');
      } catch (err) {
        setError('Greška: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Derived counts ─────────────────────────────────────────────────────────
  let includedCount = 0, pendingManual = 0;
  rows.forEach((tx, i) => {
    if (tx.action === 'skip') return;
    if (!included[i])         return;
    includedCount++;
    if (!assignments[i]) pendingManual++;
  });
  const autoSkippedCount = rows.filter(tx => tx.action === 'skip').length;
  const canConfirm = pendingManual === 0 && includedCount > 0;

  // ── Confirm import ─────────────────────────────────────────────────────────
  function confirm() {
    const ns = {
      ...state,
      actual:        { ...state.actual },
      recentEntries: [...(state.recentEntries || [])],
      importedRefs:  [...(state.importedRefs  || [])],
      importRules: {
        merchants:      { ...(state.importRules?.merchants      || {}) },
        standingOrders: { ...(state.importRules?.standingOrders || {}) },
      },
    };

    let added = 0, userExcluded = 0;
    const allCats = [
      ...state.categories.expense.map(c => ({ ...c, catType: 'expense' })),
      ...state.categories.income.map( c => ({ ...c, catType: 'income'  })),
    ];

    rows.forEach((tx, i) => {
      if (tx.action === 'skip') return;
      if (!included[i]) { userExcluded++; return; }
      const catId = assignments[i];
      if (!catId) return;

      const month = new Date(tx.date).getMonth();
      const cat   = allCats.find(c => c.id === catId);

      // Accumulate into actual
      if (!ns.actual[catId]) ns.actual[catId] = new Array(12).fill(0);
      else ns.actual[catId] = [...ns.actual[catId]];
      ns.actual[catId][month] = (ns.actual[catId][month] || 0) + tx.amount;

      // Recent entry
      ns.recentEntries.unshift({
        ts:      Date.now() + i,
        date:    tx.date,
        type:    cat?.catType || 'expense',
        catId,
        catName: cat?.name || catId,
        amount:  tx.amount,
        label:   tx.merchant || tx.opis.slice(0, 40),
      });

      // Mark as imported
      ns.importedRefs.push(tx.ref);

      // Learn merchant/standing order rules
      if (tx.typeHint === 'merchant'       && tx.merchant) ns.importRules.merchants[tx.merchant]           = catId;
      if (tx.typeHint === 'standing_order' && tx.merchant) ns.importRules.standingOrders[tx.merchant]      = catId;

      added++;
    });

    ns.recentEntries = ns.recentEntries.slice(0, 60);

    const alreadyCount = rows.filter(tx => tx.action === 'skip' && tx.skipReason === 'Već uvezeno').length;
    const autoCount    = autoSkippedCount - alreadyCount;

    updateState(ns);
    setResult({ added, userExcluded, alreadyCount, autoCount });
    setStep('done');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="import-modal">

        {/* Header */}
        <div className="import-modal-header">
          <div>
            <div className="import-modal-title">Uvoz bankovnog izvoda</div>
            {step === 'preview' && (
              <div className="import-modal-sub">eZaba · {state.year}</div>
            )}
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Zatvori">×</button>
        </div>

        {/* Body */}
        <div className="import-modal-body">

          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <div>
              <div
                className={'import-upload-zone' + (dragging ? ' dragging' : '')}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
                onClick={() => document.getElementById('_import-file').click()}
              >
                <div className="import-upload-icon">↑</div>
                <div className="import-upload-text">Povuci XLS ovdje ili klikni za odabir</div>
                <div className="import-upload-hint">eZaba izvod · "Promet po računu"</div>
              </div>
              <input
                id="_import-file"
                type="file"
                accept=".xls,.xlsx"
                style={{ display: 'none' }}
                onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }}
              />
              {error && <div className="import-error">{error}</div>}
            </div>
          )}

          {/* ── PREVIEW ── */}
          {step === 'preview' && (
            <div>
              {/* Summary bar */}
              <div className="import-summary-bar">
                <span><b>{includedCount}</b> za uvoz</span>
                {pendingManual > 0 && (
                  <span className="import-warn-badge">⚠ {pendingManual} čeka kategoriju</span>
                )}
                {autoSkippedCount > 0 && (
                  <span className="import-info-badge">{autoSkippedCount} preskočeno</span>
                )}
              </div>

              {/* Transactions table */}
              {rows.some(tx => tx.action !== 'skip') ? (
                <div className="import-table-wrap">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}></th>
                        <th>Datum</th>
                        <th>Merchant / Opis</th>
                        <th style={{ textAlign: 'right' }}>Iznos</th>
                        <th>Kategorija</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((tx, i) => {
                        if (tx.action === 'skip') return null;
                        const isOn     = !!included[i];
                        const catId    = assignments[i] || '';
                        const isAuto   = tx.action === 'auto';
                        const needsCat = isOn && !catId;

                        let rowCls = 'import-row';
                        if (!isOn)     rowCls += ' excluded';
                        else if (isAuto && !needsCat) rowCls += ' auto';
                        else if (needsCat) rowCls += ' warn';

                        return (
                          <tr key={tx.ref + '-' + i} className={rowCls}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isOn}
                                onChange={() => setIncluded(p => ({ ...p, [i]: !p[i] }))}
                              />
                            </td>
                            <td className="import-col-date">{fmtShortDate(tx.date)}</td>
                            <td className="import-col-merchant">
                              {tx.merchant || tx.opis.slice(0, 35)}
                              {isAuto && <span className="import-auto-badge">auto</span>}
                            </td>
                            <td className="import-col-amount">{tx.amount.toFixed(0)} €</td>
                            <td>
                              <select
                                className={'import-cat-select' + (needsCat ? ' missing' : '')}
                                value={catId}
                                disabled={!isOn}
                                onChange={e => setAssignments(p => ({ ...p, [i]: e.target.value }))}
                              >
                                <option value="">— odaberi —</option>
                                <optgroup label="Troškovi">
                                  {state.categories.expense.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Prihodi">
                                  {state.categories.income.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </optgroup>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="import-empty">Nema transakcija za uvoz u {state.year}.</div>
              )}

              {/* Skipped section */}
              {autoSkippedCount > 0 && (
                <details className="import-skipped-details">
                  <summary>Automatski preskočeno ({autoSkippedCount})</summary>
                  <div className="import-skipped-list">
                    {rows.filter(tx => tx.action === 'skip').map((tx, idx) => (
                      <div key={tx.ref + '-s' + idx} className="import-skipped-row">
                        <span className="import-col-date">{fmtShortDate(tx.date)}</span>
                        <span className="import-skipped-opis">{tx.opis.slice(0, 45)}</span>
                        <span className="import-skipped-reason">{tx.skipReason}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && result && (
            <div className="import-done">
              <div className="import-done-icon">✓</div>
              <div className="import-done-title">Uvoz završen!</div>
              <div className="import-done-stats">
                <div className="import-done-row pos">✓ {result.added} transakcija dodano u {state.year}.</div>
                {result.alreadyCount > 0 && (
                  <div className="import-done-row muted">– {result.alreadyCount} već uvezeno (preskočeno)</div>
                )}
                {result.autoCount > 0 && (
                  <div className="import-done-row muted">– {result.autoCount} automatski preskočeno (kreditna kartica, naknade...)</div>
                )}
                {result.userExcluded > 0 && (
                  <div className="import-done-row muted">– {result.userExcluded} ručno isključeno</div>
                )}
              </div>
              {result.added > 0 && (
                <div className="import-done-note">Pravila za merchantove su zapamćena za sljedeći uvoz.</div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="import-modal-footer">
          {step === 'upload' && (
            <button className="btn btn-secondary" onClick={onClose}>Odustani</button>
          )}
          {step === 'preview' && (
            <>
              <button className="btn btn-secondary" onClick={() => setStep('upload')}>← Natrag</button>
              <button
                className="btn"
                disabled={!canConfirm}
                onClick={confirm}
                title={pendingManual > 0 ? 'Dodijeli kategoriju svim transakcijama prije potvrde' : ''}
              >
                Potvrdi uvoz ({includedCount})
              </button>
            </>
          )}
          {step === 'done' && (
            <button className="btn" onClick={onClose}>Zatvori</button>
          )}
        </div>

      </div>
    </div>
  );
}
