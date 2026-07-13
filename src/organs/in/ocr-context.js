// EO: SEG·INS·DEF·EVA·REC(Field,Lens → Entity,Lens,Paradigm, Dissecting,Making,Binding,Tracing) — the OCR reading that edits itself in context
// The OCR reading's second pass — a GUESS at what a shaky line likely means, in context.
//
// The eyes (organs/in/ocr-quorum.js) settle what the pixels SAY: several witnesses read the
// scan, the best reading is elected, the disagreements flagged. This module is the layer
// ABOVE that — what the line likely MEANS given everything else we have. A garbled "]3en" on
// a low-belief line, when the document confidently says "Ben" a dozen times elsewhere, is
// almost certainly "Ben" misread. So we guess it — and mark the guess as a guess.
//
// This is the SAME move the ear already makes for a waveform (organs/in/hear.js
// resolveTranscript): a reading is an assertion, not a fact, so it is defeasible and it is
// BELIEVED. The ear re-hears "Marcy" as the confident "Darcy"; here we re-read a garble as the
// word the document's own vocabulary vouches for. It reuses the reader's OWN primitives — the
// fuzzy matcher (parse/fuzzy.js) and the entity admission (parse/entities.js) — never a
// bespoke dictionary: a garble is corrected only toward a term the reader already knows from a
// MORE-BELIEVED line, exactly as the ear elects the most-believed spelling.
//
// THREE LAYERS, EACH EASY TO AUDIT AND REVERT. The whole point is that nothing is silently
// overwritten:
//
//   1. RAW      — what each eye returned, kept on span.ref.witnesses (never touched here).
//   2. QUORUM   — the elected reading, on span.text with its belief (ocr-quorum.js).
//   3. GUESS    — this layer. Every guess lands on the append-only log as
//                 SEG (retract the shaky reading) · INS (re-mint the guess) · DEF (revisedFrom
//                 + the evidence that justified it) · EVA (the reason) · REC (the rule learned).
//                 The original is RETRACTED, not deleted — so `revertOcrGuesses` peels the
//                 layer straight back off, and the reversal is itself a logged, auditable act.
//
// Pure and DOM-free. It reads the doc shape organs/in/ocr.js emits (spans with belief, a log)
// and an optional `lexicon` — the vocabulary of "what else we have" (the rest of the corpus).
// The tests drive it in Node exactly as the reader does.

import { parseText, editWithin, fuzzCeiling, tok } from '../../perceiver/parse/index.js';
import { CONVERSATIONAL_CAP } from '../../turn/converse/index.js';

const isNum = (x) => typeof x === 'number' && isFinite(x);
const normWord = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// A span's own weight as context — how much its vocabulary should be trusted to correct
// OTHER lines. Its belief when the quorum set one; else its confidence; else a neutral prior.
// A confident, corroborated line lends its words a strong pull; a shaky one, barely any.
const spanWeight = (span, cap) => {
  const b = span?.ref?.belief;
  if (isNum(b)) return b;
  const c = span?.ref?.confidence;
  if (isNum(c)) return (c / 100) * cap;
  return cap * 0.5;
};

// A line the quorum did NOT settle unanimously with ≥2 eyes is open to a context guess; a
// line every eye agreed on is trusted as-is. No tuned threshold — the corroboration bar
// (enactor/ground/corroboration.js: two eyes) decides, the same bar everything else reads.
const isEligible = (span) => {
  const r = span?.ref;
  if (!r) return true;                                  // a classic single-eye scan — all lines open
  return !((r.eyes ?? 1) >= 2 && !r.disagreement);
};

// ── the context — the vocabulary of "what else we have" ──────────────────────────
//
// buildOcrContext(doc, external) → { support, surface, belief, confident, entities }
//   support   norm → Σ span-weight over every line the term appears in (+ external weight).
//   surface   norm → its most frequent original casing (what a correction writes).
//   belief    norm → the greatest span-weight of any line that attests it (how trusted a
//             witness the term has — a garble is only corrected toward a BETTER-attested word).
//   confident Set of norms that appear on a fully-corroborated line or in the external lexicon
//             — the words we will NOT treat as garbles, however odd they look.
//   entities  Set of admitted entity norms (parse/entities.js) — the priority targets: a
//             misread NAME is worse than a misread common word.
//
// `external` is the corpus context: an array of strings, or of { term, weight?, surface? }, or
// a Map(term → weight). Each external term enters as CONFIDENT at the witness cap — established
// vocabulary the current scan is being read against.
export const buildOcrContext = (doc, external = null, cap = CONVERSATIONAL_CAP) => {
  const support = new Map(), surfaceCount = new Map(), belief = new Map();
  const confident = new Set(), entities = new Set();

  const bump = (raw, weight, { isConfident = false } = {}) => {
    const norm = normWord(raw);
    if (norm.length < 2) return;
    support.set(norm, (support.get(norm) || 0) + weight);
    belief.set(norm, Math.max(belief.get(norm) || 0, weight));
    const sc = surfaceCount.get(norm) || new Map();
    const label = String(raw).trim();
    sc.set(label, (sc.get(label) || 0) + 1);
    surfaceCount.set(norm, sc);
    if (isConfident) confident.add(norm);
  };

  const spans = doc?.spans || [];
  spans.forEach((s) => {
    const w = spanWeight(s, cap);
    const trusted = !isEligible(s);                     // a fully-corroborated line is confident vocab
    for (const t of tok(s.text || '')) bump(t, w, { isConfident: trusted });
  });

  // The reader's admitted entities, read off the CONFIDENT lines only — the names the document
  // itself vouches for. The entity notion is the reader's (parse/entities.js), not a regex here.
  try {
    const confidentText = spans.filter((s) => !isEligible(s)).map((s) => s.text).join('. ');
    if (confidentText.trim()) {
      const parsed = parseText(confidentText);
      const admitted = parsed?.admission?.admitted ? [...parsed.admission.admitted.keys()] : [];
      for (const label of admitted) {
        for (const word of String(label).split(/\s+/)) {
          const norm = normWord(word);
          if (norm.length >= 2) { entities.add(norm); confident.add(norm); bump(word, cap, { isConfident: true }); }
        }
      }
    }
  } catch { /* best-effort — a doc the reader cannot parse simply yields no entity targets */ }

  // The external corpus vocabulary — "what else we have", entered as established (confident, at cap).
  const addExternal = (term, weight, surface) => {
    if (!term) return;
    bump(surface || term, isNum(weight) ? weight : cap, { isConfident: true });
    const norm = normWord(term);
    if (norm.length >= 2) confident.add(norm);
  };
  if (external instanceof Map) for (const [term, weight] of external) addExternal(term, weight);
  else if (Array.isArray(external)) for (const e of external) (typeof e === 'string') ? addExternal(e) : addExternal(e?.term, e?.weight, e?.surface);

  const surface = new Map();
  for (const [norm, sc] of surfaceCount) surface.set(norm, [...sc.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]);
  return { support, surface, belief, confident, entities };
};

// guessWord(coreNorm, ctx, hereBelief) → { to, evidence, belief } | null
//
// The heart of "what it likely means": a garble is re-read as the term the CONTEXT vouches for.
// Not a dictionary lookup — the reader's own bounded-Levenshtein under its length-aware ceiling
// (parse/fuzzy.js), the SAME primitive the ear folds name variants with. A correction fires only
// when the target is:
//   · within the fuzz ceiling (a near-spelling, not a different word),
//   · BETTER attested than the garble (more support), and
//   · vouched for by a MORE-BELIEVED line than the one we are editing (hereBelief) — the
//     "re-hear the shaky one to the confident one" rule, so a confident line is never dragged
//     toward a shaky one.
// Entities win ties: a misread name is the correction that matters most.
const guessWord = (coreNorm, ctx, hereBelief) => {
  if (coreNorm.length < 4) return null;                 // fuzzCeiling(≤3)=0 — nothing to correct toward
  if (ctx.confident.has(coreNorm)) return null;         // a trusted word, however odd — not a garble
  const selfSupport = ctx.support.get(coreNorm) || 0;

  let best = null;
  for (const [t, sup] of ctx.support) {
    if (t === coreNorm) continue;
    if (sup <= selfSupport) continue;                   // only toward a BETTER-attested term
    if ((ctx.belief.get(t) || 0) <= hereBelief) continue; // vouched for by a more-believed line
    const ceil = Math.min(fuzzCeiling(coreNorm.length), fuzzCeiling(t.length));
    if (ceil < 1) continue;
    const d = editWithin(coreNorm, t, ceil);
    if (d < 1 || d > ceil) continue;                    // a near-spelling, not identical, not far
    const isEnt = ctx.entities.has(t) ? 1 : 0;
    // Prefer: fewer edits, then an entity, then better attested, then more-believed, then lexical.
    const score = [d, -isEnt, -sup, -(ctx.belief.get(t) || 0)];
    if (!best || cmp(score, best.score) < 0) best = { to: t, d, score, support: sup, belief: ctx.belief.get(t) || 0, entity: !!isEnt };
  }
  if (!best) return null;
  return {
    to: ctx.surface.get(best.to) || best.to,
    evidence: `${best.entity ? 'entity' : 'term'} "${ctx.surface.get(best.to) || best.to}" attested at belief ${best.belief.toFixed(3)} (${best.d} edit${best.d > 1 ? 's' : ''} away)`,
    belief: best.belief,
  };
};
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; } return 0; };

// Split a line into whitespace-separated tokens, keeping the separators so the corrected line
// reassembles byte-for-byte except where a word changed. Each word token is peeled into
// (leading punctuation, alnum core, trailing punctuation) so a garble wearing brackets — "]3en,"
// — is matched on its core and rebuilt with its punctuation intact.
const CORE = /^([^\p{L}\p{N}]*)([\p{L}\p{N}].*[\p{L}\p{N}]|[\p{L}\p{N}])([^\p{L}\p{N}]*)$/u;

// ── resolveOcrInContext — the self-editing pass ──────────────────────────────────
//
// resolveOcrInContext(doc, { lexicon, cap }) — re-read every eligible (not-fully-corroborated)
// line against the context, and land each accepted guess on the append-only log. Mutates `doc`
// in place (span.text patched, span.raw/​revisedFrom set, text + char ranges reprojected) and
// returns a receipt { guesses, edits, rules } — inert (empty receipt, nothing appended) when no
// line has a better-attested near-spelling to move to, so a clean scan is byte-identical to one
// that never ran this. `lexicon` is the corpus context ("what else we have").
export const resolveOcrInContext = (doc, { lexicon = null, cap = CONVERSATIONAL_CAP } = {}) => {
  const empty = { guesses: [], edits: 0, rules: [] };
  if (!doc || !doc.log || !Array.isArray(doc.spans) || !doc.spans.length) return empty;

  const ctx = buildOcrContext(doc, lexicon, cap);
  const spans = doc.spans;

  // Pass 1 — compute the corrected line for every eligible span, mutating nothing yet.
  const edits = [];   // { span, index, from, to, belief, words:[{from,to,evidence}] }
  spans.forEach((span, index) => {
    if (!isEligible(span)) return;
    const hereBelief = spanWeight(span, cap);
    const words = [];
    const rebuilt = String(span.text || '').split(/(\s+)/).map((tokn) => {
      if (!tokn || /^\s+$/.test(tokn)) return tokn;
      const m = tokn.match(CORE);
      if (!m) return tokn;
      const [, pre, core, post] = m;
      const g = guessWord(normWord(core), ctx, hereBelief);
      if (!g || normWord(g.to) === normWord(core)) return tokn;
      words.push({ from: core, to: g.to, evidence: g.evidence });
      return pre + matchCase(core, g.to) + post;
    }).join('');
    if (words.length && rebuilt !== span.text) edits.push({ span, index, from: span.text, to: rebuilt, words });
  });
  if (!edits.length) return empty;

  // Pass 2 — apply the text changes, then reproject the char ranges so the new loci are exact.
  const insSeqById = new Map();
  for (const e of doc.log.snapshot()) if (e.op === 'INS' && e.id != null && !insSeqById.has(e.id)) insSeqById.set(e.id, e.seq);
  for (const e of edits) { e.span.raw = e.span.raw ?? e.span.text; e.span.text = e.to; }
  reprojectSpans(doc);

  // Pass 3 — land the DEF·EVA·REC·SEG·INS trail on the log, pointing at the reprojected spans.
  const guesses = [], rules = [];
  for (const e of edits) {
    const span = e.span;
    const supportBelief = Math.max(...e.words.map((w) => beliefOf(ctx, w.to)), 0);
    const guessBelief = +Math.min(cap, supportBelief || spanWeight(span, cap)).toFixed(4);
    const locus = `${doc.docId}#${span.page != null ? `page=${span.page}&` : ''}${span.bbox ? `xywh=${span.bbox.join(',')}&` : ''}char=${span.charStart},${span.charEnd}`;
    const oldSeq = insSeqById.get(span.id);
    if (oldSeq != null) doc.log.retract(oldSeq, `re-read in context: "${e.from}" ⇒ "${e.to}"`);
    doc.log.append({ op: 'INS', id: span.id, label: 'line', kind: 'guessed', sentIdx: e.index, w: guessBelief, locus });
    doc.log.append({ op: 'DEF', id: span.id, key: 'revisedFrom', value: e.from, sentIdx: e.index, locus });
    for (const w of e.words) {
      doc.log.append({ op: 'DEF', id: span.id, key: 'context-evidence', value: `${w.from} ⇒ ${w.to} — ${w.evidence}`, sentIdx: e.index, locus });
      doc.log.append({ op: 'REC', kind: 'context-unify', token: normWord(w.from), expansion: normWord(w.to), via: 'ocr-context-guess', weight: guessBelief, sentIdx: e.index });
      rules.push({ from: w.from, to: w.to, evidence: w.evidence });
    }
    doc.log.append({ op: 'EVA', id: span.id, reason: 'ocr-context-guess', value: `${e.from} ⇒ ${e.to}`, sentIdx: e.index, locus });

    span.revisedFrom = e.from;
    span.guessed = true;
    if (span.ref) { span.ref.rawBelief = span.ref.belief ?? null; span.ref.belief = guessBelief; span.ref.guessed = true; }
    guesses.push({ id: span.id, index: e.index, from: e.from, to: e.to, belief: guessBelief, words: e.words });
  }

  syncArrays(doc);
  doc.guesses = guesses;
  return { guesses, edits: guesses.length, rules };
};

// revertOcrGuesses(doc) → { reverted } — peel the guess layer straight back off. Restores every
// guessed span to its RAW reading and records the reversal on the log (SEG retract of the guess
// + INS re-mint of the raw + EVA reason), so undoing a guess is itself an auditable act — nothing
// is unwritten, in either direction. Inert when no guesses were made.
export const revertOcrGuesses = (doc) => {
  if (!doc || !doc.log || !Array.isArray(doc.spans)) return { reverted: 0 };
  const guessed = doc.spans.filter((s) => s.guessed && s.raw != null);
  if (!guessed.length) return { reverted: 0 };

  for (const s of guessed) { s.text = s.raw; s.guessed = false; s.revisedFrom = null; delete s.raw; }
  reprojectSpans(doc);

  const guessInsById = new Map();
  for (const e of doc.log.snapshot()) if (e.op === 'INS' && e.kind === 'guessed' && e.id != null) guessInsById.set(e.id, e.seq);
  doc.spans.forEach((span, index) => {
    const seq = guessInsById.get(span.id);
    if (seq == null) return;
    const locus = `${doc.docId}#char=${span.charStart},${span.charEnd}`;
    doc.log.retract(seq, `reverted context guess on ${span.id}`);
    doc.log.append({ op: 'INS', id: span.id, label: 'line', kind: 'reverted', sentIdx: index, locus });
    doc.log.append({ op: 'EVA', id: span.id, reason: 'ocr-guess-reverted', value: span.text, sentIdx: index, locus });
    if (span.ref && span.ref.rawBelief != null) { span.ref.belief = span.ref.rawBelief; span.ref.guessed = false; }
  });

  syncArrays(doc);
  doc.guesses = [];
  return { reverted: guessed.length };
};

// The belief the context lends a term (the max span-weight of any line attesting it).
const beliefOf = (ctx, surfaceOrNorm) => ctx.belief.get(normWord(surfaceOrNorm)) || 0;

// Write the correction in the garble's own case shape: an ALL-CAPS garble → an all-caps
// correction, a Capitalized one → capitalized, else the context's stored surface.
const matchCase = (from, to) => {
  const f = String(from), t = String(to);
  if (f && f === f.toUpperCase() && f !== f.toLowerCase()) return t.toUpperCase();
  if (f && f[0] === f[0].toUpperCase() && f.slice(1) === f.slice(1).toLowerCase()) return t.charAt(0).toUpperCase() + t.slice(1);
  return t;
};

// Recompute doc.text and every span's [charStart,charEnd) from the (edited) span texts — the
// SAME layout assembleDocument lays down (a line breaks with a blank line, a cell with a tab),
// so a corrected line's downstream address stays exact. doc.spans is authoritative after an edit
// (spanAt reads it); a length-changing guess shifts later siblings' char ranges here, and their
// re-minted guess INS carries the fresh locus — the page+bbox address, the one a crop renders
// from, never moves whatever the text does.
const reprojectSpans = (doc) => {
  let text = '';
  for (const s of doc.spans) {
    s.charStart = text.length;
    text += String(s.text || '');
    s.charEnd = text.length;
    text += (s.kind === 'cell' ? '\t' : '\n\n');
  }
  doc.text = text.trimEnd();
};

// Re-derive the projected views (sentences, units, tokensBySentence) and the per-span reads
// (confidence, belief) from the patched spans, so every projection follows the edited log.
const syncArrays = (doc) => {
  doc.sentences = doc.spans.map((s) => s.text);
  doc.units = doc.spans.map((s) => `${s.kind || 'line'}: ${String(s.text).slice(0, 60)}${String(s.text).length > 60 ? '…' : ''}`);
  doc.tokensBySentence = doc.sentences.map((s) => new Set(tok(s)));
  doc.confidence = doc.spans.map((s) => s.ref?.confidence ?? null);
  doc.belief = doc.spans.map((s) => s.ref?.belief ?? null);
};
