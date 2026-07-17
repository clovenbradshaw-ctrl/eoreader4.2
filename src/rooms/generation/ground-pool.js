// EO: SEG·SIG(Field → Field, Clearing,Tending) — source text → a ranked ground pool
// ground-pool.js — the generation surface's own span builder. The essay driver
// (weave/essay) writes FROM a ground pool of { idx, score, text } spans — the
// same shape the reader's retrieval and the longgen walk both consume — but a
// pasted draft or a set of research notes arrives as one blob of prose, not a
// pool. This is the SEG that resplits it (sentence grain, the finest unit the
// binder can cite) and the SIG that scores each sentence's salience, so a piece
// of source material becomes citable evidence without any model call: the same
// "modelless read path" discipline the rest of the engine holds.
//
// The score is a cheap, transparent blend — never a substitute for a real
// retrieval organ, only enough of a prior that a thesis-relevant sentence
// out-ranks an incidental one when the driver's default (span-window) explore
// picks candidates: position (early material carries the frame), topic-term
// overlap (does this sentence speak to what the piece is about), and length
// (a fuller sentence is more likely to carry a whole claim).

import { termsOf, termSimilarity } from '../../weave/essay/index.js';

// A sentence boundary: punctuation followed by whitespace/end, or the final
// unterminated run. Kept simple and dependency-free — the perceiver's own
// sentence segmenter is a different holon's internals, not this surface's to
// reach into for a one-shot span split.
const SENT_RE = /[^.!?\n]+[.!?]+(?=\s|$)|[^.!?\n]+$/g;
const MIN_CHARS = 8;      // shorter than this is a fragment, not a citable claim
const MAX_SPANS = 400;    // a hard ceiling — a long paste stays a ground pool, not a token bill

export const splitSentences = (text = '') => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  return (t.match(SENT_RE) || [])
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_CHARS)
    .slice(0, MAX_SPANS);
};

const round3 = (x) => Math.round(x * 1000) / 1000;

// buildGroundPool(text, { topic }) -> [{ idx, score, text }], ranked-pool shape
// (weave/essay's `spans`, weave/longgen's `fold` / `ground`). `topic` is the
// thesis or outline lead — its terms bias the score toward what the piece is
// actually about, so the driver's default retrieval opens on relevant material
// even before any claim has bound.
export const buildGroundPool = (text = '', { topic = '' } = {}) => {
  const sentences = splitSentences(text);
  const n = sentences.length;
  if (!n) return [];
  const topicTerms = topic ? termsOf(topic) : [];
  return sentences.map((s, i) => {
    const position = n > 1 ? 1 - (i / (n - 1)) * 0.3 : 1;
    const overlap = topicTerms.length ? termSimilarity(termsOf(s), topicTerms).sim : 0;
    const length = Math.min(1, s.length / 220);
    const score = Math.max(0.05, Math.min(1, 0.35 * position + 0.45 * overlap + 0.2 * length));
    return Object.freeze({ idx: i, score: round3(score), text: s });
  });
};
