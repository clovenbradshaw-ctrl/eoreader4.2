// EO contracts for the predict holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/perceiver/predict/evaluate.js': contract({ ops: ['EVA', 'SEG'], targets: ['Network'], products: ['Lens', 'Network'], stances: ['Tracing', 'Unraveling'], note: 'controls / falsification' }),
  'src/perceiver/predict/grained.js': contract({ ops: ['SYN', 'CON', 'EVA'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Composing', 'Binding', 'Tracing'], note: 'grain-nested predictor' }),
  'src/perceiver/predict/grammar-data.js': contract({ ops: ['NUL'], targets: ['Paradigm'], products: ['Paradigm'], stances: ['Clearing'], note: 'frozen grammar matrix' }),
  'src/perceiver/predict/grammar.js': contract({ ops: ['REC', 'SIG'], targets: ['Field', 'Paradigm'], products: ['Paradigm', 'Atmosphere'], stances: ['Composing', 'Tending'], note: 'learned move-grammar' }),
  'src/perceiver/predict/index.js': contract({ ops: ['EVA', 'SYN', 'SEG'], targets: ['Network', 'Field'], products: ['Lens', 'Atmosphere'], stances: ['Tracing', 'Composing'], note: 'barrel' }),
  'src/perceiver/predict/movelog.js': contract({ ops: ['SYN', 'INS'], targets: ['Network', 'Field'], products: ['Field', 'Network'], stances: ['Composing', 'Making'], note: 'the move-log, Phase 0' }),
  'src/perceiver/predict/predictor.js': contract({ ops: ['EVA', 'SYN'], targets: ['Network', 'Atmosphere'], products: ['Lens', 'Void'], stances: ['Tracing', 'Composing'], note: 'fuse priors to posterior' }),
  'src/perceiver/predict/recurrence.js': contract({ ops: ['SIG'], targets: ['Field'], products: ['Atmosphere'], stances: ['Tracing'], note: 'recurrence prior, Phase 1' }),
  'src/perceiver/predict/segment.js': contract({ ops: ['SEG', 'EVA'], targets: ['Field'], products: ['Field', 'Lens'], stances: ['Dissecting', 'Tracing'], note: 'the SEG cut' }),
  'src/perceiver/predict/structure.js': contract({ ops: ['EVA'], targets: ['Lens', 'Field'], products: ['Atmosphere'], stances: ['Tending'], note: 'structural prior, Phase 2' }),
});
