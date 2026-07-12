// EO contracts for the lineup holon — the chorus of surfers. The Act/Site/Stance faces of
// every module, with the Site face split into targets (what it reads) and products (what it
// writes). Validated by tests/contracts.test.js against the cube's coherence guard.
// See docs/cooperative-graph-surfers.md, docs/eo-for-coders.md, docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/lineup/index.js': contract({ ops: ['NUL', 'SEG', 'SIG', 'EVA', 'CON', 'REC', 'DEF'], targets: ['Field', 'Network', 'Kind'], products: ['Network', 'Field', 'Lens', 'Paradigm', 'Void'], stances: ['Tending', 'Clearing', 'Tracing', 'Making', 'Composing', 'Binding', 'Dissecting'], note: 'barrel — the chorus of surfers' }),
  'src/surfer/lineup/temperaments.js': contract({ ops: ['DEF', 'EVA'], targets: ['Kind'], products: ['Lens', 'Paradigm'], stances: ['Dissecting', 'Binding'], note: 'the cast — surfer temperaments' }),
  'src/surfer/lineup/surfer.js': contract({ ops: ['EVA', 'SEG', 'SYN'], targets: ['Field', 'Network'], products: ['Network', 'Lens'], stances: ['Tracing', 'Composing', 'Dissecting'], note: 'one surfer — a temperament riding the graph' }),
  'src/surfer/lineup/signal.js': contract({ ops: ['SIG', 'EVA', 'NUL'], targets: ['Field', 'Network'], products: ['Field', 'Lens', 'Void'], stances: ['Tending', 'Tracing', 'Clearing'], note: 'signal from noise — the null + consensus' }),
  'src/surfer/lineup/sources.js': contract({ ops: ['NUL', 'SIG', 'INS', 'CON'], targets: ['Void', 'Field', 'Network'], products: ['Entity', 'Field', 'Network', 'Void'], stances: ['Clearing', 'Tending', 'Making', 'Binding'], note: 'the search gate + the meaningful-only source commons' }),
  'src/surfer/lineup/reward.js': contract({ ops: ['DEF', 'EVA', 'REC', 'SEG'], targets: ['Field', 'Network', 'Atmosphere'], products: ['Lens', 'Paradigm', 'Atmosphere'], stances: ['Tending', 'Tracing', 'Making', 'Composing', 'Dissecting'], note: 'evolutionary reward — fitness, shares, reputation, room' }),
});
