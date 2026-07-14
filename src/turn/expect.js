// EO: DEF·EVA(Field → Atmosphere,Lens, Clearing,Binding) — answer expectation
// The answer expectation — the prompt read as a PREDICTION of its own answer.
// (docs/answer-expectation.md)
//
// The predictive-processing move: comprehending a prompt already constrains its answer,
// before any content arrives. A good answer is the one that satisfies those constraints and
// discharges the prediction error the prompt opened. "Knowing what a good answer looks like"
// is the prompt's own forward model — sometimes a single filler ("what is her name?" → a
// proper noun), more often a set of constraints on FORM and RELATION-TO-SOURCE ("say it
// backwards", "in three sentences", "as a poem").
//
// The deciding axis is not WHICH of N templates the prompt matched — it is how CHECKABLE the
// constraint is, and with what PRECISION:
//   • mechanical / self-verifying (a transform against the source the engine owns: order,
//     length) → high precision → a miss GATES a restart;
//   • structural heuristic (does it read as verse?) → low precision → FLAG, never gate;
//   • taste ("write a GOOD poem") → no honest check → no constraint at all → OPEN.
// So an arbitrary prompt is handled by default: it yields no constraint, no gate, no flag —
// the engine just answers. The loop arms only where it can honestly measure the miss. This
// is the same discipline the reading side runs: act where the signal can be gated against
// chance, abstain where it cannot.

import { namedReferents } from '../perceiver/index.js';
import { isAbstention } from '../enactor/ground/index.js';

const norm = (s) => String(s || '').trim();

// ── The prediction: read the prompt's constraints ────────────────────────────

// A NAME lookup — "what is her name?", "what is it called", "what is the name of …". The
// answer is a proper noun and little else satisfies it. Narrow on purpose: never captures
// "what is this about" (a summary) or "what is a chrysalis" (a definition).
const NAME = new RegExp(
  '\\bwhat(?:\'s| is| was| are| were)\\s+(?:his|her|their|its|the)\\s+names?\\b' +
  '|\\bwhat\\s+(?:is|was|are|were)\\s+(?:he|she|it|they)\\s+called\\b' +
  '|\\bwhat(?:\'s| is)\\s+the\\s+name\\s+of\\b' +
  '|\\bname\\s+of\\s+(?:the|this|that|his|her|their|its)\\b',
  'i',
);
const WHO  = /\bwho\s+(?:is|was|are|were|'s)\b/i;
const POEM = /\b(poem|in\s+verse|as\s+verse|haiku|sonnet|limerick)\b/i;

const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const numFrom = (w) => /^\d+$/.test(w) ? parseInt(w, 10) : (WORDNUM[String(w).toLowerCase()] ?? null);

// A LENGTH bound — "in one word", "in three sentences", "in 50 words". A transform on the
// answer's own size: mechanically checkable, so it gates. Returns { unit, max } or null.
const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a)';
const readLength = (q) => {
  let m;
  if ((m = new RegExp(`\\b(?:in|to|with(?:in)?|under|at\\s+most)\\s+(?:just\\s+|only\\s+)?${NUM}\\s+words?\\b`, 'i').exec(q))) {
    const n = m[1].toLowerCase() === 'a' ? 1 : numFrom(m[1]); if (n) return { unit: 'word', max: n };
  }
  if ((m = new RegExp(`\\b(?:in|to|with(?:in)?|under|at\\s+most)\\s+(?:just\\s+|only\\s+)?${NUM}\\s+sentences?\\b`, 'i').exec(q))) {
    const n = m[1].toLowerCase() === 'a' ? 1 : numFrom(m[1]); if (n) return { unit: 'sentence', max: n };
  }
  return null;
};

// An ORDER constraint — "backwards", "in reverse", "in order", "chronologically". A
// transform on the SOURCE the engine owns: the answer's claims should bind to the source in
// the requested direction, which the existing citation indices let us check. Returns
// 'desc' (backwards) | 'asc' (forward) | null.
const readOrder = (q) => {
  if (/\b(backwards?|in\s+reverse|reverse\s+order|reversed|last\s+to\s+first|end\s+to\s+(?:the\s+)?(?:start|beginning))\b/i.test(q)) return 'desc';
  if (/\b(in\s+order|in\s+sequence|chronological(?:ly)?|first\s+to\s+last|start\s+to\s+(?:the\s+)?(?:end|finish))\b/i.test(q)) return 'asc';
  return null;
};

export const SLOT = Object.freeze({ NAME: 'name', WHO: 'who', OPEN: 'open' });

// expectAnswer(question) → { constraints: [{ id, dim, precision, gates, params }], gates }.
// Each constraint is a typed prediction with a precision (how sharply the prompt types its
// answer) and a `gates` flag (whether a miss is checkable enough to stop and answer again).
// OPEN — an empty constraint set — on every prompt that does not type its answer in a way
// the engine can honestly measure, so the default turn is byte-identical.
export const expectAnswer = (question) => {
  const q = norm(question);
  const c = [];
  if      (NAME.test(q)) c.push({ id: 'name', dim: 'name', precision: 0.9, gates: true });
  else if (WHO.test(q))  c.push({ id: 'who',  dim: 'who',  precision: 0.5, gates: false });
  const len = readLength(q); if (len) c.push({ id: 'length', dim: 'length', precision: 0.85, gates: true, params: len });
  const ord = readOrder(q);  if (ord) c.push({ id: 'order',  dim: 'order',  precision: 0.6,  gates: true, params: { dir: ord } });
  if (POEM.test(q))          c.push({ id: 'form-poem', dim: 'form', precision: 0.3, gates: false, params: { form: 'poem' } });
  return { constraints: c, gates: c.some((x) => x.gates) };
};

// Whether the expectation needs the referent resolved (only the name check does) — so the
// turn resolves it lazily, for name prompts alone.
export const needsReferent = (expectation) =>
  !!expectation?.constraints?.some((c) => c.dim === 'name');

// ── A proper name, told from a description ───────────────────────────────────

const DESCRIPTOR = /^(?:his|her|their|its|the|a|an|this|that|these|those|my|your|our|he|she|it|they)\b/i;
export const isProperName = (label) => {
  const s = norm(label);
  return s.length > 0 && /^\p{Lu}/u.test(s) && !DESCRIPTOR.test(s);
};
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── The error signal: which constraints did the answer miss? ─────────────────

const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const sentCount = (t) => t.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length;

// One constraint, checked against the produced answer. Returns null (satisfied / not
// checkable here) or { reason, params?, expectedName? }.
const checkConstraint = (c, text, { doc, referent, bound }) => {
  switch (c.dim) {
    case 'name': {
      const expectedName = referent && isProperName(referent.label) ? norm(referent.label) : null;
      if (expectedName) {
        const head  = expectedName.split(/\s+/)[0];
        const gives = new RegExp(`\\b${escapeRe(head)}\\b`, 'i').test(text);
        return gives ? null : { expectedName,
          reason: `asked for a name; the reading resolved it as “${expectedName}”, but the answer does not give it` };
      }
      if (!doc) return null;
      return namedReferents(doc, text).length === 0
        ? { reason: 'asked for a name; the answer names no one — it describes instead of naming' }
        : null;
    }
    case 'length': {
      const n = c.params.unit === 'word' ? wordCount(text) : sentCount(text);
      return n > c.params.max
        ? { params: c.params, reason: `asked for ${c.params.max} ${c.params.unit}${c.params.max > 1 ? 's' : ''}; the answer runs to ${n}` }
        : null;
    }
    case 'order': {
      if (!Array.isArray(bound)) return null;
      const idx = bound.filter((b) => b.citation)
        .map((b) => parseInt(String(b.citation).slice(1), 10)).filter(Number.isFinite);
      if (idx.length < 3) return null;                 // too few cited claims to judge — don't gate
      let wrong = 0, pairs = 0;
      for (let i = 1; i < idx.length; i++) {
        if (idx[i] === idx[i - 1]) continue;
        pairs++;
        const descending = idx[i] < idx[i - 1];
        if (c.params.dir === 'desc' ? !descending : descending) wrong++;
      }
      return (pairs > 0 && wrong / pairs > 0.5)
        ? { params: c.params, reason: `asked for ${c.params.dir === 'desc' ? 'reverse' : 'forward'} order; the answer follows the source the other way` }
        : null;
    }
    case 'form': {
      if (c.params.form === 'poem') {
        const lines = text.split(/\n/).map((s) => s.trim()).filter(Boolean);
        return lines.length < 2
          ? { params: c.params, reason: 'asked for a poem; the answer is a single prose block, not verse' }
          : null;
      }
      return null;
    }
    default: return null;
  }
};

// answerPredictionError(prediction, answerText) → the divergence between the engine's OWN
// grounded generation (the mechanical writer's draft, src/write) and the talker's answer.
// The mechanical draft is the prior / efference copy: it says, from the graph alone, what
// the answer is about — for "what is her name?" it carries the focus figure's name. When the
// grounded reading confidently centers on a NAMED figure that the fluent answer never names
// (and is not an honest abstention), that omission is a prediction error — the under-answer
// mirror of a confabulation. This is the general predictor: no question template, just "the
// answer dropped what the grounded reading was about." Gates only when the reading was
// CONCENTRATED (the coref field settled on one figure); otherwise it rides as a flag.
export const answerPredictionError = (prediction, answerText) => {
  const name = prediction?.primaryName;
  if (!name || !isProperName(name)) return null;
  const text = norm(answerText);
  if (!text || isAbstention(text)) return null;
  const head = name.split(/\s+/)[0];
  if (new RegExp(`\\b${escapeRe(head)}\\b`, 'i').test(text)) return null;
  return {
    id: 'coverage', dim: 'coverage', gates: !!prediction.confident, expectedName: name,
    reason: `the grounded reading centers on “${name}”, but the answer never names them`,
  };
};

// answerConstraintErrors(expectation, answerText, { doc, referent, bound }) → the prediction
// errors: the constraints the answer did not satisfy, each tagged with whether it gates. An
// honest abstention ("I did not find it") satisfies every GATING constraint — reporting the
// typed gap is the correct terminal, not a miss to retry (a soft form constraint can still
// flag). Empty array when the answer fits, or when the prompt typed nothing checkable.
export const answerConstraintErrors = (expectation, answerText, { doc = null, referent = null, bound = null } = {}) => {
  const out = [];
  if (!expectation?.constraints?.length) return out;
  const text = norm(answerText);
  if (!text) return out;                               // empty is the `empty` veto's job
  const abstain = isAbstention(text);
  for (const c of expectation.constraints) {
    if (abstain && c.gates) continue;                  // the honest gap fills any hard constraint
    const e = checkConstraint(c, text, { doc, referent, bound });
    if (e) out.push({ id: c.id, dim: c.dim, gates: c.gates, ...e });
  }
  return out;
};
