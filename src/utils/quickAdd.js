import { currentMonthIdx, activeBillingMonth } from './finance.js';

export const QA_SYNONYMS = {
  'struja': ['hep'],
  'voda': ['vodovod', 'vik'],
  'internet': ['a1', 'iskon', 'optima', 'magenta', 'telemach', 't-com'],
  'plin': ['gradska plinara', 'plinara'],
  'hrt': ['rtv', 'pristojba'],
  'pricuva': ['pričuva'],
  'smeca': ['smeće', 'smece', 'cistoca', 'cistoća', 'odvoz'],
  'komunalna': ['komunalno', 'naknada'],
  'gorivo': ['benzin', 'dizel', 'ina', 'omv', 'tifon', 'crodux', 'lukoil'],
  'placa': ['plaća', 'isplata place'],
  'bonus': ['nagrada', 'bonusa'],
  'putni': ['nalog', 'naloga', 'putni nalozi'],
  'regres': ['regresa'],
  'bozicnica': ['božićnica'],
  'dar': ['djecu'],
  'skijanje': ['ski', 'skije'],
  'putovanje': ['put', 'apartman', 'hotel', 'avion', 'aerodrom'],
  'restoran': ['rucak', 'ručak', 'vecera', 'večera', 'kafic', 'kafić'],
  'kava': ['cappuccino', 'espresso'],
  'hrana': ['konzum', 'lidl', 'plodine', 'tommy', 'spar', 'kaufland', 'metro', 'trgovina', 'trznica', 'tržnica', 'rucak', 'spiza'],
  'apoteka': ['ljekarna', 'lijek', 'farmacia'],
  'auto': ['servis', 'gume', 'registracija auta', 'akumulator']
};

export function detectTargetMonths(lower) {
  if (/svaki\s+mjesec|sve\s+mjesece|za\s+sve\s+mjesece|mjeseč?no/i.test(lower))
    return [0,1,2,3,4,5,6,7,8,9,10,11];
  const fromMatch = lower.match(/od\s+(\d{1,2})\.?\s*mjes/);
  if (fromMatch) {
    const start = parseInt(fromMatch[1]) - 1;
    if (start >= 0 && start < 12) {
      const arr = [];
      for (let m = start; m < 12; m++) arr.push(m);
      return arr;
    }
  }
  const inMatch = lower.match(/(?:u|za)\s+(\d{1,2})\.?\s*mjes/);
  if (inMatch) {
    const m = parseInt(inMatch[1]) - 1;
    if (m >= 0 && m < 12) return [m];
  }
  const monthMap = [
    ['siječ','sije'], ['velj'], ['ožuj','ozuj','ozu'], ['travn','travanj','trav'],
    ['svibn','svibanj'], ['lipn','lipanj','lipa'], ['srpn','srpanj','srpa'],
    ['kolov','kolovoz'], ['rujn','rujan'], ['listopa','listopad'],
    ['studen'], ['prosinc','prosin']
  ];
  for (let i = 0; i < monthMap.length; i++) {
    if (monthMap[i].some(k => lower.includes(k))) return [i];
  }
  return null;
}

export function parseQuickAdd(text, state) {
  text = (text || '').trim();
  if (!text) return { error: 'Prazan unos' };
  const m = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return { error: 'Nisam pronasao iznos. Probaj npr. "Struja 87"' };
  const amount = parseFloat(m[1].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return { error: 'Neispravan iznos' };
  const lower = text.toLowerCase();
  const plannedKw = ['planiram', 'dodaj plan', 'plan ', 'za sve mjesece', 'svaki mjesec', 'mjesečno', 'mjesecno', 'očekujem', 'ocekujem', 'planirano', 'planiraj', 'od ', 'povecaj plan', 'povecaj plac', 'povecaj plaću', 'povećaj plaću'];
  const isPlanned = plannedKw.some(kw => lower.includes(kw));
  const incomeKw = ['plaća','placa','plaću','placu','primio','primila','uplata','isplata','bonus','regres','božićnica','bozicnica','putni nalog','putni nalozi','honorar','nagrada','dar za djecu'];
  const isIncome = incomeKw.some(kw => lower.includes(kw));
  const type = isIncome ? 'income' : 'expense';
  let bestCat = null, bestScore = 0;
  for (const cat of state.categories[type]) {
    const cl = cat.name.toLowerCase();
    cl.split(/\s+/).forEach(w => {
      if (w.length > 2 && lower.includes(w) && w.length > bestScore) { bestCat = cat; bestScore = w.length; }
    });
    for (const [key, syns] of Object.entries(QA_SYNONYMS)) {
      if (cl.includes(key) || key.includes(cl.split(/\s+/)[0])) {
        for (const s of syns) {
          if (s.length > 2 && lower.includes(s) && s.length > bestScore) { bestCat = cat; bestScore = s.length; }
        }
      }
    }
  }
  if (!bestCat) bestCat = state.categories[type].find(c => /ostalo/i.test(c.name) || /redovni/i.test(c.name)) || state.categories[type][0];
  if (!bestCat) return { error: 'Nema kategorija. Dodaj ih u Postavkama.' };
  const months = isPlanned ? (detectTargetMonths(lower) || [0,1,2,3,4,5,6,7,8,9,10,11]) : null;

  // Za actual unose: pokušaj parsirati naziv mjeseca iz teksta,
  // inače koristi activeBillingMonth (prethodni do 15., tekući od 16.)
  let month = activeBillingMonth(state);
  if (!isPlanned) {
    const detected = detectTargetMonths(lower);
    if (detected && detected.length === 1) month = detected[0];
  }

  return {
    mode: isPlanned ? 'planned' : 'actual',
    amount,
    type,
    catId: bestCat.id,
    catName: bestCat.name,
    month,
    months,
    label: text
  };
}
