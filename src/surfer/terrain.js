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

import { terrainOf } from '../core/index.js';

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

// siteTerrainAt(doc, cursor, opts) → the terrain of one locus, read off the log.
//   The ops are every operator that landed at this cursor (sentIdx); thin when no inscribed
//   content (no INS/CON/SIG) is there — the ambient case. recurrent is left to the caller (a
//   single locus is an INSTANCE → Figure by default; an aggregate reading, like a trajectory's
//   arc, is the Pattern case and types itself — see arcTerrain). Modality-blind: reads only ops.
export const siteTerrainAt = (doc, cursor, { recurrent = false, thin = null } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const ops = [];
  let content = false;
  for (const e of events) {
    if (e.sentIdx !== cursor) continue;
    ops.push(e.op);
    if (e.op === 'INS' || e.op === 'CON' || e.op === 'SIG') content = true;
  }
  return siteTerrain({ ops, recurrent, thin: thin == null ? !content : thin });
};

// A single CON/SIG bond IS a Link (Structure × Figure) — the instance. The salience link
// channel selects Links; this names what it selects.
export const bondTerrain = () => terrainOf('Structure', 'Figure');   // 'Link'

// A REGULARITY over links — a trajectory's segmented arc, an aggregated relation — IS a
// Network (Structure × Pattern). The trajectory is a Network reading: a pattern of Links.
export const arcTerrain = () => terrainOf('Structure', 'Pattern');   // 'Network'
