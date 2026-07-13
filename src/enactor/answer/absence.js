// EO: DEF·SEG(Field,Void → Lens,Field, Dissecting·Clearing) — typed absence: which nothing is this?
// The Work v2 #4 — the void retyped by its CAUSE. NUL is first-class, but the REASON for
// doing nothing is itself a judgment, hence a DEF carrying which absence:
//
//   retrieval-miss   present but unreached — the adversarial REFILL aimed at the empty slot
//                    FINDS the material. Not a void at all: the found spans feed forward and
//                    the turn answers. "VOID does not fire on unreached-but-present" is the
//                    law this probe enforces; the honest verdict is INDETERMINATE ("the
//                    absence could not be measured — the reading had not looked here yet").
//   corpus           truly absent — the refill also failed, and the failure RIDES IN THE
//                    WITNESS: a corpus void is only declared with its failed probe attached,
//                    never as the residue of "retrieval found little".
//   evaluation       the Elvis "best" — the corpus holds the subject but never RANKS it. A
//                    post-draw probe: the answer asserted a value judgment (typed EVA by
//                    ground/predication.js, unsupported), and a scan of every subject-bearing
//                    sentence plus a refill aimed at the ranking finds no entailing judgment.
//                    The absence of an evaluation is invisible to the field measure (the
//                    subject retrieves fine); it is witnessed by the exhaustive scan.
//   reference        the field scattered across unresolved senses — typed upstream by v2 #3
//                    (the mention DEFs and the ask); recorded at the field grain as a pointer
//                    to those DEFs. Codd's UNKNOWN, not cleared: no corpus claim is made.
//
// Every probe is mechanical and its witness carries the replay inputs (the refill query and
// its hits, the probed sentence indices, the mention count) — a later reader re-runs the
// probe from the witness alone. No fallthrough: each absence is the POSITIVE result of its
// own probe, and a probe that cannot run yields no verdict.

import { retrieveLexical, querySubjectTerms } from '../../surfer/retrieve/index.js';
import { evalTermOf, evalEntails } from '../ground/predication.js';

// A refill hit at or above this overlap score contradicts the measured void — the same
// strong-hit bar the field measure trusts (surfer/answerable.js STRONG_SCORE).
export const REFILL_STRONG = 0.5;
// The evaluation scan is capped — bounded work, and the cap rides in the witness.
export const EVAL_SCAN_CAP = 24;

const stem = (t) => String(t || '').toLowerCase().replace(/['’]s$/, '').replace(/s$/, '');
const mentionsSubject = (text, subject) => {
  const s = stem(subject);
  return String(text || '').toLowerCase().split(/[^a-z0-9'’-]+/).some((w) => stem(w) === s);
};

// typeAbsence — challenge a MEASURED void (surfer/answerable.js fieldVerdict) before it is
// declared: aim a second, differently-armed retrieval at the empty slot. A strong hit → the
// absence was a retrieval miss (spans returned, turn answers); no hit → the void is CORPUS,
// carrying the failed probe as part of its witness.
export const typeAbsence = ({ doc, question, verdict = null } = {}) => {
  if (!doc || !verdict) return null;
  const subjectTerms = querySubjectTerms(String(question || ''));
  const refillQuery = (subjectTerms.length ? subjectTerms.join(' ') : String(question || '')).trim();
  let hits = [];
  try { hits = retrieveLexical(doc, refillQuery, 4) || []; } catch { hits = []; }
  const found = hits.map((h) => ({ idx: h.idx, score: Math.round((h.score || 0) * 1000) / 1000 }));
  const strong = hits.filter((h) => (h.score || 0) >= REFILL_STRONG);
  if (strong.length) {
    return Object.freeze({
      cause: 'retrieval-miss',
      refill: Object.freeze({ query: refillQuery, found: Object.freeze(found), bar: REFILL_STRONG }),
      refillSpans: Object.freeze(strong.map((h) => ({ idx: h.idx, text: h.text, score: h.score, via: 'refill' }))),
    });
  }
  return Object.freeze({
    cause: 'corpus',
    voidMeasure: Object.freeze({
      ...verdict,
      cause: 'corpus',
      probes: Object.freeze({ refill: Object.freeze({ query: refillQuery, found: Object.freeze(found), bar: REFILL_STRONG }) }),
    }),
  });
};

// evaluationAbsence — the post-draw probe. The answer asserted a value judgment the binder
// typed EVA and could not support; scan every subject-bearing sentence (capped) and a refill
// aimed at the ranking for ANY entailing judgment. None → the evaluation void, witnessed by
// the exhaustive scan. A subject the corpus never mentions is not an evaluation void (that is
// the corpus probe's territory); an entailing judgment found late means the binder should
// have cited — return null and let the citation flags speak.
export const evaluationAbsence = ({ doc, bound = [] } = {}) => {
  if (!doc) return null;
  const row = bound.find((b) => b?.typed?.op === 'EVA' && b.typed.verdict === 'unsupported' && b.typed.eval?.subject);
  if (!row) return null;
  const { subject, claim: term } = row.typed.eval;
  const sentences = doc.sentences || doc.units || [];
  const probed = [];
  for (let i = 0; i < sentences.length && probed.length < EVAL_SCAN_CAP; i++) {
    if (mentionsSubject(sentences[i], subject)) probed.push(i);
  }
  if (!probed.length) return null;   // the corpus never holds the subject — not an evaluation void
  let refillFound = [];
  try {
    refillFound = (retrieveLexical(doc, `${subject} ${term}`, 4) || [])
      .map((h) => ({ idx: h.idx, score: Math.round((h.score || 0) * 1000) / 1000 }));
  } catch { refillFound = []; }
  const scanIdxs = [...new Set([...probed, ...refillFound.map((f) => f.idx)])];
  for (const idx of scanIdxs) {
    const se = evalTermOf(sentences[idx] || '');
    if (se && evalEntails(se, term) !== false && mentionsSubject(sentences[idx], subject)) {
      return null;   // a judgment is there after all — the binder's flags own this, not the void
    }
  }
  const n = probed.length;
  return Object.freeze({
    cause: 'evaluation',
    subject,
    term,
    mentionCount: n,
    probed: Object.freeze(scanIdxs),
    refill: Object.freeze({ query: `${subject} ${term}`, found: Object.freeze(refillFound) }),
    text: `The sources mention ${subject} ${n === 1 ? 'once' : `${n} times`}, but no source ranks or evaluates ${subject} — nothing witnesses "${term}".`,
  });
};
