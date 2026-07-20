// EO: DEF(Field,Link → Lens, Dissecting) — site typing by operators
// Site typing — which of the 9 terrains a locus IS. (the omnimodal Site face)
//
// The cube's Site face is Domain × grain → 9 TERRAINS (core/cube.js):
//
//                 Ground       Figure    Pattern
//   Existence:    Void         Entity    Kind
//   Structure:    Field        Link      Network
//   Interpretation: Atmosphere  Lens      Paradigm
//
// The engine has been typing only a corner of this — Void/Entity at the locus, Atmosphere/
// Lens/Paradigm in the significance column — and NEVER the Structure row (Field/Link/Network),
// even though CON (the bond) is the central operator and every relation we read is one. This
// module closes that: it reads the terrain of a locus from the OPERATORS that landed there and
// the grain, nothing else. No words — so it is the same typing for a sentence, a video frame,
// an audio window, or a sensor sample. A link is a Link whether it is syntactic, spatial,
// harmonic, or causal; that modality-independence is the whole point of typing by operator.
//
//   domain — the row, from the most specific operator present:
//     CON / SEG / SYN  → Structure       (a relation/edge is the fact here)
//     DEF / EVA / REC  → Interpretation  (a reading / evaluation / reconsolidation)
//     INS / SIG / NUL  → Existence       (an entity or its attribute)
//   grain — the column:
//     thin (no inscribed content)        → Ground   (the ambient medium: Void/Field/Atmosphere)
//     a regularity (recurrent/aggregate) → Pattern  (Kind/Network/Paradigm)
//     a specific instance                → Figure   (Entity/Link/Lens)
//
// `recurrent` USED to be a flag every caller had to invent — and none ever did, so the
// three Pattern cells (Kind, Network, Paradigm) were reachable in name only. All three now
// ride the SAME discipline surf.js's paradigmReading pioneered for Paradigm alone — a Born-
// rule density operator, gated against a calibrated baseline, never a hand-picked flag:
//
//   Kind      (Existence × Pattern)      detectKinds     (kinds.js)  — over ENTITIES
//   Network   (Structure × Pattern)      detectHolons    (holons.js) — over TIME
//   Paradigm  (Interpretation × Pattern) paradigmReading (surf.js)   — needs a meaning
//                                        prior + embeddings, so it cannot be measured
//                                        synchronously off the log alone; siteTerrainAt
//                                        honestly holds it at Figure (Lens) until a
//                                        caller supplies the reading surf.js already made.
//
// siteTerrainAt still accepts an explicit `recurrent` override (a caller who already knows
// better, or a test), but its DEFAULT is now a measurement, not an always-false assumption.

import { terrainOf, memoizeOnLog } from '../core/index.js';
import { detectHolons } from './holons.js';
import { detectKinds } from './kinds.js';

// siteTerrain(profile) → the terrain at a locus, from its operator profile and grain signals.
//   ops        the operators that landed at the locus (e.g. ['INS','CON'])
//   recurrent  the locus stands for a REGULARITY, not a single instance (→ Pattern grain)
//   thin       the locus has no inscribed content — ambient medium (→ Ground grain)
// Pure and modality-blind: the same (ops, recurrent, thin) → the same terrain in any modality.
export const siteTerrain = ({ ops = [], recurrent = false, thin = false } = {}) => {
  const present = new Set(ops);
  const domain = (present.has('CON') || present.has('SEG') || present.has('SYN')) ? 'Structure'
    : (present.has('DEF') || present.has('EVA') || present.has('REC')) ? 'Interpretation'
    : 'Existence';
  const grain = thin ? 'Ground' : (recurrent ? 'Pattern' : 'Figure');
  return terrainOf(domain, grain);
};

// Memoized per-doc: computed once (keyed on doc.log identity + length), read at every
// cursor. detectHolons/detectKinds are O(document); a caller typing every event in a log
// (weave/write/rdf.js) must not recompute either from scratch per event.
const holonsOf = memoizeOnLog((log, doc) => detectHolons(doc));
const kindsOf = memoizeOnLog((log, doc) => detectKinds(doc));

// networkRecurrenceAt(doc) — is there a REAL (non-abstaining) holonic partition at all.
// holons.js guarantees every unit in range belongs to exactly one holon once a genuine
// multi-holon split exists (detectHolons's own "the holons partition the full range"
// invariant), so document-wide non-abstention is exactly the fact a locus's bond needs to
// read as a Network expression (a pattern of Links) rather than one bare Link.
const networkRecurrenceAt = (doc) => !holonsOf(doc.log, doc).abstain;

// kindRecurrenceAt(doc, entityIds) — do any of the entities touched at this locus belong
// to a REAL recurring class (detectKinds' own non-abstaining, profiled membership).
const kindRecurrenceAt = (doc, entityIds) => {
  if (!entityIds.length) return false;
  const kinds = kindsOf(doc.log, doc);
  return entityIds.some((id) => kinds.kindOf(id) != null);
};

// measureRecurrence(doc, ops, entityIds) — dispatch the Site-face domain (read off the
// SAME ops siteTerrain itself reads the row from) to its own structural detector. The
// Interpretation row holds at false: paradigmReading needs a meaning prior and embeddings
// this synchronous, log-only reader does not have — an honest Figure (Lens) default, not
// an invented Paradigm.
const measureRecurrence = (doc, ops, entityIds) => {
  const present = new Set(ops);
  if (!doc?.log) return false;
  if (present.has('CON') || present.has('SEG') || present.has('SYN')) return networkRecurrenceAt(doc);
  if (present.has('DEF') || present.has('EVA') || present.has('REC')) return false;
  return kindRecurrenceAt(doc, entityIds);
};

// siteTerrainAt(doc, cursor, opts) → the terrain of one locus, read off the log.
//   The ops are every operator that landed at this cursor (sentIdx); thin when no inscribed
//   content (no INS/CON/SIG) is there — the ambient case. `recurrent`, left unset, is now
//   MEASURED (see measureRecurrence above) rather than assumed false; pass it explicitly to
//   override the measurement (a caller who already knows better, or a test). Modality-blind:
//   reads only ops (+ the touched entity ids, for the Kind measurement).
export const siteTerrainAt = (doc, cursor, { recurrent = null, thin = null } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const ops = [];
  const entityIds = [];
  let content = false;
  for (const e of events) {
    if (e.sentIdx !== cursor) continue;
    ops.push(e.op);
    if (e.op === 'INS' || e.op === 'CON' || e.op === 'SIG') content = true;
    if (e.id != null) entityIds.push(e.id);
    if (e.src != null) entityIds.push(e.src);
    if (e.tgt != null) entityIds.push(e.tgt);
  }
  const measured = recurrent != null ? recurrent : measureRecurrence(doc, ops, entityIds);
  return siteTerrain({ ops, recurrent: measured, thin: thin == null ? !content : thin });
};

// A single CON/SIG bond IS a Link (Structure × Figure) — the instance. The salience link
// channel selects Links; this names what it selects.
export const bondTerrain = () => terrainOf('Structure', 'Figure');   // 'Link'

// A REGULARITY over links — a trajectory's segmented arc, an aggregated relation — IS a
// Network (Structure × Pattern). The trajectory is a Network reading: a pattern of Links.
export const arcTerrain = () => terrainOf('Structure', 'Pattern');   // 'Network'
