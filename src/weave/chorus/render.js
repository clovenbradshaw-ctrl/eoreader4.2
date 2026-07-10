// EO: CON·SEG(Field,Network → Network,Lens, Tracing,Binding,Dissecting) — the render (weighted map)
// The render — a weighted map, mechanical, no generation (docs/chorus.md, "The
// render").
//
// The output is a weighted map, and the map IS the answer for most queries. Per
// level, a lane. Within a lane, the cube's mass across cells, with the three
// face-marginals available as the three readable projections. Two incompatible
// cells both carrying high mass are drawn as an EVA-site, held side by side,
// unresolved — productive ambiguity, not an error to reconcile. The move from one
// level's lane to the next is drawn as a REC-transition, the rotation made
// visible. The cell at SYN by Ground carries zero mass in every physical reading
// and is drawn as silence, a preserved absence — the empty slot kept as data.
//
// The render NEVER collapses the lanes into one. Collapse is SYN, and SYN here
// would be the compression we are avoiding. A reader may project the whole thing
// down to one lane or one face on demand and lose nothing, because the rest is
// parked with its address and recoverable (fold.js). That recoverability is the
// entire reason the voices had to be folds. This module emits DATA — a structured
// map — not pixels; a UI renders it, but the reading lives here.

import { govern, DEFAULT_COVERAGE } from './governor.js';
import { cubeMarginals, marginalCells } from './marginals.js';
import { cubeFolds } from './fold.js';
import { recStrain } from './levels.js';

// The SYN-by-Ground cell — Generate × Structure at the Ground grain. The corpus
// finds no verbs at SYN's empty cells; this one is drawn as a preserved absence in
// every lane, the empty slot kept as data rather than hidden.
export const SILENCE_CELL = 'SYN_Cultivating_Field';

// A competitor carrying at least this fraction of the leader's weight is a genuine
// rival, held beside it as an EVA-site rather than resolved away. Readable knob.
const DEFAULT_EVA_FLOOR = 0.5;

// One lane: the cube's mass at a level, its three face-marginals, the EVA-sites
// held unresolved, and the silence kept as data. Built on folds, so every cell in
// the lane is addressed and recoverable.
export const renderLane = (dist, { level = 0, coverage = DEFAULT_COVERAGE, evaFloor = DEFAULT_EVA_FLOOR, spansByCell = {}, frameSig = null } = {}) => {
  const cube = govern(dist, { coverage });
  const marginals = cubeMarginals(dist);

  // Each face is its own governed projection — the three readable lenses.
  const faces = {};
  for (const face of ['act', 'site', 'stance'])
    faces[face] = govern(marginalCells(marginals, face), { coverage });

  // EVA-sites: among the voiced cube cells, every rival that carries at least
  // `evaFloor` of the leader's weight is held beside the leader, unresolved.
  const voiced = cube.voiced;
  const lead = voiced[0]?.weight || 0;
  const evaSites = lead > 0
    ? voiced.slice(1)
        .filter((c) => c.weight >= evaFloor * lead)
        .map((c) => Object.freeze({ hold: [voiced[0].key, c.key], weights: [lead, c.weight] }))
    : [];

  // Silence: the SYN-by-Ground cell, drawn as a preserved absence with whatever
  // (near-zero) mass it carries. Never omitted — the empty slot is evidence.
  const silenceCell = (dist || []).find((c) => c.key === SILENCE_CELL);
  const silence = Object.freeze({
    cell: SILENCE_CELL,
    weight: silenceCell?.weight ?? 0,
    preservedAbsence: true,
  });

  return Object.freeze({
    level,
    coverage,
    cube,                                   // voiced + silent, addressed
    faces: Object.freeze(faces),            // act / site / stance, each governed
    evaSites: Object.freeze(evaSites),
    silence,
    folds: cubeFolds(dist, { level, spansByCell, frameSig }),  // recoverable projections
  });
};

// A REC-transition between two lanes — the rotation made visible. Carries the
// strain (how much mass the level above redistributed) and the movers (the cells
// that gained or lost the most), so the significance-becomes-being hinge is shown
// rather than hidden. SKETCH-level, like levels.recStrain.
export const recTransition = (lowerDist, upperDist, { topMovers = 3 } = {}) => {
  const asMap = (cells) => {
    const m = {};
    for (const c of (cells || [])) m[c.key] = (m[c.key] || 0) + (c.weight || 0);
    return m;
  };
  const lo = asMap(lowerDist), hi = asMap(upperDist);
  const keys = [...new Set([...Object.keys(lo), ...Object.keys(hi)])];
  const movers = keys
    .map((key) => ({ key, delta: (hi[key] || 0) - (lo[key] || 0) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, topMovers);
  return Object.freeze({
    kind: 'REC-transition',
    strain: recStrain(lowerDist, upperDist),
    movers: Object.freeze(movers),
  });
};

// The whole chorus: one lane per level, the REC-transitions between them, and the
// lanes NEVER collapsed into one. `levelDists` is an ordered array of Born cube
// distributions (lowest level first). Pure.
export const renderChorus = (levelDists, { coverage = DEFAULT_COVERAGE, evaFloor = DEFAULT_EVA_FLOOR } = {}) => {
  const dists = levelDists || [];
  const lanes = dists.map((dist, level) => renderLane(dist, { level, coverage, evaFloor }));
  const transitions = [];
  for (let i = 1; i < dists.length; i++)
    transitions.push(recTransition(dists[i - 1], dists[i]));
  return Object.freeze({
    lanes: Object.freeze(lanes),
    transitions: Object.freeze(transitions),
    // The render never collapses; a reader may project down on demand and lose
    // nothing, because every fold keeps its address.
    collapsed: false,
  });
};

// Project the whole chorus down to ONE lane or ONE face on demand — the reader's
// prerogative, losing nothing because the rest stays parked with its address.
// `pick` is { level } for one lane, or { level, face } for one face of it.
export const project = (chorus, { level = 0, face = null } = {}) => {
  const lane = chorus?.lanes?.[level];
  if (!lane) return null;
  if (!face) return lane;
  return Object.freeze({ level, face, governed: lane.faces[face] });
};
