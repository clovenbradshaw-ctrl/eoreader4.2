// EO: SYN·EVA(Lens,Field → Field,Lens, Composing,Tracing) — band-pull / ablation-delta
// Element analysis by band-pull — the band-level realisation of ablation-delta.
//
// The ablation-delta spec classifies a delta VECTOR (W − W-minus-element) against
// delta-centroids. That needs the centroids rebuilt from minimal pairs (operator
// with/without), and the eo-lex exemplars are whole clauses in 27 languages, not
// minimal pairs — so the rebuild is a real task, not a derivation.
//
// Dividing the cube into the three grain BANDS dissolves it. Instead of naming a
// delta vector, measure how much removing each element drops the proposition's
// similarity to each band: contribution_B(e) = cos(W, B) − cos(W−e, B). That is a
// DIFFERENCE OF TWO SAME-TYPE COSINES — a scalar — so the type-consistency
// constraint (§2: never compare a difference to a position) holds against the
// EXISTING whole-phrase band centroids. No rebuild.
//
// One confound: removing any span shortens the clause and drops similarity to
// every band, so the raw drops share a common term. Mean-centre across the three
// bands and it cancels; what remains is the band the element DIFFERENTIALLY pulls
// toward. Validated on real embeddings: the verb pulls Figure, the object Ground.
//
// This is the Step C cross-check (proposition-addressing §4/§5): structure assigns
// the position (subject·object → Ground, verb → Figure, relation → Pattern); the
// band-pull names where the meaning is drawn. A pull that matches the structural
// position confirms it; a divergence is signal for the fold, never a silent
// override — the lane holds. Meaning-only: under the hash organ it returns
// no-commit, the same firewall the classifier runs.

import { BANDS, BAND_OPERATORS } from './bands.js';

const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};
const round = (x) => Math.round(x * 1000) / 1000;

const meanVec = (vs) => {
  const n = vs[0].length, m = new Array(n).fill(0);
  for (const v of vs) for (let i = 0; i < n; i++) m[i] += v[i];
  const L = Math.sqrt(m.reduce((s, x) => s + x * x, 0)) || 1;
  return m.map((x) => x / L);
};

// The band centroid is the re-normalised mean of the band's cell centroids. Built
// from the SAME whole-phrase bundle the classifier uses — so this needs no new
// artifact, only the centroids already installed. Null when no vectors are present.
export const bandCentroids = (centroids) => {
  const vectors = centroids?.vectors;
  if (!vectors || !Object.keys(vectors).length) return null;
  const out = {};
  for (const [band, ops] of Object.entries(BAND_OPERATORS)) {
    const vs = Object.entries(vectors)
      .filter(([k]) => ops.includes(k.split('_')[0]))
      .map(([, v]) => v);
    if (vs.length) out[band] = meanVec(vs);
  }
  return Object.keys(out).length ? out : null;
};

// What the grammar predicts each element pulls toward (the structural position).
const STRUCTURE = Object.freeze({ subject: 'Ground', verb: 'Figure', object: 'Ground' });

// Measure each element's band-pull by ablation. `whole` is the proposition text;
// `elements` is { subject, verb, object } with `.text` spans; `bands` is the band
// centroids. Async (embedding). Returns per element the band it is drawn to, the
// structural position it was predicted to fill, whether they agree, and the
// mean-centred contribution to each band. No-commit under a non-measuring embedder.
export const bandPull = async (whole, elements, { embedder, bands } = {}) => {
  if (!embedder?.measuresMeaning || !bands) {
    return Object.freeze({ live: false, reason: 'no-commit (meaning-only)' });
  }
  const present = Object.keys(bands);
  const W = await embedder.embed(whole);
  const out = {};
  for (const [name, span] of Object.entries(elements || {})) {
    if (!span?.text) continue;
    const remainder = whole.replace(span.text, ' ').replace(/\s+/g, ' ').trim();
    const We = await embedder.embed(remainder);
    const raw = {};
    for (const b of present) raw[b] = cos(W, bands[b]) - cos(We, bands[b]);
    const mu = present.reduce((s, b) => s + raw[b], 0) / present.length;   // length confound
    const contribution = {};
    for (const b of present) contribution[b] = round(raw[b] - mu);          // band differential
    const drawn = present.slice().sort((a, b) => contribution[b] - contribution[a])[0];
    const expected = STRUCTURE[name] || null;
    out[name] = Object.freeze({ drawn, expected, confirms: drawn === expected, contribution });
  }
  return Object.freeze({ live: true, bands: BANDS, elements: out });
};
