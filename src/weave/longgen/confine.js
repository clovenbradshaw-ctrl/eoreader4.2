// EO: DEF·SIG(Link → Lens, Dissecting,Binding) — holonic token confinement
// confine — the projection from a cursor's holonic address to its token confinement
// (docs/holonic-token-confinement.md). The GPS coordinate → the morphogen gradient.
//
// The engine already assigns every move a diagonal address, operator(Site, Stance)
// (core/address.js, core/cube.js). The lens-port (write/lens-port.js) already biases the
// logits by field-salience, grounding, and the entropy gate — but the OPERATOR and STANCE
// faces of the address never reach it. This composes the full address plus the phase and
// the field into a CONFINEMENT SPEC — which surface register is admissible, which figures
// may be named, how far up the entropy the draw may reach, and the always-on floor — and
// projects it to the port's configure() payload. Pure; no model, no logits. It drives real
// logits when a propose/LogitProcessor backend is present; on the echo path it is computed
// and recorded per atom (the loop now knows each position's coordinate).

import { eoAddressOfEvent } from '../../core/address.js';

// The surface REGISTER each operator admits — the shape of sentence the move resolves to.
// This is the Stance face made operational: a register is a soft preference over
// connective/framing tokens, and `forbidClose` is the hard mask a hold-open needs (a hedge
// that hardens into an assertion is a mis-fold the stance must forbid).
const REGISTER = Object.freeze({
  DEF:  'defining',       // set the terms
  INS:  'minting',        // name a new figure
  CON:  'assertive',      // bond a relation, state it plainly
  SIG:  'attributing',    // attribute a figure
  EVA:  'testing',        // weigh a particular against a term
  SYN:  'closing',        // draw together
  REC:  'restructuring',  // recast, unravel the strained frame
  SEG:  'segmenting',     // mark a boundary
  NUL:  'holding',        // register a degenerate line
  VOID: 'hedged',         // hold the absence open
});

// How far up the entropy the draw may reach, by operator — the openness the phase then
// scales. A move that MINTS or RESTRUCTURES is a genuine content choice (open wide); a move
// that HOLDS or SEGMENTS asserts almost nothing (stay near the forced grammar).
const OPENNESS = Object.freeze({
  INS: 1.0, REC: 1.0, DEF: 0.8, EVA: 0.8, CON: 0.7, SIG: 0.7, SYN: 0.6, SEG: 0.4, NUL: 0.3, VOID: 0.5,
});

// The phase scales the openness: the develop body is where content is chosen; the open and
// the land are more constrained (term-setting and closing are near-formulaic).
const PHASE_OPENNESS = Object.freeze({ open: 0.8, develop: 1.0, land: 0.7 });

const figureOf = (span) => {
  const t = String(span?.text || '').replace(/\s+/g, ' ').trim();
  return t.length <= 80 ? t : t.slice(0, 80).replace(/\s+\S*$/, '') + '…';
};

// Compose the confinement for one atom from its resolved proposition, its phase, and the
// field. Returns a pure spec:
//   register     the admissible surface shape (Stance face)
//   forbidClose  hard-mask the assertive close (a void/hold-open must not harden)
//   figures      the referents this SITE admits (become the relevance up-weights + trie)
//   openness     the entropy reach the address permits (operator × phase)
//   floor        the void flags — ALWAYS on, the one level no address relaxes
//   address      the EO coordinate, for the record (operator, site terrain, stance)
export const holonicConfinement = ({ proposition = {}, phase = null } = {}) => {
  const move = String(proposition.move || 'CON').toUpperCase();
  const band = proposition.band || 'firm';
  const address = eoAddressOfEvent({ op: move }) || null;

  const register = band === 'void' ? 'hedged' : (REGISTER[move] || 'assertive');
  // A void band, a VOID move, or a hold register may not resolve into an assertion.
  const forbidClose = band === 'void' || move === 'VOID' || move === 'NUL';

  const figures = (proposition.spans || []).map(figureOf).filter(Boolean);
  const openness = (OPENNESS[move] ?? 0.7) * (PHASE_OPENNESS[phase] ?? 1.0);

  return Object.freeze({
    move,
    register,
    forbidClose,
    figures: Object.freeze(figures),
    openness: Math.round(openness * 1000) / 1000,
    floor: Object.freeze({ voidNumerals: true, voidEntities: true }),
    address: address && Object.freeze({
      operator: address.operator,
      terrain: address.site.terrain,
      stance: address.resolution.stance,
    }),
  });
};

// Project a confinement to the lens-port configure() payload (write/lens-port.js). The
// parts that need no tokenizer are set here — the figure relevance, the entropy reach (as
// mu), and the always-on floor. `register`/`forbidClose` ride through as the seam the model
// layer realizes into a register bias and a hard close-mask once a real tokenizer is present
// (they need token ids). Given no conceptMap, relevance is silent but the floor still holds.
export const toLensConfig = (confinement = {}, { conceptMap = null, lambda = 0 } = {}) => {
  const figureWeights = new Map();
  const figs = confinement.figures || [];
  if (figs.length) {
    const w = 1 / figs.length;                 // a flat Born distribution over the site's figures
    for (const f of figs) figureWeights.set(f, w);
  }
  return {
    enabled: true,
    conceptMap,
    figureWeights: figureWeights.size ? figureWeights : null,
    mu: confinement.openness ?? 0.7,           // the entropy reach the address permits
    lambda,
    voidNumerals: confinement.floor?.voidNumerals !== false,
    voidEntities: confinement.floor?.voidEntities !== false,
    grammarMask: null,                          // register→token mask: the model-layer seam
    // carried for the model layer to realize (need token ids):
    register: confinement.register,
    forbidClose: !!confinement.forbidClose,
  };
};
