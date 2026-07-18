// EO contracts for the surfaces/operator-clock holon (docs/coil-surfaces.md §3) — the
// Act/Site/Stance faces of every module. Validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfaces/operator-clock/index.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'barrel' }),
  'src/surfaces/operator-clock/render.js': contract({ ops: ['SIG'], targets: ['Lens'], products: ['Lens'], stances: ['Tending'], note: 'the coil seen end-on — a 9-spoke dial over FoldTrace, buildScene + the DOM adapter' }),
});
