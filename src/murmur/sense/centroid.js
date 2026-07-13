// EO: SIG·NUL(Void,Atmosphere → Atmosphere, Tending,Clearing) — the drift anchor
// The running session-topic centroid — the vector the drift signal is measured AGAINST
// (spec §5). This is NOT the live query. The distinction is load-bearing: a follow-up like
// "yeah go research that" or "no the worst MOVIE" carries almost no topical content of its
// own, and anchoring drift on that garbled string lets retrieval wander freely (spec §5,
// the worst-movie exchange-2 failure). So:
//
//   · turn 1 of a topic   → anchor = the opening query embedding
//   · later turns         → anchor = the resolved session-topic centroid
//   · deictic follow-up   → anchor = the centroid (never the contentless query)
//
// This is the single riskiest tuning surface in the spec (§14): too sticky and a real
// topic CHANGE reads as drift; too loose and "go research that" resets the anchor to noise.
// The rule below is deliberately conservative — a content query far from the topic RELOCATES
// the anchor (an explicit user redirect dominates, spec §9.6); a deictic or on-topic query
// only nudges it (EMA). Phase-1 shipped the bare centroid; phase-4 (cross-turn linking) keeps
// each prior reading's LOCUS (`ref`) beside its vector so a recognition can point BACK at the
// specific earlier event, not merely report that one exists.

import { cosine, meanVec } from './geometry.js';

// A cheap deictic / low-content classifier (spec §14 — "a cheap classifier for 'this query
// is deictic/contentless'"). No model: content-word count + a small deictic-marker set.
// "that" / "it" / "this one" / "go research that" / "yeah" are the exemplars from the spec.
const DEICTIC = new Set([
  'that', 'it', 'this', 'those', 'these', 'them', 'they', 'one', 'ones', 'there',
  'yeah', 'yes', 'no', 'ok', 'okay', 'sure', 'go', 'do', 'more', 'again', 'research',
  'tell', 'me', 'about', 'the', 'a', 'an', 'and', 'so', 'now', 'please', 'continue',
]);
const wordsOf = (q) => String(q || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

export const isDeictic = (query, maxWords = 4) => {
  const ws = wordsOf(query);
  if (ws.length === 0) return true;
  const content = ws.filter(w => !DEICTIC.has(w) && w.length > 2);
  // Short AND mostly function/deictic words → deictic. A long query with real content is not,
  // even if it opens with "yeah" or "no".
  if (content.length === 0) return true;
  return ws.length <= maxWords && content.length <= 1;
};

// createSessionTopic({ decay, shiftFloor, deicticMaxWords, historyTurns })
// A stateful tracker across a session. Feed it one snapshot per turn; it yields the anchor
// to measure drift against, folds accepted queries into the topic, and keeps a ring of
// prior-turn reading centroids for novelty / recognition.
export const createSessionTopic = ({
  decay = 0.25, shiftFloor = 0.35, deicticMaxWords = 4, historyTurns = 24,
} = {}) => {
  let topic = null;          // the running anchor vector (Float32Array)
  let turns = 0;             // topics seen (turn 1 = opening query)
  const priorCentroids = []; // ring of { vector, ref } — prior-turn readings + their locus (novelty/recognition)

  // resolve({ query, queryVec }) — decide the drift anchor for THIS turn and update the topic,
  // BEFORE drift is measured. This is the load-bearing move (spec §5, §9.6, §14): a user redirect
  // must never read as drift. Drift means the READING wandered while the QUERY stayed on thread;
  // a content query that itself diverges is a topic SHIFT (the user chose it), so we re-anchor to
  // the query FIRST and measure the reading against where the user just pointed.
  //
  //   · turn 1                    → topic = query; anchor = query
  //   · deictic follow-up         → anchor = topic (never the contentless query, spec §5)
  //   · content query on-topic    → nudge topic (EMA); anchor = topic
  //   · content query off-anchor  → SHIFT: topic = query; anchor = query (an explicit redirect)
  //
  // Returns { anchor, deictic, shifted, sim, turn } — the classification, for audit legibility.
  const resolve = ({ query = '', queryVec = null } = {}) => {
    turns += 1;
    const deictic = isDeictic(query, deicticMaxWords);
    let shifted = false, sim = null;

    if (!queryVec) return Object.freeze({ anchor: topic, deictic, shifted, sim, turn: turns });

    if (!topic) {
      topic = Float32Array.from(queryVec);            // turn 1 — establish the topic
    } else if (deictic) {
      /* contentless follow-up — do NOT move the anchor; measure drift against the topic (§5) */
    } else {
      sim = cosine(queryVec, topic);
      if (sim != null && sim < shiftFloor) {
        topic = Float32Array.from(queryVec);          // SHIFT — the user redirected (§9.6, §14)
        shifted = true;
      } else {
        const t = new Float32Array(topic.length);     // same topic — nudge toward the query (EMA)
        for (let i = 0; i < t.length; i++) t[i] = (1 - decay) * topic[i] + decay * (queryVec[i] || 0);
        topic = t;
      }
    }
    return Object.freeze({ anchor: topic, deictic, shifted, sim, turn: turns });
  };

  // Append this turn's reading centroid to the novelty/recognition ring (spec §5). Called AFTER
  // drift/novelty are measured, so the current reading is never compared against itself. `ref` is
  // the reading's LOCUS ({ turnId, docId, sentIdxs, t }) — kept beside the vector so a later
  // recognition can name the specific earlier event it matched, not just its similarity (phase 4).
  const pushReading = (readingCentroid = null, ref = null) => {
    if (readingCentroid && readingCentroid.length) {
      priorCentroids.push({ vector: Float32Array.from(readingCentroid), ref: ref || null });
      while (priorCentroids.length > historyTurns) priorCentroids.shift();
    }
  };

  return {
    resolve,
    pushReading,
    // The priors as of NOW, excluding the current turn's own centroid — the caller reads these
    // to compute novelty against, then calls pushReading() to append the current one. Each entry
    // is { vector, ref }: the reading vector and the locus it was read at (phase-4 recognition).
    priors: () => priorCentroids.slice(),
    get topic() { return topic; },
    get turns() { return turns; },
    reset() { topic = null; turns = 0; priorCentroids.length = 0; },
  };
};

export { meanVec };
