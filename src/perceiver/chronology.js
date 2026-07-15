// EO: SEG·REC·EVA(Field → Paradigm,Lens, Dissecting,Composing,Tracing) — fabula from sujet
// chronology.js — the order events are TOLD vs. the order they HAPPENED.
//
// A document narrates in its own order (the sujet): a filing opens with the outcome, a witness
// doubles back, a report foreshadows. But the events carry their own in-world dates (the fabula).
// This fold reads the dates the text states, orders the events by when they HAPPENED, and surfaces
// the GAP — where the telling jumps back in time (a flashback) or ahead (foreshadowing). The
// reconstructed timeline is a first-class object; so is the reordering between the two axes.
//
// HONEST about what it can't date. Only events whose sentence STATES a date are placed; everything
// else collects as `undated` and is never interleaved (the time-axis discipline). It reads dates
// the text wrote down — it does not infer "the next morning" into a wall-clock. Pure, no model.

const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MON_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const YEAR = String.raw`(1[7-9]\d\d|20\d\d)`;   // 1700–2099, tight enough to avoid ids/amounts
const clampDay = (d) => Math.min(Math.max(d, 1), 28);   // avoid month-overflow; day precision is enough to order

// Every date a string states, most-specific first, each as { t, label, precision }. The first is
// the event's story-time. Precision (day/month/year) is kept so a bare year sorts stably.
export const readDates = (text) => {
  const s = String(text || '');
  const out = [];
  const push = (t, label, precision) => { if (Number.isFinite(t)) out.push({ t, label, precision }); };
  let m;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;                                    // 2021-03-14
  while ((m = iso.exec(s))) { const y = +m[1]; if (y >= 1700 && y <= 2099) push(Date.UTC(y, clampMo(+m[2] - 1), clampDay(+m[3])), m[0], 'day'); }
  const mdy = new RegExp(String.raw`\b(${MON_RE})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+${YEAR}\b`, 'gi');   // March 14, 2021
  while ((m = mdy.exec(s))) push(Date.UTC(+m[3], MONTHS[m[1].toLowerCase()], clampDay(+m[2])), m[0], 'day');
  const dmy = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MON_RE})\.?,?\s+${YEAR}\b`, 'gi');   // 14 March 2021
  while ((m = dmy.exec(s))) push(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], clampDay(+m[1])), m[0], 'day');
  const my = new RegExp(String.raw`\b(${MON_RE})\.?\s+${YEAR}\b`, 'gi');         // March 2021
  while ((m = my.exec(s))) push(Date.UTC(+m[2], MONTHS[m[1].toLowerCase()], 1), m[0], 'month');
  const yr = new RegExp(String.raw`\b(?:in|by|since|before|after|during|around|circa)\s+${YEAR}\b|\b${YEAR}\b`, 'gi');   // …in 1998 / 1998
  while ((m = yr.exec(s))) { const y = +(m[1] || m[2]); push(Date.UTC(y, 0, 1), String(y), 'year'); }
  // most specific first, then earliest — the first entry is the event's anchor
  const rank = { day: 0, month: 1, year: 2 };
  out.sort((a, b) => (rank[a.precision] - rank[b.precision]) || (a.t - b.t));
  // dedupe by timestamp keeping the most specific label
  const seen = new Set(), uniq = [];
  for (const d of out) { if (seen.has(d.t)) continue; seen.add(d.t); uniq.push(d); }
  return uniq;
};
const clampMo = (mo) => Math.min(Math.max(mo, 0), 11);

// Build the chronology from telling-ordered items. `items`: [{ order, text, source? }] where
// `order` is the telling position (sentence index, or a global corpus position). Returns the
// events placed in story-time, the reorderings where the telling runs against time, and an honest
// count of what could not be dated.
export const buildChronology = (items, { maxUndated = 0 } = {}) => {
  const dated = [], undated = [];
  for (const it of items || []) {
    const ds = readDates(it.text);
    if (ds.length) dated.push({ order: it.order, text: String(it.text || '').trim(), source: it.source ?? null, t: ds[0].t, when: ds[0].label, precision: ds[0].precision });
    else undated.push({ order: it.order, text: String(it.text || '').trim(), source: it.source ?? null });
  }
  const timeline = [...dated].sort((a, b) => (a.t - b.t) || (a.order - b.order));
  // reorderings: walk the dated events in TELLING order; a step where time goes backward is a
  // flashback, forward-with-a-gap after a backward run reads as a return. Report the backward steps.
  const byTelling = [...dated].sort((a, b) => a.order - b.order);
  const reorderings = [];
  for (let i = 1; i < byTelling.length; i++) {
    const prev = byTelling[i - 1], cur = byTelling[i];
    if (cur.t < prev.t) reorderings.push({ kind: 'flashback', order: cur.order, from: prev.when, to: cur.when, text: cur.text });
  }
  const span = timeline.length ? { first: timeline[0].when, last: timeline[timeline.length - 1].when } : null;
  return {
    timeline, reorderings, span,
    undated: maxUndated ? undated.slice(0, maxUndated) : [],
    metric: { dated: dated.length, undated: undated.length, reorderings: reorderings.length, ordered: reorderings.length === 0 && dated.length > 1 },
  };
};
