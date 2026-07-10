// EO: SIG·EVA(Paradigm,Kind → Lens, Binding,Tracing) — stages spelled on three faces
// The pipeline, spelled on all three faces — migration step 1 of
// docs/spec-good-watchmaker.md ("Print the faces").
//
// The turn is a fold of 17 named stages (turn/pipeline.js). Each stage has a
// human LABEL that a person reads in the trace under deadline — `route`,
// `retrieve`, `settle` — and, underneath, a canonical spelling in the cube's own
// notation: operator(Site, Stance). The label is the Act face alone; the spelling
// carries all three. The spec's Finding 2 is that Site and Stance rotted into
// invisibility precisely because only the label ever showed. This module makes the
// other two faces visible: every stage now carries `notate(event)` beside its
// label, so incoherence hurts where a human can see it.
//
// TWO READINGS PER STAGE, both kept honest:
//
//   spec[]    — the spelling the spec's §5 table WROTE for the stage, transcribed
//               verbatim as { op, terrain, stance } cells. This is the human gloss.
//   notation  — the spelling the cube actually PRINTS, derived by running the
//               stage's operator through core's notate() at the grain the spec's
//               cell implies. Coherent by construction (it is read off the diagonal
//               in core/faces.js), so it is what the trace shows.
//
// The two agree exactly where the spec spelled a stage coherently (reason, llm,
// bind, revise). Where they diverge, the spec's cell is off the cube's diagonal —
// an operator carrying a stance from another Mode (`EVA(Lens, Dissecting)`: EVA is
// Relate, Dissecting is a Differentiate stance) or a terrain from another Domain
// (`SIG(Atmosphere, …)`: SIG is Existence, Atmosphere is Interpretation). That
// divergence is not noise to be smoothed over; it is the census the spec's step 2
// asks for, surfaced here as `specCoherent`. The confabulation guard (core/cube.js
// `coherence`) is the judge — the same guard that rules on every emitted event.
//
// Pure: it reads the cube and prints; it emits nothing and moves no files.

import { OPERATORS, GRAINS } from '../core/operators.js';
import {
  STANCES, TERRAINS, terrainInfo, grainOfTerrain, grainOfStance, coherence,
} from '../core/cube.js';
import { notate } from '../core/faces.js';

// ── reverse lookups the cube does not export directly ─────────────────────────
// A stance name uniquely fixes its Mode; a terrain name its Domain. terrainInfo
// gives the terrain's (domain, grain); this is its stance twin, built once.
const STANCE_MODE = new Map();
for (const mode of Object.keys(STANCES))
  for (const grain of GRAINS) STANCE_MODE.set(STANCES[mode][grain], mode);

const domainOfTerrain = (terrain) => terrainInfo(terrain)?.domain ?? null;
const modeOfStance    = (stance)  => STANCE_MODE.get(stance) ?? null;

// The grain at which to PRINT a spec cell's operator. The operator's Mode and
// Domain are fixed; only the grain is free, and the spec's own cell implies it:
//   · if the operator's Domain owns the named terrain, the terrain fixes the grain
//     (the Site face is authoritative — it says where the op lands);
//   · else if the operator's Mode owns the named stance, the stance fixes it (the
//     Stance face carries the grain — the op lands elsewhere, but resolves the
//     same way);
//   · else the terrain's grain, as a last resort (a fully cross-cube gloss).
// Whichever it picks, notate() reads the coherent terrain and stance back off the
// operator at that grain, so the printed cell is always on the diagonal.
const grainForCell = ({ op, terrain, stance }) => {
  const o = OPERATORS[op];
  if (domainOfTerrain(terrain) === o.domain) return grainOfTerrain(terrain);
  if (modeOfStance(stance) === o.mode)       return grainOfStance(stance);
  return grainOfTerrain(terrain) ?? grainOfStance(stance);
};

// ── the 17 stages, transcribed from the spec's §5 table ───────────────────────
// `faculty` is the §5 column the stage belongs to; `spec` is the verbatim §5
// spelling as cells; `connector` joins a multi-cell phrase the way §5 wrote it
// (→ sequence, · walk, + pair); `note` is §5's parenthetical (grain:edge, budget…).
// The order is PIPELINE order (turn/pipeline.js), so reading the table top to
// bottom is reading a turn.
const STAGE_SPEC = Object.freeze({
  route:      { faculty: 'enactor', connector: ' · ', note: 'terminate?',
                spec: [{ op: 'EVA', terrain: 'Lens', stance: 'Dissecting' }] },
  expect:     { faculty: 'enactor', connector: ' · ',
                spec: [{ op: 'DEF', terrain: 'Atmosphere', stance: 'Making' }] },
  converse:   { faculty: 'enactor', connector: ' · ', note: 'deposition',
                spec: [{ op: 'SIG', terrain: 'Atmosphere', stance: 'Tending' }] },
  retrieve:   { faculty: 'surfer', connector: ' → ',
                spec: [{ op: 'SIG', terrain: 'Field', stance: 'Tending' },
                       { op: 'SEG', terrain: 'Field', stance: 'Dissecting' }] },
  inquire:    { faculty: 'surfer', connector: ' · ',
                spec: [{ op: 'SIG', terrain: 'Field', stance: 'Tending' }] },
  fold:       { faculty: 'surfer', connector: ' + ',
                spec: [{ op: 'SEG', terrain: 'Field', stance: 'Dissecting' },
                       { op: 'NUL', terrain: 'Field', stance: 'Clearing' }] },
  predict:    { faculty: 'surfer', connector: ' · ',
                spec: [{ op: 'EVA', terrain: 'Network', stance: 'Tracing' }] },
  answerable: { faculty: 'enactor', connector: ' · ', note: 'refuses',
                spec: [{ op: 'EVA', terrain: 'Atmosphere', stance: 'Dissecting' }] },
  gate:       { faculty: 'enactor', connector: ' · ', note: 'budget',
                spec: [{ op: 'EVA', terrain: 'Lens', stance: 'Dissecting' }] },
  reason:     { faculty: 'surfer→enactor', connector: ' · ',
                spec: [{ op: 'SYN', terrain: 'Network', stance: 'Composing' },
                       { op: 'CON', terrain: 'Link', stance: 'Binding' },
                       { op: 'REC', terrain: 'Paradigm', stance: 'Composing' }] },
  prompt:     { faculty: 'surfer', connector: ' · ', note: 'assembly',
                spec: [{ op: 'SEG', terrain: 'Field', stance: 'Dissecting' }] },
  llm:        { faculty: 'the leaf', connector: ' · ', note: 'INS — the leaf',
                spec: [{ op: 'INS', terrain: 'Entity', stance: 'Making' }] },
  bind:       { faculty: 'enactor', connector: ' · ', note: 'grain:claim',
                spec: [{ op: 'CON', terrain: 'Link', stance: 'Binding' }] },
  factcheck:  { faculty: 'enactor', connector: ' · ', note: 'grain:edge',
                spec: [{ op: 'EVA', terrain: 'Lens', stance: 'Dissecting' }] },
  revise:     { faculty: 'enactor', connector: ' · ', note: 'once',
                spec: [{ op: 'REC', terrain: 'Paradigm', stance: 'Composing' }] },
  veto:       { faculty: 'enactor', connector: ' → ', note: 'flags',
                spec: [{ op: 'EVA', terrain: 'Lens', stance: 'Dissecting' },
                       { op: 'DEF', terrain: 'Lens', stance: 'Making' }] },
  settle:     { faculty: 'enactor', connector: ' · ', note: 'commit',
                spec: [{ op: 'DEF', terrain: 'Lens', stance: 'Making' }] },
});

// The pipeline order, for callers that want to read a turn top to bottom.
export const PIPELINE_STAGES = Object.freeze(Object.keys(STAGE_SPEC));

// ── derive the printed (coherent) faces from the spec cells ───────────────────
// For each spec cell: pick the grain its own coordinates imply, then read the
// coherent terrain and stance back off the operator at that grain via notate().
// The result is the face the trace prints — guaranteed on the diagonal.
const faceOfSpecCell = (cell) => {
  const grain = grainForCell(cell);
  const event = { op: cell.op, grain };
  const notation = notate(event);                 // "OP(Terrain, Stance)" — the canonical form
  // pull the coherent terrain/stance back out of the notation for structured use
  const m = /^(\w+)\(([^,]+),\s*([^)]+)\)$/.exec(notation);
  return Object.freeze({
    op: cell.op, grain,
    terrain: m ? m[2] : null,
    stance:  m ? m[3] : null,
    notation,
  });
};

// A spec cell is coherent iff the full three-face event it names lies on the
// diagonal — the same verdict core's coherence guard gives every emitted event.
const specCellCoherent = (cell) =>
  coherence({ op: cell.op, terrain: cell.terrain, stance: cell.stance }).ok;

const specNotationOf = (cell) => `${cell.op}(${cell.terrain}, ${cell.stance})`;

// Build the full record for one stage, once.
const buildStageFace = (name) => {
  const s = STAGE_SPEC[name];
  const cells = s.spec.map(faceOfSpecCell);
  const specCoherent = s.spec.map(specCellCoherent);
  return Object.freeze({
    stage: name,
    faculty: s.faculty,
    note: s.note ?? null,
    // the coherent spelling the trace prints (all cells on the diagonal)
    notation: cells.map(c => c.notation).join(s.connector),
    cells,
    // the spec's §5 spelling, verbatim, and the guard's verdict on each cell —
    // the census: where `coherent` is false, §5 spelled the stage off the cube.
    spec: Object.freeze({
      notation: s.spec.map(specNotationOf).join(s.connector),
      cells: Object.freeze(s.spec.map(c => Object.freeze({ ...c }))),
      coherent: specCoherent.every(Boolean),
      cellCoherent: Object.freeze(specCoherent),
    }),
  });
};

// The frozen table, computed once at load.
export const STAGE_FACES = Object.freeze(
  Object.fromEntries(PIPELINE_STAGES.map(name => [name, buildStageFace(name)])),
);

// The face of one stage, or null for an unknown stage name (the pipeline emits a
// few book-keeping steps — `error`, `reflect`, `propose-web` — that are not cube
// stages; those get no spelling rather than a confabulated one).
export const stageFace = (name) => STAGE_FACES[name] ?? null;

// Just the printed notation for a stage, or null — the one-liner the trace shows
// beside the label. `notateStage('route')` → 'EVA(Lens, Binding)'.
export const notateStage = (name) => STAGE_FACES[name]?.notation ?? null;

// The census as a list: every stage whose §5 spelling carries an off-diagonal
// cell, with the guard's reason. This is the step-2 worklist, computed for free.
export const specCensus = () =>
  PIPELINE_STAGES
    .map(name => {
      const s = STAGE_SPEC[name];
      const offDiagonal = s.spec
        .map(c => ({ cell: c, verdict: coherence({ op: c.op, terrain: c.terrain, stance: c.stance }) }))
        .filter(x => !x.verdict.ok)
        .map(x => ({ spec: specNotationOf(x.cell), reason: x.verdict.reason }));
      return offDiagonal.length ? { stage: name, offDiagonal } : null;
    })
    .filter(Boolean);
