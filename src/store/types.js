// EO: DEF·SEG(Field → Lens, Dissecting,Unraveling) — value coercion + type inference
//
// The shared coercion floor for the spreadsheet-database engine: one place that
// decides what a cell's number, date, boolean, string, or array reading is, so
// the filter, sort, aggregate, and formula layers all agree. Pure, no DOM.

// ── emptiness ──
export const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

// ── number: money-tolerant (strips currency, thousands separators, units) ──
// A spreadsheet holds "$1,234.56" and "42%"; treat those as numbers so a filter
// or SUM behaves the way a person reading the column expects.
export const toNum = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined || v === null || v === '') return NaN;
  const n = parseFloat(String(v).replace(/[^0-9.eE+-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

// ── time: Date | epoch ms | parseable string → ms since epoch (NaN on failure) ──
export const toTime = (v) => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || v === '') return NaN;
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
};

// ── string / equality ──
export const strOf = (v) => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
export const ciEq = (a, b) => strOf(a).trim().toLowerCase() === strOf(b).trim().toLowerCase();

// ── arrays: an array as-is, or a comma/semicolon-split string (multiselect) ──
export const asArray = (v) => {
  if (Array.isArray(v)) return v.map(strOf);
  if (isEmpty(v)) return [];
  return strOf(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
};
export const asList = (v) => (Array.isArray(v) ? v : [v]);

// ── accent-fold: lowercase, collapse whitespace, strip diacritics ──
// so a text filter for "mexico" matches "México".
export const nfold = (s) =>
  strOf(s).toLowerCase().replace(/[\s_]+/g, ' ').trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

/**
 * Guess a column's type from its values — the same shape a grid needs:
 * 'number' | 'boolean' | 'date' | 'select' | 'text' | 'json'. A small set of
 * distinct string values reads as a 'select' (an enum), a long tail as 'text'.
 */
export function inferType(values) {
  const defined = (values || []).filter((v) => !isEmpty(v));
  if (defined.length === 0) return 'text';
  if (defined.every((v) => typeof v === 'number')) return 'number';
  if (defined.every((v) => typeof v === 'boolean')) return 'boolean';
  if (defined.every((v) => typeof v === 'string')) {
    // Dates BEFORE numbers — money-tolerant toNum would misread "2024-01-01" as 2024.
    if (defined.every((v) => DATE_RE.test(v))) return 'date';
    if (defined.every((v) => !Number.isNaN(toNum(v)))) return 'number';
    const distinct = new Set(defined);
    if (distinct.size <= 5 && distinct.size < defined.length * 0.7) return 'select';
    return 'text';
  }
  // mixed numbers + numeric strings still read as a number column
  if (defined.every((v) => typeof v !== 'boolean' && !Number.isNaN(toNum(v)))) return 'number';
  return 'json';
}

/** Coerce a raw import cell to a typed value (number/boolean/date/text). */
export function coerce(value, type) {
  if (value == null || value === '') return undefined;
  if (type === 'number')  { const n = toNum(value); return Number.isNaN(n) ? value : n; }
  if (type === 'boolean') { return /^(true|yes|y|1)$/i.test(String(value)); }
  if (type === 'date')    { const d = Date.parse(value); return Number.isNaN(d) ? value : new Date(d).toISOString(); }
  return String(value);
}

/** Coerce a value that may already be a JSON scalar/object (import-from-JSON). */
export function coerceValue(value, type) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'object') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return coerce(value, type);
}

/** A human display of a cell — arrays joined, booleans as ✓, objects as JSON. */
export function displayValue(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(displayValue).join(', ');
  if (typeof v === 'boolean') return v ? '✓' : '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
