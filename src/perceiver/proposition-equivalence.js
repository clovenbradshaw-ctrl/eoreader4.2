// EO: EVA·SYN·REC(Link,Field → Network,Kind, Composing,Binding) — same-assertion attest
// Proposition equivalence — "are these two clauses the SAME assertion?", attested.
//
// equivalence.js asks this of TONES and answers it from overtone overlap. asterisk.js
// asks it of ENTITY NAMES ("are these two `tom-turner`s one person?") and answers it
// from relational discriminators. This module asks it of PROPOSITIONS —
//
//     "Ralph owns a boat"  ≟  "Ralph is the owner of a boat"
//
// — and answers it from the one signal that reads the meaning of a whole clause: the
// MiniLM embedding. Two propositions are the same when their embeddings are near AND
// nothing in the field's own noise produces a nearness like it by chance. That second
// clause is the whole point, and it is the Born rule (voidnull.js).
//
// ── The loop is DEF · EVA · REC, run on a proposition instead of a name ──────────
//
//   DEF  the terms — each proposition is asserted (held-as-true) and EMBEDDED. The
//        embedding is the proposition's fingerprint, the way a discriminator set is a
//        name's fingerprint in asterisk.js. The embedder is the only place meaning
//        enters; nothing here reads spelling.
//   EVA  the test — construe one proposition AS the other (EVA_Binding_Lens: "interpret,
//        translate, construe, read-as, take" — the entity_transform arrow A ==> B). The
//        measurement is the cosine between the two embeddings. A judgment, not a fact.
//   REC  restructure on the outcome — collapse the two to one Figure (SYN merge, when
//        the cosine beats the null AND the polarities agree), fork them (a polarity
//        clash: same content, opposite sign — "owns" vs "does not own" — is a
//        contradiction, NOT an identity), or hold the question open (the cosine did not
//        clear the null: a proposition asterisk, identity unestablished).
//
// ── The Born rule's role (why a fixed cosine threshold is the wrong instrument) ──
//
// The classifier's ADJACENCY_FLOOR is a hand-set 0.6 — a chosen number, the small a
// priori this whole engine fights. MiniLM sentence cosines do not center on zero;
// unrelated clauses sit in a positive band (~0.3–0.5), and the band drifts with the
// domain. A constant cannot say where the tail begins. So the boundary is not set — it
// is DERIVED, online, from the field's own non-cohering proposition cosines: the
// also-ran nearnesses are samples of what chance produces, and a proposed equivalence
// must beat the extreme-value (1−α) quantile of that background — leave-one-out (a real
// paraphrase never has to outrank itself), robust (a handful of real paraphrases do not
// raise the bar), causal (estimated from the field read so far). One knob, α, the
// tolerated rate of mistaking coincidence for sameness. The physics computes the rest.
//
// ── Two honest seams (stated, not papered over) ──────────────────────────────────
//
//   • THE FIREWALL. Under a spelling-space embedder (the hash organ, measuresMeaning
//     false) a cosine measures nothing, so every pair HOLDS at no-commit — the same
//     firewall the geometric classifier runs (phasepost.js). Equivalence is live only
//     under MiniLM. This is not a degradation; it is the only honest output until the
//     meaning organ is warm.
//   • POLARITY IS THE PARSER'S, NOT SPELLING'S. The conflict that forks "owns" from
//     "does not own" reads the proposition's polarity slot (relations.js already cuts
//     it), never a negation word-list of our own. A bare string carries no polarity and
//     defaults positive; the veto is inert until the caller wires the parsed sign in.
//     The module stays pure on its two injected signals — the embedder and the polarity.

import { createNoiseFloor } from '../core/index.js';

// Cosine in the embedder's space — the same form phasepost.js and semantic.js use.
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
};

// A proposition's clause text. Accepts a bare string, or the parsed shapes the rest of
// the core speaks (a proposition's `clause`/`sentence`, an edge). The embedder reads
// this; it is the Given.
export const propositionText = (p) =>
  typeof p === 'string' ? p
    : String(p?.clause ?? p?.sentence ?? p?.text ?? '');

// A proposition's polarity, normalized to '+' / '-'. Tolerant of every sign the engine
// carries it under: the parser's '−' (U+2212, relations.js), the proposition slot's '-'
// (proposition.js), the word 'negative', a boolean. Absent → '+', the realis default.
// This is the ONLY non-embedding signal the module reads, and it comes from upstream
// parsing, never from inspecting the string here.
export const propositionPolarity = (p) => {
  const raw = typeof p === 'object' && p ? p.polarity : undefined;
  if (raw === '-' || raw === '−' || raw === 'negative' || raw === false || raw === -1) return '-';
  return '+';
};

// ── The EVA primitive — one pair, given its measured nearness and the null ───────
//
// The three-way verdict, mirroring asterisk.js's promote / split / open exactly:
//   'same'    — the cosine beats the null and the polarities agree. SYN merge earned.
//   'opposed' — the cosine beats the null but the polarities CLASH. Same content,
//               opposite sign: a contradiction, positive evidence of two propositions,
//               never a merge. (Conflict dominates — a near-identical embedding is
//               exactly when the polarity is the only thing telling them apart.)
//   'open'    — the cosine does not clear the null. Held: the proposition asterisk
//               stands, identity unestablished, not refused.
export const evaluatePropositionPair = ({ sim, polarityA = '+', polarityB = '+', boundary }) => {
  const clears = sim > boundary;
  const verdict = !clears ? 'open' : (polarityA === polarityB ? 'same' : 'opposed');
  return Object.freeze({ verdict, sim, boundary, clears, polarityClash: polarityA !== polarityB });
};

// ── The mutual-nearest discipline (from equivalence.js), over cosines ────────────
//
// Two propositions merge only if each is the OTHER's strongest match — the parameter-
// free grouping that keeps a weak argmax from forcing a merge. Ties are kept (a set),
// so a proposition equally near two paraphrases pairs with both and the union-find
// makes the class transitive. Returns the candidate pairs with their cosine.
export const mutualNearestPropositions = (vectors) => {
  const n = vectors.length;
  const sim = (i, j) => cosine(vectors[i], vectors[j]);
  const near = [];
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    for (let j = 0; j < n; j++) if (j !== i) { const s = sim(i, j); if (s > best) best = s; }
    const set = new Set();
    for (let j = 0; j < n; j++) if (j !== i && Math.abs(sim(i, j) - best) < 1e-9) set.add(j);
    near.push({ best, set });
  }
  const pairs = [];
  for (let i = 0; i < n; i++)
    for (const j of near[i].set)
      if (j > i && near[j].set.has(i)) pairs.push({ i, j, sim: near[i].best });
  return pairs;
};

// Derive the VOID boundary for proposition cosines from the field's own non-cohering
// nearnesses — every ordered pair's cosine is a sample of what the background produces.
// Leave-one-out + the robust bulk fit keep the real paraphrase pairs from poisoning the
// floor they must clear. Mirrors equivalence.js's overlapFloor; the scale is 'linear'
// (cosine is a bounded, additive nearness, not a heavy-tailed extent). No grain quantum:
// a cosine is continuous, so the extreme-value σ-projection carries the boundary alone.
const cosineFloor = (vectors, alpha) => {
  const n = vectors.length;
  const floor = createNoiseFloor({ scale: 'linear', alpha, grain: 0, N: n });
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j) floor.observe(cosine(vectors[i], vectors[j]));
  return floor;
};

// ── The orchestration — the pure core, over already-embedded propositions ────────
//
// Given the proposition vectors and their polarities, attest the equivalence classes.
// The boundary is set one of three ways, in priority order, exactly as equivalence.js:
//   • `minSim`  — an explicit constant boundary (a caller-supplied null; back-compat
//                 and the n<4 fallback, where no field exists to derive a null from).
//   • `alpha`   — DERIVE the null online from the field's own cosines, at the tolerated
//                 false-positive rate. The boundary is a readout, not a number you set.
//   • neither   — 0, pure rank: merge the mutual-nearest argmax. Right for RECOVERY and
//                 the cold start, but it cannot ABSTAIN — on noise it merges the argmax.
//
// Returns the verdicts (`pairs` = attested same, `held` = open, `opposed` = polarity
// clash), the equivalence `classes` (each an array of proposition indices), and
// `voided` (nothing cleared the null — the absence is a finding, not silence).
export const attestEquivalenceFrom = (vectors, polarities = [], { minSim = null, alpha = null } = {}) => {
  const n = vectors.length;
  const pol = (i) => polarities[i] ?? '+';
  const candidates = mutualNearestPropositions(vectors);

  const floor = (minSim == null && alpha != null) ? cosineFloor(vectors, alpha) : null;
  const boundaryOf = (c) =>
    minSim != null ? minSim
      : floor ? floor.threshold({ leaveOut: c.sim })
        : 0;

  const parent = new Map();
  const find = (x) => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };
  const union = (a, b) => { parent.set(find(a), find(b)); };

  const pairs = [];     // 'same'    — cleared the null, polarities agree → SYN merge
  const held = [];      // 'open'    — did not clear the null → held, asterisk stands
  const opposed = [];   // 'opposed' — cleared the null but polarities clash → split
  for (const c of candidates) {
    const v = evaluatePropositionPair({ sim: c.sim, polarityA: pol(c.i), polarityB: pol(c.j), boundary: boundaryOf(c) });
    const rec = Object.freeze({ ...c, verdict: v.verdict, boundary: v.boundary });
    if (v.verdict === 'same') { union(c.i, c.j); pairs.push(rec); }
    else if (v.verdict === 'opposed') opposed.push(rec);
    else held.push(rec);
  }

  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(i);
  }
  return {
    pairs, held, opposed,
    classes: [...byRoot.values()],
    voided: pairs.length === 0,
  };
};

// ── The faculty face — embed the propositions, then attest, with the firewall ────
//
// The async front-end: take propositions (strings or parsed shapes), embed each once
// (the embedder caches), and run the pure core. The firewall short-circuits to all-held
// under a spelling-space embedder — equivalence is live only when the embedder measures
// meaning. `emit`+`log` optionally write the loop into an append-only log (SYN per
// attested merge, NUL per held/opposed pair, a DEF-to-void when nothing clears), keyed
// by each proposition's `id` or its index — so an integrated caller's projection can
// collapse the classes itself, the way discoverEquivalences feeds doc.log.
export const discoverPropositionEquivalence = async (propositions, { embedder, minSim = null, alpha = null, emit = false, log = null } = {}) => {
  const props = [...propositions];
  const base = { propositions: props.map(propositionText) };

  if (!embedder?.measuresMeaning) {
    // The firewall: a cosine in spelling space measures nothing. Hold every pair.
    return Object.freeze({
      ...base, live: false, reason: 'weak-embedder',
      pairs: [], held: [], opposed: [],
      classes: props.map((_, i) => [i]), voided: false,
    });
  }

  const vectors = [];
  for (const p of props) vectors.push(await embedder.embed(propositionText(p)));
  const polarities = props.map(propositionPolarity);
  const out = attestEquivalenceFrom(vectors, polarities, { minSim, alpha });

  if (emit && log) {
    const idOf = (i) => props[i]?.id ?? `p${i}`;
    for (const c of out.pairs)
      log.append({ op: 'SYN', kind: 'merge', from: idOf(c.i), to: idOf(c.j), via: 'same-proposition', sim: c.sim });
    for (const c of out.held)
      log.append({ op: 'NUL', kind: 'held-equivalence', src: idOf(c.i), tgt: idOf(c.j), sim: c.sim });
    for (const c of out.opposed)
      log.append({ op: 'NUL', kind: 'opposed-proposition', src: idOf(c.i), tgt: idOf(c.j), sim: c.sim, note: 'same content, opposite polarity' });
    if (out.voided)
      log.append({ op: 'DEF', kind: 'void', node: 'identity', rel: 'same-proposition', note: 'no proposition equivalence clears the null' });
  }

  return Object.freeze({ ...base, live: true, ...out });
};
