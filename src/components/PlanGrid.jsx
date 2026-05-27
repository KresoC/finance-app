import { useState, useRef, useEffect } from 'react';
import { useApp } from '../store/AppContext.jsx';
import {
  fmtEUR, currentMonthIdx, plannedIncomeMonth, plannedExpenseMonth,
  plannedEndOfYear, startMonthIdx, startIsThisYear
} from '../utils/finance.js';
import { MONTHS_HR, MONTHS_LONG, ALL_MONTHS } from '../store/state.js';

// ── useIsMobile ──────────────────────────────────────────────────────────────
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

// ── FillModal ────────────────────────────────────────────────────────────────
// Prikazuje se i za kategority (cat) i za grupe (groupName)
function FillModal({ cat, groupName, onClose }) {
  const { state, updateState } = useApp();
  const isGroup = !cat && !!groupName;
  const label    = isGroup ? groupName + ' (grupa)' : cat.name;
  const activeMths = isGroup ? ALL_MONTHS : (cat.months || ALL_MONTHS);

  const [amount, setAmount]               = useState('');
  const [selectedMonths, setSelectedMonths] = useState(() => new Set(activeMths));
  const [overwrite, setOverwrite]           = useState(true);

  function toggleMonth(m) {
    setSelectedMonths(prev => {
      const s = new Set(prev);
      s.has(m) ? s.delete(m) : s.add(m);
      return s;
    });
  }

  function confirm() {
    const n = parseFloat(amount);
    if (isNaN(n) || n < 0) return;
    let newState;
    if (isGroup) {
      newState = { ...state, groupPlan: { ...state.groupPlan } };
      const arr = [...(state.groupPlan[groupName] || new Array(12).fill(0))];
      for (let m = 0; m < 12; m++) {
        if (selectedMonths.has(m) && (overwrite || !arr[m])) arr[m] = n;
      }
      newState.groupPlan[groupName] = arr;
    } else {
      newState = { ...state, plan: { ...state.plan } };
      const arr = [...(state.plan[cat.id] || new Array(12).fill(0))];
      for (let m = 0; m < 12; m++) {
        if (selectedMonths.has(m) && (overwrite || !arr[m])) arr[m] = n;
      }
      newState.plan[cat.id] = arr;
    }
    updateState(newState);
    onClose();
  }

  return (
    <div className="fill-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fill-modal">
        <div className="fill-modal-header">
          <span>Popuni: <b>{label}</b></span>
          <button className="fill-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="fill-modal-body">
          <div className="form-row">
            <label>Iznos (EUR)</label>
            <input
              type="number" step="1" min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirm()}
              autoFocus
              placeholder="0"
            />
          </div>
          <div className="fill-modal-section">
            <div className="fill-modal-section-label">Odaberi mjesece:</div>
            <div className="fill-month-grid">
              {MONTHS_HR.map((mn, m) => {
                const active = activeMths.includes(m);
                return (
                  <label
                    key={m}
                    className={'fill-month-chip' + (selectedMonths.has(m) ? ' selected' : '') + (!active ? ' dim' : '')}
                    onClick={() => toggleMonth(m)}
                  >
                    {mn}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="fill-overwrite-row">
            <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
            <span>Prepiši već unesene iznose</span>
            {!overwrite && <span className="muted" style={{ fontSize: '0.78rem' }}>(preskočit će popunjene)</span>}
          </label>
        </div>
        <div className="fill-modal-footer">
          <button className="btn secondary" onClick={onClose}>Odustani</button>
          <button className="btn" onClick={confirm} disabled={!amount.trim() || isNaN(parseFloat(amount))}>
            Primijeni
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AnnualDistribModal ───────────────────────────────────────────────────────
function AnnualDistribModal({ cat, catType, onClose }) {
  const { state, updateState } = useApp();
  const currentAnnual = (state.plan[cat.id] || []).reduce((s, v) => s + (v || 0), 0);

  const [total, setTotal]                   = useState(currentAnnual > 0 ? String(Math.round(currentAnnual)) : '');
  const [selectedMonths, setSelectedMonths] = useState(() => new Set(cat.months || ALL_MONTHS));
  const [mode, setMode]                     = useState('equal');
  const [manualAmounts, setManualAmounts]   = useState(() => {
    const obj = {};
    (cat.months || ALL_MONTHS).forEach(m => { obj[m] = state.plan[cat.id]?.[m] || 0; });
    return obj;
  });

  function toggleMonth(m) {
    setSelectedMonths(prev => {
      const s = new Set(prev);
      s.has(m) ? s.delete(m) : s.add(m);
      return s;
    });
  }

  const n        = parseFloat(total) || 0;
  const cnt      = selectedMonths.size;
  const perMonth = cnt > 0 ? Math.round(n / cnt) : 0;
  const manualTotal = [...selectedMonths].reduce((s, m) => s + (parseFloat(manualAmounts[m]) || 0), 0);

  function confirm() {
    const arr = new Array(12).fill(0);
    if (mode === 'equal') {
      selectedMonths.forEach(m => { arr[m] = perMonth; });
    } else {
      selectedMonths.forEach(m => { arr[m] = parseFloat(manualAmounts[m]) || 0; });
    }
    const newMonths = [...selectedMonths].sort((a, b) => a - b);
    const newCats = state.categories[catType].map(c =>
      c.id === cat.id ? { ...c, annualMode: true, months: newMonths } : c
    );
    updateState({
      ...state,
      categories: { ...state.categories, [catType]: newCats },
      plan: { ...state.plan, [cat.id]: arr }
    });
    onClose();
  }

  return (
    <div className="fill-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fill-modal annual-modal">
        <div className="fill-modal-header">
          <span>🗓 Godišnji raspored: <b>{cat.name}</b></span>
          <button className="fill-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="fill-modal-body">
          <div className="form-row">
            <label>Ukupni godišnji iznos (EUR)</label>
            <input
              type="number" step="1" min="0"
              value={total}
              onChange={e => setTotal(e.target.value)}
              autoFocus
              placeholder="0"
            />
          </div>
          <div className="fill-modal-section">
            <div className="fill-modal-section-label">U kojim mjesecima:</div>
            <div className="fill-month-grid">
              {MONTHS_HR.map((mn, m) => (
                <label
                  key={m}
                  className={'fill-month-chip' + (selectedMonths.has(m) ? ' selected' : '')}
                  onClick={() => toggleMonth(m)}
                >
                  {mn}
                </label>
              ))}
            </div>
          </div>
          <div className="annual-mode-toggle">
            <button className={'annual-mode-btn' + (mode === 'equal' ? ' active' : '')} onClick={() => setMode('equal')}>
              Jednako
            </button>
            <button className={'annual-mode-btn' + (mode === 'manual' ? ' active' : '')} onClick={() => setMode('manual')}>
              Ručno
            </button>
          </div>
          {mode === 'equal' && cnt > 0 && n > 0 && (
            <div className="annual-preview">
              {cnt} {cnt === 1 ? 'mjesec' : 'mjes.'} × <b>{fmtEUR(perMonth)}</b> = {fmtEUR(perMonth * cnt)}
            </div>
          )}
          {mode === 'manual' && (
            <div className="annual-manual-grid">
              {[...selectedMonths].sort((a, b) => a - b).map(m => (
                <div key={m} className="annual-manual-row">
                  <span>{MONTHS_HR[m]}</span>
                  <input
                    type="number" step="1" min="0"
                    className="annual-manual-input"
                    value={manualAmounts[m] || ''}
                    onChange={e => setManualAmounts(p => ({ ...p, [m]: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              ))}
              <div className="annual-manual-total">Ukupno: <b>{fmtEUR(manualTotal)}</b></div>
            </div>
          )}
        </div>
        <div className="fill-modal-footer">
          <button className="btn secondary" onClick={onClose}>Odustani</button>
          <button className="btn" onClick={confirm}>Primijeni</button>
        </div>
      </div>
    </div>
  );
}

// ── PlanGridDesktop ──────────────────────────────────────────────────────────
// 16 stupaca: Kategorija | Sij..Pro (12) | God. | ≡ | 🗓
function PlanGridDesktop({ typeView }) {
  const { state, updateState } = useApp();
  const cats = state.categories[typeView];
  const curM = currentMonthIdx(state);

  const [fillModal, setFillModal]     = useState(null);
  const [annualModal, setAnnualModal] = useState(null);

  function updateCell(catId, month, val) {
    const v = parseFloat(val) || 0;
    const newState = { ...state, plan: { ...state.plan } };
    newState.plan[catId] = [...(state.plan[catId] || new Array(12).fill(0))];
    newState.plan[catId][month] = v;
    updateState(newState);
  }

  function updateGroupCell(group, month, val) {
    const v = parseFloat(val) || 0;
    const newState = { ...state, groupPlan: { ...state.groupPlan } };
    newState.groupPlan[group] = [...(state.groupPlan[group] || new Array(12).fill(0))];
    newState.groupPlan[group][month] = v;
    updateState(newState);
  }

  function toggleGroupPlan(groupName, on) {
    const newState = {
      ...state,
      useGroupPlan: { ...state.useGroupPlan },
      groupPlan:    { ...state.groupPlan }
    };
    if (on) {
      if (!newState.groupPlan[groupName] || newState.groupPlan[groupName].every(v => !v)) {
        const arr = new Array(12).fill(0);
        cats.forEach(c => {
          if (c.group === groupName)
            for (let m = 0; m < 12; m++) arr[m] += state.plan[c.id]?.[m] || 0;
        });
        newState.groupPlan[groupName] = arr;
      }
      newState.useGroupPlan[groupName] = true;
    } else {
      newState.useGroupPlan[groupName] = false;
    }
    updateState(newState);
  }

  // Totals
  const totals = new Array(12).fill(0);
  const totalSeenG = new Set();
  cats.forEach(c => {
    if (c.group && state.useGroupPlan?.[c.group]) {
      if (totalSeenG.has(c.group)) return;
      totalSeenG.add(c.group);
      (state.groupPlan[c.group] || []).forEach((v, m) => { totals[m] += v || 0; });
    } else {
      for (let m = 0; m < 12; m++) totals[m] += state.plan[c.id]?.[m] || 0;
    }
  });
  const yearTotal = totals.reduce((a, b) => a + b, 0);

  // Rows
  const rows = [];
  let lastGroup = null;
  const seenGroups = new Set();

  cats.forEach((c, idx) => {
    const groupLabel = c.group || (typeView === 'income' ? 'Prihodi' : 'Ostalo');
    const useGroup   = c.group && state.useGroupPlan?.[c.group];

    // Group header row (expense only)
    if (typeView === 'expense' && groupLabel !== lastGroup) {
      const toggleBtn = c.group
        ? (state.useGroupPlan?.[c.group]
            ? <button className="btn ghost small" onClick={() => toggleGroupPlan(c.group, false)}>→ Po stavkama</button>
            : <button className="btn ghost small" onClick={() => toggleGroupPlan(c.group, true)}>→ Plan po grupi</button>)
        : null;
      rows.push(
        <tr key={'g-' + groupLabel + idx} className="group-row">
          <td colSpan={14}>{groupLabel}</td>
          <td colSpan={2}>{toggleBtn}</td>
        </tr>
      );
      lastGroup = groupLabel;
    }

    // Group plan row (one row for the whole group)
    if (useGroup) {
      if (seenGroups.has(c.group)) return;
      seenGroups.add(c.group);
      const arr     = state.groupPlan[c.group] || new Array(12).fill(0);
      const yearSum = arr.reduce((a, b) => a + (b || 0), 0);
      rows.push(
        <tr key={'grp-' + c.group} style={{ background: '#fefce8' }}>
          <td className="cat-name"><b>{c.group}</b></td>
          {arr.map((v, m) => (
            <td key={m} className={'num' + (m === curM ? ' col-current' : '')}>
              <input
                className="plan-input" type="number" step="1"
                defaultValue={v || ''}
                key={v + '-' + m}
                onBlur={e => updateGroupCell(c.group, m, e.target.value)}
              />
            </td>
          ))}
          <td className="num"><b>{fmtEUR(yearSum)}</b></td>
          <td>
            <button className="btn ghost small plan-fill-btn" title="Popuni sve" onClick={() => setFillModal({ groupName: c.group })}>≡</button>
          </td>
          <td></td>
        </tr>
      );
      return;
    }

    // Regular category row
    const months  = c.months || ALL_MONTHS;
    const vals    = state.plan[c.id] || new Array(12).fill(0);
    const yearSum = vals.reduce((a, b) => a + (b || 0), 0);

    rows.push(
      <tr key={c.id}>
        <td className="cat-name">
          <span>{c.name}</span>
          {c.annualMode && <span className="annual-badge" title="Godišnji iznos raspoređen">🗓</span>}
          {' '}<span className="months-info">({months.length})</span>
        </td>
        {Array.from({ length: 12 }, (_, m) => {
          const isActive = months.includes(m);
          const colCls   = 'num' + (m === curM ? ' col-current' : '');
          if (!isActive) return <td key={m} className={'num inactive-cell' + (m === curM ? ' col-current' : '')}>-</td>;
          return (
            <td key={m} className={colCls}>
              <input
                className="plan-input" type="number" step="1"
                defaultValue={vals[m] || ''}
                key={vals[m] + '-' + m}
                onBlur={e => updateCell(c.id, m, e.target.value)}
              />
            </td>
          );
        })}
        <td className="num"><b>{fmtEUR(yearSum)}</b></td>
        <td>
          <button className="btn ghost small plan-fill-btn" title="Popuni sve" onClick={() => setFillModal({ cat: c })}>≡</button>
        </td>
        <td>
          <button className="btn ghost small plan-fill-btn" title="Godišnji raspored" onClick={() => setAnnualModal({ cat: c, catType: typeView })}>🗓</button>
        </td>
      </tr>
    );
  });

  return (
    <>
      <div className="table-wrap">
        <table id="planTable">
          <thead>
            <tr>
              <th>Kategorija</th>
              {MONTHS_HR.map((mn, m) => (
                <th key={m} className={'num' + (m === curM ? ' col-current' : '')}>{mn}</th>
              ))}
              <th className="num">God.</th>
              <th className="plan-col-icon" title="Popuni sve">≡</th>
              <th className="plan-col-icon" title="Godišnji raspored">🗓</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr className="total-row">
              <td>UKUPNO</td>
              {totals.map((t, m) => (
                <td key={m} className={'num' + (m === curM ? ' col-current' : '')}>{fmtEUR(t)}</td>
              ))}
              <td className="num">{fmtEUR(yearTotal)}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {fillModal && (
        <FillModal
          cat={fillModal.cat}
          groupName={fillModal.groupName}
          onClose={() => setFillModal(null)}
        />
      )}
      {annualModal && (
        <AnnualDistribModal
          cat={annualModal.cat}
          catType={annualModal.catType}
          onClose={() => setAnnualModal(null)}
        />
      )}
    </>
  );
}

// ── MobileRow ────────────────────────────────────────────────────────────────
function MobileRow({ item, onUpdate, onFill, onAnnual }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(item.val > 0 ? String(Math.round(item.val)) : '');
  const inputRef              = useRef(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 40);
  }

  function commit() {
    onUpdate(val);
    setEditing(false);
  }

  return (
    <div className="plan-mobile-row">
      <span className="plan-mobile-cat-name">
        {item.label}
        {item.annualMode && <span className="annual-badge">🗓</span>}
      </span>
      <div className="plan-mobile-row-right">
        <button className="plan-mobile-fill-btn" onClick={onFill} title="Popuni sve">≡</button>
        {!item.isGroup && (
          <button className="plan-mobile-annual-btn" onClick={onAnnual} title="Godišnji raspored">🗓</button>
        )}
        {editing ? (
          <input
            ref={inputRef}
            className="plan-mobile-input"
            type="number"
            inputMode="numeric"
            step="1"
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') inputRef.current?.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button className={'plan-mobile-amount' + (item.val > 0 ? '' : ' empty')} onClick={startEdit}>
            {item.val > 0 ? fmtEUR(item.val) : <span>unesi</span>}
          </button>
        )}
      </div>
    </div>
  );
}

// ── PlanGridMobile ───────────────────────────────────────────────────────────
function PlanGridMobile({ typeView }) {
  const { state, updateState } = useApp();
  const curM = currentMonthIdx(state);

  const [activeMonth, setActiveMonth] = useState(curM);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [fillModal, setFillModal]     = useState(null);
  const [annualModal, setAnnualModal] = useState(null);

  const cats = state.categories[typeView];

  function updateCell(catId, val) {
    const v = parseFloat(val) || 0;
    const newState = { ...state, plan: { ...state.plan } };
    newState.plan[catId] = [...(state.plan[catId] || new Array(12).fill(0))];
    newState.plan[catId][activeMonth] = v;
    updateState(newState);
  }

  function updateGroupCell(group, val) {
    const v = parseFloat(val) || 0;
    const newState = { ...state, groupPlan: { ...state.groupPlan } };
    newState.groupPlan[group] = [...(state.groupPlan[group] || new Array(12).fill(0))];
    newState.groupPlan[group][activeMonth] = v;
    updateState(newState);
  }

  function copyFromPrev() {
    if (activeMonth === 0) return;
    const prev = activeMonth - 1;
    const newState = { ...state, plan: { ...state.plan }, groupPlan: { ...state.groupPlan } };
    const seenG = new Set();
    cats.forEach(c => {
      if (c.group && state.useGroupPlan?.[c.group]) {
        if (seenG.has(c.group)) return;
        seenG.add(c.group);
        const arr = [...(state.groupPlan[c.group] || new Array(12).fill(0))];
        arr[activeMonth] = arr[prev];
        newState.groupPlan[c.group] = arr;
      } else {
        const arr = [...(state.plan[c.id] || new Array(12).fill(0))];
        arr[activeMonth] = arr[prev];
        newState.plan[c.id] = arr;
      }
    });
    updateState(newState);
  }

  // Build items for active month
  const items = [];
  const seenG = new Set();
  cats.forEach(c => {
    if (c.group && state.useGroupPlan?.[c.group]) {
      if (seenG.has(c.group)) return;
      seenG.add(c.group);
      const val = state.groupPlan?.[c.group]?.[activeMonth] || 0;
      items.push({
        key: 'grp-' + c.group,
        label: c.group,
        isGroup: true,
        groupName: c.group,
        cat: null,
        val,
        annualMode: false
      });
    } else {
      const months = c.months || ALL_MONTHS;
      if (!months.includes(activeMonth)) return;
      const val = state.plan[c.id]?.[activeMonth] || 0;
      items.push({
        key: c.id,
        label: c.name,
        isGroup: false,
        groupName: null,
        cat: c,
        val,
        annualMode: !!c.annualMode
      });
    }
  });

  // Month total
  let monthTotal = 0;
  const seenG2 = new Set();
  cats.forEach(c => {
    if (c.group && state.useGroupPlan?.[c.group]) {
      if (seenG2.has(c.group)) return;
      seenG2.add(c.group);
      monthTotal += state.groupPlan?.[c.group]?.[activeMonth] || 0;
    } else {
      monthTotal += state.plan[c.id]?.[activeMonth] || 0;
    }
  });

  // Annual summary
  const sm    = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  let annIncome = 0, annExpense = 0;
  for (let m = fromM; m < 12; m++) {
    annIncome  += plannedIncomeMonth(state, m);
    annExpense += plannedExpenseMonth(state, m);
  }
  const annResult = plannedEndOfYear(state);

  return (
    <div className="plan-mobile">
      {/* ── Navigacija između mjeseci ── */}
      <div className="plan-month-nav">
        <button
          className="plan-nav-btn"
          onClick={() => setActiveMonth(m => m - 1)}
          disabled={activeMonth === 0}
        >‹</button>
        <div className="plan-month-center">
          <span className="plan-month-name">{MONTHS_LONG[activeMonth]} {state.year}</span>
          <span className={'plan-month-total ' + (typeView === 'income' ? 'pos' : 'neg')}>
            {typeView === 'income' ? '+' : '−'}{fmtEUR(monthTotal)}
          </span>
        </div>
        <button
          className="plan-nav-btn"
          onClick={() => setActiveMonth(m => m + 1)}
          disabled={activeMonth === 11}
        >›</button>
      </div>

      {/* ── Lista stavki ── */}
      <div className="plan-mobile-rows">
        {items.length === 0
          ? <div className="plan-mobile-empty">Nema aktivnih stavki za ovaj mjesec.</div>
          : items.map(item => (
              <MobileRow
                key={item.key + '-' + activeMonth}
                item={item}
                onUpdate={v => item.isGroup
                  ? updateGroupCell(item.groupName, v)
                  : updateCell(item.cat.id, v)
                }
                onFill={() => setFillModal(
                  item.isGroup ? { groupName: item.groupName } : { cat: item.cat }
                )}
                onAnnual={() => !item.isGroup && setAnnualModal({ cat: item.cat, catType: typeView })}
              />
            ))
        }
      </div>

      {/* ── Kopiraj iz prošlog ── */}
      {activeMonth > 0 && (
        <button className="btn secondary plan-copy-btn" onClick={copyFromPrev}>
          ← Kopiraj iz {MONTHS_LONG[activeMonth - 1]}
        </button>
      )}

      {/* ── Collapsible sažetak ── */}
      <div className="plan-mobile-summary">
        <button className="plan-summary-toggle" onClick={() => setSummaryOpen(o => !o)}>
          {summaryOpen ? '▲' : '▼'} Godišnji sažetak
        </button>
        {summaryOpen && (
          <div className="plan-summary-content">
            <div className="plan-sum-row">
              <span>Planirani prihodi</span>
              <b className="pos">{fmtEUR(annIncome)}</b>
            </div>
            <div className="plan-sum-row">
              <span>Planirani rashodi</span>
              <b className="neg">{fmtEUR(annExpense)}</b>
            </div>
            <div className="plan-sum-divider" />
            <div className="plan-sum-row">
              <span>Planirani rezultat</span>
              <b className={annResult >= 0 ? 'pos' : 'neg'}>{fmtEUR(annResult)}</b>
            </div>
          </div>
        )}
      </div>

      {fillModal && (
        <FillModal
          cat={fillModal.cat}
          groupName={fillModal.groupName}
          onClose={() => setFillModal(null)}
        />
      )}
      {annualModal && (
        <AnnualDistribModal
          cat={annualModal.cat}
          catType={annualModal.catType}
          onClose={() => setAnnualModal(null)}
        />
      )}
    </div>
  );
}

// ── PlanSummaryPanel — sticky sidebar na desktopu ────────────────────────────
export function PlanSummaryPanel({ state }) {
  const sm    = startMonthIdx(state);
  const fromM = startIsThisYear(state) ? sm : 0;
  let totalIncome = 0, totalExpense = 0;
  for (let m = fromM; m < 12; m++) {
    totalIncome  += plannedIncomeMonth(state, m);
    totalExpense += plannedExpenseMonth(state, m);
  }
  const result = plannedEndOfYear(state);

  return (
    <div className="plan-summary-sidebar card">
      <h2 style={{ marginBottom: '14px' }}>Godišnji plan</h2>
      <div className="plan-sum-row">
        <span>Prihodi</span>
        <b className="pos">{fmtEUR(totalIncome)}</b>
      </div>
      <div className="plan-sum-row">
        <span>Rashodi</span>
        <b className="neg">{fmtEUR(totalExpense)}</b>
      </div>
      <div className="plan-sum-divider" />
      <div className="plan-sum-row large">
        <span>Rezultat</span>
        <b className={result >= 0 ? 'pos' : 'neg'}>{fmtEUR(result)}</b>
      </div>
      <div className="plan-sum-note muted" style={{ marginTop: '8px' }}>
        poč. stanje {fmtEUR(state.initialBalance)}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function PlanGrid({ typeView }) {
  const isMobile = useIsMobile();
  return isMobile
    ? <PlanGridMobile typeView={typeView} />
    : <PlanGridDesktop typeView={typeView} />;
}
