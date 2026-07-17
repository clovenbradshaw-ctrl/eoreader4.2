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
    schedule: 'completion' };
  const base = M[measure] || measure;
  if (measure === 'schedule') return 'completion';
  return unit && unit !== measure ? `${base} (${unit})` : base;
};

// ── The bound a comparison construction puts on a value ───────────────────────
//
// "$145M" alone is an EXACT reading; "at least $145M" is a FLOOR (atLeast) and
// "up to $145M" a CEILING (atMost). The comparison instrument the record needs
// (docs) cannot fold "$120M" against "≥$145M" as a bare magnitude clash — the
// second value is not a point, it is one side of a range — so the reading carries
// which side. Cues are scanned in the ~26-char window BEFORE the number, the same
// place the parser looks for the governing preposition. Open-vocabulary in, three
// closed bounds out.
const ATLEAST_CUE = /(?:at\s+least|no\s+less\s+than|no\s+fewer\s+than|minimum(?:\s+of)?|min\.?\s+of|upwards?\s+of|north\s+of|more\s+than|greater\s+than|over|above|exceed(?:ing|s)?|starting\s+at|≥|>=?)\s*\$?\s*$/i;
const ATMOST_CUE = /(?:up\s+to|no\s+more\s+than|not\s+more\s+than|at\s+most|maximum(?:\s+of)?|max\.?\s+of|as\s+much\s+as|less\s+than|fewer\s+than|under|below|nearly|almost|about|around|roughly|approximately|~|≤|<=?)\s*\$?\s*$/i;
export const boundBefore = (text, at) => {
  const win = String(text || '').slice(Math.max(0, at - 26), at).toLowerCase();
  if (ATLEAST_CUE.test(win)) return 'atLeast';
  if (ATMOST_CUE.test(win)) return 'atMost';
  return 'exact';
};

// Read the magnitudes a stretch of text states. Returns [{ value, unit, measure, raw }].
// A number with no recognizable measure is DROPPED (a bare "2021", a footnote "[3]"): an
// ungoverned magnitude has nothing to be compared against, and guessing one would invent
// a conflict, the very failure this module exists to avoid.
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
    const after = s.slice(re.lastIndex).toLowerCase();
    const sc = after.match(/^\s*(thousand|million|billion|trillion|bn|mn)\b/);
    let scaleMul = sc ? (SCALE[sc[1]] || 1) : 1;
    let scaleRaw = sc ? sc[0].replace(/\s+/g, ' ') : '';
    let afterScale = sc ? after.slice(sc[0].length) : after;
    // A single-letter money suffix ("$120M", "$1.5B", "$500K") — only on a DOLLAR amount,
    // so "80MW" (a capacity unit, not "80 million watts") is never mis-scaled. It short-
    // circuits the unit rules, since the dollar already names the measure.
    if (!sc && dollar) {
      const suf = after.match(/^(m|bn|b|k|t)\b/i);
      const MUL = { m: 1e6, b: 1e9, bn: 1e9, k: 1e3, t: 1e12 };
      if (suf && MUL[suf[1].toLowerCase()]) {
        scaleMul = MUL[suf[1].toLowerCase()];
        scaleRaw = suf[1].toUpperCase();
        afterScale = after.slice(suf[0].length);
      }
    }
    let unit = null, measure = null;
    for (const u of UNIT_RULES) {
      if (u.re.test(afterScale)) { measure = u.measure; unit = u.unit; if (u.mul) value *= u.mul; break; }
    }
    value *= scaleMul;
    // A dollar sign names the measure regardless of a trailing noun ("$2.5 billion").
    if (dollar) { measure = 'cost'; unit = 'USD'; }
    if (!measure) continue;
    out.push({ value, unit, measure, at: m.index, bound: boundBefore(s, m.index),
      raw: `${dollar ? '$' : ''}${m[2]}${scaleRaw}`.trim() });
  }
  return out;
};

// ── Schedule years ───────────────────────────────────────────────────────────
// A completion year ("2030 completion", "not before 2032") is a measured position the
// corpus disagrees about the way it disagrees about a budget, but a bare year carries no
// unit for UNIT_RULES to key on — so readQuantities drops it and a "2030 vs 2032" clash
// never surfaced. This reads a year as the `schedule` measure ONLY when a scheduling cue
// governs it, so a bare "In 2021 the board met" stays ungoverned (dropped).
const SCHEDULE_CUE = /\b(?:complete[ds]?|completion|finish(?:ed|es)?|deliver(?:ed|y|s)?|open(?:ed|ing|s)?|target(?:ed|ing|s)?|schedul(?:ed|e|ing)|due|slated|ready|online|operational|commission(?:ed|ing)?|no\s+earlier\s+than|no\s+later\s+than|not\s+before|not\s+until|by|before|after|from)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/g;
export const readScheduleYears = (text) => {
  const s = String(text || '');
  const out = [];
  let m;
  while ((m = YEAR_RE.exec(s))) {
    const year = parseInt(m[0], 10);
    if (year < 1900 || year > 2100) continue;
    const before = s.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    const after = s.slice(m.index + 4, m.index + 40).toLowerCase();
    if (!SCHEDULE_CUE.test(before) && !SCHEDULE_CUE.test(after)) continue;
    let bound = 'exact';
    // "not ... before 2032" is a FLOOR (completion ≥ 2032) even though "before" alone
    // reads as a ceiling — the negation flips it. Check the floor cues first.
    if (/no\s+earlier\s+than\s*$/i.test(before) || /\bafter\s*$/i.test(before) ||
        (/\bnot\b/i.test(before) && /before\s*$/i.test(before))) bound = 'atLeast';
    else if (/no\s+later\s+than\s*$/i.test(before) || /before\s*$/i.test(before) || /\bby\s*$/i.test(before)) bound = 'atMost';
    out.push({ value: year, unit: 'year', measure: 'schedule', at: m.index, bound, raw: m[0] });
  }
  return out;
};

// ── Change constructions: "from X to Y", "Y rather than X", "Y, up from X" ─────
//
// A single sentence can state a value AND the value it replaced ("revised from $120M to
// $145M", "2032 rather than 2030"). Read naively both land as same-measure magnitudes and
// the cross-source pass picks whichever comes first — so "$120M → $145M" was compared on
// its OLD number and read as agreeing with a source still on $120M (the reported failure).
// This pairs the two: the operative value is the one the sentence ASSERTS (the "to" / the
// "rather than" side), carrying `transition: { from }`; the value it supersedes is marked.
//
// Each rule finds a connective and splits the sentence at it; the records already
// read from the text are then classified as lying BEFORE or AFTER the connective by
// their character position (`at`), and `op` names which side the sentence asserts.
// Matching by position rather than re-reading a fragment means a bare "2030" on one
// side is still recognised as the schedule year the whole-sentence cue already keyed.
const CHANGE_RULES = Object.freeze([
  { find: /\bfrom\b[\s\S]*?\bto\b/i,       split: /\bto\b/i,                 op: 'after'  }, // from X to Y
  { find: /\bto\b[\s\S]*?\bfrom\b/i,       split: /\bfrom\b/i,               op: 'before' }, // to Y from X
  { find: /→|-->|->/,                       split: /→|-->|->/,               op: 'after'  }, // X → Y
  { find: /\brather\s+than\b/i,             split: /\brather\s+than\b/i,     op: 'before' }, // Y rather than X
  { find: /\binstead\s+of\b/i,              split: /\binstead\s+of\b/i,      op: 'before' }, // Y instead of X
  { find: /\bup\s+from\b/i,                 split: /\bup\s+from\b/i,         op: 'before' }, // Y, up from X
  { find: /\bdown\s+from\b/i,               split: /\bdown\s+from\b/i,       op: 'before' }, // Y, down from X
  { find: /\brevised\s+from\b/i,            split: /\brevised\s+from\b/i,    op: 'before' }, // Y revised from X
  { find: /\b(?:formerly|previously)\b/i,   split: /\b(?:formerly|previously)\b/i, op: 'before' }, // Y, formerly X
]);

// Given the flat measure records of one sentence, resolve a change construction.
// A pair is only recognised when both sides read to the SAME measure — "$120M → $145M"
// pairs (cost/cost), "2030 → 2032" pairs (schedule/schedule), but "$50M in 2030" has
// its cost and its year on opposite sides of no connective at all, so an ordinary
// "value in a year" is never mistaken for a change. Mutates and returns `recs`.
const markChanges = (text, recs) => {
  if (recs.length < 2) return recs;
  const s = String(text || '');
  const used = (r) => r.superseded || r.transition;   // a record is spoken for once paired
  for (const rule of CHANGE_RULES) {
    const fm = s.match(rule.find);
    if (!fm) continue;
    // Split at the connective WITHIN the matched region, so "to $145M … to 2032 from 2030"
    // cuts at its own "from", not at an earlier "from" elsewhere in the sentence.
    const sp = fm[0].match(rule.split);
    if (!sp) continue;
    const cut = fm.index + sp.index, cutEnd = cut + sp[0].length;
    const before = recs.filter((r) => !used(r) && (r.at ?? 0) < cut).sort((a, b) => (b.at || 0) - (a.at || 0));
    const after = recs.filter((r) => !used(r) && (r.at ?? 0) >= cutEnd).sort((a, b) => (a.at || 0) - (b.at || 0));
    // Pick the pair straddling the connective that shares a measure — the ones nearest it
    // on each side (X just before the connective, Y just after) — and mark them, then let
    // the remaining rules resolve a SECOND measure's change in the same sentence.
    for (const bRec of before) {
      const aRec = after.find((r) => r.measure === bRec.measure && r.value !== bRec.value);
      if (!aRec) continue;
      const op = rule.op === 'after' ? aRec : bRec;
      const prior = rule.op === 'after' ? bRec : aRec;
      op.transition = { from: prior.value, fromRaw: prior.raw, fromUnit: prior.unit };
      prior.superseded = true;
      break;                       // one pairing per rule; another rule handles another measure
    }
  }
  return recs;
};

// readMeasuresFlat — every measured value a stretch of text states (magnitudes +
// governed schedule years), WITHOUT change pairing. The primitive markChanges and
// readMeasures both build on.
export const readMeasuresFlat = (text) =>
  [...readQuantities(text), ...readScheduleYears(text)].sort((x, y) => (x.at || 0) - (y.at || 0));

// readMeasures — the full reading of a sentence: every measured value, with change
// constructions resolved so each record carries `bound` (exact/atLeast/atMost), an
// optional `transition: { from }`, and `superseded` on the value a change replaced.
export const readMeasures = (text) => markChanges(text, readMeasuresFlat(text));

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
