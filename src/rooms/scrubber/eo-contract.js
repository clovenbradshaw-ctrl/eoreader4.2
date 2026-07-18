// EO contracts for the rooms/scrubber holon (docs/coil-surfaces.md §2) — the
// Act/Site/Stance faces of every module. Validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/scrubber/index.js': contract({ ops: ['INS', 'DEF'], targets: ['Entity'], products: ['Entity'], stances: ['Making', 'Tending'], note: 'barrel' }),
  'src/rooms/scrubber/poincare.js': contract({ ops: ['INS', 'DEF'], targets: ['Entity'], products: ['Entity'], stances: ['Making', 'Tending'], note: 'the Poincaré scrubber — one shared reading-position cursor every coil surface subscribes to (docs/coil-surfaces.md §2)' }),
});
