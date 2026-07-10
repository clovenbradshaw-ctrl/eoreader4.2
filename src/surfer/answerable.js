// EO: EVA·DEF·NUL(Field,Entity → Void, Clearing,Tending) — answerability — is field void
// Answerability — is there an answer to give, or is the field VOID here?
//
// (docs/answerability.md) The talker's worst failure is the invented answer: hand
// a model a question whose answer is not in the material and it fills the gap with
// probable tokens — "the situation in the …" wants a place, so it invents one (the
// documented invented-location lie; see prompt-assembly.md / edge-grounding.md).
// The fold's notes are the cure on the GENERATION side. This is the cure BEFORE
// generation: do not ask the talker to answer from a field that holds nothing.
//
// It is the same discipline the equivalence and motion readers already run
// (read/equivalence.js, read/motion.js, tests/void.test.js): propose a structure,
// measure it against the noise null the field's own non-cohering background throws
// up by chance, and when nothing beats the null, HOLD (NUL) and assert the absence
// (a DEF to VOID). Here the proposed structure is "there is an answer to this
// question where it landed"; the field is the witness, the gradient is the verdict,
// the step is mechanical — the witness-does-not-decide rule applied to the response.
// The route gate decides WHETHER to read the document; this decides whether the
// reading found anything to say.
//
// A MEASUREMENT, not a choice, and conservative by construction: it claims VOID only
// when (1) no referent the question names resolves in the document, (2) no retrieval
// hit is strong, and (3) the field where the question landed is measurably flat — its
// steepest Bayesian-surprise peak fails to beat a noise null that was actually
// MEASURABLE (enough samples; never a cold-start abstention). Anything short of all
// three lets the talker speak. A short or unmeasurable field is never voided — assume
// an answer until the void is measured.

import { surfFold } from './surf.js';
import { deriveNull, MIN_SAMPLES } from '../core/index.js';
import { namedReferents } from '../perceiver/index.js';
import { tok } from '../perceiver/parse/index.js';

// The hallucination budget for the turn's void boundary: the tolerated probability
// of mistaking the field's own noise for an answer. Larger → a lower null → fewer
// VOIDs (the talker speaks more, tolerating thinner answers); smaller → a higher
// null → more "the document does not say." A policy, not an overlap value — the
// physics computes the threshold that delivers it (read/voidnull.js). Exposed so a
// caller (or a future certainty dial) can move it per turn.
export const ANSWERABLE_ALPHA = 0.05;

// A retrieval hit is STRONG — real material, not an incidental token — when its
// score clears this, or it shares at least this many content tokens with the
// question. Mirrors eoreader3's strong-lexical gate.
const STRONG_SCORE = 0.5;
const STRONG_OVERLAP = 2;

// The pure void-boundary decision over a field's Bayesian-surprise values. The field
// is VOID when its steepest peak fails to beat the noise null derived from the rest
// of the field (leave-one-out, extreme-value, robust — read/voidnull.js), AND that
// null was measurable. An unmeasurable null (too few samples, or a contaminated bulk
// → Infinity) is NOT void: abstain toward an answer rather than assert an absence off
// a null we cannot trust. Pure, so the boundary math is testable without a document.
export const fieldIsVoid = (bayesValues, { alpha = ANSWERABLE_ALPHA } = {}) => {
  const xs = (bayesValues || []).filter(Number.isFinite);
  if (xs.length < MIN_SAMPLES) return false;          // too thin to know → not void
  const peak = Math.max(...xs);
  const noiseNull = deriveNull(xs, { scale: 'linear', alpha, leaveOut: peak });
  if (!Number.isFinite(noiseNull)) return false;       // unmeasurable → abstain, not void
  return peak <= noiseNull;                             // even the steepest point is noise
};

// Does the question name a proper noun the document never tokenised? When it does,
// the absence is ELSEWHERE — a real referent, not in this scope — rather than
// NEVER-SET. Reached only after namedReferents came back empty, so a capitalised
// content word here is one the document's admitted entities do not carry.
const QWORD = new Set(['who', 'what', 'where', 'when', 'why', 'how', 'is', 'are', 'was',
  'were', 'does', 'do', 'did', 'the', 'a', 'an', 'can', 'could', 'would', 'should',
  'will', 'which', 'whose', 'i', "i'm"]);
const absentProperNoun = (doc, question) => {
  const byIdx = doc?.tokensBySentence || [];
  const names = String(question || '').match(/\b[A-Z][A-Za-z'’-]{2,}\b/g) || [];
  for (const nm of names) {
    if (QWORD.has(nm.toLowerCase())) continue;
    const t = nm.toLowerCase();
    const inDoc = byIdx.some((set) => set && set.has && set.has(t));
    if (!inDoc) return nm;
  }
  return null;
};

const overlapAt = (doc, qTokens, idx) => {
  const set = doc?.tokensBySentence?.[idx];
  if (!set || !set.has) return 0;
  let n = 0;
  for (const t of qTokens) if (set.has(t)) n++;
  return n;
};

// The answerability verdict for a question against the document and its retrieved
// spans. Pure, deterministic, no model. Returns { void:false } when the talker should
// answer, or { void:true, kind, receipt, ... } when the response is a typed absence.
// `kind` is the void-typology terrain (docs/answerability.md):
//   never-set — the page never addressed it (carries a scan receipt)
//   elsewhere — a named referent not in this document (carries the term)
export const fieldVerdict = (doc, question, spans = [], opts = {}) => {
  const notVoid = { void: false };
  if (!doc) return notVoid;                            // pure chat: nothing to be void about
  const units = doc.units || doc.sentences || [];
  if (!units.length) return notVoid;

  // (1) The question's subject resolves to an admitted referent → the field has it.
  if ((namedReferents(doc, question) || []).length) return notVoid;

  // (2) A strong retrieval hit → real material was found (by score, or content overlap).
  const qTokens = tok(question);
  const strong = spans.some((s) =>
    (s.score ?? 0) >= STRONG_SCORE || overlapAt(doc, qTokens, s.idx) >= STRONG_OVERLAP);
  if (strong) return notVoid;

  const receipt = `scanned ${units.length} sentence${units.length === 1 ? '' : 's'}`;

  // (3) Nothing retrieved above the floor. The clearest VOID: the page never addressed
  // it. A named proper noun absent from the document is ELSEWHERE; an ordinary
  // unanswerable question is NEVER-SET.
  if (!spans.length) {
    const term = absentProperNoun(doc, question);
    return term
      ? { void: true, kind: 'elsewhere', term, receipt, rode: 'retrieval-void' }
      : { void: true, kind: 'never-set', receipt, rode: 'retrieval-void' };
  }

  // (4) Weak spans exist. Is there STRUCTURE where the question landed, or only the
  // field's own noise? Surf the anchor and measure its reach against the void boundary
  // — if even the steepest Bayesian-surprise peak fails to beat what this context
  // throws up by chance, the field is empty here.
  const anchor = spans[0]?.idx ?? 0;
  const surf = surfFold(doc, anchor);
  const reachBayes = (surf.field || []).map((f) => f.bayes);
  if (fieldIsVoid(reachBayes, { alpha: opts.alpha ?? ANSWERABLE_ALPHA })) {
    return { void: true, kind: 'never-set', receipt, rode: 'bayesian-void' };
  }
  return notVoid;
};
