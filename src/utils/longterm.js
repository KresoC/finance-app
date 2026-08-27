// ─── Dugoročna projekcija do mirovine ────────────────────────────────────────
// Odvojeno od godišnjeg praćenja: ne veže se na kalendarsku godinu nego na dob.

export function uidLT() {
  return 'lt-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export function defaultLongTerm() {
  return {
    ageNow: 42,
    ageEnd: 65,
    // Polaziste projekcije: procijenjeno stanje na kraju godine prije prve
    // projicirane. Snapshot, ne ziva veza — rebasa se rucno gumbom.
    startBalance: 0,
    startBalanceFrom: null, // { year, date }
    salary: { monthly: 2924, bonusAnnual: 5000 },
    // Povećanje plaće: total se dijeli na korake, zadnji korak pada u lastAge
    raise: { total: 1000, stepYears: 2, firstAge: 45, lastAge: 63 },
    investment: { initial: 30000, annualAdd: 10000, rate: 2 },
    oneOffs: [
      { id: 'lt-o1', name: 'Prodaja stana Gajnice',   amount: 100000, age: null, invest: false },
      { id: 'lt-o2', name: 'Prodaja vikendice Lika',  amount: 100000, age: null, invest: false },
      { id: 'lt-o3', name: 'Prodaja stana Zaprešić',  amount: 300000, age: null, invest: false },
      { id: 'lt-o4', name: 'Iva ušteđevina',          amount:  50000, age: null, invest: false },
      { id: 'lt-o5', name: 'Ušteđevina za djecu',     amount:  20000, age: null, invest: false },
      { id: 'lt-o6', name: 'Ušteđevina roditelji',    amount:  10000, age: null, invest: false },
      { id: 'lt-o7', name: 'Iva dodatno',             amount:  20000, age: null, invest: false },
    ],
    annualExpenses: [
      { id: 'lt-e1', name: 'Putovanja',        amount: 9000 },
      { id: 'lt-e2', name: 'Redovni godišnji', amount: 7800 },
      { id: 'lt-e3', name: 'Režije',           amount: 3600 },
      { id: 'lt-e4', name: 'Troškovi kartica', amount: 1500 },
      { id: 'lt-e5', name: 'Ulaganja u stan',  amount: 1000 },
    ],
    // Redoslijed = prioritet ispunjavanja — goalTimeline ih zbraja kumulativno
    // ovim redom, pa prvi u listi postaje dostizan prvi.
    goals: [
      { id: 'lt-g4', name: 'Fakultet — dijete 1', amount:  50000 },
      { id: 'lt-g5', name: 'Fakultet — dijete 2', amount:  50000 },
      { id: 'lt-g2', name: 'Stan — dijete 1',     amount: 250000 },
      { id: 'lt-g3', name: 'Stan — dijete 2',     amount: 250000 },
      { id: 'lt-g1', name: 'Kuća',                amount: 500000 },
    ],
  };
}

// Broj koraka povećanja plaće (npr. 45→63 svake 2 god = 10 koraka)
export function raiseSteps(raise) {
  const span = raise.lastAge - raise.firstAge;
  if (span < 0 || raise.stepYears <= 0) return 0;
  return Math.floor(span / raise.stepYears) + 1;
}

// Mjesečno povećanje plaće u danoj dobi (kumulativno)
export function raiseAtAge(raise, age) {
  const steps = raiseSteps(raise);
  if (steps === 0 || age < raise.firstAge) return 0;
  const perStep = raise.total / steps;
  const reached = Math.min(Math.floor((age - raise.firstAge) / raise.stepYears) + 1, steps);
  return reached * perStep;
}

// Glavni izračun — vraća godišnji hod i zbrojeve po stavkama
export function projectLongTerm(lt) {
  const ages = [];
  for (let a = lt.ageNow + 1; a <= lt.ageEnd; a++) ages.push(a);

  const annualExpTotal = lt.annualExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const untimed = lt.oneOffs.filter(o => o.age === null || o.age === undefined || o.age === '');

  let invBalance = 0, invContributed = 0;
  const startBalance = lt.startBalance || 0;
  let capital = startBalance;
  const rows = [];
  let salaryBase = 0, salaryRaise = 0, bonusTotal = 0, oneOffTotal = 0, interestTotal = 0;

  // Jednokratni prihodi oznaceni "uloži do umirovljenja": svaki ima svoj saldo
  // koji raste po istoj stopi kao trezorski zapisi, od godine nakon prodaje do
  // ageEnd. Rast pocinje SLJEDECE godine (ne iste kad je prodano) da FV
  // odgovara tocno (ageEnd - dobProdaje) razdoblja rasta.
  const investRate = (lt.investment.rate || 0) / 100;
  const oneOffInvestBalances = {};
  let oneOffInvestInterestTotal = 0;

  ages.forEach((age, i) => {
    const base  = (lt.salary.monthly || 0) * 12;
    const extra = raiseAtAge(lt.raise, age) * 12;
    const bonus = lt.salary.bonusAnnual || 0;

    // Trezorski zapisi: prva godina početni ulog, dalje godišnja doplata.
    // Kamata se reinvestira — prinos je jedini "novi" novac.
    const contribution = i === 0 ? (lt.investment.initial || 0) : (lt.investment.annualAdd || 0);
    invContributed += contribution;
    const interest = (invBalance + contribution) * investRate;
    invBalance = invBalance + contribution + interest;

    // Rast postojecih uloga PRIJE dodavanja novih prodanih ove godine
    let oneOffInvestInterestThisYear = 0;
    Object.keys(oneOffInvestBalances).forEach(id => {
      const grown = oneOffInvestBalances[id] * investRate;
      oneOffInvestBalances[id] += grown;
      oneOffInvestInterestThisYear += grown;
    });
    oneOffInvestInterestTotal += oneOffInvestInterestThisYear;

    // Jednokratni prihodi koji padaju u ovu dob; netimirani idu u zadnju godinu
    let oneOffThis = lt.oneOffs
      .filter(o => Number(o.age) === age)
      .reduce((s, o) => s + (o.amount || 0), 0);
    if (age === lt.ageEnd) oneOffThis += untimed.reduce((s, o) => s + (o.amount || 0), 0);

    // Registriraj nove uloge — pocinju rasti od sljedece godine
    lt.oneOffs.forEach(o => {
      if (o.invest && Number(o.age) === age) oneOffInvestBalances[o.id] = o.amount || 0;
    });

    const income = base + extra + bonus + interest + oneOffThis + oneOffInvestInterestThisYear;
    const net    = income - annualExpTotal;
    capital += net;

    salaryBase    += base;
    salaryRaise   += extra;
    bonusTotal    += bonus;
    interestTotal += interest;
    oneOffTotal   += oneOffThis;

    rows.push({ age, base, extra, bonus, interest, oneOff: oneOffThis, oneOffInvestInterest: oneOffInvestInterestThisYear, income, expense: annualExpTotal, net, capital, invBalance });
  });

  // Detalji po stavci: konacna vrijednost svakog uloga na ageEnd (saldo iz petlje)
  const oneOffInvestDetails = lt.oneOffs
    .filter(o => o.invest && oneOffInvestBalances[o.id] !== undefined)
    .map(o => {
      const fv = oneOffInvestBalances[o.id];
      return { id: o.id, name: o.name, amount: o.amount || 0, age: Number(o.age), years: lt.ageEnd - Number(o.age), fv, interest: fv - (o.amount || 0) };
    });

  const incomeTotal  = salaryBase + salaryRaise + bonusTotal + interestTotal + oneOffTotal + oneOffInvestInterestTotal;
  const expenseTotal = annualExpTotal * ages.length;
  const goalTotal    = lt.goals.reduce((s, g) => s + (g.amount || 0), 0);

  // Kad je koji cilj dostižan — ciljevi se ispunjavaju redom, kumulativno
  let cum = 0;
  const goalTimeline = lt.goals.map(g => {
    cum += g.amount || 0;
    const hit = rows.find(r => r.capital >= cum);
    return { ...g, cumulative: cum, reachedAge: hit ? hit.age : null };
  });

  return {
    ages, rows, goalTimeline,
    totals: {
      startBalance,
      salaryBase, salaryRaise, bonusTotal, interestTotal, oneOffTotal,
      oneOffInvestInterestTotal, oneOffInvestDetails,
      incomeTotal, expenseTotal, annualExpTotal,
      net: startBalance + incomeTotal - expenseTotal,
      goalTotal,
      invContributed, invBalance,
      untimedCount: untimed.length,
    },
  };
}
