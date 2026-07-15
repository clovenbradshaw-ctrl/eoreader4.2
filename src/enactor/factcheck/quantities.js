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
    cost: 'cost', acres: 'acreage', energy: 'annual output', tonnage: 'tonnage', percent: 'share' };
  const base = M[measure] || measure;
  return unit && unit !== measure ? `${base} (${unit})` : base;
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
    const scaleMul = sc ? (SCALE[sc[1]] || 1) : 1;
    const afterScale = sc ? after.slice(sc[0].length) : after;
    let unit = null, measure = null;
    for (const u of UNIT_RULES) {
      if (u.re.test(afterScale)) { measure = u.measure; unit = u.unit; if (u.mul) value *= u.mul; break; }
    }
    value *= scaleMul;
    // A dollar sign names the measure regardless of a trailing noun ("$2.5 billion").
    if (dollar) { measure = 'cost'; unit = 'USD'; }
    if (!measure) continue;
    out.push({ value, unit, measure, raw: `${dollar ? '$' : ''}${m[2]}${sc ? sc[0].replace(/\s+/g, ' ') : ''}`.trim() });
  }
  return out;
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
