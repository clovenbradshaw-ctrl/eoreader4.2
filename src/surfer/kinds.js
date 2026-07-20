// EO: SIG·INS·NUL(Entity → Kind, Tracing,Composing,Unraveling) — recurring classes by Born rule
// Recurring Kinds — detected, not asserted.
//
// The Existence row's Pattern cell (Kind) has never had a real detector. The phasepost
// registry's INS_Composing_Kind ("vermin: established as what he now is") and
// SIG_Tracing_Kind ("recognizes the-same-again") describe what a Kind IS — entities read
// as interchangeable members of one recurring class — but nothing measured whether a
// document actually holds one, so `siteTerrain`'s Existence×Pattern cell was reachable
// only by a caller asserting `recurrent: true` from nowhere. This closes that gap the
// same way holons.js closed the Structure row's: the Born rule over a density operator,
// never a hand-picked flag.
//
// The move holons.js makes over TIME (which span the cast recurs across) is made here
// over ENTITIES (which entities recur under one class):
//
//   1. Profile   — each entity's activation is what OPERATIONS touch it across the whole
//                  document (structure-basis.js's operator vocabulary, transposed from
//                  per-unit to per-entity). Operational, not distributional — the same
//                  refusal of embedding-space clustering the rest of the significance
//                  column makes: a Kind is entities that get INSTANTIATED-AND-BONDED
//                  alike, not entities whose names are similar strings.
//   2. ρ         — buildDensity over the entity profiles: how much entities i and j
//                  behave alike across the reading.
//   3. Clusters  — segmentGroups(core/segment.js) derives k from ρ's own eigen-gap (DEF)
//                  — the same null-gated group count holons.js uses, never a caller
//                  constant. k=1 (abstain) means the document holds ONE behavioral class,
//                  i.e. no real Kind distinction — every entity defaults to Entity/Figure.
//   4. Assign    — each entity goes to the cluster it expresses with maximal Born
//                  probability |⟨lens|profile⟩|² (segmentGroups' own assign/score).
//   5. Closure   — per cluster, how concentrated its members' Born mass is on their own
//                  lens vs bleeding into the others (holons.js's closure formula,
//                  unchanged, read over entities instead of a unit span).
//
// MEASUREMENT FIRST (the significance column's honest seam, atmosphere.js /
// unnamedFrames): whether operational-profile clustering is a real Kind signal on real
// corpora — as opposed to real-holon detection on cast co-occurrence, which the
// scene-boundary probes already validated — is an open measurement. It ships because the
// alternative (an always-false `recurrent`, i.e. the cell simply never existing) is
// strictly worse, and every verdict below is null-gated so a flat corpus abstains rather
// than inventing classes.

import { projectGraph, buildDensity, segmentGroups } from '../core/index.js';
import { OPS } from './structure-basis.js';

const OP_IDX = Object.fromEntries(OPS.map((o, i) => [o, i]));
const round = (x) => Math.round(x * 1e4) / 1e4;

// Per-entity operational profile: which operators touched this entity, anywhere in the
// log — INS/SIG/NUL when the entity is the direct subject, CON/SIG when it is an
// endpoint of a bond. Coref-resolved (touch is keyed by the representative id) so
// "the creature" and "Gregor" accumulate onto the SAME profile, not two thin ones.
const entityActivations = (doc) => {
  const events = doc?.log?.snapshot ? doc.log.snapshot() : (Array.isArray(doc?.log) ? doc.log : []);
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const labelOf = (id) => doc.admission?.labelOf?.(id) || graph.entities.get(rep(id))?.label || id;

  const profile = new Map();  // repId → Float-ish array over OPS
  const touch = (id, op) => {
    if (id == null || !(op in OP_IDX)) return;
    const r = rep(id);
    let v = profile.get(r);
    if (!v) { v = new Array(OPS.length).fill(0); profile.set(r, v); }
    v[OP_IDX[op]] += 1;
  };
  for (const e of events) {
    if (!(e.op in OP_IDX)) continue;
    if (e.op === 'CON' || (e.op === 'SIG' && e.src != null)) { touch(e.src, e.op); touch(e.tgt, e.op); }
    else touch(e.id, e.op);
  }

  const ids = [...profile.keys()];
  const acts = ids.map((id) => {
    const v = profile.get(id);
    let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n);
    return n > 0 ? v.map((x) => x / n) : v;
  });
  return { ids, acts, labelOf };
};

// MEASURED (atmosphere.js, on real corpora): a raw activation is dominated by a large
// common component — here, every instantiated entity shares heavy INS mass simply for
// being instantiated at all — so the top eigen-direction is that shared bulk, not the
// split between behavioral classes, and a real distinction reads as a sub-null blur
// beneath it. Subtracting the corpus's own mean profile (exactly atmosphere.js's
// centerBy) exposes the DEVIATION that actually carries the class, the same fix for the
// same failure mode, one Domain over (Interpretation's tone/departure → Existence's Kind).
const centerByMean = (acts) => {
  const n = acts.length, dim = acts[0]?.length || 0;
  if (!n || !dim) return acts;
  const mean = new Array(dim).fill(0);
  for (const v of acts) for (let j = 0; j < dim; j++) mean[j] += v[j] / n;
  return acts.map((v) => v.map((x, j) => x - mean[j]));
};

// detectKinds — the Born-rule closure detection over entities, the Existence-row
// sibling of holons.js's detectHolons (Structure row) and surf.js's paradigmReading
// (Interpretation row). `maxK` caps the retained cluster count; the real count is
// DERIVED (segmentGroups → DEF), never supplied.
export const detectKinds = (doc, { maxK = 8, minEntities = 4 } = {}) => {
  const empty = { k: 0, abstain: true, kinds: [], entities: 0, kindOf: () => null };
  const { ids, acts, labelOf } = entityActivations(doc);
  if (ids.length < minEntities) return empty;

  const active = acts.filter((v) => v.some((x) => x !== 0));
  if (active.length < minEntities) return empty;

  const centered = centerByMean(acts);
  const g = segmentGroups(centered, null, { maxK });
  if (!g.lenses.length) return empty;

  const assign = ids.map((id, i) => g.assign(centered[i]));
  const kindOfId = new Map(ids.map((id, i) => [id, assign[i]]));

  const members = g.lenses.map((_, k) => ids.filter((_, i) => assign[i] === k));
  const kinds = g.lenses.map((l, k) => ({
    idx: k, mass: round(l.weight),
    members: members[k].map((id) => ({ id, label: labelOf(id) })),
    closure: 0,   // filled below
  }));

  // closure — LOCAL coherence: over a kind's own members, how much of each member's
  // Born mass its own lens captures, vs the mass shared with the other retained lenses.
  // The same "does this span express one reading or a blur" question holons.js asks,
  // read here as "do these entities express one class, or an incidental grouping."
  const dot = (a, b) => { let c = 0; for (let j = 0; j < a.length; j++) c += a[j] * b[j]; return c; };
  kinds.forEach((kd, k) => {
    let s = 0, m = 0;
    for (let i = 0; i < ids.length; i++) {
      if (assign[i] !== k) continue;
      const v = centered[i]; if (!v.some((x) => x !== 0)) continue;
      let tot = 0; for (const l of g.lenses) tot += dot(v, l.lens) ** 2;
      if (tot > 0) { s += (dot(v, g.lenses[k].lens) ** 2) / tot; m++; }
    }
    kd.closure = round(m ? s / m : 0);
  });

  // A retained lens no entity actually expresses strongest is not a Kind — segmentGroups
  // reserves k slots on the eigen-gap alone, but membership is a SEPARATE Born-argmax
  // step, and the two can disagree (a slot with a real gap yet zero winners). Report only
  // the lenses that are actually SOMEONE's kind; a phantom, member-less "kind" is dropped.
  // If fewer than two kinds survive that filter, the eigen-gap alone was not a genuine
  // multi-class distinction either — abstain, the same honest hold as a flat spectrum.
  const realKinds = kinds.filter((kd) => kd.members.length > 0);
  const abstain = g.abstain || realKinds.length < 2;

  return Object.freeze({
    k: abstain ? 1 : realKinds.length, abstain, entities: ids.length,
    kinds: abstain ? [] : realKinds.map((kd) => Object.freeze({ ...kd, members: Object.freeze(kd.members) })),
    // kindOf(entityId) — the cluster an entity belongs to, or null if it was never
    // profiled (no INS/SIG/CON/NUL event touched it) or the corpus abstained (no real
    // multi-class distinction to place it in).
    kindOf: (id) => (abstain ? null : (kindOfId.has(id) ? kindOfId.get(id) : null)),
  });
};

// kindRecurrence(doc) → does this document's entity population hold a REAL, multi-class
// Kind structure at all (the document-level verdict `siteTerrain`'s Existence×Pattern
// cell reads its `recurrent` flag off) — as opposed to one flat behavioral class, which
// defaults every entity back to Entity (Figure grain, an instance, not a class member).
export const kindRecurrence = (doc, opts) => !detectKinds(doc, opts).abstain;
