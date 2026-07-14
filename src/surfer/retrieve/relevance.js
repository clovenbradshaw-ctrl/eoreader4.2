// EO: SIG·EVA(Field,Lens → Field,Link, Tending,Binding) — embedding relevance gate
// Relevance by embedding cosine — the meaning-space sibling of surfer/salience.js's
// term-space Born rule. Where `bornSalience` measures |⟨T|s⟩|² in the discrete TOKEN
// space, so "Louis Armstrong" and "Neil Armstrong" look identical (both are just the
// token "armstrong"), this measures the same overlap in the MiniLM MEANING space, where
// the jazz musician and the astronaut lie far apart. It is what decides whether a fetched
// page is ABOUT the topic before the page is saved or allowed to ground an answer.
//
// The keep rule is a threshold of significance measured against the BACKGROUND — the run
// of scores the walk has already seen — not a bare absolute cutoff (which is brittle
// across topics and embedders). Two things set the floor:
//   · the baseline leash — at least `ratio` of the SEED page's own on-topic score, so a
//     page a fraction as on-topic as the anchor is off the leash (the curiosity walk's
//     existing discipline, now carried in meaning rather than tokens);
//   · the noise null — `deriveNull` (core/voidnull.js) over the background: the level the
//     background's own non-aligned bulk throws up by chance. It is TRUSTED only when it
//     sits BELOW the on-topic baseline; above the baseline the "bulk" is itself signal (an
//     all-on-topic run) and forcing the null would reject every good page, so it is ignored.
//
// The floor is therefore max(ratio·baseline, trustedNull): when the walk has drifted and
// most of what it pulled is off-topic, the null rises out of that background and culls the
// drift; when everything gathered is on-topic, the null abstains and the plain baseline
// leash carries. Pure but for the injected embedder; offline callers never reach here.

import { deriveNull } from '../../core/index.js';

// cosine(a, b) — the cosine of two vectors. MiniLM returns L2-normalized vectors, so for
// them this is a dot product; the explicit norm keeps it correct for any embedder and
// safe on a zero vector (→ 0, never NaN).
export const cosine = (a, b) => {
  if (!a || !b) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 1e-12 ? dot / d : 0;
};

// bornScore(a, b) — |⟨a|b⟩|², the Born weight: cosine, floored at 0 (an anti-aligned page
// is unrelated, not "negatively relevant") then squared. Squaring matches the Born rule in
// surfer/salience.js so the leash math is the same shape in the meaning space as in the
// token space, and it sharpens the split — a mid-range cosine is pushed well below a strong
// one, which is exactly the Louis-vs-Neil separation the token overlap could not make.
export const bornScore = (a, b) => {
  const c = cosine(a, b);
  return c > 0 ? c * c : 0;
};

// significanceFloor(background, { baseline, ratio, alpha }) — the Born score a candidate
// must EXCEED to count as on-topic, read against the background of already-seen scores.
//   background  the run of scores gathered so far (the walk's non-seed hops)
//   baseline    the seed page's own on-topic score — the "on-topic looks like this" mark
//   ratio       the leash: a candidate must be at least this fraction of the baseline
//   alpha       the tolerated false-positive rate for the noise null
// deriveNull abstains (→ Infinity) on a thin/undifferentiated background, in which case only
// the leash applies. Its floor is trusted only when it sits below the baseline (else the
// background is signal, not noise). Returns the max of the leash and the trusted null.
export const significanceFloor = (background = [], { baseline = 0, ratio = 0.34, alpha = 0.05 } = {}) => {
  const bg = (Array.isArray(background) ? background : []).filter(Number.isFinite);
  const leash = baseline > 0 ? ratio * baseline : 0;
  const nul = deriveNull(bg, { scale: 'linear', alpha });
  // Trust the noise null ONLY when it separates a low background bulk from real structure — i.e. it
  // sits BELOW the top of the background (some score rose above it) and below the on-topic baseline.
  // When the background is one undifferentiated on-topic cluster (an all-on-topic run) deriveNull
  // fits the whole cluster and returns a value ABOVE every score; trusting it there would raise the
  // floor over the good pages and reject them, so it abstains and the plain baseline leash carries.
  const maxBg = bg.length ? Math.max(...bg) : 0;
  const trusted = (Number.isFinite(nul) && nul < maxBg && nul < baseline) ? nul : 0;
  return Math.max(leash, trusted);
};

// renormAdd(a, b) — the L2-normalized sum of two vectors: fold a second reading into a
// topic vector and re-normalize, so the topic frame can be enriched by the seed page (the
// first grounding of what the question is about) the way the token frame is, then frozen.
// Returns a fresh Float32Array; a zero sum degrades to zeros (cosine against it is 0).
export const renormAdd = (a, b) => {
  const n = Math.min(a?.length || 0, b?.length || 0);
  const out = new Float32Array(n);
  let nn = 0;
  for (let i = 0; i < n; i++) { const v = a[i] + b[i]; out[i] = v; nn += v * v; }
  if (nn > 0) { const inv = 1 / Math.sqrt(nn); for (let i = 0; i < n; i++) out[i] *= inv; }
  return out;
};
