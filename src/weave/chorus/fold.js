// EO: INS(Field,Lens → Entity, Making) — fold-voice minter
// The fold-voice — a voice is a fold, not a generation (docs/chorus.md, "The
// fold-voice").
//
// A voice is a mechanical object the surfer produces: a fold at an address,
// carrying a weight. It is NOT model output. Model output is a compression —
// structure narrated into prose with the coordinate lost, invisibly. A fold is a
// projection: addressed and recoverable. The polyphony stays on the projection
// side of that line, so the voices are folds and only folds.
//
// A fold-voice carries:
//   address    — (level, face, cell). face is 'cube' for a primary-measure cell,
//                or 'act'|'site'|'stance' for a face-marginal cell.
//   amp        — the raw signed cosine projection onto the centroid (null on a
//                marginal, which is a sum of squares and has no single sign).
//   weight     — the squared, normalized Born mass.
//   provenance — the contributing spans and the frameSig that formed it.
//
// It is grounder-side, deterministic, and carries NO prose. Prose is the vox
// leaf's job (vox.js), and only ever for a single selected fold.

// One fold-voice. Frozen; carries no prose. `spans` and `frameSig` are the
// provenance — what formed this fold, so the render can trace it and the vox can
// be handed the excerpts. `amp` is optional (marginals have none).
export const foldVoice = ({ level = 0, face = 'cube', cell, amp = null, weight = 0, spans = [], frameSig = null } = {}) =>
  Object.freeze({
    kind: 'fold-voice',
    level,
    face,
    cell,
    amp,
    weight,
    provenance: Object.freeze({ spans: Object.freeze([...spans]), frameSig }),
    // The address as a readable, recoverable string. The whole point of a fold:
    // the coordinate is never lost, so a projection to one lane loses nothing.
    address: `L${level}/${face}/${cell}`,
  });

// Lift a Born cube distribution ({ key, amp, weight }[]) into cube fold-voices.
// `spansByCell` optionally maps a cell key → its contributing spans; `frameSig`
// is the frame signature that formed the reading. Order is preserved. Pure.
export const cubeFolds = (cells, { level = 0, spansByCell = {}, frameSig = null } = {}) =>
  Object.freeze((cells || []).map((c) => foldVoice({
    level, face: 'cube', cell: c.key, amp: c.amp, weight: c.weight,
    spans: spansByCell[c.key] || [], frameSig,
  })));

// Lift a face marginal (marginalCells output: { key, weight }[]) into fold-voices
// for that face. Marginals carry no single amp (they are sums of squares), so
// amp stays null. Pure.
export const marginalFolds = (cells, face, { level = 0, frameSig = null } = {}) =>
  Object.freeze((cells || []).map((c) => foldVoice({
    level, face, cell: c.key, amp: null, weight: c.weight, frameSig,
  })));
