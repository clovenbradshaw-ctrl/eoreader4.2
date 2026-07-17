// EO: SEG·SIG·NUL(Void,Field → Field,Void, Dissecting,Clearing,Tending) — the generic pre-SEG detector (§3)
// The detector that sits UPSTREAM of every organ. Organs stop being "the email parser" / "the PDF
// parser" and become interpreters of pre-segmented zones. This layer is FORMAT-BLIND by
// construction: it must work on unmarked narrative prose, which has no conventions to lean on, and
// email/CSV/etc are just denser, more regular instances of the SAME statistical signal types. No
// signal here knows a format name — none reads "From:" or "<html>"; each reads a shape.
//
// Every pass emits CLMs (a SIG at the enriched, self-aware register — a boundary proposal that
// KNOWS it is a proposal), NEVER a committed SEG/INS. Committing happens only through the promotion
// pipeline (§4) or a per-instance EVA. Two properties the spec demands are built in, not assumed:
//   · convergence — the signal tests recover known structure (an RFC-5322 header/body split, an
//     indented HTML tree) without any format-specific rule (tests/structure-memory.test.js §10.1).
//   · a live VOID — when no signal produces a confident proposal, the detector SAYS so (void:true).
//     A detector that never emits VOID is overconfident by construction.
//
// Two KINDS of signal, matching the cut abstraction (core/cut.js): PRESENCE-type (periodicity,
// delimiter block, whitespace, salience, cross-reference) — a mark that EXISTS or does not, DECIDABLE,
// so it fires on a clean structural cue with no background distribution (a single blank line splits a
// header from a body: presence is not a quantile); and COMPARATIVE-type (vocabulary/topic drift) — a
// soft change-point read against the engine's OWN derived noise null (core/voidnull.js), firing only
// when the drift beats chance and abstaining (→ VOID) when the field is too short/flat to trust a
// floor. Pure and model-free — same result in a unit test as in the browser.

import { SEG } from '../../core/index.js';

// ── unit splitting ───────────────────────────────────────────────────────────────────────────────
// The detector reads UNITS (lines, by default). Blank lines are KEPT — they carry the whitespace /
// layout-discontinuity signal, which is one of the six. A blob with no newlines is one unit (and the
// detector will honestly VOID on it: there is nothing to find a discontinuity between).
export const toUnits = (blob) => String(blob ?? '').split(/\r\n|\r|\n/);

const tokens = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];

// A coarse SHAPE SIGNATURE of a line — the periodicity signal reads recurrence of this, never of the
// content. It abstracts a line to its skeleton: word-ish runs → 'w', digit runs → 'd', each
// structural punctuation kept, whitespace collapsed. So "1,Alice,30" and "2,Bob,25" share a
// signature and read as one recurring shape, with no notion of "CSV" anywhere.
const shapeSig = (s) =>
  String(s || '')
    .replace(/[A-Za-z]+/g, 'w').replace(/[0-9]+/g, 'd').replace(/\s+/g, ' ').trim().slice(0, 48);

// A FIELD LINE — a line that instantiates a field (an INS candidate): "key: value" / "key = value",
// or a line carrying ≥2 of the separator punctuation (comma / tab / semicolon / pipe). Blind to
// WHICH separator: it reads the shape, so header lines, CSV rows, and TSV rows all qualify.
const isFieldLine = (s) => {
  const str = String(s || '');
  if (/^\s*\S[^:=]*[:=]\s+\S/.test(str)) return true;              // key: value / key = value
  return ((str.match(/[,\t;|]/g) || []).length) >= 2;             // ≥2 delimiters → a record row
};

// Cross-reference density — URLs, @-mentions, [n]/(n)/^n footnote marks on a line. A CON candidate:
// citation lists, threaded replies, and reference networks all show as a spike here.
const xrefDensity = (s) => {
  const str = String(s || '');
  const urls = (str.match(/https?:\/\/|www\.|\bdoi:/gi) || []).length;
  const ats  = (str.match(/(^|\s)@[\w.]+/g) || []).length;
  const foot = (str.match(/\[\d+\]|\(\d{4}\)|\^\d+/g) || []).length;
  return urls + ats + foot;
};

// Typographic salience — a SIG (attention, not a label). A line is salient when the eye is drawn to
// it: a high ALL-CAPS ratio, or a short heading-cue line ending in a colon that is NOT a full
// sentence. Deliberately conservative so ordinary short prose sentences do not false-fire — the
// false-witness guard begins here, at the signal.
const isSalient = (s) => {
  const str = String(s || '').trim();
  if (!str) return false;
  const letters = str.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && str.replace(/[^A-Z]/g, '').length / letters.length >= 0.6) return true;   // SHOUTED
  if (str.length <= 48 && /[:]\s*$/.test(str) && !/[.?!]\s*$/.test(str)) return true;                    // heading cue
  return false;
};

// Jaccard distance between two token sets — the vocabulary/topic-drift metric.
const jaccardDist = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? 1 - inter / union : 0;
};

// ── a CLM — the self-aware boundary proposal ─────────────────────────────────────────────────────
// register:'clm' is the wiki's enriched, self-aware register: this thing KNOWS it is a proposal, so a
// downstream reader can never mistake it for a committed cut. `kind` is the operator the proposal
// would become IF committed (SEG for a cut, INS for a field, SIG for attention, CON for a reference),
// but it is NOT that operator yet. `at` is the unit index; a boundary sits BEFORE that unit.
const clm = ({ signal, kind, at, score, note = null }) =>
  Object.freeze({ register: 'clm', proposal: true, signal, kind, at, score, ...(note ? { note } : {}) });

// ── the six signals ──────────────────────────────────────────────────────────────────────────────
export const SIGNALS = Object.freeze([
  'periodicity', 'delimiter-shift', 'whitespace', 'salience', 'vocabulary', 'cross-reference',
]);

// runs(predicate) → the maximal runs of consecutive units satisfying a predicate, each { lo, hi, len }
// (hi exclusive). The shared shape behind every block/periodicity signal.
const runsOf = (units, pred) => {
  const out = []; let lo = -1;
  for (let i = 0; i <= units.length; i++) {
    const ok = i < units.length && pred(i);
    if (ok && lo < 0) lo = i;
    else if (!ok && lo >= 0) { out.push({ lo, hi: i, len: i - lo }); lo = -1; }
  }
  return out;
};

// periodicity — a SEG boundary at the EDGES of a run of ≥3 consecutive lines sharing one shape
// signature (a periodic block: CSV rows, repeated stanzas, a table body). Decidable: a run exists or
// it does not. The boundary is proposed BEFORE the run starts and BEFORE the line after it ends.
const detectPeriodicity = (units) => {
  const sigs = units.map(shapeSig);
  const out = [];
  // Group maximal runs of an identical non-empty signature; a run of ≥3 is a periodic block.
  let lo = 0;
  while (lo < units.length) {
    let hi = lo + 1;
    while (hi < units.length && sigs[hi] === sigs[lo] && sigs[lo] !== '') hi++;
    const len = hi - lo;
    if (sigs[lo] !== '' && len >= 3) {
      if (lo > 0) out.push(clm({ signal: 'periodicity', kind: 'SEG', at: lo, score: len }));
      if (hi < units.length) out.push(clm({ signal: 'periodicity', kind: 'SEG', at: hi, score: len }));
    }
    lo = hi > lo ? hi : lo + 1;
  }
  return out;
};

// delimiter-shift — an INS (field-instantiation) candidate on each line inside a BLOCK of ≥2
// consecutive field lines. Block-gated so a lone inline colon in prose ("He said: run") never fires,
// but a header block or a CSV body lights up field-by-field.
const detectDelimiterShift = (units) => {
  const out = [];
  for (const r of runsOf(units, (i) => isFieldLine(units[i]))) {
    if (r.len < 2) continue;
    for (let i = r.lo; i < r.hi; i++) out.push(clm({ signal: 'delimiter-shift', kind: 'INS', at: i, score: r.len }));
  }
  return out;
};

// whitespace — a SEG boundary candidate at a layout discontinuity: a blank-line gap, or a jump of ≥2
// in leading indentation. Decidable presence — a blank line is a mark that exists, not a quantile —
// so this splits a header from a body (or a paragraph from the next) on the FIRST clean cue.
const detectWhitespace = (units) => {
  const indent = units.map((u) => (String(u).match(/^[ \t]*/)?.[0].length) || 0);
  const out = [];
  for (let i = 1; i < units.length; i++) {
    const blank = String(units[i]).trim() === '' || String(units[i - 1]).trim() === '';
    const dedent = Math.abs(indent[i] - indent[i - 1]) >= 2 && String(units[i]).trim() !== '' && String(units[i - 1]).trim() !== '';
    if (blank || dedent) out.push(clm({ signal: 'whitespace', kind: 'SEG', at: i, score: blank ? 1 : Math.abs(indent[i] - indent[i - 1]) / 4 }));
  }
  return out;
};

// salience — a SIG (attention) mark on the units the eye is drawn to (SHOUTED caps, a heading cue).
const detectSalience = (units) => {
  const out = [];
  for (let i = 0; i < units.length; i++) if (isSalient(units[i])) out.push(clm({ signal: 'salience', kind: 'SIG', at: i, score: 1 }));
  return out;
};

// vocabulary — the ONE comparative signal: a SEG candidate at a topic discontinuity, read against the
// engine's derived noise null (core/voidnull.js SEG). The per-gap score is the Jaccard distance
// between the token windows on either side; a boundary fires only where that beats the background of
// adjacent-window drift. Abstains (→ VOID) when the field is too short/flat to trust a floor.
const detectVocabulary = (units) => {
  const n = units.length;
  if (n < 6) return [];   // too short to estimate a drift background → abstain (honest VOID)
  const toks = units.map(tokens);
  const win = (lo, hi) => { const t = []; for (let j = Math.max(0, lo); j < Math.min(n, hi); j++) t.push(...toks[j]); return t; };
  const curve = []; const idx = [];
  for (let i = 1; i < n; i++) { curve.push(jaccardDist(win(i - 2, i), win(i, i + 2))); idx.push(i); }
  const peaks = SEG(curve, { alpha: 0.05, tol: 1, indices: idx });
  return peaks.map((at) => clm({ signal: 'vocabulary', kind: 'SEG', at, score: curve[idx.indexOf(at)] ?? 0 }));
};

// cross-reference — a CON candidate on a line dense with references (≥2 on one line), or on each line
// of a BLOCK of ≥2 consecutive reference-bearing lines (a citation list / threaded reply). A lone
// inline link in prose does not fire — the block/density gate is the false-witness guard for CON.
const detectCrossReference = (units) => {
  const dens = units.map(xrefDensity);
  const out = [];
  const seen = new Set();
  for (let i = 0; i < units.length; i++) if (dens[i] >= 2 && !seen.has(i)) { out.push(clm({ signal: 'cross-reference', kind: 'CON', at: i, score: dens[i] })); seen.add(i); }
  for (const r of runsOf(units, (i) => dens[i] >= 1)) {
    if (r.len < 2) continue;
    for (let i = r.lo; i < r.hi; i++) if (!seen.has(i)) { out.push(clm({ signal: 'cross-reference', kind: 'CON', at: i, score: dens[i] })); seen.add(i); }
  }
  return out;
};

const PASSES = Object.freeze({
  periodicity: detectPeriodicity,
  'delimiter-shift': detectDelimiterShift,
  whitespace: detectWhitespace,
  salience: detectSalience,
  vocabulary: detectVocabulary,
  'cross-reference': detectCrossReference,
});

// ── the detector ─────────────────────────────────────────────────────────────────────────────────
// detectStructure(blob, { only }) → { clms, void, signals, units }
//   clms     every self-aware boundary/mark proposal, source-ordered by unit index
//   void     TRUE when NO signal produced a confident proposal — the detector's own VOID output
//            ("no confident boundary here"), a live signal, not only a downstream binding outcome
//   signals  the set of signal names that fired at least once
//   units    the units the detector read (so a caller can address a CLM's `at`)
// `only` restricts to a subset of SIGNALS (used by the convergence test to probe one signal).
export const detectStructure = (blob, { only = null } = {}) => {
  const units = toUnits(blob);
  const names = only ? SIGNALS.filter((s) => only.includes(s)) : SIGNALS;
  const clms = [];
  const fired = new Set();
  for (const name of names) {
    const found = PASSES[name](units);
    for (const c of found) { clms.push(c); fired.add(name); }
  }
  clms.sort((a, b) => a.at - b.at || SIGNALS.indexOf(a.signal) - SIGNALS.indexOf(b.signal));
  return Object.freeze({
    clms: Object.freeze(clms),
    void: clms.length === 0,   // a live VOID — the detector says so itself (§3, false-witness guard)
    signals: Object.freeze([...fired]),
    units,
  });
};

// boundaryProposals(result) → every SEG (cut) CLM position, ascending & de-duplicated — the FINE
// boundary set (each blank line, each topic drift). A convenience projection over detectStructure.
export const boundaryProposals = (result) =>
  [...new Set((result?.clms || []).filter((c) => c.kind === 'SEG').map((c) => c.at))].sort((a, b) => a - b);

// containerBoundaries(result) → the COARSE boundary set a multi-document container SEG reads (§5): the
// positions where a STRUCTURAL BLOCK recurs — the START of each periodic block (periodicity SEG
// edges) and the START of each field-block (a delimiter-shift run) after the first. These mark
// record/document starts (a new email's header block, a new CSV table) WITHOUT any format rule, so an
// mbox splits into its messages rather than into every blank-line fragment. Falls back to the fine
// boundaryProposals when no recurring block exists (a prose container segments on topic drift).
export const containerBoundaries = (result, { fallback = true } = {}) => {
  const clms = result?.clms || [];
  const bounds = new Set();
  for (const c of clms) if (c.signal === 'periodicity' && c.kind === 'SEG') bounds.add(c.at);
  const fieldAt = [...new Set(clms.filter((c) => c.signal === 'delimiter-shift').map((c) => c.at))].sort((a, b) => a - b);
  for (let i = 0; i < fieldAt.length; i++) if (i === 0 || fieldAt[i] !== fieldAt[i - 1] + 1) bounds.add(fieldAt[i]);   // a block START
  const coarse = [...bounds].filter((b) => b > 0).sort((a, b) => a - b);
  // With no recurring block: fall back to the fine boundaries (a prose container drifts by topic) —
  // UNLESS fallback is off, the recursion gate's setting, so a single-document zone (a lone blank
  // line, no recurring block) is NOT mistaken for a nested container and re-descended into.
  return coarse.length ? coarse : (fallback ? boundaryProposals(result) : []);
};
