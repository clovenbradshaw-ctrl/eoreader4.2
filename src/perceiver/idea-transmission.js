// EO: EVA·SYN·REC(Lens,Network → Network,Paradigm, Tracing,Composing,Binding) — idea transmission
// idea-transmission.js — watch a claim change hands.
//
// perspective.js gives each figure the claims THEIR OWN words assert; figure-fold.js can time-
// stamp each to the document sentence the figure said it in. This module takes those timed,
// per-speaker claim streams and folds the CIRCULATION of an idea: a claim first voiced by one
// figure that a later figure voices too is an idea propagating through the cast — and where the
// later voice INVERTS it (same assertion, opposite sign) the idea mutated as it spread. This is
// provenance of an IDEA across speakers, distinct from provenance of a FACT across sources.
//
// Same discipline as the Rashomon fold, and it sharpens the same way: at the floor two claims
// are "the same idea" when their neutral clause matches (spelling), so a flip is caught by the
// polarity slot; under a warm meaning embedder the LEARNED proposition-equivalence clusters
// paraphrases too (attestEquivalenceFrom — `same` merges, `opposed` links same-topic-opposite-
// sign), so "watches the city" and "monitors the streets" trace as one idea. The floor is never
// worse; meaning only widens what counts as the same idea, and improves as the embedder does.

import { attestEquivalenceFrom } from './proposition-equivalence.js';
import { claimText, claimPhrase, claimPolarity, claimTopicKey } from './perspective-diff.js';

const norm = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
const round = (x) => Math.round(x * 1000) / 1000;

// Flatten the per-speaker streams into one timed member list. A stream is { label, claims:[{...
// claim, docIdx}] }; each member remembers its voice, its time, its neutral clause (for lexical
// clustering + the embedder) and its signed phrase (for display).
const membersOf = (streams) => {
  const out = [];
  for (const s of streams || []) {
    for (const c of s.claims || []) {
      const claim = c.claim || c;
      out.push({ label: s.label, docIdx: c.docIdx ?? claim.idx ?? 0, polarity: claimPolarity(claim),
        key: claimTopicKey(claim),           // polarity-free, stemmed — folds "watches"/"watch" so a flip clusters
        neutral: norm(claimText(claim)),     // the natural clause — what the embedder reads
        phrase: claimPhrase(claim) });
    }
  }
  return out;
};

// One cluster of members (same idea) → an origin→hops chain, or null when fewer than two voices
// carry it (one figure restating itself is not transmission). The earliest voice is the origin;
// each later distinct voice is a hop, echoed or — if its sign flipped — mutated.
const chainOf = (members) => {
  const labels = new Set(members.map((m) => m.label));
  if (labels.size < 2) return null;
  const byLabel = new Map();
  for (const m of [...members].sort((a, b) => a.docIdx - b.docIdx)) if (!byLabel.has(m.label)) byLabel.set(m.label, m);
  const chain = [...byLabel.values()].sort((a, b) => a.docIdx - b.docIdx);
  const origin = chain[0];
  const hops = chain.slice(1).map((m) => ({ label: m.label, docIdx: m.docIdx, text: m.phrase,
    relation: m.polarity === origin.polarity ? 'echoed' : 'flipped' }));
  return { text: origin.phrase, origin: { label: origin.label, docIdx: origin.docIdx, text: origin.phrase }, hops, speakers: byLabel.size };
};

const rankAndMeter = (ideas, basis) => {
  ideas.sort((a, b) => (b.hops.length - a.hops.length) || (a.origin.docIdx - b.origin.docIdx));
  const mutations = ideas.reduce((n, i) => n + i.hops.filter((h) => h.relation === 'flipped').length, 0);
  return { ideas, metric: { basis, ideas: ideas.length, mutations } };
};

// ── The lexical floor — deterministic, model-free ─────────────────────────────────────
// Cluster members by their neutral clause (polarity ignored, so a flip stays in the idea and is
// read off the sign). Every idea carried by two or more voices is a transmission.
export const transmissionFloor = (streams) => {
  const members = membersOf(streams);
  const byTopic = new Map();
  members.forEach((m, i) => { const a = byTopic.get(m.key); if (a) a.push(i); else byTopic.set(m.key, [i]); });
  const ideas = [];
  for (const idxs of byTopic.values()) {
    const chain = chainOf(idxs.map((i) => members[i]));
    if (chain) ideas.push(chain);
  }
  return rankAndMeter(ideas, 'lexical');
};

// ── The learned lift — proposition-equivalence widens "the same idea" ─────────────────
// Under a warm meaning embedder, cluster by the learned same-assertion judgment: union both the
// `same` pairs (paraphrases) and the `opposed` pairs (same idea, inverted) so a mutated echo
// stays in its idea. Under a spelling-space embedder the firewall holds and this is the floor.
export const traceTransmission = async (streams, { embedder = null, alpha = 0.05, minSim = 0.5 } = {}) => {
  const members = membersOf(streams);
  if (!embedder?.measuresMeaning || members.length < 2) return transmissionFloor(streams);

  const vectors = [];
  for (const m of members) vectors.push(await embedder.embed(m.neutral));
  const out = attestEquivalenceFrom(vectors, members.map((m) => (m.polarity === '-' ? '-' : '+')),
    members.length < 4 ? { minSim } : { alpha });

  const parent = members.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const pr of out.pairs) union(pr.i, pr.j);        // paraphrase → same idea
  for (const pr of out.opposed) union(pr.i, pr.j);      // inversion → same idea, mutated

  const clusters = new Map();
  members.forEach((_, i) => { const r = find(i); (clusters.get(r) || clusters.set(r, []).get(r)).push(i); });
  const ideas = [];
  for (const idxs of clusters.values()) {
    const chain = chainOf(idxs.map((i) => members[i]));
    if (chain) ideas.push(chain);
  }
  const res = rankAndMeter(ideas, 'meaning');
  res.metric.overlapAlpha = round(alpha);
  return res;
};
