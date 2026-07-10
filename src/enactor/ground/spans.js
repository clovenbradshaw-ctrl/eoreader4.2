// EO: EVA·CON(Field,Network → Link,Lens, Binding,Tracing) — per-span provenance + badge (groundSpans)
// ground/spans.js — per-SPAN provenance, so every span of an answer is grounded.
//
// The requirement: every span the reader sees must carry a legible provenance — it is
// EITHER from a source (and then: precisely WHERE — which source, which line, verbatim)
// OR from the LLM (the model's own words, grounded to the void — its training, nothing
// read witnesses it). This is the answer-grain projection of the type law the whole
// engine already speaks (core/provenance.js): exafference (the perceiver door, the world
// read) can anchor; reafference (the enactor door, the model) cannot. classifyProvenance
// (ground/provenance.js) already renders that verdict per PROPOSITION and names the void
// honestly; this module lifts it to the SPAN the reader actually hovers, and — the piece
// that was missing — pins each source span to the exact passage it came from, so the hover
// can say not just "from a source" but "from THIS line of THIS source", jumpable.
//
// EVERYTHING IS GROUNDED. A span nothing read witnesses is not un-annotated — it is
// grounded to the void, and the surface says so plainly. So the projection TILES the whole
// answer: every span gets a verdict, none is left bare. That is what "every span needs to
// be grounded" means here — not that the model may only lift, but that the reader can see,
// for every span, whether it was read or said, and where.
//
// Pure and DOM-free (like ground/reflect.js): the chat renders what this returns.

import { classifyProvenance } from './provenance.js';

// CITE_VERBATIM — the overlap at or above which a lexical match is a genuine LIFT: so much of the
// claim is the passage's own words that the surface IS the grounding, and no propositional check is
// owed (the same 0.6 the groundSpans doc-guard treats as near-verbatim). Below it, shared vocabulary
// is not yet evidence of a lift.
export const CITE_VERBATIM = 0.6;

// citationHolds(claim, passageText, lexScore) → may this lexical match stand as a CITATION?
//
// A citation CERTIFIES that the passage it points to is where the claim came from. Lexical overlap
// alone cannot make that promise honestly: a claim can borrow a passage's nouns yet assert a relation
// the passage never makes — "dolphins ... help other animals, including humans, in distress" scores a
// high overlap against "dolphins ... exhibit sexual behavior towards other animals, including humans"
// on the shared phrase, but the passage witnesses NONE of the claim (empathy, help, distress). Pinning
// a citation there severs it from the claim it is meant to carry — the exact failure that retired the
// essay pipeline (eo-gen.js). So below the verbatim floor the passage must actually WITNESS the claim:
// classifyProvenance asks the propositional question (the SAME figures in the SAME relation, coref by
// label) that raw overlap cannot. A near-verbatim overlap needs no such check — it is the lift itself.
//
// Fail SAFE, not silent: a parse fault (or an empty parse the caller cannot interpret) must never cost
// a citation on its own, so on any throw we degrade to the lexical verdict the caller already had. The
// gate only ever DEMOTES a match that made lexical contact but no propositional one — it never invents
// a citation, and it never fires above the verbatim floor.
export const citationHolds = (claim, passageText, lexScore) => {
  if (!(lexScore < CITE_VERBATIM)) return true;   // near-verbatim (or NaN) → a genuine lift, it stands
  try {
    return classifyProvenance(String(claim ?? ''), [String(passageText ?? '')]).anyWitnessed;
  } catch {
    return true;   // the parser must never be the reason a citation is dropped
  }
};

// The content terms a span binds on — the same shape the reader's _researchTerms and the
// witness's contentWords use: lowercased words of ≥3 chars, function words stripped. The one
// unavoidable lexical boundary (a span arrives as words); past it, meaning decides.
const STOP = new Set(('a an the of to in on at by for with and or but nor so yet as is was were are be been being it its it\'s he she they them his her their him this that these those not no into out over under up down off then than now once would will do did had has have from about into their our your my me we you i').split(' '));
const terms = (s) => (String(s ?? '').toLowerCase().match(/[a-z][a-z0-9'’-]{2,}/g) || []).filter((t) => !STOP.has(t));
// The same content-term read, exported: the self-read weld's refold signal uses it
// so "does this sentence carry enough content to bind anywhere" is ONE rule here
// and there — a connective that binds nowhere is scaffolding, never contamination.
export const contentTerms = terms;

// The best passage a span lifts from, by content-term overlap — the same lexical floor the
// reader's _citeAnnotate binds on (≥2 shared terms, overlap ≥ minOverlap). Returns the
// matched passage and the overlap score, or null. This is what carries the PRECISE location:
// a passage is { u (the source), idx (its line index in that source), text (the verbatim line) }.
const bestPassage = (tset, passages, minOverlap) => {
  let best = null, bestScore = 0;
  for (const p of passages) {
    if (!p.set.size) continue;
    let hit = 0;
    for (const t of tset) if (p.set.has(t)) hit += 1;
    const score = hit / tset.size;
    if (hit >= 2 && score > bestScore) { bestScore = score; best = p; }
  }
  return best ? { passage: best, score: bestScore } : null;
};

// The doc line a graph-grounded span most likely came from, when no retrieved passage carried
// it (a claim grounded by the graph's coref, not lifted from one line). Best content-term
// overlap over the document's own sentences; returns { u, idx, text } or null. This gives a
// grounded-but-not-verbatim span an honest, if coarser, "where".
const locateInDoc = (tset, doc) => {
  const units = doc?.units || doc?.sentences || [];
  if (!units.length) return null;
  let best = -1, bestScore = 0;
  for (let i = 0; i < units.length; i++) {
    const set = new Set(terms(units[i]));
    if (!set.size) continue;
    let hit = 0;
    for (const t of tset) if (set.has(t)) hit += 1;
    const score = hit / tset.size;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0 || bestScore <= 0) return null;
  const u = (typeof doc.origin === 'function' ? doc.origin(best)?.docId : null) ?? doc.docId ?? null;
  return { u, idx: best, text: String(units[best]), score: bestScore };
};

// Does the DOCUMENT witness this span's meaning? classifyProvenance judges the span's
// propositions against the doc's own graph (coref intact) and names the ground: a witnessed
// proposition (verbatim OR grounded) stands on the world; one witnessed by nothing read
// stands on the void. Returns 'witnessed' | 'void' | null (no doc, or no proposition to
// judge — a pure connective the parser reads no relation out of). Never throws — a parse
// fault degrades to the lexical verdict, it never costs the annotation.
const docWitness = (text, doc) => {
  if (!doc) return null;
  try {
    const c = classifyProvenance(text, { doc });
    if (!c.propositions.length) return null;
    return c.anyWitnessed ? 'witnessed' : 'void';
  } catch { return null; }
};

// A span grounded to the void — the model's own words. The witness IS the void (its
// training); nothing read anchors it. But the void is a REAL ground, not an absence: the model
// is a provenance in its own right, and sometimes the best one to assert a thing. So a model
// span still carries provenance — it names the model as the source, and its ROLE:
//   'assertion'  the model puts forward a substantive claim on its own knowledge (its
//                training). Not lifted from what you read — but a real, attributable claim,
//                weighed as the model's word. This needs provenance as much as a source does.
//   'connective' the writer's own phrasing joining the grounded points — scaffolding that
//                asserts nothing a source would need to carry.
const llm = (text, role) => Object.freeze({ text, kind: 'llm', witness: 'void', role, source: null });

// A span anchored to a read source — from the perceiver door (exafference), which can
// witness. `source` carries the PRECISE location the reader hovers to: the source, the line
// index within it, and the verbatim line text.
const sourced = (text, source) => Object.freeze({
  text, kind: 'source', witness: 'exafference',
  source: Object.freeze({ u: source.u ?? null, idx: source.idx ?? null, text: String(source.text ?? ''), label: source.label ?? null, score: source.score ?? null }),
});

// groundSpans(spans, { passages, doc, minOverlap, minTerms }) → one verdict per input span,
// in order — the per-span provenance projection.
//
//   spans      the answer split into the spans the reader will hover (sentences/clauses).
//   passages   the retrieved source excerpts the answer drew on — [{ u, idx|i, text }] — the
//              jumpable "where precisely". u is the source, idx its line index there.
//   doc        optional — the reading's own doc, to judge meaning propositionally (coref
//              intact) and guard the word-salad false positive the lexical floor alone lets
//              through (ground/provenance.js: a salad sharing a span's words witnesses nothing).
//
// Each verdict: { text, kind: 'source' | 'llm', witness: 'exafference' | 'void',
//                 source: null | { u, idx, text, label, score } }.
export const groundSpans = (spans, { passages = [], doc = null, minOverlap = 0.3, minTerms = 3 } = {}) => {
  const ps = (passages || [])
    .filter((p) => p && p.text != null)
    .map((p, k) => ({ u: p.u ?? null, idx: (p.idx ?? p.i ?? k), text: String(p.text), label: p.label ?? null, set: new Set(terms(p.text)) }));

  return (spans || []).map((raw) => {
    const text = String(raw ?? '');
    const toks = terms(text);
    // Too little content to bind — the model's own connective/scaffolding words. Honest as void
    // with the 'connective' role: it names nothing a source could carry, and asserts nothing.
    if (toks.length < minTerms) return llm(text, 'connective');

    const tset = new Set(toks);
    const lex = bestPassage(tset, ps, minOverlap);
    const wit = docWitness(text, doc);

    if (lex) {
      // A lexical hit is a CANDIDATE, not a verdict. A near-verbatim overlap is a genuine lift and
      // stands even where the parser read no relation. Below that floor the shared words must
      // actually WITNESS the claim, or they are the topic's own vocabulary — the salad the whole
      // answer shares with passages that are ABOUT the subject (a conservation answer over
      // conservation passages: every sentence touches "conservation / species / international", so
      // raw overlap marked fabricated IUCN/WWF/right-whale claims "sourced" and the badge read
      // "matched"). Three witnesses, strongest first: the doc's coref-intact reading ('void' is a
      // definitive deny, 'witnessed' a definitive pass); else whether the CITED PASSAGE itself
      // witnesses the claim (citationHolds — the SAME propositional gate the render binder reads,
      // one rule for the inline citation and the badge alike). A parse fault degrades to the lift.
      if (wit === 'void' && lex.score < CITE_VERBATIM) return llm(text, 'assertion');
      if (lex.score >= CITE_VERBATIM || wit === 'witnessed') return sourced(text, { ...lex.passage, score: lex.score });
      if (citationHolds(text, lex.passage.text, lex.score)) return sourced(text, { ...lex.passage, score: lex.score });
      return llm(text, 'assertion');
    }

    // No passage carried it, but the graph witnesses the meaning (a coref-grounded claim, not
    // lifted from one line): source, located at the doc line that most nearly carries it.
    if (wit === 'witnessed') {
      const loc = locateInDoc(tset, doc);
      if (loc) return sourced(text, loc);
      return Object.freeze({ text, kind: 'source', witness: 'exafference', source: null });
    }

    // Nothing read witnesses it — but it carries content: the model ASSERTS it, on its own
    // knowledge. A real, attributable claim (grounded to the void), not a source lift — marked
    // as the model's word so the reader weighs it as such. The model needs provenance too.
    return llm(text, 'assertion');
  });
};

// groundSummary(verdicts) → the answer-grain tally the register badge reads: how many spans
// stand on a source vs on the model (and, of those, how many are the model ASSERTING vs merely
// phrasing), and whether the whole answer is one or the other. `allModel` is the "just the
// model" case the surface must EXPRESS — every span is the model's own, none lifted from a
// source; `modelAsserts` says the model is putting forward real claims, not just connecting.
export const groundSummary = (verdicts) => {
  const v = verdicts || [];
  const source = v.filter((s) => s.kind === 'source').length;
  const assertion = v.filter((s) => s.kind === 'llm' && s.role === 'assertion').length;
  const llmN = v.length - source;
  return Object.freeze({
    total: v.length, source, llm: llmN, assertion,
    allSourced: v.length > 0 && llmN === 0,
    allVoid: v.length > 0 && source === 0,
    allModel: v.length > 0 && source === 0,          // the "just the model" answer — express it
    modelAsserts: assertion > 0,                      // the model puts forward real claims of its own
  });
};

// supportVerdict(summary, { floor, minClaims }) → { supported, kind, ratio, claims, source } — the
// ANSWER-GRAIN bind-check verdict a grounding badge reads. A "grounded / matched" badge CLAIMS the
// passages shown beside the answer are WHERE THE ANSWER CAME FROM; that claim is only honest when
// enough of the settled prose actually traces to a source. groundSummary already tallies how many
// spans stand on a source vs on the model — this turns that tally into the badge decision, once,
// modality-neutrally, so the chat path and the text organ share ONE rule instead of each hand-rolling
// a floor. (The failure this closes: an answer whose passages are a NAMESAKE of the subject — a bird
// question answered over football "Ravens" passages — draws nothing from them, yet a keyword touch
// still badged it "matched". Its spans are all void, so this reads 'void' and the caller demotes.)
//
// The denominator is the SUBSTANTIVE claims (source + the model's own assertions), NOT every span:
// connective scaffolding asserts nothing a source would carry, so counting it would unfairly drag a
// well-grounded-but-fluent answer under the floor. The kinds:
//   'void'    → nothing substantive traces to a source — the passages are misleading; the answer is
//               the model's own words. The badge must say so, never imply a cite that isn't there.
//   'partial' → some traces, but under the floor — keep the passages visible yet drop the firm
//               "matched" claim: the answer is the model's synthesis, not a direct lift.
//   'sourced' → a real share stands on a source; a grounded badge is honest, left untouched.
// A short answer (< minClaims substantive spans) is too small to demote on ratio alone — one grounded
// claim keeps it — but the pure-void case (source === 0) still demotes at any length. Nothing to judge
// (no substantive spans) is a no-op: supported, so an empty/degenerate answer never gets falsely demoted.
export const SUPPORT_FLOOR = 0.25;
export const supportVerdict = (summary, { floor = SUPPORT_FLOOR, minClaims = 3 } = {}) => {
  const s = summary || {};
  const source = s.source || 0;
  const assertion = s.assertion || 0;
  const claims = source + assertion;                 // the substantive spans; connectives don't count
  const ratio = claims ? source / claims : 0;
  if (claims === 0)      return { supported: true,  kind: 'sourced', ratio: 0, claims, source };
  if (source === 0)      return { supported: false, kind: 'void',    ratio: 0, claims, source };
  if (claims < minClaims) return { supported: true,  kind: 'sourced', ratio, claims, source };
  if (ratio < floor)     return { supported: false, kind: 'partial', ratio, claims, source };
  return { supported: true, kind: 'sourced', ratio, claims, source };
};
