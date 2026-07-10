// EO: SIG·SYN(Field → Network, Tending,Composing) — supply: bindable spans, clusters
// SUPPLY — the evidence budget (§5.2).
//
// After retrieval we have ranked spans `{idx, score, text}`. The bindable ones
// (score ≥ BIND_THRESHOLD) are the raw material; their summed score is the
// total mass; and they CLUSTER by embedding into candidate sections. Each
// cluster's `spanSet` is the spans in it, its `mass` is their summed score, and
// `clusters.length` is the supply-side section estimate.
//
// Clustering is leader (online) clustering on cosine (§11.1, the fixed-cosine-
// threshold option): walk the spans strongest-first, drop each into the first
// existing cluster whose centroid it is within CLUSTER_COS of, else seed a new
// one. Deterministic given the input order — no Math.random, so the arc replays
// identically (§8, invariant 5). The span embeddings are the same ones
// retrieval already has in hand, so this is cheap.

import { BIND_THRESHOLD, CLUSTER_COS } from './constants.js';

const dot = (a, b) => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};
const norm = (a) => Math.sqrt(dot(a, a)) || 1;
const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b));

// The spans worth founding a section on, and their total mass.
export const bindableSpans = (spans = []) => {
  const bindable = spans.filter(s => (s.score || 0) >= BIND_THRESHOLD);
  const totalMass = bindable.reduce((m, s) => m + (s.score || 0), 0);
  return { bindable, totalMass };
};

// A short retrieval-derived topic for the cluster — the first few words of its
// strongest span. NOT a generated claim: it is a hint the section is ABOUT,
// recorded as the SectionEvent's `subClaim`, never asserted as fact.
const centroidHint = (clusterSpans) => {
  const lead = [...clusterSpans].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  return String(lead?.text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ');
};

export const clusterByEmbedding = async (bindable, embedder, { threshold = CLUSTER_COS } = {}) => {
  if (!bindable.length) return [];
  // Strongest-first, so the leader of each cluster is its highest-scoring span
  // and the ordering is deterministic for replay.
  const ranked = [...bindable].sort((a, b) => (b.score || 0) - (a.score || 0));
  const vecOf = embedder?.embed
    ? await Promise.all(ranked.map(s => embedder.embed(s.text || '')))
    : ranked.map(() => null);

  const clusters = [];   // { spans, vecs, centroid }
  for (let i = 0; i < ranked.length; i++) {
    const s = ranked[i], v = vecOf[i];
    let best = null, bestCos = -Infinity;
    if (v) {
      for (const c of clusters) {
        const cs = cosine(v, c.centroid);
        if (cs > bestCos) { bestCos = cs; best = c; }
      }
    }
    if (best && bestCos >= threshold) {
      best.spans.push(s); best.vecs.push(v);
      best.centroid = meanVec(best.vecs);
    } else {
      clusters.push({ spans: [s], vecs: v ? [v] : [], centroid: v || new Float32Array(0) });
    }
  }

  return clusters.map(c => ({
    spans: c.spans,
    spanSet: c.spans.map(s => s.idx),
    mass: c.spans.reduce((m, s) => m + (s.score || 0), 0),
    anchorIdx: Math.min(...c.spans.map(s => s.idx)),   // document position, for reading-order plans
    centroidHint: centroidHint(c.spans),
  }));
};

const meanVec = (vecs) => {
  if (!vecs.length || !vecs[0]?.length) return vecs[0] || new Float32Array(0);
  const out = new Float32Array(vecs[0].length);
  for (const v of vecs) for (let i = 0; i < out.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vecs.length;
  return out;
};
