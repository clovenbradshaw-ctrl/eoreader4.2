// EO: EVA·DEF(Field → Lens, Binding,Dissecting) — read a pulled string as the QUANTITY it names
// dashboard/extract.js — turning the raw text a watch pulled off a page ("$1,240.50", "98%",
// "3,201 online", "2026-07-13") into a value a tile can show and a sparkline can plot. It is the
// same reading the data room already does on a spreadsheet cell — so it REUSES data/values.js
// (parseAmount / parseNumber / parseDate / formatMoney / formatGroup) rather than re-deriving the
// dozen ways a figure is spelled. Pure and dependency-free: the same reading in the browser and
// in a Node test. The DOM half — finding the element and pulling its text — lives in select.js;
// this half is only the string → value step, so it can be pinned without a page.

import { parseAmount, parseNumber, parseDate, formatMoney, formatGroup } from '../data/values.js';

// Pull the first plain number out of a messier string — "3,201 online" → 3201, "98% uptime" →
// 98 — for the `number` kind, where values.js's money-first reading would rather see a currency.
// Falls back to values.js's own number reading (which handles k/m/bn magnitudes: "1.2m" → 1.2e6).
const bareNumber = (raw) => {
  const n = parseNumber(raw);
  if (n != null) return n;
  const m = String(raw == null ? '' : raw).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

// inferKind(raw) → which kind an unpinned ('auto') reading looks like: a whole-cell date, a
// figure carrying a currency (money), a bare number, else text. The same precedence values.js
// uses (a date is not an amount), so the guess agrees with how the value then reads.
export const inferKind = (raw) => {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return 'text';
  if (parseDate(s)) return 'date';
  const a = parseAmount(s);
  if (a && a.currency) return 'money';
  if (a || bareNumber(s) != null) return 'number';
  return 'text';
};

// readValue(raw, kind) → { kind, value, currency, display } — the reading a tile renders.
//   · money  → the amount's value + currency, shown as "$1,240" / "85,000 EUR".
//   · number → the numeric value, thousands-grouped ("3,201").
//   · date   → a sortable YYYYMMDD value + the ISO string as the display.
//   · text   → no value (a sparkline needs a number); the trimmed string is the display.
// `auto` infers the kind first, so pinning a price element just works without the user choosing.
// value is null whenever the string doesn't carry the pinned kind — an honest "couldn't read it"
// the tile shows as "—", never a fabricated 0.
export const readValue = (raw, kind = 'auto') => {
  const s = String(raw == null ? '' : raw).trim();
  const k = kind === 'auto' ? inferKind(s) : kind;
  if (k === 'date') {
    const d = parseDate(s);
    return d ? { kind: 'date', value: d.value, currency: null, display: d.iso }
             : { kind: 'date', value: null, currency: null, display: s || '—' };
  }
  if (k === 'money') {
    const a = parseAmount(s);
    return a ? { kind: 'money', value: a.value, currency: a.currency, display: formatMoney(a.value, a.currency) }
             : { kind: 'money', value: null, currency: null, display: s || '—' };
  }
  if (k === 'number') {
    const v = bareNumber(s);
    return v != null ? { kind: 'number', value: v, currency: null, display: formatGroup(v) }
                     : { kind: 'number', value: null, currency: null, display: s || '—' };
  }
  return { kind: 'text', value: null, currency: null, display: s || '—' };
};
