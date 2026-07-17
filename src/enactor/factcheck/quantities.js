// EO: SIG·DEF(Field → Lens, Tracing) — reading magnitudes (and legibility) out of prose
// The text-reading half of the cross-source pass (crosscheck.js), split out under the
// god-module ratchet (no file over ~250 lines). Two concerns live here, both "make
// sense of a raw stretch of text before it can be compared":
//
//   readQuantities   a stretch of text → the measured magnitudes it states, each
//                    normalized to a closed measure key (capacity/homes/co2/…) + unit.
//   measureLabel     a measure/unit → its display label ("capacity (MW)", "CO₂ reduction").
//   isLegibleProse   is a document prose at all, or mis-decoded bytes? The gate that
//                    keeps readQuantities from mining a phantom figure out of a binary.
//
// The comparison itself — binding a magnitude to its subject and pairing two sources —
// stays in crosscheck.js.

// ── Reading a magnitude out of prose ─────────────────────────────────────────
//
// The parser (perceiver/parse) types COPULAR DEFs and SVO edges; a measured quantity
// rides inside an object NP ("power 18,000 homes", "an 80MW installation") and never
// becomes a structured tuple, so this reads it directly. Open-vocabulary in (any
// number + any trailing unit/noun), a small CLOSED set of measures out — the same
// discipline the relation algebra follows: extraction stays open, the comparison
// operates on the projection so two sources' "homes" land on one measure key.

// Scale words are multipliers on the bare number, distinct from units.
const SCALE = Object.freeze({
  thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12,
});

// Each rule tests the window AFTER the number (lowercased). `measure` is the closed
// key two sources must share to be comparable; `unit` is what the value is carried in;
// `mul` normalizes a same-measure unit to the group's canonical one (GW→MW, kW→MW) so
// 0.08 GW and 80 MW compare as one capacity, never two.
const UNIT_RULES = Object.freeze([
  { re: /^\s*-?\s*(?:gw|gigawatts?)\b/,                                                    measure: 'capacity', unit: 'MW', mul: 1000 },
  { re: /^\s*-?\s*(?:kw|kilowatts?)\b/,                                                     measure: 'capacity', unit: 'MW', mul: 0.001 },
  { re: /^\s*-?\s*(?:mw|megawatts?|megawatt)\b/,                                            measure: 'capacity', unit: 'MW' },
  { re: /^\s*-?\s*(?:metric\s+)?(?:tons?|tonnes?)\s+of\s+(?:co2|co₂|carbon(?:\s+dioxide)?|emissions)\b/, measure: 'co2', unit: 'tons' },
  { re: /^\s*-?\s*(?:tons?|tonnes?)\b/,                                                     measure: 'tonnage', unit: 'tons' },
  { re: /^\s*(?:homes?|households?)\b/,                                                     measure: 'homes', unit: 'homes' },
  { re: /^\s*(?:jobs?|positions?|roles?)\b/,                                                measure: 'jobs', unit: 'jobs' },
  { re: /^\s*(?:acres?)\b/,                                                                 measure: 'acres', unit: 'acres' },
  { re: /^\s*(?:megawatt-hours?|mwh)\b/,                                                    measure: 'energy', unit: 'MWh' },
]);

// A quantity's measure label for display ("capacity" → "capacity (MW)", "co2" → "CO₂").
export const measureLabel = (measure, unit) => {
  const M = { capacity: 'capacity', homes: 'homes powered', co2: 'CO₂ reduction', jobs: 'jobs',
    cost: 'cost', acres: 'acreage', energy: 'annual output', tonnage: 'tonnage', percent: 'share',
    completion: 'completion' };
  const base = M[measure] || measure;
  return unit && unit !== measure ? `${base} (${unit})` : base;
};

// ── Change language ("from X to Y") and comparator language ("at least X") ──────
//
// A source rarely just STATES a figure — it revises one ("the budget, revised from $120
// million to $145 million"), or bounds one ("at least $145 million", "not before 2032").
// Both are read here, off the number's own surrounding text, so a downstream comparison
// (crosscheck.js's cross-source pass, the comparison matrix) can prefer the CURRENT value
// of a revision instead of picking whichever number happened to print first in the
// sentence, and can carry a stated bound through to display instead of silently dropping it.
//
// CHANGE_VERBS: the verb that licenses reading two same-measure numbers, joined by "to",
// as one figure's old value and new value — never a bare "to" (which reads as prose in a
// hundred other constructions). "from" alone also licenses it — "from $120M to $145M".
const CHANGE_VERBS = /\b(?:from|revised\s+from|changed\s+from|updated\s+from|moved\s+from|up\s+from|down\s+from|increased\s+from|decreased\s+from|raised\s+from|lowered\s+from|rose\s+from|fell\s+from|grew\s+from|shrank\s+from|shrunk\s+from)\s*$/i;
// A single figure named as the CURRENT one, with no "from" partner in this sentence — the
// old value may sit in a different sentence, or may not be on record at all; either way this
// figure is the one to prefer.
const CURRENT_VERBS = /\b(?:revised|updated|changed|upgraded|amended|now|currently)\s+(?:to\s+|at\s+)?$/i;

// A comparator names a BOUND, not a point value: "at least $145M" means the true figure is
// >= 145M, not that it equals 145M. Ordered longest-phrase-first so "no more than" doesn't
// fall through to a looser rule. Read off the text immediately BEFORE the number.
const COMPARATORS = Object.freeze([
  { re: /\bat\s+least\s*$/i, cmp: 'gte' }, { re: /\bno\s+less\s+than\s*$/i, cmp: 'gte' },
  { re: /\bnot\s+before\s*$/i, cmp: 'gte' }, { re: /\bno\s+earlier\s+than\s*$/i, cmp: 'gte' },
  { re: /\bno\s+more\s+than\s*$/i, cmp: 'lte' }, { re: /\bnot\s+more\s+than\s*$/i, cmp: 'lte' },
  { re: /\bno\s+later\s+than\s*$/i, cmp: 'lte' }, { re: /\bnot\s+later\s+than\s*$/i, cmp: 'lte' },
  { re: /\bup\s+to\s*$/i, cmp: 'lte' },
  { re: /\bmore\s+than\s*$/i, cmp: 'gt' }, { re: /\bover\s*$/i, cmp: 'gt' },
  { re: /\bless\s+than\s*$/i, cmp: 'lt' }, { re: /\bunder\s*$/i, cmp: 'lt' },
]);
const comparatorBefore = (s, start) => {
  const before = s.slice(Math.max(0, start - 26), start);
  for (const c of COMPARATORS) if (c.re.test(before)) return c.cmp;
  return null;
};

// A bare year ("2030") carries no trailing unit, so the main loop below correctly drops it
// as an ungoverned number — UNLESS it sits under a completion/schedule word ("finish in
// 2030", "target completion 2032", "deadline of 2030"), in which case it is exactly the kind
// of governed figure two sources can disagree about ("2030" vs "2032"). The context word
// must precede the year within a short window so an unrelated nearby year never qualifies.
const YEAR_CONTEXT = /\b(?:complet(?:e|ed|ion|ing)|finish(?:ed|es|ing)?|schedul(?:e|ed|ing)|target(?:ed)?|deadline|due|launch(?:ed|es|ing)?|open(?:ed|s|ing)?|planned|expect(?:ed)?|slated|set\s+for)\b[^.?!]{0,24}$/i;
const YEAR_RE = /\b((?:19|20)\d{2})\b/g;

// Read the magnitudes a stretch of text states. Returns [{ value, unit, measure, raw, start,
// end, comparator, role }]. A number with no recognizable measure is DROPPED (a bare "2021",
// a footnote "[3]"): an ungoverned magnitude has nothing to be compared against, and guessing
// one would invent a conflict, the very failure this module exists to avoid.
//
// role is null, 'old', or 'new' — set only when the SENTENCE ITSELF licenses reading a
// number as a revision (readQuantities never infers a change across sentences or sources).
// A 'new' record paired with an 'old' one also carries changeId (shared by the pair) so a
// caller can print "$120M → $145M" instead of just the current figure.
export const readQuantities = (text) => {
  const s = String(text || '');
  const out = [];
  // $?  then either comma-grouped (18,000 / 1,234,567) or plain (80 / 2.5 / 18000).
  const re = /(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\d)/g;
  let m;
  while ((m = re.exec(s))) {
    const dollar = !!m[1];
    let value = parseFloat(m[2].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const numEnd = re.lastIndex;
    const after = s.slice(numEnd).toLowerCase();
    const sc = after.match(/^\s*(thousand|million|billion|trillion|bn|mn)\b/);
    const scaleMul = sc ? (SCALE[sc[1]] || 1) : 1;
    const afterScale = sc ? after.slice(sc[0].length) : after;
    let unit = null, measure = null, unitLen = 0;
    for (const u of UNIT_RULES) {
      const um = afterScale.match(u.re);
      if (um) { measure = u.measure; unit = u.unit; unitLen = um[0].length; if (u.mul) value *= u.mul; break; }
    }
    value *= scaleMul;
    // A dollar sign names the measure regardless of a trailing noun ("$2.5 billion").
    if (dollar) { measure = 'cost'; unit = 'USD'; }
    if (!measure) continue;
    out.push({
      value, unit, measure, raw: `${dollar ? '$' : ''}${m[2]}${sc ? sc[0].replace(/\s+/g, ' ') : ''}`.trim(),
      start: m.index, end: numEnd + (sc ? sc[0].length : 0) + unitLen,
      role: null, changeId: null, comparator: comparatorBefore(s, m.index),
    });
  }
  // A completion/schedule year — read only under YEAR_CONTEXT, kept in reading order with
  // the rest so the change-pairing pass below sees it alongside any other completion figure.
  let ym;
  while ((ym = YEAR_RE.exec(s))) {
    const start = ym.index, end = YEAR_RE.lastIndex;
    if (!YEAR_CONTEXT.test(s.slice(Math.max(0, start - 40), start))) continue;
    out.push({
      value: parseInt(ym[1], 10), unit: 'year', measure: 'completion', raw: ym[1],
      start, end, role: null, changeId: null, comparator: comparatorBefore(s, start),
    });
  }
  out.sort((a, b) => a.start - b.start);

  // "from $120M to $145M" / "the deadline moved from 2030 to 2032" — a same-measure pair
  // joined by a bare "to", licensed by a change verb just before the first figure.
  const byMeasure = new Map();
  out.forEach((q) => { const a = byMeasure.get(q.measure) || []; a.push(q); byMeasure.set(q.measure, a); });
  let chg = 0;
  for (const arr of byMeasure.values()) {
    for (let i = 0; i < arr.length - 1; i++) {
      const a = arr[i], b = arr[i + 1];
      if (a.role || b.role) continue;
      const gap = s.slice(a.end, b.start);
      if (!/^\s*(?:to|through|thru)\s*$/i.test(gap)) continue;
      if (!CHANGE_VERBS.test(s.slice(Math.max(0, a.start - 30), a.start))) continue;
      const id = `${a.measure}-chg-${chg++}`;
      a.role = 'old'; b.role = 'new'; a.changeId = id; b.changeId = id;
    }
  }
  // A lone "revised to $145M" — a current figure with no "from" partner in this sentence.
  for (const q of out) if (!q.role && CURRENT_VERBS.test(s.slice(Math.max(0, q.start - 24), q.start))) q.role = 'new';

  return out.map(({ start, end, ...q }) => q);
};

// ── Legible prose vs mis-decoded bytes ───────────────────────────────────────
//
// A source can be admitted and still be no prose at all: a PDF, a zip, or a UTF-16
// file read as UTF-8 arrives as mojibake — dense U+FFFD replacement chars (the
// decoder's "these bytes were not text"), or a symbol soup (<>[]{}\^~| with a few
// stray letters) that forms no words. readQuantities will happily mine a "6", a
// "9,000", a "$456" out of such bytes and bind it to a measure — and then two sources,
// one legible and one garbage, "disagree", inventing exactly the false conflict the
// cross-source pass exists to avoid ("guessing one would invent a conflict").
//
// We judge legibility over the WHOLE document at once. A lone garbage line is
// ambiguous (is "$$456 47859:;;<=" a weird data cell or bytes?); a binary file read
// as text is not — every line gives it away, so the aggregate is decisive. The test
// is script-agnostic by construction: "legible" is letters-in-words (a run led by any
// \p{L}, so Cyrillic/Greek/CJK count) plus the whitespace between them, so non-Latin
// and (spaceless) CJK prose read as legible and only genuine byte-garbage is caught.
const REPLACEMENT = /�/gu;                             // U+FFFD — the decoder's failure marker
const WORD_RUN = /[\p{L}][\p{L}\p{M}\p{Nd}]+/gu;       // a run led by a letter, length ≥ 2 — a "word"

export const replacementRatio = (text) => {
  const s = String(text || '');
  return s ? (s.match(REPLACEMENT) || []).length / s.length : 0;
};

export const isLegibleProse = (text) => {
  const s = String(text || '');
  if (s.length < 24) return true;                      // too little text to judge — defer, never censor
  if (replacementRatio(s) > 0.02) return false;        // a density of replacement chars ⇒ decode failure
  const inWords = (s.match(WORD_RUN) || []).reduce((n, w) => n + w.length, 0);
  const spaces = (s.match(/\s/gu) || []).length;
  return (inWords + spaces) / s.length >= 0.5;         // half the bytes are words + the gaps between ⇒ prose
};
