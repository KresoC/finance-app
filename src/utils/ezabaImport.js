import * as XLSX from 'xlsx';

// ── Date helpers ───────────────────────────────────────────────────────────────
function excelSerialToISO(serial) {
  const info = XLSX.SSF.parse_date_code(serial);
  if (!info) return null;
  return `${info.y}-${String(info.m).padStart(2, '0')}-${String(info.d).padStart(2, '0')}`;
}

function parseAnyDate(raw) {
  if (typeof raw === 'number') return excelSerialToISO(raw);
  const s = String(raw || '').trim();
  if (!s) return null;
  // DD.MM.YYYY.
  const dm = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

// ── Merchant extraction ────────────────────────────────────────────────────────
function extractMerchant(opis) {
  // "Kupovina STUDENAC ZAGREB HR KRESIMIR C" → "STUDENAC"
  const m = opis.match(/kupovina\s+(\S+)/i);
  return m ? m[1].toUpperCase() : null;
}

function extractStandingOrderName(opis) {
  // "Trajni nalog ALLIANZ ZAGREB D.O.O." → "ALLIANZ"
  const m = opis.match(/trajni nalog\s+(\S+)/i);
  return m ? m[1].toUpperCase() : null;
}

// ── Classify one transaction ───────────────────────────────────────────────────
export function classifyTransaction(tx, rules, categories) {
  const opis = (tx.opis || '').trim();
  const skip = reason => ({ ...tx, action: 'skip', skipReason: reason });

  // --- auto-skip rules ---
  if (/kreditna kartica/i.test(opis))              return skip('Kreditna kartica');
  if (/naplata obroka/i.test(opis))                return skip('Kreditna kartica - obroci');
  if (/troškovi.*mastercard|troškoviučinjeni/i.test(opis)) return skip('Troškovi mastercard');
  if (/kreditni transfer/i.test(opis))             return skip('Kreditni transfer');
  if (/naknada/i.test(opis))                       return skip('Naknada');
  if (tx.isIncome)                                 return skip('Prihod - unesi ručno');

  // --- ATM ---
  if (/podizanje gotovog novca/i.test(opis)) {
    const redovni = categories.expense.find(c => /redovni/i.test(c.name));
    if (tx.amount <= 50 && redovni) {
      return { ...tx, action: 'auto', merchant: 'BANKOMAT', catId: redovni.id, typeHint: 'atm' };
    }
    return { ...tx, action: 'manual', merchant: 'BANKOMAT', typeHint: 'atm' };
  }

  // --- Trajni nalog ---
  if (/trajni nalog/i.test(opis)) {
    const name  = extractStandingOrderName(opis);
    const catId = name && rules?.standingOrders?.[name];
    if (catId) return { ...tx, action: 'auto',   merchant: name, catId, typeHint: 'standing_order' };
    return       { ...tx, action: 'manual', merchant: name || opis.slice(0, 30), typeHint: 'standing_order' };
  }

  // --- Kupovina ---
  if (/kupovina/i.test(opis)) {
    const merchant = extractMerchant(opis);
    const catId    = merchant && rules?.merchants?.[merchant];
    if (catId) return { ...tx, action: 'auto',   merchant, catId, typeHint: 'merchant' };
    return       { ...tx, action: 'manual', merchant: merchant || opis.slice(0, 30), typeHint: 'merchant' };
  }

  // --- ostalo ---
  return { ...tx, action: 'manual', merchant: opis.slice(0, 40), typeHint: 'other' };
}

// ── Main parser ────────────────────────────────────────────────────────────────
export function parseEzabaXls(arrayBuffer, rules, importedRefs, categories) {
  const wb   = XLSX.read(arrayBuffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Dynamically find header row (look for "Datum" + "Referencia")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const lc = rows[i].map(c => String(c).toLowerCase());
    if (lc.some(c => c.includes('datum')) && lc.some(c => c.includes('referencia'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('Ne mogu pronaći zaglavlje tablice. Provjeri format datoteke.');

  // Map column indices from header row
  const hdr      = rows[headerIdx].map(c => String(c).toLowerCase());
  const iDatum   = hdr.findIndex(c => c.includes('datum'));
  const iRef     = hdr.findIndex(c => c.includes('referencia'));
  const iOpis    = hdr.findIndex(c => c.includes('opis'));
  const iUplata  = hdr.findIndex(c => c.includes('uplata'));
  const iIsplata = hdr.findIndex(c => c.includes('isplata'));

  if ([iDatum, iRef, iOpis, iUplata, iIsplata].some(x => x === -1)) {
    throw new Error('Zaglavlje ne sadrži sve potrebne stupce (Datum, Referencia, Opis, Uplata, Isplata).');
  }

  const refSet = new Set(importedRefs || []);
  const result = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row    = rows[i];
    const ref    = String(row[iRef]  || '').trim();
    const opis   = String(row[iOpis] || '').trim();
    if (!ref || !opis) continue;

    const uplata  = parseFloat(String(row[iUplata]  || '').replace(',', '.')) || 0;
    const isplata = parseFloat(String(row[iIsplata] || '').replace(',', '.')) || 0;
    if (uplata === 0 && isplata === 0) continue;

    const date     = parseAnyDate(row[iDatum]);
    if (!date) continue;

    const isIncome = uplata > 0 && isplata === 0;
    const amount   = isplata > 0 ? isplata : uplata;
    const tx       = { ref, date, opis, amount, isIncome };

    if (refSet.has(ref)) {
      result.push({ ...tx, action: 'skip', skipReason: 'Već uvezeno' });
      continue;
    }

    result.push(classifyTransaction(tx, rules, categories));
  }

  return result;
}
