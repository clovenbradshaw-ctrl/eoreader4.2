// EO contracts for the rashomon holon — the Act/Site/Stance faces of every module, with the
// Site face split into targets (what it reads) and products (what it writes). Validated by
// tests/contracts.test.js against the cube's coherence guard. See docs/eo-for-coders.md.
//
// The rashomon holon is the "Rashomon" surface: the same events read from two figures' folds,
// and the difference between those folds (agree / conflict / diverge / each own) painted as a
// first-class object, at one source or across the whole topic. It computes nothing itself —
// every judgment is the engine's (perceiver/perspective-diff via the reader app membrane); the
// surface only paints what the diff decides.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/rashomon/index.js':   contract({ ops: ['INS', 'NUL'], targets: ['Network'], products: ['Lens', 'Void'], stances: ['Making', 'Clearing'], note: 'barrel — the rashomon room entrance' }),
  'src/rooms/rashomon/surface.js': contract({ ops: ['INS', 'NUL'], targets: ['Network'], products: ['Lens', 'Void'], stances: ['Making', 'Clearing'], note: 'the Rashomon DOM surface — scope toggle, two figure pickers, the diff panels' }),
});
