// EO: REC·DEF(Paradigm,Lens → Paradigm, Composing,Tracing) — when the meaning changed (REC over time)
// shifts.js — the engine behind "When people changed their minds" (doc §4), the ✱ card no tool
// without REC can build. It reads a term's meaning across a DATED corpus and finds the moments the
// meaning itself shifted — not the details, the frame.
//
// The move that makes this real rather than decorative: a paradigm is the meaning the corpus
// predominantly reads a term under, and a paradigm SHIFT is a change-point in that dominant meaning
// along time. So the extraction is:
//
//   1. per source, how it characterizes the term  → disagreement.characterize (the same DEF sweep)
//   2. per source, the term's DOMINANT sense       → argmax over those characterizations
//   3. place each source in time                   → its date (metadata/recordedAt; toMs here)
//   4. walk the timeline, collapse equal dominants into runs, smooth single-source blips
//   5. every boundary between two runs is a BREAK   → REC: "before D it meant A; after, B"
//
// That is REC(Paradigm, Composing): composing, from dated readings, the rule that the governing
// meaning changed at date D. The detector emits real REC events (recEvents) so the shift is recorded
// in the engine's own grammar — the way equivalence.js records its merges as SYN/NUL. Pure and
// testable: (sources, term) → a shift model + REC events. Pinned by tests/plain-shifts.test.js
// across non-fiction, fiction, and academic corpora over time.

import { characterize } from './disagreement.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A source's date → epoch ms. Accepts ms, a bare year (2025), or any string Date.parse reads
// ("2025-02", "Feb 2025", "March 3, 2025", "2025"); NaN when there is no readable date — an undated
// source can't be placed on the timeline, and is honestly excluded rather than guessed into an order.
export const toMs = (d) => {
  if (d == null || d === '') return NaN;
  if (typeof d === 'number') return d > 0 && d < 3000 ? Date.UTC(d, 0, 1) : d; // small number → a year
  const s = String(d).trim();
  const p = Date.parse(s);
  if (!Number.isNaN(p)) return p;
  const y = s.match(/\b(1[0-9]{3}|2[0-9]{3})\b/);
  return y ? Date.UTC(Number(y[1]), 0, 1) : NaN;
};

// Format a timestamp for the timeline. Year-granular dates (midnight Jan 1 UTC — how a bare year
// parses) show just the year; anything finer shows "Mon YYYY".
export const fmt = (ms) => {
  if (!Number.isFinite(ms)) return '—';
  const dt = new Date(ms);
  return (dt.getUTCMonth() === 0 && dt.getUTCDate() === 1)
    ? `${dt.getUTCFullYear()}`
    : `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
};

// The dominant sense of a term in one source's characterizations, with a representative label.
// Ties break deterministically (the sense whose key sorts first), so the timeline is reproducible.
const dominant = (chars) => {
  const counts = new Map();
  const label = new Map();
  for (const c of chars) {
    counts.set(c.sense, (counts.get(c.sense) || 0) + 1);
    if (!label.has(c.sense) || c.label.length < label.get(c.sense).length) label.set(c.sense, c.label);
  }
  let dom = null, best = -1;
  for (const [sense, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n > best) { best = n; dom = sense; }
  }
  return dom == null ? null : { sense: dom, label: label.get(dom), spread: counts.size };
};

// Collapse consecutive equal-sense voters into runs, then remove single-source blips flanked by the
// same sense on both sides (A · B · A with B a lone source → A), so one noisy document doesn't read
// as two spurious shifts. Runs shorter than `minRun` between two agreeing runs are absorbed.
const runsOf = (voters, minRun) => {
  const collapse = (vs) => {
    const runs = [];
    for (const v of vs) {
      const last = runs[runs.length - 1];
      if (last && last.sense === v.sense) { last.members.push(v); last.toMs = v.ms; last.label = last.label.length <= v.label.length ? last.label : v.label; }
      else runs.push({ sense: v.sense, label: v.label, fromMs: v.ms, toMs: v.ms, members: [v] });
    }
    return runs;
  };
  let runs = collapse(voters);
  let changed = true;
  while (changed && runs.length >= 3) {
    changed = false;
    for (let i = 1; i < runs.length - 1; i++) {
      if (runs[i].members.length < minRun && runs[i - 1].sense === runs[i + 1].sense) {
        // absorb the blip: drop it and re-collapse (its members keep their own dominant, but the
        // run they formed no longer counts as a paradigm the corpus settled into)
        const merged = runs.slice(0, i).concat(runs.slice(i + 1));
        runs = collapse(merged.flatMap((r) => r.members).sort((a, b) => a.ms - b.ms));
        changed = true;
        break;
      }
    }
  }
  return runs;
};

// THE DETECTOR. `sources` is [{ id, label, date, text, extra? }]; `term` the word. Returns a shift
// model ready for the §4 timeline renderer, plus the runs/voters for inspection and REC emission.
export const detectShifts = (sources, term, { minRun = 2 } = {}) => {
  const voters = [];
  let undated = 0, silent = 0;
  for (const s of sources || []) {
    const ms = toMs(s.date);
    if (Number.isNaN(ms)) { undated += 1; continue; }
    const chars = characterize(s.text || '', term, { extra: s.extra || [] });
    if (!chars.length) { silent += 1; continue; }
    const dom = dominant(chars);
    if (!dom) { silent += 1; continue; }
    voters.push({ id: s.id, label: s.label || s.id, ms, sense: dom.sense, label_: dom.label });
  }
  voters.sort((a, b) => a.ms - b.ms || String(a.id).localeCompare(String(b.id)));
  const runs = runsOf(voters.map((v) => ({ ...v, label: v.label_ })), minRun);

  // Build the interleaved timeline: a steady span, the break leading out of it, the next span, …
  const marks = [];
  runs.forEach((r, i) => {
    marks.push({
      kind: 'steady', sense: r.sense, label: r.label, n: r.members.length,
      when: r.fromMs === r.toMs ? fmt(r.fromMs) : `${fmt(r.fromMs)} – ${fmt(r.toMs)}`,
      text: `${r.members.length === 1 ? 'One source reads' : `${r.members.length} sources read`} it as ${r.label}.`,
    });
    const next = runs[i + 1];
    if (next) marks.push({
      kind: 'break', note: 'the meaning shifts', when: fmt(next.fromMs),
      from: { sense: r.sense, label: r.label }, to: { sense: next.sense, label: next.label },
      source: next.members[0].id,
      text: `The old reading — ${r.label} — stops fitting. Afterwards it reads as ${next.label}.`,
    });
  });

  const shifts = Math.max(0, runs.length - 1);
  const shifted = shifts > 0;
  const lede = shifted
    ? `${shifts} moment${shifts === 1 ? '' : 's'} where the meaning shifted, not just the details.`
    : voters.length ? 'The meaning holds steady across your dated sources — no shift.'
      : 'Not enough dated sources that use this word to see a change.';

  return { term, word: term, lede, marks, runs, voters, shifted, shifts, undated, silent };
};

// The shift as engine events: one REC per break, recording that the governing meaning changed at a
// date. Staying in-grammar — REC is "learn a rule" at Interpretation — so the corpus-timeline shift
// is an auditable event, not just a picture. An injected `log` (with .append) receives them too.
export const recEvents = (model, { log = null } = {}) => {
  const events = model.runs.slice(1).map((r, i) => Object.freeze({
    op: 'REC', kind: 'paradigm-shift', term: model.term,
    at: r.fromMs, when: fmt(r.fromMs),
    from: model.runs[i].sense, to: r.sense,
    note: `${model.runs[i].label} → ${r.label}`,
  }));
  if (log && typeof log.append === 'function') for (const e of events) log.append({ ...e });
  return events;
};
