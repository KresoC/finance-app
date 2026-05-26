import { useApp } from '../store/AppContext.jsx';
import { MONTHS_HR, fmtEUR, currentMonthIdx } from '../utils/finance.js';
import { ALL_MONTHS } from '../store/state.js';

export default function DataGrid({ tableId, typeView, gridKey, allowFillAll }) {
  const { state, updateState } = useApp();
  const cats = state.categories[typeView];
  const curM = currentMonthIdx(state);

  function updateGridCell(catId, month, val) {
    const v = parseFloat(val) || 0;
    const newState = { ...state, [gridKey]: { ...state[gridKey] } };
    if (!newState[gridKey][catId]) newState[gridKey][catId] = new Array(12).fill(0);
    else newState[gridKey][catId] = [...newState[gridKey][catId]];
    newState[gridKey][catId][month] = v;
    updateState(newState);
  }

  function updateGroupPlanCell(group, month, val) {
    const v = parseFloat(val) || 0;
    const newState = { ...state, groupPlan: { ...state.groupPlan } };
    if (!newState.groupPlan[group]) newState.groupPlan[group] = new Array(12).fill(0);
    else newState.groupPlan[group] = [...newState.groupPlan[group]];
    newState.groupPlan[group][month] = v;
    updateState(newState);
  }

  function planFillActive(catId) {
    const v = prompt('Unesi iznos koji ce se postaviti za sve aktivne mjesece (EUR):');
    if (v === null) return;
    const n = parseFloat(v);
    if (isNaN(n)) { alert('Neispravan iznos'); return; }
    const cat = [...state.categories.income, ...state.categories.expense].find(c => c.id === catId);
    const months = (cat && cat.months) || ALL_MONTHS;
    const newState = { ...state, [gridKey]: { ...state[gridKey] } };
    const arr = new Array(12).fill(0);
    for (let m = 0; m < 12; m++) arr[m] = months.includes(m) ? n : 0;
    newState[gridKey][catId] = arr;
    updateState(newState);
  }

  function groupPlanFillAll(group) {
    const v = prompt('Unesi iznos za grupu "' + group + '" za svih 12 mjeseci (EUR):');
    if (v === null) return;
    const n = parseFloat(v);
    if (isNaN(n)) { alert('Neispravan iznos'); return; }
    const newState = { ...state, groupPlan: { ...state.groupPlan } };
    newState.groupPlan[group] = new Array(12).fill(n);
    updateState(newState);
  }

  function toggleGroupPlan(groupName, on) {
    const newState = {
      ...state,
      useGroupPlan: { ...state.useGroupPlan },
      groupPlan: { ...state.groupPlan }
    };
    if (on) {
      if (!newState.groupPlan[groupName] || newState.groupPlan[groupName].every(v => !v)) {
        const arr = new Array(12).fill(0);
        ['income', 'expense'].forEach(type => {
          state.categories[type].forEach(c => {
            if (c.group === groupName) {
              for (let m = 0; m < 12; m++) arr[m] += (state.plan[c.id] && state.plan[c.id][m]) || 0;
            }
          });
        });
        newState.groupPlan[groupName] = arr;
      }
      newState.useGroupPlan[groupName] = true;
    } else {
      newState.useGroupPlan[groupName] = false;
    }
    updateState(newState);
  }

  // Build totals row
  const totals = new Array(12).fill(0);
  const totalSeenGroups = new Set();
  cats.forEach(c => {
    if (gridKey === 'plan' && c.group && state.useGroupPlan && state.useGroupPlan[c.group]) {
      if (totalSeenGroups.has(c.group)) return;
      totalSeenGroups.add(c.group);
      const arr = state.groupPlan[c.group] || [];
      for (let m = 0; m < 12; m++) totals[m] += arr[m] || 0;
    } else {
      for (let m = 0; m < 12; m++) totals[m] += state[gridKey][c.id]?.[m] || 0;
    }
  });
  const yearTotal = totals.reduce((a, b) => a + b, 0);

  // Render rows
  const rows = [];
  let lastGroup = null;
  const seenGroups = new Set();

  cats.forEach((c, idx) => {
    const groupLabel = c.group || (typeView === 'income' ? 'Prihodi' : 'Ostalo');
    const useGroup = gridKey === 'plan' && c.group && state.useGroupPlan && state.useGroupPlan[c.group];

    if (typeView === 'expense' && groupLabel !== lastGroup) {
      const toggleLabel = (gridKey === 'plan' && c.group)
        ? (state.useGroupPlan && state.useGroupPlan[c.group]
            ? <button className="btn ghost small" onClick={() => toggleGroupPlan(c.group, false)}>→ Po stavkama</button>
            : <button className="btn ghost small" onClick={() => toggleGroupPlan(c.group, true)}>→ Plan po grupi</button>)
        : null;
      rows.push(
        <tr key={'grp-' + groupLabel + '-' + idx} className="group-row">
          <td colSpan={13}>{groupLabel}</td>
          <td>{toggleLabel}</td>
        </tr>
      );
      lastGroup = groupLabel;
    }

    if (useGroup) {
      if (seenGroups.has(c.group)) return;
      seenGroups.add(c.group);
      const arr = state.groupPlan[c.group] || new Array(12).fill(0);
      const yearSum = arr.reduce((a, b) => a + b, 0);
      rows.push(
        <tr key={'group-row-' + c.group} style={{ background: '#fefce8' }}>
          <td className="cat-name"><b>{c.group} UKUPNO</b></td>
          {arr.map((v, m) => (
            <td key={m} className={'num' + (m === curM ? ' col-current' : '')}>
              <input
                className="plan-input"
                type="number"
                step="1"
                defaultValue={v || ''}
                key={v + '-' + m}
                onBlur={e => updateGroupPlanCell(c.group, m, e.target.value)}
              />
            </td>
          ))}
          <td className="num"><b>{fmtEUR(yearSum)}</b></td>
          <td>
            <button className="btn ghost small" onClick={() => groupPlanFillAll(c.group)} title="Postavi isti iznos za sve mjesece">=12</button>
          </td>
        </tr>
      );
      return;
    }

    const months = c.months || ALL_MONTHS;
    const vals = state[gridKey][c.id] || new Array(12).fill(0);
    const yearSum = vals.reduce((a, b) => a + b, 0);

    rows.push(
      <tr key={c.id}>
        <td className="cat-name">
          {c.name} <span className="months-info">({months.length})</span>
        </td>
        {Array.from({ length: 12 }, (_, m) => {
          const v = vals[m] || 0;
          const isActive = months.includes(m);
          const colCls = 'num' + (m === curM ? ' col-current' : '');
          if (isActive) {
            return (
              <td key={m} className={colCls}>
                <input
                  className="plan-input"
                  type="number"
                  step="1"
                  defaultValue={v || ''}
                  key={v + '-' + m}
                  onBlur={e => updateGridCell(c.id, m, e.target.value)}
                />
              </td>
            );
          }
          return <td key={m} className={'num inactive-cell' + (m === curM ? ' col-current' : '')}>-</td>;
        })}
        <td className="num"><b>{fmtEUR(yearSum)}</b></td>
        <td>
          {allowFillAll && (
            <button className="btn ghost small" onClick={() => planFillActive(c.id)} title="Postavi isti iznos za sve aktivne mjesece">=N</button>
          )}
        </td>
      </tr>
    );
  });

  return (
    <table id={tableId}>
      <thead>
        <tr>
          <th>Kategorija</th>
          {MONTHS_HR.map((mn, m) => (
            <th key={m} className={'num' + (m === curM ? ' col-current' : '')}>{mn}</th>
          ))}
          <th className="num">SUM god.</th>
          <th></th>
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
        </tr>
      </tbody>
    </table>
  );
}
