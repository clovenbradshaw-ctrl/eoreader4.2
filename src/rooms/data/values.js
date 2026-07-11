// EO: EVA·DEF(Field → Lens, Binding,Dissecting) — cell value / money / date parsing
// data/values.js — reading a raw table cell as the QUANTITY it names, not the string it is.
//
// A tabular column is only computable once its cells are read as values, and real exports
// spell the same figure a dozen ways: "$410k", "410000", "USD 98,000", "£180k",
// "EUR 85,000", "85000 EUR", and "$275k (down from $310k, they de-scoped)". A naive
// strip-the-non-digits (the shape query.js used to carry) turns "$410k" into 410 and the
// de-scoped note into 275310 — both silently wrong. This module reads a cell the way a
// person does: the FIRST monetary figure, its magnitude suffix (k/m/bn), and its currency,
// so a sum can be honest about what it added and refuse to blend three currencies into one
// meaningless number. Pure and dependency-free — the same reading in the browser and in a
// Node test.

// Currency symbols and the ISO codes we recognise, both directions.
const SYMBOL_CCY = { '$': 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR' };
export const CCY_SYMBOL = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', INR: '₹', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', NZD: 'NZ$' };
const CODES = ['USD', 'GBP', 'EUR', 'JPY', 'INR', 'CAD', 'AUD', 'CHF', 'NZD'];
const CODE_RE = CODES.join('|');

// Magnitude words/suffixes → the multiplier they scale the figure by.
const MAGNITUDE = {
  k: 1e3, thousand: 1e3, thousands: 1e3,
  m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, millions: 1e6,
  b: 1e9, bn: 1e9, billion: 1e9, billions: 1e9,
};

// One monetary figure: an optional leading symbol/code, a number (thousands-grouped or
// decimal), an optional magnitude suffix, and an optional trailing code. Anchored to the
// FIRST such figure in the cell so a "(down from …)" aside never joins the primary value.
const AMOUNT_RE = new RegExp(
  '(?:(' + CODE_RE + ')\\s*)?' +           // leading ISO code  (USD 98,000)
  '([$£€¥₹])?\\s*' +                       // leading symbol    ($410k)
  '(\\d[\\d,]*(?:\\.\\d+)?)' +             // the number        (410 / 98,000 / 410000)
  '\\s*(k|kk|mm|mn|bn|b|m|thousand[s]?|million[s]?|billion[s]?)?' +  // magnitude (k/m/bn)
  '(?:\\s*(' + CODE_RE + '))?',            // trailing ISO code (85000 EUR)
  'i',
);

const ISO_DATE_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/;

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export const monthNumber = (word) => MONTHS[String(word || '').toLowerCase().replace(/[^a-z]/g, '')] || null;

// Read a cell as a DATE — ISO (2025-04-12) or a written "12 January 2025" / "January 12,
// 2025". Returns a sortable YYYYMMDD integer + the ISO string, or null. Strict: it must be
// the WHOLE cell, so a stray year inside prose does not read as a date.
export const parseDate = (raw) => {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  let y, m, d;
  const iso = s.match(ISO_DATE_RE);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else {
    // "12 January 2025" or "January 12, 2025" / "Jan 2025"
    const dmy = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/);
    const mdy = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    const my  = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
    if (dmy)      { d = +dmy[1]; m = monthNumber(dmy[2]); y = +dmy[3]; }
    else if (mdy) { m = monthNumber(mdy[1]); d = +mdy[2]; y = +mdy[3]; }
    else if (my)  { m = monthNumber(my[1]); d = 1; y = +my[2]; }
    else return null;
  }
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { value: y * 10000 + m * 100 + d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, y, m, d, raw: s };
};

// Read a cell as a monetary/numeric AMOUNT. Returns { value, currency, magnitude, raw } or
// null. A cell that is wholly a date is NOT an amount (so a date column never reads numeric).
export const parseAmount = (raw) => {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  if (parseDate(s)) return null;                 // a date is not an amount
  const m = s.match(AMOUNT_RE);
  if (!m || !m[3]) return null;
  const num = parseFloat(m[3].replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  const mag = m[4] ? (MAGNITUDE[m[4].toLowerCase()] || 1) : 1;
  const code = (m[1] || m[5] || '').toUpperCase() || null;
  const currency = code || (m[2] ? SYMBOL_CCY[m[2]] : null) || null;
  return { value: num * mag, currency, magnitude: mag, raw: s };
};

// The plain numeric reading of a cell (the amount's value), or null.
export const parseNumber = (raw) => { const a = parseAmount(raw); return a ? a.value : null; };

// A bare number written in NL — "200k", "1.5m", "$300,000", "over 250000" — reduced to its
// value. Used by the filter parser for comparisons ("arr over 200k").
export const numberInText = (text) => {
  const a = parseAmount(text);
  return a ? a.value : null;
};

// Read a whole COLUMN's values and decide what kind of column it is, so the engine knows
// which columns it may sum/average (money/number), which it may sort chronologically
// (date), and which are categorical (the filter surface). `currency` is the column's
// dominant currency when it is money; `mixed` is true when its cells span more than one.
export const classifyColumn = (values) => {
  const cells = (values || []).map((v) => String(v == null ? '' : v)).filter((v) => v.trim() !== '');
  if (!cells.length) return { kind: 'empty' };
  let dates = 0, amounts = 0, withCcy = 0;
  const ccyCount = new Map();
  for (const c of cells) {
    if (parseDate(c)) { dates++; continue; }
    const a = parseAmount(c);
    if (a) {
      amounts++;
      if (a.currency) { withCcy++; ccyCount.set(a.currency, (ccyCount.get(a.currency) || 0) + 1); }
    }
  }
  const n = cells.length;
  if (dates >= n * 0.6) return { kind: 'date' };
  if (amounts >= n * 0.6) {
    if (withCcy > 0) {
      const ranked = [...ccyCount.entries()].sort((a, b) => b[1] - a[1]);
      return { kind: 'money', currency: ranked[0][0], mixed: ranked.length > 1, currencies: ranked.map((r) => r[0]) };
    }
    return { kind: 'number' };
  }
  return { kind: 'categorical' };
};

// Group a set of parsed amounts by currency (null currency folded into the sole named
// currency when there is exactly one — a single-currency column that just omits the symbol
// on some rows). Returns { byCurrency: Map, mixed, order:[currency…] }.
export const groupByCurrency = (amounts) => {
  const named = new Set(amounts.map((a) => a.currency).filter(Boolean));
  const soleCurrency = named.size === 1 ? [...named][0] : null;
  const byCurrency = new Map();
  for (const a of amounts) {
    const ccy = a.currency || soleCurrency || '—';
    if (!byCurrency.has(ccy)) byCurrency.set(ccy, []);
    byCurrency.get(ccy).push(a);
  }
  return { byCurrency, mixed: byCurrency.size > 1, order: [...byCurrency.keys()] };
};

// A grouped-number → a readable string. "$275,000", "£180,000", "85,000 EUR" (trailing code
// when the currency has no short symbol), or a bare grouped number when currency is unknown.
export const formatMoney = (value, currency) => {
  const grouped = formatGroup(value);
  if (!currency || currency === '—') return grouped;
  const sym = CCY_SYMBOL[currency];
  if (!sym) return `${grouped} ${currency}`;
  return sym.endsWith(' ') ? `${sym}${grouped}` : `${sym}${grouped}`;
};

// Group digits with thousands separators, keeping any fractional part; integers print whole.
export const formatGroup = (value) => {
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const [int, frac] = String(Number.isInteger(abs) ? abs : Math.round(abs * 100) / 100).split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg + withSep + (frac ? '.' + frac : '');
};
