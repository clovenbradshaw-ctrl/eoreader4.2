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
// `recurrent` USED to be a flag every caller had to invent — and none ever did (every real
// call site omitted it), so the three Pattern cells were reachable in name only. All three
// are now COMPUTED, never a hand-picked flag, each off the cheapest real signal its domain
// actually has:
//
//   Network   (Structure × Pattern)      the same (src, tgt) pair bonded more than once
//                                        elsewhere in the log — id-based, not word-based.
//   Paradigm  (Interpretation × Pattern) the same entity characterized (DEF/predicate)
//                                        more than once with a genuinely different value.
//   Kind      (Existence × Pattern)      detectKinds (kinds.js) — a Born-rule density
//                                        operator over ENTITIES (the sibling of holons.js's
//                                        detectHolons over TIME, and surf.js's own
//                                        paradigmReading), gated against a calibrated null.
//                                        Existence had no cheap repetition signal the way
//                                        Network/Paradigm do (no membership-criterion edge
//                                        exists at this layer), so this is a real measurement
//                                        rather than a repetition check — the honest answer
//                                        to a gap the log alone cannot shortcut.
//
// siteTerrainAt still accepts an explicit `recurrent` override (a caller who already knows
// better, or a test), but its DEFAULT is now a measurement, not an always-false assumption.

import { terrainOf, memoizeOnLog } from '../core/index.js';
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

// kindsOf(doc): memoized per-doc (keyed on doc.log identity + length) — detectKinds is
// O(document); a caller typing every event in a log (weave/write/rdf.js) must not
// recompute it from scratch per event, unlike the cheap linear scans below.
const kindsOf = memoizeOnLog((log, doc) => detectKinds(doc));

// recurrenceAt(doc, events, cursor, ops, entityIds) — recurrent, COMPUTED from the log
// instead of trusted from the caller. A locus is a regularity, not an instance, when what
// it names keeps happening elsewhere in the SAME log:
//   Structure (CON/SEG/SYN present) — the same PAIR of ids is bonded (CON) at more than
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
//   Existence (INS/SIG/NUL present) — no cheap repetition signal exists here (no
//     `instance_of`-shaped membership-criterion edge at this layer), so this is a real
//     measurement rather than a shortcut: detectKinds (kinds.js) clusters entities by their
//     operational profile and reports whether any entity touched at this locus belongs to a
//     REAL (non-abstaining) recurring class.
const recurrenceAt = (doc, events, cursor, ops, entityIds) => {
  const present = new Set(ops);
  // Same domain precedence as siteTerrain's own domain pick (Structure before
  // Interpretation before Existence) — a locus with BOTH a CON and a bookkeeping DEF
  // (e.g. the parser's own grain-cue DEF) is Structure-domain there, same as siteTerrain
  // decides; computing recurrence against the other domain would silently answer a
  // question this locus was never going to be asked.
  if (present.has('CON') || present.has('SEG') || present.has('SYN')) {
    const here = events.find((e) => e.sentIdx === cursor && e.op === 'CON');
    if (!here || here.src == null || here.tgt == null) return false;
    const sentIdxs = new Set();
    for (const e of events) if (e.op === 'CON' && e.src === here.src && e.tgt === here.tgt) sentIdxs.add(e.sentIdx);
    return sentIdxs.size >= 2;
  }
  if (present.has('DEF') || present.has('EVA') || present.has('REC')) {
    const here = events.find((e) => e.sentIdx === cursor && e.op === 'DEF' && e.key === 'predicate');
    if (!here || here.id == null) return false;
    const values = new Set();
    for (const e of events) if (e.op === 'DEF' && e.key === 'predicate' && e.id === here.id)
      values.add(String(e.value == null ? '' : e.value).trim().toLowerCase());
    return values.size >= 2;
  }
  if (!doc?.log || !entityIds.length) return false;
  const kinds = kindsOf(doc.log, doc);
  return entityIds.some((id) => kinds.kindOf(id) != null);
};

// siteTerrainAt(doc, cursor, opts) → the terrain of one locus, read off the log.
//   The ops are every operator that landed at this cursor (sentIdx); thin when no inscribed
//   content (no INS/CON/SIG) is there — the ambient case. recurrent defaults to a REAL read
//   of the log (recurrenceAt), not a fixed false — a single locus is an instance (Figure)
//   only until the same reading/relation/behavioral class recurs elsewhere in the document;
//   an explicit true/false from the caller still wins (an aggregate object like a
//   trajectory's arc types itself — see arcTerrain — and should not be re-derived here).
//   Modality-blind: reads only ops (+ the touched entity ids, for the Kind measurement).
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
  const rec = recurrent == null ? recurrenceAt(doc, events, cursor, ops, entityIds) : recurrent;
  return siteTerrain({ ops, recurrent: rec, thin: thin == null ? !content : thin });
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
