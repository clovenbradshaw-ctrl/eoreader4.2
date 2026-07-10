// EO: SIG(Field → Atmosphere, Tracing) — meaning reader; 1-cos surprise
// The meaning reader — the richer `read` the skeleton was built to receive (§11).
//
// The enacted loop (loop.js) is unchanged. The skeleton fed it the cheap γ-mass
// surprise — modelless, thin, real but blind to meaning: it spikes when a new
// FIGURE arrives, and misses a topic or tone shift that introduces no new name.
// This deepens the surprise WITHOUT touching the loop, exactly as the design
// promised: "the same machinery deepens with no shape change — only a richer
// read." The frames, strain, REC, cross-layer testing, and the arrow of time are
// identical; only the per-cursor divergence is now measured in MEANING space.
//
// SURPRISE is the prediction error in the centroids' space: how far the clause
// sits from the γ-decayed semantic prior the reading carried into it. A clause
// that continues the current sense is near the prior (low surprise, the frame
// holds); a clause that turns the sense is far (high surprise, strain accrues
// toward a REC) — even when no new figure enters, which is the depth the γ-mass
// reader cannot see.
//
// THE FIREWALL. Meaning-distance is only real in the space the embedder measures.
// Under the hash organ a cosine is spelling, not meaning, so buildMeaningRead
// returns null and the caller falls back to the cheap reader — the same no-commit
// discipline the classifier runs. The meaning reader is honest only on MiniLM.
//
// TERMS stay the salient figures (the frame's human-readable label); the deepening
// is the surprise that DRIVES restructuring, not the labelling. Frames standing on
// semantic terrain rather than figure lists is a further step, noted in the doc.
//
// CONTRIB is the per-dimension axis the surprise strains ALONG — the same bayesBy the
// cheap path supplies. The meaning 1−cos says HOW FAR the sense moved (the magnitude
// that breaks the frame); bayesBy says along WHICH figures belief moved (the axis the
// REC restructures toward). Wiring it is what lets the deep reader restructure toward
// the cause of the break, not whatever figures were merely in view — the cheap path
// got this; the meaning path, the one that matters, had been left without it.

import { buildClauses } from '../../perceiver/parse/clause-layer.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Build the per-cursor meaning-distance surprise over a document's clauses, async.
// Returns { surprise, terms, contrib } ready to drive createEnactedLoop, or null when
// the embedder cannot measure meaning.
//
// CLAUSE GRAIN (clause-layer.js) — the depth the sentence pool erased. The surprise
// was measured over one pooled vector per whole SENTENCE, so a compound sentence whose
// second clause turned the sense had that turn averaged into its calm first clause and
// never broke a frame. We now γ-decay the prior and measure the 1−cos divergence over
// CLAUSES in reading order (a finer prior AND a finer divergence), then fold each
// sentence's clauses back to its cursor by MAX — the loud clause sets the sentence's
// surprise instead of being diluted by the quiet one. The enacted loop still steps by
// SENTENCE cursor (surprise.length === sentences.length), so nothing downstream changes.
// A document of simple single-clause sentences is byte-identical: one clause per
// sentence, max over one element, the same series as before.
export const buildMeaningRead = async (doc, embedder, { gamma = 0.7, termsAt, contribAt } = {}) => {
  if (!embedder?.measuresMeaning) return null;          // hash organ → fall back (firewall)
  const sentences = doc.units || doc.sentences || [];
  if (!sentences.length) return { surprise: [], terms: [] };

  // Prefer the doc's prebuilt clause layer; derive it when absent (a non-text organ,
  // or a bare parseText/stub doc the meaning tests build). Fall back to sentence grain
  // only if segmentation yields nothing at all (defensive — a doc of blank units).
  const clauses = (Array.isArray(doc.clauses) && doc.clauses.length)
    ? doc.clauses
    : buildClauses(sentences);
  const useClauses = clauses.length > 0;
  const units = useClauses ? clauses.map(c => c.text) : sentences;
  const sentOf = useClauses ? clauses.map(c => c.sentIdx) : sentences.map((_, i) => i);

  // Embed with THIS embedder directly — never the doc's shared cache, which ingest may
  // have populated with the hash organ from the retrieval path; a meaning-distance off
  // spelling-space vectors would measure nothing. Run once per (doc, embedder); the
  // caller caches the resulting enacted log.
  const embs = [];
  for (const u of units) embs.push(await embedder.embed(u));
  const dim = embs[0]?.length || 0;

  // Per-CLAUSE surprise against the γ-decayed clause prior (reading order).
  const clauseSurprise = new Array(units.length).fill(0);
  const prior = new Float64Array(dim);                  // γ-decayed running sum of prior clauses
  let priorMass = 0;
  for (let c = 0; c < units.length; c++) {
    const e = embs[c];
    if (priorMass > 0 && e) {
      // cosine of this clause against the prior DIRECTION (both normalised in the
      // cosine, so the prior need not be a unit vector). 1 − cos is the divergence.
      let dot = 0, np = 0, ne = 0;
      for (let i = 0; i < dim; i++) { dot += e[i] * prior[i]; np += prior[i] * prior[i]; ne += e[i] * e[i]; }
      const cos = dot / (Math.sqrt(np) * Math.sqrt(ne) + 1e-9);
      clauseSurprise[c] = clamp01(1 - cos);             // the first clause stays 0: nothing precedes it
    }
    if (e) for (let i = 0; i < dim; i++) prior[i] = prior[i] * gamma + e[i];
    priorMass = priorMass * gamma + 1;
  }

  // Fold clauses back to their sentence cursor by MAX — the sentence's surprise is its
  // most-divergent clause, not the average that buried it.
  const surprise = new Array(sentences.length).fill(0);
  for (let c = 0; c < units.length; c++) {
    const s = sentOf[c];
    if (s >= 0 && s < surprise.length && clauseSurprise[c] > surprise[s]) surprise[s] = clauseSurprise[c];
  }

  const terms = termsAt
    ? sentences.map((_, c) => termsAt(c))
    : sentences.map(() => []);
  // The per-dimension strain axis (the cheap path's bayesBy), one entry per cursor.
  // The caller already reads the cheap reading for the terms, so the contrib comes off
  // the same read — no second pass. Null per cursor when no per-dimension signal is
  // supplied, in which case the REC falls back to the in-view terms (loop.js).
  const contrib = contribAt
    ? sentences.map((_, c) => contribAt(c))
    : sentences.map(() => null);
  return { surprise, terms, contrib };
};
