// EO: SIG·SYN·EVA(Field → Network,Lens, Composing,Tracing) — structural significance basis
// The structural significance basis — ρ built from operations, not embeddings.
//
// The significance column first built ρ over the 27-cell COSINE projection of a MiniLM
// embedding. That imported the distributional theory of meaning (a word is the company
// it keeps) — the LLM bet EOreader4 exists to refute, and it pinned the column to the
// embedder (now rightly a VOX/surface organ). Meaning here is OPERATIONAL: what the
// DEF·EVA·REC·CON·SIG·INS… operators do to the field. So the per-unit activation is its
// profile over the nine operators — the cube's Act face — read straight off the log,
// with no embedder and nothing distributional.
//
// spectral.js is pure on vectors, so the whole density-operator apparatus is unchanged;
// only the basis moves from embedding-space to operator-space. The eigen-lenses are then
// recurring OPERATIONAL PATTERNS (a reading: which operations cohere — "instantiate-and-
// bond", "assert-and-evaluate"), which cannot be topic clusters because they are made of
// operators, not content words. That is the separation the embedding path needed
// centering to fake; here it is free, because structure is not distribution.
//
// FIRST LEVEL: a link is its operator. An edge between two nodes is a LINK, and a link
// IS one of the nine operators — that is how a relation is typed, full stop, at the first
// level. Links CAN get more specific (a CON that is a kinship bond, a SIG that is a
// perception), but that finer typing is a SECOND, optional level layered on top — never
// the default. So the canonical structural activation is operators-only; the relation-
// class refinement is opt-in (`relations:true`), and it types only the minority of links
// the shipped closed vocabulary happens to know. The recurring links it leaves untyped are
// what the label-feedback basis (learn-links.js) grows new specific types for.

import { buildDensity, eigenLenses, vonNeumann, relEntropy, commutator, projectorFrom, OPERATORS } from '../core/index.js';

// the operational vocabulary: the nine operators (Act face = Mode × Domain).
export const OPS = Object.freeze(Object.keys(OPERATORS));
const OP_IDX = Object.fromEntries(OPS.map((o, i) => [o, i]));
const round = (x) => Math.round(x * 1e4) / 1e4;

// the engine's relation-semantic classes (read off CON/SIG events' relType) — the SECOND,
// optional level: a fixed closed taxonomy that REFINES the operator typing. A link is
// always its operator first (a CON is a bond); a SPATIAL bond and an AFFECT bond are the
// same link made more specific. Shipped and fixed, so it only types the minority of links
// whose verb the conventions ledger recognises — the recurring untyped rest is the gap
// learn-links.js grows into. Still no embedder, nothing distributional. NOT the default.
export const RELTYPES = Object.freeze(['spatial', 'perception', 'affect', 'motion', 'possession', 'speech', 'kinship']);

// Per-unit structural activation: the count of each operator the unit performs, read off
// the append-only log by sentence index. Raw counts (buildDensity trace-normalises).
export const operatorProfiles = (doc) => {
  const units = doc?.units || doc?.sentences || [];
  const prof = units.map(() => new Array(OPS.length).fill(0));
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  for (const e of events) {
    if (e.sentIdx == null || !(e.op in OP_IDX)) continue;
    if (e.sentIdx >= 0 && e.sentIdx < prof.length) prof[e.sentIdx][OP_IDX[e.op]] += 1;
  }
  return prof;
};

// Structural activation: by default operators ONLY (a link is its operator — the first
// level). Opt into the second level with `relations:true`, which appends the relation-
// semantic classes; a SIGN read off polarity lets a negated/defeated reading subtract
// (the spec's contradiction-interferes ρ, computed structurally). Still no embedder.
export const structuralActivations = (doc, { relations = false } = {}) => {
  const units = doc?.units || doc?.sentences || [];
  const dims = relations ? [...OPS, ...RELTYPES] : [...OPS];
  const RT_IDX = Object.fromEntries(RELTYPES.map((r, i) => [r, OPS.length + i]));
  const acts = units.map(() => new Array(dims.length).fill(0));
  const pol = units.map(() => 0);
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  for (const e of events) {
    const i = e.sentIdx;
    if (i == null || i < 0 || i >= acts.length) continue;
    if (e.op in OP_IDX) acts[i][OP_IDX[e.op]] += 1;
    if (relations && e.relType && (e.relType in RT_IDX)) acts[i][RT_IDX[e.relType]] += 1;
    if (e.polarity === '−' || e.polarity === '-') pol[i] -= 1; else if (e.polarity) pol[i] += 1;
  }
  return { dims, activations: acts, signs: pol.map(p => (p < 0 ? -1 : 1)) };
};

// the bare ground σ for a basis of `dim` dimensions: maximally mixed (no dimension
// privileged). A document departs it as its operations/relations concentrate.
const groundCache = new Map();
const groundSigma = (dim) => {
  if (!groundCache.has(dim)) groundCache.set(dim, buildDensity(Array.from({ length: dim }, (_, i) => { const v = new Array(dim).fill(0); v[i] = 1; return v; })).rho);
  return groundCache.get(dim);
};

// The structural ground σ as the { dim, rho } shape a Horizon cold-starts from — the
// embedder-free counterpart to atmosphere.js `corpusSigma`. createHorizon built its σ from a
// CENTROID basis (a meaning prior), so a persistent Horizon was dark on the default path; the
// operator-profile basis has no centroids, only this maximally-mixed ground over the operator
// (or operator+relation) dimensions. Hands the Horizon a measurable σ with no embedder, so the
// cross-turn memory accumulates on every turn, not only when a meaning model is loaded.
export const structuralGround = ({ relations = false } = {}) => {
  const dim = relations ? OPS.length + RELTYPES.length : OPS.length;
  return { dim, rho: groundSigma(dim) };
};

// name an eigen-lens by its heaviest dimensions — the operational/relational pattern.
const lensTop = (lens, dims, n = 3) => dims.map((d, i) => ({ d, w: lens[i] }))
  .sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, n)
  .filter(o => Math.abs(o.w) > 0.15).map(o => ({ op: o.d, w: round(o.w) }));

// the structural tone: dominant operator + the Domain/Mode mix over the operator
// dimensions, plus the dominant relation class when the basis carries them.
const toneOf = (rho, dims) => {
  let best = -1, bi = 0;
  for (let i = 0; i < OPS.length; i++) if (rho[i][i] > best) { best = rho[i][i]; bi = i; }
  const op = OPS[bi], o = OPERATORS[op];
  const domMass = { Existence: 0, Structure: 0, Interpretation: 0 };
  for (let i = 0; i < OPS.length; i++) domMass[OPERATORS[OPS[i]].domain] += rho[i][i];
  const dom = Object.entries(domMass).sort((a, b) => b[1] - a[1]);
  let rel = null;
  if (dims.length > OPS.length) {
    let rb = -1, ri = -1;
    for (let i = OPS.length; i < dims.length; i++) if (rho[i][i] > rb) { rb = rho[i][i]; ri = i; }
    if (ri >= 0 && rb > 0) rel = dims[ri];
  }
  return Object.freeze({
    op, mode: o.mode, domain: o.domain, relation: rel,
    label: `reads as ${o.mode.toLowerCase()} · ${dom[0][0].toLowerCase()}${rel ? ` · ${rel}` : ''}`,
    domainMix: Object.fromEntries(Object.entries(domMass).map(([k, v]) => [k, round(v)])),
  });
};

// structuralHorizon(doc | profiles, { k, relations, signs, learner }) → the embedder-free
// significance reading. Same shape as the embedding column (departure · tone · lenses ·
// lensEntropy) but every number is operational. `relations` adds the fixed relation-
// semantic dimensions; `signs` lets a defeated reading subtract (contradiction-interferes
// ρ); `learner` reads the document through the GROWN basis (operators + the types the
// engine has learned for itself), so the reading is constituted partly through distinctions
// it was not shipped with — the label-feedback loop, closed.
export const structuralHorizon = (docOrProfiles, { k = 4, relations = false, signs = false, learner = null } = {}) => {
  let dims, profiles, sgnAll = null;
  if (Array.isArray(docOrProfiles?.[0])) { dims = OPS; profiles = docOrProfiles; }
  else if (learner && typeof learner.activationsFor === 'function') { const s = learner.activationsFor(docOrProfiles); dims = s.dims; profiles = s.activations; }
  else if (relations) { const s = structuralActivations(docOrProfiles, { relations: true }); dims = s.dims; profiles = s.activations; if (signs) sgnAll = s.signs; }
  else { dims = OPS; profiles = operatorProfiles(docOrProfiles); }

  const keep = profiles.map((p, i) => (p.some(x => x > 0) ? i : -1)).filter(i => i >= 0);
  const acts = keep.map(i => profiles[i]);
  const sgn = sgnAll ? keep.map(i => sgnAll[i]) : null;
  if (acts.length < 2) return { units: 0, departure: 0, tone: null, lenses: [], lensEntropy: 0, dims, rho: [] };

  const { rho } = buildDensity(acts, null, sgn);
  const spectrum = eigenLenses(rho).map(l => l.weight);
  const top = eigenLenses(rho, { k });
  return {
    units: acts.length, dims,
    departure: round(relEntropy(rho, groundSigma(dims.length))),
    lensEntropy: round(vonNeumann(spectrum)),
    tone: toneOf(rho, dims),
    lenses: top.map(({ lens, weight }) => ({ weight: round(weight), pattern: lensTop(lens, dims), lens })),
    rho,
  };
};

// Two documents' operational bases incommensurable? The Paradigm pass, structurally: do
// the top operational patterns of two docs (or two halves) fail to commute past a
// within-document baseline. Same commutator, an operator basis instead of an embedding one.
export const structuralCommutator = (profilesA, profilesB, { m = 3 } = {}) => {
  const proj = (ps) => projectorFrom(eigenLenses(buildDensity(ps.filter(p => p.some(x => x > 0))).rho, { k: m }).map(l => l.lens));
  return round(commutator(proj(profilesA), proj(profilesB)));
};
