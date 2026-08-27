import { useApp } from '../store/AppContext.jsx';
import { fmtEUR, projectionForYear } from '../utils/finance.js';
import { defaultLongTerm, projectLongTerm, raiseSteps, uidLT } from '../utils/longterm.js';

// Kompaktan format za osi grafa: 1.200.000 -> "1,2M"
function fmtShort(n) {
  const a = Math.abs(n);
  if (a >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (a >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

// ─── Polje za unos broja: commit na blur da tipkanje ne okida sync ───────────
function NumField({ label, value, onCommit, suffix, step }) {
  return (
    <label className="lt-field">
      <span className="lt-field-label">{label}</span>
      <span className="lt-field-input">
        <input
          type="number"
          step={step || 'any'}
          defaultValue={value ?? ''}
          onBlur={e => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            if (v !== value) onCommit(v);
          }}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        />
        {suffix && <span className="lt-field-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

// ─── Hero: neto raspoloživo vs cilj ─────────────────────────────────────────
function LTHero({ t, lt }) {
  const gap = t.net - t.goalTotal;
  const ok = gap >= 0;
  const pct = t.goalTotal > 0 ? Math.round((t.net / t.goalTotal) * 100) : 0;

  return (
    <div className="card hero-card">
      <div className="hero-label">Neto raspoloživo do {lt.ageEnd}. godine</div>
      <div className="hero-value">{fmtEUR(t.net)}</div>
      <div className="hero-sub">cilj {fmtEUR(t.goalTotal)} · {pct}% pokriveno</div>
      <div>
        <span className={'hero-status ' + (ok ? 'good' : 'bad')}>
          {ok ? '+' + fmtEUR(gap) + ' viška' : fmtEUR(Math.abs(gap)) + ' manjka'}
        </span>
      </div>
    </div>
  );
}

// ─── Razrada po stavkama ────────────────────────────────────────────────────
function LTBreakdown({ t, lt, years }) {
  const income = [
    {
      name: 'Plaća (osnovica)',
      v: t.salaryBase,
      sub: fmtEUR(lt.salary.monthly) + '/mj × 12 × ' + years + ' god',
    },
    {
      name: 'Projicirano povećanje plaće',
      v: t.salaryRaise,
      sub: '+' + fmtEUR(lt.raise.total) + '/mj kroz ' + raiseSteps(lt.raise) + ' koraka, do ' + lt.raise.lastAge + '. god',
    },
    {
      name: 'Bonusi',
      v: t.bonusTotal,
      sub: fmtEUR(lt.salary.bonusAnnual) + ' godišnje',
    },
    {
      name: 'Prinos trezorskih zapisa',
      v: t.interestTotal,
      sub: 'uloženo ' + fmtEUR(t.invContributed) + ' → saldo ' + fmtEUR(t.invBalance),
    },
    {
      name: 'Jednokratni prihodi',
      v: t.oneOffTotal,
      sub: lt.oneOffs.length + ' stavki',
    },
  ];
  if (t.oneOffInvestDetails.length > 0) {
    income.push({
      name: 'Prinos od uloženih jednokratnih prihoda',
      v: t.oneOffInvestInterestTotal,
      sub: t.oneOffInvestDetails.map(d => d.name).join(', '),
    });
  }

  return (
    <div className="card">
      <div className="card-title"><h2>Razrada po stavkama</h2><span className="muted">{years} god</span></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Stavka</th><th className="num">Iznos</th></tr>
          </thead>
          <tbody>
            {t.startBalance !== 0 && (
              <>
                <tr className="group-row"><td colSpan={2}>Polazište</td></tr>
                <tr>
                  <td className="cat-name">
                    Početno stanje
                    <div className="lt-row-sub">
                      {lt.startBalanceFrom
                        ? 'procjena kraja ' + lt.startBalanceFrom.year + '. · preuzeto ' + lt.startBalanceFrom.date
                        : 'ručno upisano'}
                    </div>
                  </td>
                  <td className="num pos">{fmtEUR(t.startBalance)}</td>
                </tr>
              </>
            )}
            <tr className="group-row"><td colSpan={2}>Prihodi</td></tr>
            {income.map((r, i) => (
              <tr key={i}>
                <td className="cat-name">{r.name}<div className="lt-row-sub">{r.sub}</div></td>
                <td className="num pos">{fmtEUR(r.v)}</td>
              </tr>
            ))}
            <tr className="lt-total-row">
              <td><b>Ukupno prihodi</b></td>
              <td className="num pos"><b>{fmtEUR(t.incomeTotal)}</b></td>
            </tr>

            <tr className="group-row"><td colSpan={2}>Troškovi</td></tr>
            {lt.annualExpenses.map(e => (
              <tr key={e.id}>
                <td className="cat-name">{e.name}<div className="lt-row-sub">{fmtEUR(e.amount)} godišnje</div></td>
                <td className="num neg">{fmtEUR((e.amount || 0) * years)}</td>
              </tr>
            ))}
            <tr className="lt-total-row">
              <td><b>Ukupno troškovi</b></td>
              <td className="num neg"><b>{fmtEUR(t.expenseTotal)}</b></td>
            </tr>

            <tr className="lt-grand-row">
              <td><b>NETO RASPOLOŽIVO</b></td>
              <td className={'num ' + (t.net >= 0 ? 'pos' : 'neg')}><b>{fmtEUR(t.net)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Graf akumulacije kapitala ──────────────────────────────────────────────
function LTChart({ rows, goalTimeline }) {
  if (rows.length === 0) return null;
  const W = 700, H = 280;
  const pad = { l: 52, r: 16, t: 14, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const caps = rows.map(r => r.capital);
  const goalMax = goalTimeline.length ? goalTimeline[goalTimeline.length - 1].cumulative : 0;
  const maxV = Math.max(...caps, goalMax, 0);
  const minV = Math.min(...caps, 0);
  const range = maxV - minV || 1;
  const yMax = maxV + range * 0.06;
  const yMin = minV;

  const a0 = rows[0].age;
  const a1 = rows[rows.length - 1].age;
  const xOf = age => pad.l + ((age - a0) / Math.max(a1 - a0, 1)) * innerW;
  const yOf = v => pad.t + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const path = rows
    .map((r, i) => (i === 0 ? 'M' : 'L') + xOf(r.age).toFixed(1) + ',' + yOf(r.capital).toFixed(1))
    .join(' ');

  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const val = yMin + (yMax - yMin) * (i / 4);
    const y = yOf(val);
    grid.push(
      <g key={i}>
        <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#e2e8f0" strokeWidth="1" />
        <text x={pad.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#64748b">{fmtShort(val)}</text>
      </g>
    );
  }

  const goalLines = goalTimeline.map((g, i) => {
    if (g.cumulative > yMax) return null;
    const y = yOf(g.cumulative);
    return (
      <g key={'g' + i}>
        <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,4" opacity="0.7" />
        <text x={W - pad.r} y={y - 4} textAnchor="end" fontSize="9" fill="#b45309">{g.name}</text>
        {g.reachedAge !== null && (
          <circle cx={xOf(g.reachedAge)} cy={y} r="4" fill="#f59e0b" stroke="white" strokeWidth="1.5" />
        )}
      </g>
    );
  });

  const step = rows.length > 12 ? 4 : 2;
  const xLabels = rows
    .filter((_, i) => i % step === 0 || i === rows.length - 1)
    .map((r, i) => (
      <text key={i} x={xOf(r.age)} y={H - pad.b + 14} textAnchor="middle" fontSize="10" fill="#64748b">{r.age}</text>
    ));

  return (
    <div className="card">
      <div className="card-title"><h2>Akumulacija kapitala po dobi</h2></div>
      <div className="chart-wrap">
        <svg className="chart" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet">
          {grid}
          {goalLines}
          <path d={path} fill="none" stroke="#0f766e" strokeWidth="2.5" />
          {xLabels}
        </svg>
      </div>
      <div className="chart-legend">
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#0f766e' }}></span>Kumulativni kapital</span>
        <span className="legend-item"><span className="legend-swatch" style={{ background: '#f59e0b' }}></span>Prag cilja</span>
      </div>
    </div>
  );
}

// ─── Prinos od uloženih jednokratnih prihoda ─────────────────────────────────
function LTOneOffInvest({ details, rate }) {
  if (details.length === 0) return null;
  const totalAmount = details.reduce((s, d) => s + d.amount, 0);
  const totalFV = details.reduce((s, d) => s + d.fv, 0);
  const totalInterest = details.reduce((s, d) => s + d.interest, 0);

  return (
    <div className="card">
      <div className="card-title">
        <h2>Ulaganje jednokratnih prihoda</h2>
        <span className="muted">trezorski zapisi, {rate}%</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stavka</th><th className="num">Ulog</th><th className="num">Dob</th>
              <th className="num">Godina rasta</th><th className="num">Vrijednost na kraju</th><th className="num">Prinos</th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => (
              <tr key={d.id}>
                <td className="cat-name">{d.name}</td>
                <td className="num">{fmtEUR(d.amount)}</td>
                <td className="num">{d.age}</td>
                <td className="num">{d.years}</td>
                <td className="num">{fmtEUR(d.fv)}</td>
                <td className="num pos">+{fmtEUR(d.interest)}</td>
              </tr>
            ))}
            <tr className="lt-total-row">
              <td><b>Ukupno</b></td>
              <td className="num"><b>{fmtEUR(totalAmount)}</b></td>
              <td></td><td></td>
              <td className="num"><b>{fmtEUR(totalFV)}</b></td>
              <td className="num pos"><b>+{fmtEUR(totalInterest)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Kad je koji cilj dostižan ──────────────────────────────────────────────
function LTGoals({ goalTimeline, untimedCount }) {
  return (
    <div className="card">
      <div className="card-title"><h2>Kad si što možeš priuštiti</h2></div>
      {untimedCount > 0 && (
        <div className="br-note" style={{ marginBottom: 10 }}>
          {untimedCount} jednokratnih prihoda nema upisanu dob — računaju se u zadnjoj godini,
          pa ciljevi izgledaju dostižni kasnije nego što stvarno jesu. Upiši dob u postavkama ispod.
        </div>
      )}
      <ul className="deviations">
        {goalTimeline.map((g, i) => (
          <li key={g.id}>
            <div>
              <div className="dev-name">{i + 1}. {g.name}</div>
              <div className="dev-detail">{fmtEUR(g.amount)} · kumulativno {fmtEUR(g.cumulative)}</div>
            </div>
            <div className={'dev-value ' + (g.reachedAge !== null ? 'pos' : 'neg')}>
              {g.reachedAge !== null ? g.reachedAge + '. god' : 'izvan dosega'}
            </div>
          </li>
        ))}
      </ul>
      <div className="lt-row-sub" style={{ marginTop: 10 }}>
        Redoslijed = prioritet. Promijeni ga u postavkama ispod, u listi Ciljevi.
      </div>
    </div>
  );
}

// ─── Uredive liste ──────────────────────────────────────────────────────────
// Sve izmjene idu kroz setLT(updater) da rade nad svjezim stanjem — inace
// brzo tabanje kroz polja izgubi ranije unose.
function EditableList({ items, listKey, setLT, withAge, withInvest, reorderable, ageRange, investRate }) {
  const edit = fn => setLT(cur => ({ ...cur, [listKey]: fn(cur[listKey] || []) }));
  function upd(id, patch) { edit(list => list.map(it => (it.id === id ? { ...it, ...patch } : it))); }
  function del(id) { edit(list => list.filter(it => it.id !== id)); }
  function add() {
    edit(list => [...list, { id: uidLT(), name: 'Nova stavka', amount: 0, ...(withAge ? { age: null } : {}), ...(withInvest ? { invest: false } : {}) }]);
  }
  function move(idx, dir) {
    edit(list => {
      const next = list.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return list;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  return (
    <div className="lt-list-block">
      {items.map((it, idx) => {
        const hasAge = it.age !== null && it.age !== undefined && it.age !== '';
        return (
          <div key={it.id} className="lt-list-row">
            {reorderable && (
              <span className="lt-reorder">
                <button className="lt-reorder-btn" disabled={idx === 0} onClick={() => move(idx, -1)}>▲</button>
                <button className="lt-reorder-btn" disabled={idx === items.length - 1} onClick={() => move(idx, 1)}>▼</button>
              </span>
            )}
            <input
              className="lt-name-input"
              defaultValue={it.name}
              onBlur={e => { if (e.target.value !== it.name) upd(it.id, { name: e.target.value }); }}
            />
            <input
              className="lt-amt-input"
              type="number"
              defaultValue={it.amount}
              onBlur={e => upd(it.id, { amount: Number(e.target.value) || 0 })}
            />
            {withAge && (
              <input
                className="lt-age-input"
                type="number"
                placeholder="dob"
                min={ageRange[0]}
                max={ageRange[1]}
                defaultValue={it.age ?? ''}
                onBlur={e => upd(it.id, { age: e.target.value === '' ? null : Number(e.target.value) })}
              />
            )}
            {withInvest && (
              <label className={'lt-invest-toggle' + (!hasAge ? ' disabled' : '')} title={hasAge ? 'Uloži u trezorske zapise (' + investRate + '%) od dobi prodaje do umirovljenja' : 'Upiši dob da bi mogao/mogla uložiti'}>
                <input
                  type="checkbox"
                  disabled={!hasAge}
                  checked={!!it.invest && hasAge}
                  onChange={e => upd(it.id, { invest: e.target.checked })}
                />
                <span>Uloži</span>
              </label>
            )}
            <button className="btn ghost small lt-del" onClick={() => del(it.id)}>✕</button>
          </div>
        );
      })}
      {items.length === 0 && <div className="hero-empty">Nema stavki.</div>}
      <button className="btn ghost small" onClick={add}>+ Dodaj stavku</button>
    </div>
  );
}

// ─── Postavke ───────────────────────────────────────────────────────────────
function LTSettings({ lt, setLT, baseYear, baseProjection }) {
  const set = patch => setLT(cur => ({ ...cur, ...patch }));
  const setN = (key, patch) => setLT(cur => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  const ageRange = [lt.ageNow + 1, lt.ageEnd];
  const steps = raiseSteps(lt.raise);

  function takeFromYear() {
    if (baseProjection === null) return;
    set({
      startBalance: Math.round(baseProjection),
      startBalanceFrom: { year: baseYear, date: new Date().toLocaleDateString('hr-HR') },
    });
  }

  return (
    <details className="advanced-details">
      <summary className="advanced-summary">Postavke projekcije</summary>

      <div className="card">
        <div className="card-title"><h2>Polazište</h2></div>
        <div className="lt-fields">
          <NumField
            label="Početno stanje"
            value={lt.startBalance || 0}
            onCommit={v => set({ startBalance: v || 0, startBalanceFrom: null })}
            suffix="EUR"
          />
        </div>
        {baseProjection === null ? (
          <div className="br-note" style={{ marginTop: 10 }}>
            Nema podataka za {baseYear}. — upiši početno stanje ručno.
          </div>
        ) : (
          <>
            <button className="btn secondary small" style={{ marginTop: 10 }} onClick={takeFromYear}>
              Preuzmi iz projekcije {baseYear}. ({fmtEUR(baseProjection)})
            </button>
            <div className="lt-row-sub" style={{ marginTop: 8 }}>
              Kopira procjenu stanja na 31.12.{baseYear}. kao polazište. Snapshot, ne živa veza —
              projekcija se ne miče dok opet ne pritisneš. Projekcija kreće od {baseYear + 1}., pa se
              s {baseYear}. ne preklapa.
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title"><h2>Razdoblje i plaća</h2></div>
        <div className="lt-fields">
          <NumField label="Trenutna dob" value={lt.ageNow} onCommit={v => set({ ageNow: v })} />
          <NumField label="Dob umirovljenja" value={lt.ageEnd} onCommit={v => set({ ageEnd: v })} />
          <NumField label="Mjesečna plaća" value={lt.salary.monthly} onCommit={v => setN('salary', { monthly: v })} suffix="EUR" />
          <NumField label="Godišnji bonus" value={lt.salary.bonusAnnual} onCommit={v => setN('salary', { bonusAnnual: v })} suffix="EUR" />
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Povećanje plaće</h2>
          <span className="muted">{steps} koraka × {fmtEUR(lt.raise.total / Math.max(steps, 1))}</span>
        </div>
        <div className="lt-fields">
          <NumField label="Ukupno povećanje" value={lt.raise.total} onCommit={v => setN('raise', { total: v })} suffix="EUR/mj" />
          <NumField label="Korak (godina)" value={lt.raise.stepYears} onCommit={v => setN('raise', { stepYears: v })} />
          <NumField label="Prvo povećanje u dobi" value={lt.raise.firstAge} onCommit={v => setN('raise', { firstAge: v })} />
          <NumField label="Zadnje u dobi" value={lt.raise.lastAge} onCommit={v => setN('raise', { lastAge: v })} />
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>Trezorski zapisi</h2></div>
        <div className="lt-fields">
          <NumField label="Početni ulog" value={lt.investment.initial} onCommit={v => setN('investment', { initial: v })} suffix="EUR" />
          <NumField label="Godišnja doplata" value={lt.investment.annualAdd} onCommit={v => setN('investment', { annualAdd: v })} suffix="EUR" />
          <NumField label="Godišnji prinos" value={lt.investment.rate} onCommit={v => setN('investment', { rate: v })} suffix="%" />
        </div>
        <div className="lt-row-sub" style={{ marginTop: 8 }}>
          Kamata se svake godine reinvestira zajedno s doplatom, pa je prinos jedini novi novac.
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>Jednokratni prihodi</h2></div>
        <EditableList items={lt.oneOffs} listKey="oneOffs" setLT={setLT} withAge withInvest ageRange={ageRange} investRate={lt.investment.rate} />
        <div className="lt-row-sub" style={{ marginTop: 8 }}>
          Treće polje je dob u kojoj očekuješ prihod. Bez nje se računa u zadnjoj godini.
          "Uloži" znači: umjesto da taj novac samo uđe u kapital, uloži se u trezorske zapise
          i raste po istoj stopi kao ulaganja gore, sve do umirovljenja.
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>Godišnji troškovi</h2></div>
        <EditableList items={lt.annualExpenses} listKey="annualExpenses" setLT={setLT} />
      </div>

      <div className="card">
        <div className="card-title"><h2>Ciljevi</h2></div>
        <EditableList items={lt.goals} listKey="goals" setLT={setLT} reorderable />
        <div className="lt-row-sub" style={{ marginTop: 8 }}>
          Redoslijed je prioritet ispunjavanja — strelicama promijeni koji cilj dolazi na red prvi.
        </div>
      </div>
    </details>
  );
}

// ─── Stranica ───────────────────────────────────────────────────────────────
export default function MirovinaPage() {
  const { state, updateState } = useApp();
  const lt = state.longTerm || defaultLongTerm();
  // Projekcija krece od ageNow+1, sto je iduca kalendarska godina.
  // Polaziste je zato uvijek tekuca godina, ne ona odabrana u izborniku.
  const baseYear = new Date().getFullYear();
  const baseProjection = projectionForYear(state, baseYear);
  const setLT = updater => updateState(prev => {
    const cur = prev.longTerm || defaultLongTerm();
    return { ...prev, longTerm: typeof updater === 'function' ? updater(cur) : updater };
  });

  if (!(lt.ageEnd > lt.ageNow)) {
    return (
      <section>
        <div className="card">
          <div className="card-title"><h2>Projekcija do mirovine</h2></div>
          <div className="hero-empty">Dob umirovljenja mora biti veća od trenutne dobi.</div>
        </div>
        <LTSettings lt={lt} setLT={setLT} baseYear={baseYear} baseProjection={baseProjection} />
      </section>
    );
  }

  const proj = projectLongTerm(lt);
  const t = proj.totals;

  return (
    <section>
      <LTHero t={t} lt={lt} />
      <LTBreakdown t={t} lt={lt} years={proj.ages.length} />
      <LTOneOffInvest details={t.oneOffInvestDetails} rate={lt.investment.rate} />
      <LTChart rows={proj.rows} goalTimeline={proj.goalTimeline} />
      <LTGoals goalTimeline={proj.goalTimeline} untimedCount={t.untimedCount} />
      <LTSettings lt={lt} setLT={setLT} baseYear={baseYear} baseProjection={baseProjection} />
    </section>
  );
}
