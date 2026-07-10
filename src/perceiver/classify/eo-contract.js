// EO contracts for the classify holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/perceiver/classify/bandpull.js': contract({ ops: ['SYN', 'EVA'], targets: ['Lens', 'Field'], products: ['Field', 'Lens'], stances: ['Composing', 'Tracing'], note: 'band-pull / ablation-delta' }),
  'src/perceiver/classify/bands.js': contract({ ops: ['SEG', 'DEF'], targets: ['Kind'], products: ['Field', 'Lens'], stances: ['Unraveling', 'Dissecting'], note: 'grain bands, cell partition' }),
  'src/perceiver/classify/centroids.js': contract({ ops: ['NUL', 'SIG'], targets: ['Void'], products: ['Lens'], stances: ['Clearing', 'Tending'], note: 'centroid loader / instrument' }),
  'src/perceiver/classify/index.js': contract({ ops: ['SYN', 'EVA', 'SEG', 'DEF', 'NUL', 'SIG'], targets: ['Lens', 'Field', 'Kind', 'Void', 'Link'], products: ['Field', 'Lens'], stances: ['Composing', 'Tracing', 'Unraveling', 'Dissecting', 'Clearing', 'Tending', 'Binding'], note: 'barrel' }),
  'src/perceiver/classify/phasepost.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Lens', 'Kind', 'Link'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'geometric phasepost classifier' }),
});
