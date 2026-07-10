// EO contracts for the credence holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/perceiver/credence/book.js': contract({ ops: ['EVA', 'SEG', 'DEF', 'NUL'], targets: ['Entity', 'Network', 'Lens'], products: ['Link', 'Lens', 'Void'], stances: ['Binding', 'Dissecting', 'Clearing'], note: 'credence write side' }),
  'src/perceiver/credence/detect.js': contract({ ops: ['SEG'], targets: ['Field'], products: ['Link'], stances: ['Dissecting'], note: 'Page-Hinkley detector' }),
  'src/perceiver/credence/filters.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Atmosphere'], stances: ['Tending'], note: 'forgetting Beta/EW estimators' }),
  'src/perceiver/credence/index.js': contract({ ops: ['SIG', 'SEG', 'EVA', 'DEF', 'NUL'], targets: ['Field', 'Entity', 'Network', 'Lens', 'Atmosphere'], products: ['Link', 'Atmosphere', 'Lens', 'Void', 'Field'], stances: ['Tending', 'Binding', 'Tracing', 'Dissecting', 'Unraveling', 'Clearing'], note: 'barrel' }),
  'src/perceiver/credence/integrate.js': contract({ ops: ['EVA'], targets: ['Atmosphere', 'Lens', 'Field'], products: ['Field', 'Lens'], stances: ['Tending', 'Binding'], note: 'reweight + flag, gated' }),
  'src/perceiver/credence/project.js': contract({ ops: ['SIG', 'SEG', 'EVA'], targets: ['Field', 'Lens'], products: ['Atmosphere', 'Lens'], stances: ['Tracing', 'Unraveling', 'Binding'], note: 'projectCredence, read side' }),
});
