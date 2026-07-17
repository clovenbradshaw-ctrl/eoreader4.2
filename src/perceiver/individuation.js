// EO: EVA·SEG(Network → Entity, Dissecting,Tracing) — the individuation gate
// individuation.js — type every referent by how far it climbed the helix (SIG → INS → CON).
//
// The cast is built from a NAME AUTHORITY: a label enters it only when a capitalised
// candidate clears referential gravity (entities.js). Two referents never reach the list:
//
//   • the creature — a definite/role description ("the creature", "his sister") that
//     recurs and acts but is never named. Its mass is real, accumulating in the coref
//     descriptor channel (coref.js noteDescriptor), yet it has no door onto the cast.
//   • Kurtz-before-he-arrives — a referent barely PRESENT (low mass) that everything
//     COUPLES to (high incident salience). Admission gates on gravity-at-a-sighting and
//     the cast ranks on sightings — both pure mass. Coupling never enters the decision,
//     so a low-mass / high-coupling hub sorts below the cutoff and is dropped.
//
// This module aggregates the coupling signal per node (couplingByNode), and reads each
// referent off the (mass, coupling, agency, INS'd?) plane into one of five types. The
// TYPE IS THE DIAGNOSIS, not a detector — nothing races anything. Thresholds are Born
// nulls derived per document (voidnull.js), never constants: the gate is a function of
// the document. Every typing is an EVA event; a later name binding is a REC (held:true).
//
// Canon read: docs/holons.md (the composition holon, one grain up), docs/edge-grounding.md.

import { projectGraph, deriveNull, boundedNull } from '../core/index.js';
import { scanAbsoluteDescriptorCands } from './absolute-descriptors.js';

// The five types the plane cuts a referent into (§2).
export const REFERENT_TYPES = Object.freeze({
  HOLON:    'holon',     // INS ∧ orbited — a whole that is also a part (own props + a hub)
  EMANON:   'emanon',    // ¬INS ∧ present ∧ acts — recurs and acts, never named (the creature)
  PROTOGON: 'protogon',  // ¬INS ∧ orbited ∧ barely present — coupling outruns instantiation (Kurtz)
  FIELD:    'field',     // present ∧ oblique — a setting, typed OFF the cast (the city, the room)
  VOID:     'void',      // clears no null — a passing common noun, typed discard (replayable)
});

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// ── Assembly 1 — node coupling ──────────────────────────────────────────────
// The coupling number already exists on every edge (projectGraph stamps `coupling`
// and a Born-weighted `weight`); it has never been aggregated PER NODE. couplingByNode
// folds Σ weight over edges incident to each node, coref-collapsed through the
// projection's `representative`, self-loops dropped, split ρ_in / ρ_out by direction.
// Pure on the projection.
export const couplingByNode = (graph) => {
  const rep = (graph && graph.representative) || ((x) => x);
  const out = new Map();
  const bump = (id, key, w) => {
    const e = out.get(id) || { rhoIn: 0, rhoOut: 0, rho: 0 };
    e[key] += w; e.rho += w;
    out.set(id, e);
  };
  for (const edge of (graph && graph.edges) || []) {
    const f = rep(edge.from), t = rep(edge.to);
    if (f === t) continue;                       // a self-loop is not incident coupling
    const w = Number.isFinite(edge.weight) ? edge.weight : 0;
    if (w <= 0) continue;
    bump(f, 'rhoOut', w);                        // f couples OUT to t
    bump(t, 'rhoIn', w);                         // t is coupled INTO by f
  }
  return out;
};

// ── The Born gates — derived per document, never constants (§3) ─────────────
// mnull / ρnull come from the candidate population the way the edge-weight floor does:
// heavy-tailed → log scale, a candidate clears the null only by beating the document's
// own noise background at α. subjShare is a bounded fraction → boundedNull. deriveNull
// abstains (Infinity) on a thin population (< MIN_SAMPLES); we then fall back to the
// population median so a small cast still types, rather than collapsing every candidate
// to VOID for want of a background.
export const deriveGates = (cands, { alpha = 0.01, agencyAlpha = 0.05 } = {}) => {
  const masses = cands.map((c) => c.mass).filter((x) => Number.isFinite(x) && x > 0);
  const rhos   = cands.map((c) => c.rho).filter((x) => Number.isFinite(x) && x > 0);
  const shares = cands.map((c) => c.subjShare).filter(Number.isFinite);
  const mNull = deriveNull(masses, { scale: 'log', alpha });
  const rNull = deriveNull(rhos,   { scale: 'log', alpha });
  return {
    mnull:      Number.isFinite(mNull) ? mNull : median(masses),
    rnull:      Number.isFinite(rNull) ? rNull : median(rhos),
    // A bounded fraction: "just above what a typical chance value reaches", falling back
    // to the population median when the background cannot support a line.
    agencyLine: boundedNull(shares, { alpha: agencyAlpha, ceiling: 1, fallback: median(shares) }),
  };
};

// Born-normalised salience — the two-axis rank that replaces the mass-only sort. Bilinear
// in the log of the two signals, exactly the base amplitude form projectGraph uses for an
// edge (log(1+m) + log(1+ρ)); a protogon with near-zero mass still ranks by its coupling.
export const salienceOf = (mass, rho) =>
  Math.log(1 + Math.max(0, mass || 0)) + Math.log(1 + Math.max(0, rho || 0));

// ── The read-off — a single referent against the gates (§2) ─────────────────
// Pure. A candidate is { id, label, ins, mass, rho, subjShare, provisional? }. Returns
// the same fields plus { type, onCast, promotable, salience }. Type is the diagnosis:
//
//   INS'd?            ρ ≥ ρnull (orbited)         ρ < ρnull (not a hub)
//   ─────────────────────────────────────────────────────────────────────────
//   INS  (named)      holon                       named-but-inert → field (setting)
//   ¬INS (unnamed)    protogon (if m<mnull)       emanon (if agent) / field (if oblique)
//                     emanon·promotable (if m≥m)  void (if m<mnull too)
export const classifyReferent = (cand, gates) => {
  const mass = Number.isFinite(cand.mass) ? cand.mass : 0;
  const rho  = Number.isFinite(cand.rho)  ? cand.rho  : 0;
  const subjShare = Number.isFinite(cand.subjShare) ? cand.subjShare : 0;
  const heavy   = mass >= gates.mnull;                        // m ≥ mnull  — present
  const orbited = rho  >= gates.rnull && rho > 0;             // ρ ≥ ρnull  — a hub
  const agent   = subjShare >= gates.agencyLine;              // it ACTS (keeps settings off the cast)

  let type, promotable = false;
  if (cand.ins) {
    // A whole that is also a part needs the coupling: requiring ρ ≥ ρnull for holon-hood
    // refuses the named-but-oblique, uncoupled proper noun (a dateline placename) the
    // current mass-only cast wrongly promotes. A named agent that plainly acts is a holon
    // even if its coupling sits under the line.
    type = (orbited || (heavy && agent)) ? REFERENT_TYPES.HOLON : REFERENT_TYPES.FIELD;
  } else if (orbited && !heavy) {
    type = REFERENT_TYPES.PROTOGON;                           // orbited, barely present, no name
  } else if (heavy && orbited) {
    type = REFERENT_TYPES.EMANON; promotable = true;          // present AND orbited but unnamed — ripe for INS
  } else if (heavy && agent) {
    type = REFERENT_TYPES.EMANON;                             // recurs + acts, not yet a hub (the creature)
  } else if (heavy) {
    type = REFERENT_TYPES.FIELD;                              // present but oblique — a setting
  } else {
    type = REFERENT_TYPES.VOID;                               // clears no null — typed discard
  }

  const onCast = type === REFERENT_TYPES.HOLON
              || type === REFERENT_TYPES.EMANON
              || type === REFERENT_TYPES.PROTOGON;
  return {
    id: cand.id, label: cand.label, provisional: !!cand.provisional,
    ins: !!cand.ins, mass, rho, subjShare,
    type, onCast, promotable,
    salience: salienceOf(mass, rho),
  };
};

// Type a whole population — derive the gates from it, classify each, rank by salience.
// field / void are typed OFF the cast (accountable loss, not silently dropped) — the
// caller can still read them for the Field terrain.
export const classifyReferents = (cands, opts = {}) => {
  const list = cands || [];
  if (!list.length) return [];
  const gates = deriveGates(list, opts);
  return list.map((c) => classifyReferent(c, gates))
    .sort((a, b) => b.salience - a.salience);
};

// A stable provisional id for an un-INS'd descriptor referent — a real display handle
// that never collides with a name id (idFor never emits a leading '~').
export const provisionalId = (descKey) => `~desc:${String(descKey || '').toLowerCase()}`;

// ── Assembly 4 — the two-axis cast ──────────────────────────────────────────
// typeReferents(doc) — the cast, typed. Draws the INS'd candidates from the projection
// (named entities: mass = merged sightings, ρ = couplingByNode, subjShare = admission's
// own subject/oblique split) and the un-INS'd candidates from the coref descriptor
// channel (mass = the decaying dr.mass; a still-unbound role epithet has no name door).
// A descriptor already bound to a name is folded onto that name (its promotion already
// happened) and is not re-listed as provisional. Returns the ranked, type-stamped list.
export const typeReferents = (doc, opts = {}) => {
  if (!doc || !doc.log) return [];
  const graph = projectGraph(doc.log);
  const coupling = couplingByNode(graph);
  const admission = doc.admission;
  const labelOf = (id) => (admission && admission.labelOf && admission.labelOf(id))
    || (graph.entities.get(id) && graph.entities.get(id).label) || id;

  const cands = [];

  // INS'd — the named cast, straight off the projection.
  for (const ent of graph.entities.values()) {
    const label = labelOf(ent.id);
    const sig = admission && admission.signals ? admission.signals(label) : null;
    const rho = coupling.get(ent.id);
    cands.push({
      id: ent.id, label, ins: true, provisional: false,
      mass: ent.sightings || 0,
      rho: rho ? rho.rho : 0,
      rhoIn: rho ? rho.rhoIn : 0, rhoOut: rho ? rho.rhoOut : 0,
      subjShare: sig ? sig.subjShare : 0,
    });
  }

  // ¬INS'd — the descriptor channel: standing role referents that never earned a name.
  const bound = new Set();
  const refs = doc.corefField && doc.corefField.descriptorReferents
    ? doc.corefField.descriptorReferents() : [];
  for (const dr of refs) {
    if (dr.bound) { bound.add(dr.bound); continue; }          // already a name — folded, not provisional
    const pid = provisionalId(dr.roleKey);
    const rho = coupling.get(pid);
    cands.push({
      id: pid, label: dr.roleKey, ins: false, provisional: true,
      mass: dr.mass || 0,
      rho: rho ? rho.rho : (dr.rho || 0),
      subjShare: Number.isFinite(dr.subjShare) ? dr.subjShare : 1,  // a role epithet is subject of its clause
    });
  }

  // Ownerless absolute descriptions (absolute-descriptors.js), opt-gated for a byte-identical
  // default, typed against the gates the ESTABLISHED cast sets — never a re-derived pool.
  if (opts.absoluteDescriptors) {
    const gates = deriveGates(cands, opts);
    const have = new Set(cands.map((c) => c.id));
    const extra = scanAbsoluteDescriptorCands(doc).map((a) => ({
      id: provisionalId(a.roleKey), label: a.label, ins: false, provisional: true,
      mass: a.mass, rho: a.rho, subjShare: a.subjShare,
    })).filter((c) => !have.has(c.id));
    const named = classifyReferents(cands, opts);
    const added = extra.map((c) => classifyReferent(c, gates));
    return [...named, ...added].sort((a, b) => b.salience - a.salience)
      .map((c) => ({ ...c, boundName: bound.has(c.id) || undefined }));
  }

  return classifyReferents(cands, opts).map((c) => ({ ...c, boundName: bound.has(c.id) || undefined }));
};

// ── Assembly 5 — the promotion ledger ───────────────────────────────────────
// When a name later binds a descriptor (unifyDescriptor / bindDescriptorsByElimination),
// that binding IS the INS: the type flips emanon/protogon → holon, and the flip is a
// logged REC (held:true) — the provisional id folded onto the name's. `kind:'name'` is the
// held-migration kind migrate.js already accounts (the inverse: REC held:false escapes are
// the Emanon FINDING at ≥3 — the same referent seen at two times, unbound here, un-migratable
// there). This returns the event; the caller appends it to the log.
export const promotionEvent = (descKey, nameId, { sentIdx = null } = {}) =>
  Object.freeze({
    op: 'REC', kind: 'name', held: true,
    from: provisionalId(descKey), to: nameId, role: String(descKey || '').toLowerCase(),
    ...(sentIdx != null ? { sentIdx } : {}),
  });

// Emit the promotion ledger for a finished doc: one REC (held:true) per descriptor that
// bound a name. Additive and replayable — the default parse stays byte-identical (the
// events are minted on demand, never inline), yet the cast carries the auditable trace of
// its own individuation. Returns the events (also appended to the log when `append`).
export const promoteBoundDescriptors = (doc, { append = false } = {}) => {
  if (!doc || !doc.corefField || !doc.corefField.descriptorReferents) return [];
  const events = [];
  for (const dr of doc.corefField.descriptorReferents()) {
    if (!dr.bound) continue;
    const ev = promotionEvent(dr.roleKey, dr.bound, { sentIdx: dr.lastIdx });
    events.push(ev);
    if (append && doc.log && doc.log.append) doc.log.append(ev);
  }
  return events;
};
