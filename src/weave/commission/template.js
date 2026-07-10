// EO: REC·SYN(Field,Network → Paradigm, Composing,Making) — the EOT structure template
// Read an exemplar's DISCOURSE FORM off its reading and freeze it as a loadable template.
//
// A source has two things worth keeping. Its TOPICS go into the graph (projectGraph, the
// existing path). Its FORM — the way it moves from move to move, the shape of its arc, the
// grain of its sentences — has had nowhere to live. This module gives it one: a StyleTemplate,
// the EOT structure of the exemplar, learned live from a fetched text, not shipped.
//
// Three layers, each from a primitive that already exists:
//   grammar    a bigram move-grammar over the ten EO operators (learnGrammar over the exemplar's
//              move-log) — the discourse SYNTAX, the drop-in replacement for the frozen
//              metamorphosis grammar the predictor rides (perceiver/predict).
//   arc        the operator MIX across reading position, binned and mapped to the open/develop/
//              close phases, plus the flow witness's natural-section summary (surfer/flow) —
//              the RHYTHM, a positional bias the generation loop can lean on.
//   surface    cheap, legible signatures read straight off the sentences — sentence length,
//              quotation / first-person / digression rate — the VOICE, and the knobs the prompt
//              and the left panel can show.
//
// The three fold into a `styleVector`, the point the exemplar occupies in structure-space — what
// the inspiration selector navigates. Topical distance is MiniLM's job (surfer/retrieve); this is
// the shape it cannot see.

import { buildMoveLog, learnGrammar, MOVE_ALPHABET } from '../../perceiver/predict/index.js';
import { trajectoryFromDoc } from '../../surfer/flow/index.js';

// The significance-row phases, matched to flow/index.js (L3_EARLY/MID) and longgen/shape.js so a
// bias built here lands in the same phase vocabulary the arc lean already speaks. VOID is a
// refusal, not a phase — it stays neutral.
export const PHASE_OPS = Object.freeze({
  open:    ['NUL', 'SIG', 'INS', 'DEF'],
  develop: ['SEG', 'CON', 'EVA'],
  close:   ['SYN', 'REC'],
});
const PHASE_OF = (() => {
  const m = {};
  for (const [phase, ops] of Object.entries(PHASE_OPS)) for (const op of ops) m[op] = phase;
  return Object.freeze(m);
})();

const FLOOR = 1e-6;
const round = (x, k = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** k) / 10 ** k : 0);

// ── surface signatures ───────────────────────────────────────────────────────
// Read off the sentence strings — no model, no reading. These are the voice knobs a human
// recognises (Montaigne's digressions, a paper's impersonal register) and the ones the prompt
// carries and the panel shows.
const FIRST_PERSON = /\b(i|we|me|us|my|our|mine|ours|myself|ourselves)\b/i;
const QUOTED = /["“”«»]|(?:^|\s)['‘][^'’]{3,}/;
const DIGRESSION = /[—–]|\([^)]{2,}\)|;|:/;   // dashes, parentheticals, semicolons, colons

export const surfaceOf = (sentences = []) => {
  const S = sentences.filter((s) => typeof s === 'string' && s.trim());
  const n = S.length || 1;
  let words = 0, chars = 0, quote = 0, first = 0, question = 0, digress = 0, longSent = 0;
  const types = new Set();
  let tokens = 0;
  for (const s of S) {
    const w = s.trim().split(/\s+/).filter(Boolean);
    words += w.length; chars += s.length;
    if (w.length > 34) longSent++;                    // periodic / subordinated sentence
    if (QUOTED.test(s)) quote++;
    if (FIRST_PERSON.test(s)) first++;
    if (/\?\s*$/.test(s.trim())) question++;
    if (DIGRESSION.test(s)) digress++;
    for (const t of s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) { types.add(t); tokens++; }
  }
  return Object.freeze({
    meanWords: round(words / n, 2),
    meanChars: round(chars / n, 1),
    quotationRate: round(quote / n),
    firstPersonRate: round(first / n),
    questionRate: round(question / n),
    digressionRate: round(digress / n),
    longSentenceRate: round(longSent / n),
    lexicalDiversity: round(types.size / (tokens || 1)),
  });
};

// ── the arc ──────────────────────────────────────────────────────────────────
// Bin the depicted (content-register) moves by reading position and read the operator MIX in each
// bin. Where the exemplar over-uses an operator relative to its own marginal, that bin's `bias`
// leans there — a phaseBias-compatible multiplier (mean ~1) the generation loop can apply. `phase`
// is the dominant significance-row group of the bin: an essay that opens by defining and lands by
// synthesising leaves that trace here.
export const arcOf = (moves = [], marginal = {}, { bins = 3 } = {}) => {
  const content = moves.filter((m) => m.register === 'content' && MOVE_ALPHABET.includes(m.op));
  const maxCursor = content.reduce((mx, m) => Math.max(mx, m.cursor || 0), 0) || 1;
  const buckets = Array.from({ length: bins }, () => Object.fromEntries(MOVE_ALPHABET.map((o) => [o, 0])));
  const counts = new Array(bins).fill(0);
  for (const m of content) {
    const b = Math.min(bins - 1, Math.floor(((m.cursor || 0) / (maxCursor + 1e-9)) * bins));
    buckets[b][m.op] += 1; counts[b] += 1;
  }
  const schedule = buckets.map((raw, b) => {
    const total = counts[b] || 1;
    const mix = {}; for (const op of MOVE_ALPHABET) mix[op] = round(raw[op] / total);
    // lean = local share / global share, renormalised to mean 1 so it reads as a multiplier.
    const lean = {}; let leanSum = 0;
    for (const op of MOVE_ALPHABET) { const l = (mix[op] + FLOOR) / ((marginal[op] || 0) + FLOOR); lean[op] = l; leanSum += l; }
    const bias = {}; const mean = leanSum / MOVE_ALPHABET.length || 1;
    for (const op of MOVE_ALPHABET) bias[op] = round(lean[op] / mean, 3);
    // the bin's dominant phase — which significance-row group carries the most mass here.
    const phaseMass = { open: 0, develop: 0, close: 0 };
    for (const op of MOVE_ALPHABET) if (PHASE_OF[op]) phaseMass[PHASE_OF[op]] += mix[op];
    const phase = Object.entries(phaseMass).sort((a, b2) => b2[1] - a[1])[0][0];
    const dominant = Object.entries(mix).sort((a, b2) => b2[1] - a[1])[0][0];
    return Object.freeze({ at: round((b + 0.5) / bins, 3), phase, dominant, mix: Object.freeze(mix), bias: Object.freeze(bias) });
  });
  return Object.freeze({
    bins,
    schedule: Object.freeze(schedule),
    opening: schedule[0]?.dominant || null,
    closing: schedule[schedule.length - 1]?.dominant || null,
    phases: Object.freeze(schedule.map((s) => s.phase)),
  });
};

// ── the fingerprint ──────────────────────────────────────────────────────────
// The marginal move mix — the one-glance signature the panel shows and the inspiration selector
// compares. Straight from the learned grammar's unigram.
export const fingerprintOf = (grammar) => {
  const out = {};
  for (const op of MOVE_ALPHABET) out[op] = round(grammar?.marginal?.[op] ?? 0);
  return Object.freeze(out);
};

// ── the template ─────────────────────────────────────────────────────────────
// extractStyleTemplate(docs, meta, opts) → a frozen StyleTemplate.
//   docs   one parsed doc (parseText / a fetched book) or an array — an array BLENDS the
//          exemplars at the move-log level (learnGrammar over all of them), the honest way to
//          fuse "Montaigne + Hazlitt" into one personal-essay grammar.
//   meta   { name, title, source, url } provenance carried onto the template.
//   opts   { bins, alpha } — arc resolution and the grammar's add-α smoothing.
export const extractStyleTemplate = (docs, meta = {}, opts = {}) => {
  const list = Array.isArray(docs) ? docs.filter(Boolean) : [docs].filter(Boolean);
  if (!list.length) throw new Error('extractStyleTemplate: no exemplar doc');
  const moveLogs = list.map((d) => buildMoveLog(d, opts.moveLog || {}));
  const allMoves = moveLogs.map((ml) => ml.moves);
  const grammar = learnGrammar(allMoves, MOVE_ALPHABET, { alpha: opts.alpha ?? 0.5 });

  // The union of moves for the arc, and the union of sentences for the surface read.
  const unionMoves = allMoves.flat();
  const sentences = list.flatMap((d) => d.units || d.sentences || []);
  const arc = arcOf(unionMoves, grammar.marginal, { bins: opts.bins ?? 3 });
  const surface = surfaceOf(sentences);
  const fingerprint = fingerprintOf(grammar);

  // The flow witness's own read — natural sections and the mode-sequence summary — kept as a
  // richer descriptor (and the seam where the PCA style-space coords will attach).
  let flow = null;
  try {
    const traj = trajectoryFromDoc(list[0]);
    flow = Object.freeze({
      sections: traj?.sections?.length ?? traj?.steps?.length ?? 0,
      l3: traj?.l3summary ?? null,
    });
  } catch { /* flow is descriptive only — never block the template on it */ }

  const template = Object.freeze({
    kind: 'eo-style-template',
    version: 1,
    exemplar: Object.freeze({
      name: meta.name || meta.title || null,
      title: meta.title || null,
      source: meta.source || null,          // 'gutenberg' | 'arxiv' | 'openalex' | 'web' | …
      url: meta.url || null,
      blendedFrom: list.length > 1 ? list.length : 1,
    }),
    grammar,               // { alphabet, trans, marginal } — the drop-in move-grammar
    fingerprint,           // the marginal move mix (the shown signature)
    arc,                   // the positional phase/bias schedule
    surface,               // the voice signatures
    flow,                  // the flow witness's natural-section descriptor
    provenance: Object.freeze({
      sentencesRead: sentences.length,
      movesRead: unionMoves.length,
      builtFrom: list.map((d) => d.docId || null),
    }),
  });
  return template;
};

// ── structure-space ───────────────────────────────────────────────────────────
// The point the template occupies in shape-space: the marginal move mix (10) ⊕ the voice
// signatures (8), L2-normalised. This is what the inspiration selector navigates — the structural
// complement to MiniLM's topical vector. Deterministic, model-free, comparable across exemplars.
export const STYLE_DIMS = Object.freeze([
  ...MOVE_ALPHABET.map((o) => `move.${o}`),
  'surf.meanWords', 'surf.quotationRate', 'surf.firstPersonRate', 'surf.questionRate',
  'surf.digressionRate', 'surf.longSentenceRate', 'surf.lexicalDiversity', 'surf.subordination',
]);

// The one place the vector layout lives — a fingerprint (move mix) and a surface (voice) folded
// into the ordered STYLE_DIMS and L2-normalised. Both a real template and a target SHAPE (the
// inspiration selector's "what a good X looks like") build their point in structure-space here.
export const styleVectorFrom = (fingerprint = {}, surface = {}) => {
  const raw = [
    ...MOVE_ALPHABET.map((o) => fingerprint[o] || 0),
    Math.min(1, (surface.meanWords || 0) / 40),     // squashed to ~[0,1] so length doesn't dominate
    surface.quotationRate || 0, surface.firstPersonRate || 0, surface.questionRate || 0,
    surface.digressionRate || 0, surface.longSentenceRate || 0, surface.lexicalDiversity || 0,
    Math.min(1, (surface.meanChars || 0) / 220),
  ];
  const norm = Math.hypot(...raw) || 1;
  return Object.freeze(raw.map((x) => round(x / norm, 5)));
};

export const styleVectorOf = (template) => styleVectorFrom(template.fingerprint || {}, template.surface || {});

export const styleDistance = (a, b) => {
  const va = Array.isArray(a) ? a : styleVectorOf(a);
  const vb = Array.isArray(b) ? b : styleVectorOf(b);
  let dot = 0; const n = Math.min(va.length, vb.length);
  for (let i = 0; i < n; i++) dot += va[i] * vb[i];
  return round(1 - dot, 5);                          // cosine distance; both already unit-norm
};

// A short, human-readable reading of a template — for the panel, the audit, and the plan's note.
export const describeTemplate = (t) => {
  if (!t) return '∅';
  const top = Object.entries(t.fingerprint || {}).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([op, p]) => `${op} ${Math.round(p * 100)}%`).join(' · ');
  const s = t.surface || {};
  const voice = [
    s.firstPersonRate > 0.3 ? 'first-person' : s.firstPersonRate < 0.05 ? 'impersonal' : null,
    s.quotationRate > 0.15 ? 'quotation-laden' : null,
    s.digressionRate > 0.4 ? 'digressive' : null,
    s.meanWords > 28 ? 'periodic' : s.meanWords < 14 ? 'clipped' : null,
  ].filter(Boolean).join(', ');
  const arc = (t.arc?.phases || []).join('→');
  return `${t.exemplar?.name || 'exemplar'} — moves: ${top}${voice ? `; voice: ${voice}` : ''}${arc ? `; arc: ${arc}` : ''}`;
};

// Blend already-built templates (when the docs are gone but the templates remain): a weighted
// average of the grammars, fingerprints, and surfaces. For live fusion prefer passing multiple
// docs to extractStyleTemplate — this is the after-the-fact path the inspiration selector uses to
// preview an ensemble before committing to fetch-and-refit.
export const blendTemplates = (templates = [], weights = null) => {
  const ts = templates.filter(Boolean);
  if (!ts.length) throw new Error('blendTemplates: nothing to blend');
  if (ts.length === 1) return ts[0];
  const w = (weights && weights.length === ts.length) ? weights : ts.map(() => 1);
  const wsum = w.reduce((a, b) => a + b, 0) || 1;
  const alphabet = MOVE_ALPHABET;
  const marginal = {}; for (const op of alphabet) marginal[op] = 0;
  const trans = {}; for (const p of alphabet) { trans[p] = {}; for (const op of alphabet) trans[p][op] = 0; }
  const surfaceKeys = Object.keys(ts[0].surface || {});
  const surface = Object.fromEntries(surfaceKeys.map((k) => [k, 0]));
  ts.forEach((t, i) => {
    const wi = w[i] / wsum;
    for (const op of alphabet) marginal[op] += wi * (t.grammar?.marginal?.[op] || 0);
    for (const p of alphabet) for (const op of alphabet) trans[p][op] += wi * (t.grammar?.trans?.[p]?.[op] || 0);
    for (const k of surfaceKeys) surface[k] += wi * (t.surface?.[k] || 0);
  });
  for (const op of alphabet) marginal[op] = round(marginal[op], 6);
  for (const p of alphabet) for (const op of alphabet) trans[p][op] = round(trans[p][op], 6);
  for (const k of surfaceKeys) surface[k] = round(surface[k], 4);
  const grammar = { alphabet: [...alphabet], trans, marginal };
  return Object.freeze({
    kind: 'eo-style-template', version: 1,
    exemplar: Object.freeze({ name: ts.map((t) => t.exemplar?.name).filter(Boolean).join(' + ') || 'blend', blendedFrom: ts.length, source: 'blend' }),
    grammar, fingerprint: fingerprintOf(grammar),
    arc: ts[0].arc, surface: Object.freeze(surface), flow: null,
    provenance: Object.freeze({ blend: ts.map((t) => t.exemplar?.name) }),
  });
};
