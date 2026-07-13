// EO: DEF·EVA(Field,Link → Lens,Link, Dissecting·Binding) — the bounded predicate-argument aligner
// The Work v2 #2 — binding retyped from token overlap to a same-vs-other DEF over PREDICATION,
// typed by operator: DEF-support (the span predicates the asserted value of the asserted
// subject), CON-support (the span holds the relation with resolved arguments and a predicate
// AT LEAST as strong), EVA-support (the span holds a judgment entailing the asserted
// evaluation). Argument alignment grounds out at INS — the resolved ids of enactor/props.js,
// the same parse the edge-grounding fact-checker reads — and PREDICATE STRENGTH STAYS THE
// AUTHORED LAYER: two small hand-written tables (a strength order per verb family, an
// evaluation lexicon with polarity and degree), grown by hand, never learned.
//
// The trap this module exists to refuse: an NLI/embedding oracle — a stamp with no
// re-judgeable grammar. Everything here is a bounded, authored, mechanical check whose
// witness carries the full replay inputs; where the tables are silent, the verdict is
// INDETERMINATE — the underconfidence residue ("referred" vs "recommended") ships uncited
// rather than guessed. tri-state throughout: true / false / null, and null is a verdict.

import { parseProps, relKey } from '../props.js';
import { typeOf } from '../../core/index.js';

// The authored evaluation lexicon — VALUE judgments (polarity × degree), not descriptive
// superlatives: "best" ranks, "smallest" measures. Grown by hand; silence is the residue.
export const EVAL_LEXICON = Object.freeze({
  best:      Object.freeze({ polarity: 1,  degree: 3 }),
  greatest:  Object.freeze({ polarity: 1,  degree: 3 }),
  finest:    Object.freeze({ polarity: 1,  degree: 3 }),
  excellent: Object.freeze({ polarity: 1,  degree: 2 }),
  great:     Object.freeze({ polarity: 1,  degree: 2 }),
  good:      Object.freeze({ polarity: 1,  degree: 1 }),
  decent:    Object.freeze({ polarity: 1,  degree: 1 }),
  worst:     Object.freeze({ polarity: -1, degree: 3 }),
  terrible:  Object.freeze({ polarity: -1, degree: 2 }),
  awful:     Object.freeze({ polarity: -1, degree: 2 }),
  bad:       Object.freeze({ polarity: -1, degree: 1 }),
});

// The authored strength order, per verb family, strongest first. A span predicate supports a
// claim predicate only when it is AT LEAST as strong; the table's silence is not a license.
export const PREDICATE_STRENGTH = Object.freeze({
  endorse: Object.freeze(['recommended', 'endorsed', 'referred', 'mentioned']),
  say:     Object.freeze(['insisted', 'stated', 'said', 'suggested', 'implied']),
});

const stem = (t) => String(t || '').toLowerCase().replace(/['’]s$/, '').replace(/s$/, '');
const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9'’-]+/).filter(Boolean);

// strengthAtLeast(spanVia, claimVia) → true (span predicate is at least as strong), false
// (decidably weaker), null (the tables are silent — the residue). Identical predicates and
// same-primitive projections are trivially at-least-as-strong.
export const strengthAtLeast = (spanVia, claimVia) => {
  const s = stem(spanVia), c = stem(claimVia);
  if (!s || !c) return null;
  if (s === c) return true;
  const sk = relKey(s), ck = relKey(c);
  if (sk && ck && sk === ck) return true;   // same primitive under the relation algebra
  for (const family of Object.values(PREDICATE_STRENGTH)) {
    const si = family.findIndex((w) => stem(w) === s);
    const ci = family.findIndex((w) => stem(w) === c);
    if (si >= 0 && ci >= 0) return si <= ci;   // strongest first: lower index = stronger
  }
  return null;
};

// evalEntails(spanEval, claimEval) → does the span's value judgment entail the claim's?
// Same polarity and at-least-the-degree → true; same polarity, decidably weaker → false;
// opposite polarity → false; either side outside the lexicon → null (the residue).
export const evalEntails = (spanEval, claimEval) => {
  const s = EVAL_LEXICON[stem(spanEval)] ?? EVAL_LEXICON[String(spanEval || '').toLowerCase()];
  const c = EVAL_LEXICON[stem(claimEval)] ?? EVAL_LEXICON[String(claimEval || '').toLowerCase()];
  if (!s || !c) return null;
  if (s.polarity !== c.polarity) return false;
  return s.degree >= c.degree;
};

// The first evaluation term a stretch of text asserts, or null.
export const evalTermOf = (text) => {
  for (const w of words(text)) {
    if (EVAL_LEXICON[w] || EVAL_LEXICON[stem(w)]) return EVAL_LEXICON[w] ? w : stem(w);
  }
  return null;
};

// valueEntails(spanValue, claimValue) → tri-state entailment between two DEF values.
//   true   the span's value contains the claim's (or vice versa), or every primitive the
//          claim's value projects to (typeOf, plural-stemmed — sister/sibling/brother → one
//          primitive) is held by the span's value, or the evaluation lexicon decides it;
//   false  the evaluation lexicon decides against it (weaker degree / opposite polarity);
//   null   the tables are silent — the residue.
export const valueEntails = (spanValue, claimValue) => {
  const sv = String(spanValue || '').toLowerCase(), cv = String(claimValue || '').toLowerCase();
  if (!sv || !cv) return null;
  if (sv.includes(cv) || cv.includes(sv)) return true;
  const prims = (v) => new Set(words(v).map((w) => typeOf(w)?.type || typeOf(stem(w))?.type).filter(Boolean));
  const cp = prims(cv);
  if (cp.size) {
    const sp = prims(sv);
    if ([...cp].every((t) => sp.has(t))) return true;
  }
  const se = evalTermOf(sv), ce = evalTermOf(cv);
  if (ce) return se ? evalEntails(se, ce) : null;
  return null;
};

// A copular evaluation the SVO parser cannot resolve ("The bottlenose is the best dolphin."):
// subject phrase before the copula, an evaluation term after it. Bounded and authored — this
// is the Elvis-"best" shape, typed even when no admission id resolves.
const COPULA = /^(?:the\s+|an?\s+)?([a-z0-9'’-]+(?:\s+[a-z0-9'’-]+)?)\s+(?:is|are|was|were)\s+(.+)$/i;
const evalPattern = (claim) => {
  const m = String(claim || '').trim().replace(/[.!?]+$/, '').match(COPULA);
  if (!m) return null;
  const term = evalTermOf(m[2]);
  if (!term) return null;
  const subject = words(m[1]).filter((w) => w.length > 2).pop() || null;   // the head noun
  return subject ? { subject, term } : null;
};

// typeClaim(claim, doc, cursor) → the claim's typed predication, or null (untypeable — the
// caller falls back to the lexical floor, which stays byte-identical).
//   { op:'CON', prop }   a resolved two-place relation (arguments ground at INS)
//   { op:'EVA', prop }   a resolved one-place DEF whose value is an evaluation
//   { op:'EVA', eva }    the copular-evaluation pattern (no resolved subject id)
//   { op:'DEF', prop }   a resolved one-place predication
export const typeClaim = (claim, doc, cursor = Infinity) => {
  let props = [];
  try { props = parseProps(claim, doc, cursor); } catch { props = []; }
  const prop = props[0] || null;
  if (prop?.kind === 'rel') return { op: 'CON', prop };
  if (prop?.kind === 'def') {
    return evalTermOf(prop.attr?.value) ? { op: 'EVA', prop } : { op: 'DEF', prop };
  }
  const eva = evalPattern(claim);
  return eva ? { op: 'EVA', eva } : null;
};

// predicationSupport(typed, spans, doc, cursor) → the same-vs-other verdict over the
// predication, against the RETRIEVED spans (the binder's own candidates):
//   { verdict: 'supported'|'unsupported'|'indeterminate', spanIdx, reason,
//     alignment?, strength?, eval? } — every field a replay input.
// Span propositions are parsed at the SAME cursor as the claim (one field, symmetric
// resolution: a verbatim claim always meets its own span's parse). The scan keeps the best
// outcome: any supporting span wins; a residue (tables silent) outranks a plain miss.
export const predicationSupport = (typed, spans = [], doc = null, cursor = Infinity) => {
  if (!typed) return null;
  const spanProps = (s) => { try { return parseProps(s.text || '', doc, cursor); } catch { return []; } };

  // The copular-evaluation shape: scan span TEXTS for the subject plus an entailing value
  // judgment — the corpus either ranks the subject, or it does not.
  if (typed.op === 'EVA' && typed.eva) {
    const { subject, term } = typed.eva;
    let residue = null;
    const probed = [];
    for (const s of spans) {
      const text = String(s.text || '').toLowerCase();
      if (!words(text).some((w) => stem(w) === stem(subject))) continue;
      probed.push(s.idx);
      const se = evalTermOf(text);
      if (!se) continue;
      const e = evalEntails(se, term);
      if (e === true) return { verdict: 'supported', spanIdx: s.idx, reason: 'eval-entailed', eval: { claim: term, span: se, subject } };
      if (e === null) residue = { spanIdx: s.idx, span: se };
    }
    if (residue) return { verdict: 'indeterminate', spanIdx: residue.spanIdx, reason: 'eval-unordered', eval: { claim: term, span: residue.span, subject, probed } };
    return { verdict: 'unsupported', spanIdx: null, reason: 'never-ranked', eval: { claim: term, span: null, subject, probed } };
  }

  const cp = typed.prop;
  if (!cp) return null;

  if (typed.op === 'CON') {
    const sym = !!typeOf(String(cp.rel || '').toLowerCase())?.symmetric;
    let residue = null, weaker = null;
    for (const s of spans) {
      for (const p of spanProps(s)) {
        if (p.kind !== 'rel') continue;
        const direct = p.subj === cp.subj && p.obj === cp.obj;
        const flipped = (sym || !!typeOf(String(p.rel || '').toLowerCase())?.symmetric)
          && p.subj === cp.obj && p.obj === cp.subj;
        if (!direct && !flipped) continue;
        const alignment = { spanIdx: s.idx, subj: cp.subj, obj: cp.obj, orientation: direct ? 'direct' : 'flipped' };
        const st = strengthAtLeast(p.rel, cp.rel);
        if (st === true) return { verdict: 'supported', spanIdx: s.idx, reason: 'relation-held', alignment, strength: { claim: cp.rel, span: p.rel, order: true } };
        if (st === null) residue = { spanIdx: s.idx, alignment, strength: { claim: cp.rel, span: p.rel, order: null } };
        else weaker = { spanIdx: s.idx, alignment, strength: { claim: cp.rel, span: p.rel, order: false } };
      }
    }
    if (residue) return { verdict: 'indeterminate', reason: 'strength-unordered', ...residue };
    if (weaker) return { verdict: 'unsupported', reason: 'predicate-weaker', ...weaker };
    return { verdict: 'unsupported', spanIdx: null, reason: 'no-witnessing-prop', alignment: { subj: cp.subj, obj: cp.obj } };
  }

  // DEF (and EVA over a resolved prop): the span must predicate the asserted value of the
  // asserted subject; a same-subject predication the tables cannot compare is the residue.
  let residue = null, touched = false;
  for (const s of spans) {
    for (const p of spanProps(s)) {
      if (p.kind !== 'def' || p.subj !== cp.subj) continue;
      touched = true;
      const e = valueEntails(p.attr?.value, cp.attr?.value);
      if (e === true) return { verdict: 'supported', spanIdx: s.idx, reason: 'value-entailed', alignment: { spanIdx: s.idx, subj: cp.subj, claimValue: cp.attr?.value, spanValue: p.attr?.value } };
      if (e === null) residue = { spanIdx: s.idx, alignment: { spanIdx: s.idx, subj: cp.subj, claimValue: cp.attr?.value, spanValue: p.attr?.value } };
    }
  }
  if (residue) return { verdict: 'indeterminate', reason: 'value-unordered', ...residue };
  return { verdict: 'unsupported', spanIdx: null, reason: touched ? 'value-not-held' : 'no-witnessing-prop', alignment: { subj: cp.subj, claimValue: cp.attr?.value } };
};
