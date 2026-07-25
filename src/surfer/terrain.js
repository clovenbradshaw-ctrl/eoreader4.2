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
// Domain is determined by the most specific operator present at the locus:
//   CON  → Structure       (a specific relation between two entities)
//   DEF  → Interpretation  (a characterization/definition)
//   EVA  → Interpretation  (an evaluation)
//   SEG  → Structure       (a resplit of the field)
//   SYN  → Structure       (a synthesis across the field)
//   REC  → Interpretation  (a learned rule)
//   INS  → Existence       (an entity instantiated)
//   SIG  → Existence       (an attribute of an entity)
//   NUL  → Existence       (a hold — nothing existence-wise transformed)
//
// Grain is determined by three independent measurements:
//   thin (no INS/CON/SIG at the locus)  → Ground  (Void/Field/Atmosphere)
//   recurrent (same bond or characterization repeats elsewhere) → Pattern (Kind/Network/Paradigm)
//   Structure without a specific CON bond → Ground (Field — ambient relational environment)
//   default → Figure (Entity/Link/Lens)
//
// Kind membership (entity belongs to a detected class) is stored on the entity,
// NOT used to override locus grain. An entity is always a specific instance (Entity)
// at its locus regardless of what Kind it belongs to.
//
// Modality-blind: the same (ops, grain) → the same terrain in any modality.

import { terrainOf } from '../core/index.js';

// siteTerrain(profile) → the terrain at a locus, from its operator profile and grain signals.
//   ops        the operators that landed at the locus (e.g. ['INS','CON'])
//   recurrent  the locus stands for a REGULARITY, not a single instance (→ Pattern grain)
//   thin       the locus has no inscribed content — ambient medium (→ Ground grain)
//
// Domain is determined by specificity, not count. A single CON makes it Structure
// regardless of how many INS events also landed here. A single DEF makes it
// Interpretation regardless of INS count. This fixes the 32% error rate from the
// count-based vote (experiment A showed Link loci had only 47% Structure-domain ops).
export const siteTerrain = ({ ops = [], recurrent = false, thin = false } = {}) => {
  const present = new Set(ops);

  let domain;
  if (present.has('CON')) {
    domain = 'Structure';
  } else if (present.has('DEF') || present.has('EVA')) {
    domain = 'Interpretation';
  } else if (present.has('SEG') || present.has('SYN')) {
    domain = 'Structure';
  } else if (present.has('REC')) {
    domain = 'Interpretation';
  } else {
    domain = 'Existence';
  }

  const grain = thin ? 'Ground' : (recurrent ? 'Pattern' : 'Figure');
  return terrainOf(domain, grain);
};

// recurrenceAt(doc, events, cursor, ops) — recurrent, COMPUTED from the log
// instead of trusted from the caller. A locus is a regularity, not an instance, when what
// it names keeps happening elsewhere in the SAME log:
//   Structure (CON present) — the same PAIR of ids is bonded (CON) at more than
//     one distinct sentIdx elsewhere in the log — a relationship that recurs, not a
//     single instance of one. Deliberately id-based, not word-based (relType/via are
//     often a raw verb string from the reader, e.g. "admired" or, on a misparse, a bare
//     pronoun like "i"/"you" — a real recurring signal on the WORD would inherit that
//     noise; the ids the parser already resolved do not).
//   Interpretation (DEF/EVA/REC present) — the entity this DEF characterizes (op:DEF,
//     key:'predicate') has been characterized more than once, at more than one sentIdx,
//     with a genuinely different value: the reading has been held, then re-held
//     differently. That is a Paradigm's own identity condition (>=2 instancing readings),
//     read off the log the parser already keeps — no new signal, just an unignored one.
//   Existence — no recurrence signal exists here. Kind membership is stored on the
//     entity referent, NOT used to override locus grain. An entity that belongs to a
//     detected Kind is still a specific instance (Entity/Figure) at its locus.
const recurrenceAt = (doc, events, cursor, ops) => {
  const present = new Set(ops);
  const hasStructure = present.has('CON');
  const hasInterpretation = present.has('DEF') || present.has('EVA') || present.has('REC');

  if (hasStructure) {
    const here = events.find((e) => e.sentIdx === cursor && e.op === 'CON' && e.src != null && e.tgt != null);
    if (here) {
      const sentIdxs = new Set();
      for (const e of events) if (e.op === 'CON' && e.src === here.src && e.tgt === here.tgt) sentIdxs.add(e.sentIdx);
      if (sentIdxs.size >= 2) return true;
    }
  }
  if (hasInterpretation) {
    const here = events.find((e) => e.sentIdx === cursor && e.op === 'DEF' && e.key === 'predicate');
    if (here && here.id != null) {
      const values = new Set();
      for (const e of events) if (e.op === 'DEF' && e.key === 'predicate' && e.id === here.id)
        values.add(String(e.value == null ? '' : e.value).trim().toLowerCase());
      if (values.size >= 2) return true;
    }
  }
  return false;
};

// siteTerrainAt(doc, cursor, opts) → the terrain of one locus, read off the log.
//   Domain from the most specific operator present (siteTerrain's specificity rule).
//   Grain from: thin (no content ops) → Ground; recurrent → Pattern;
//     Structure without specific CON bond → Field/Ground;
//     default → Figure.
//   Kind membership is NOT used to override grain — it is stored separately on
//   the referent.
//   Explicit recurrent/thin overrides from the caller still win.
export const siteTerrainAt = (doc, cursor, { recurrent = null, thin = null } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const ops = [];
  let content = false;
  for (const e of events) {
    if (e.sentIdx !== cursor) continue;
    ops.push(e.op);
    if (e.op === 'INS' || e.op === 'CON' || e.op === 'SIG') content = true;
  }

  // Domain from operator presence (specificity-based)
  const present = new Set(ops);
  let domain;
  if (present.has('CON')) {
    domain = 'Structure';
  } else if (present.has('DEF') || present.has('EVA')) {
    domain = 'Interpretation';
  } else if (present.has('SEG') || present.has('SYN')) {
    domain = 'Structure';
  } else if (present.has('REC')) {
    domain = 'Interpretation';
  } else {
    domain = 'Existence';
  }

  // Field detection: Structure domain without a specific CON bond is
  // Ground grain (ambient relational environment), not Figure/Link.
  // A specific bond = CON with a resolved (src, tgt) pair.
  // If no specific bond exists, the locus describes ambient relational structure.
  const hasSpecificBond = present.has('CON') &&
    events.some((e) => e.sentIdx === cursor && e.op === 'CON' && e.src != null && e.tgt != null);

  // Grain: thin → Ground; recurrent → Pattern; Structure without bond → Field/Ground; else Figure
  const userThin = thin == null ? !content : thin;
  const rec = recurrent == null ? recurrenceAt(doc, events, cursor, ops) : recurrent;

  let grain;
  if (userThin) {
    grain = 'Ground';
  } else if (rec) {
    grain = 'Pattern';
  } else if (domain === 'Structure' && !hasSpecificBond) {
    grain = 'Ground';
  } else {
    grain = 'Figure';
  }

  return terrainOf(domain, grain);
};

// A single CON/SIG bond IS a Link (Structure × Figure) — the instance. The salience link
// channel selects Links; this names what it selects.
export const bondTerrain = () => terrainOf('Structure', 'Figure');   // 'Link'

// A REGULARITY over links — a trajectory's segmented arc, an aggregated relation — IS a
// Network (Structure × Pattern). The trajectory is a Network reading: a pattern of Links.
export const arcTerrain = () => terrainOf('Structure', 'Pattern');   // 'Network'

// GRAIN_WEIGHT — how much a locus's GRAIN (Ground/Figure/Pattern) should scale a measured
// quantity, shared by every terrain-aware consumer so the law is stated once: a Ground-grain
// locus is ambient, not yet concentrated into anything specific (Atmosphere/Field/Void), and
// weighs LESS; Figure, a specific instance (Lens/Entity/Link), is the baseline; Pattern, a
// recurring regularity (Paradigm/Kind/Network), weighs MORE — it already clears a stricter
// measurement bar to register as a regularity at all (surf.js's own Paradigm-pass hysteresis).
// Consumed by write/gravity.js's turnWeights (how heavily a rendered turn is emphasized) and
// surf.js's own arrest conditioning (where the reading stops) — two readings of the SAME cube
// law, not two independently-invented schedules.
export const GRAIN_WEIGHT = Object.freeze({ Ground: 0.75, Figure: 1, Pattern: 1.25 });
