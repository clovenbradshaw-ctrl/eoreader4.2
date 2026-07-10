// EO contracts for the turn holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/turn/archive.js': contract({ ops: ['NUL', 'SIG'], targets: ['Entity'], products: ['Entity'], stances: ['Clearing', 'Tending'], note: 'leased store + shredder' }),
  'src/turn/deep-research.js': contract({ ops: ['SYN', 'EVA'], targets: ['Network', 'Field'], products: ['Network'], stances: ['Composing', 'Tracing'], note: 'deep multi-branch research + report' }),
  'src/turn/expect.js': contract({ ops: ['DEF', 'EVA'], targets: ['Field'], products: ['Atmosphere', 'Lens'], stances: ['Clearing', 'Binding'], note: 'answer expectation' }),
  'src/turn/feed.js': contract({ ops: ['NUL', 'SEG'], targets: ['Field'], products: ['Field'], stances: ['Clearing', 'Dissecting'], note: 'what the model would be fed' }),
  'src/turn/index.js': contract({ ops: ['SYN', 'EVA', 'DEF'], targets: ['Network', 'Field', 'Lens'], products: ['Network', 'Entity', 'Lens'], stances: ['Composing', 'Binding', 'Dissecting'], note: 'barrel' }),
  'src/turn/intent.js': contract({ ops: ['EVA', 'DEF', 'REC'], targets: ['Field', 'Kind'], products: ['Kind', 'Paradigm'], stances: ['Tracing', 'Dissecting', 'Composing'], note: 'task register (DEF·EVA·REC)' }),
  'src/turn/meta-route.js': contract({ ops: ['EVA', 'DEF'], targets: ['Atmosphere', 'Field'], products: ['Lens', 'Paradigm'], stances: ['Tracing', 'Dissecting'], note: 'route off metacognition speech' }),
  'src/turn/pipeline.js': contract({ ops: ['SYN', 'CON'], targets: ['Network', 'Field'], products: ['Network', 'Entity'], stances: ['Composing', 'Binding'], note: 'runTurn — the pass composition' }),
  'src/turn/prefetch.js': contract({ ops: ['NUL', 'EVA'], targets: ['Entity'], products: ['Entity'], stances: ['Clearing', 'Tending'], note: 'speculative web prefetch quarantine' }),
  'src/turn/propose.js': contract({ ops: ['EVA', 'DEF'], targets: ['Lens', 'Void'], products: ['Lens'], stances: ['Binding', 'Dissecting'], note: 'web-search proposer' }),
  'src/turn/reread.js': contract({ ops: ['EVA', 'SIG'], targets: ['Field', 'Lens'], products: ['Field'], stances: ['Binding', 'Tending'], note: 'active-inference re-read' }),
  'src/turn/research.js': contract({ ops: ['EVA', 'SYN'], targets: ['Network', 'Field'], products: ['Network'], stances: ['Tracing', 'Composing'], note: 'curiosity-guided multi-hop research' }),
  'src/turn/shape.js': contract({ ops: ['REC', 'EVA'], targets: ['Field', 'Lens'], products: ['Paradigm', 'Lens'], stances: ['Composing', 'Binding'], note: 'answer-form predictor (learned shapes)' }),
  'src/turn/stage-faces.js': contract({ ops: ['SIG', 'EVA'], targets: ['Paradigm', 'Kind'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'stages spelled on three faces' }),
  'src/turn/stages.js': contract({ ops: ['SEG', 'INS', 'EVA'], targets: ['Field', 'Network'], products: ['Entity', 'Lens', 'Network'], stances: ['Dissecting', 'Making', 'Binding'], note: 'the named pipeline stages' }),
  'src/turn/web.js': contract({ ops: ['SYN', 'EVA', 'DEF'], targets: ['Network', 'Field', 'Lens'], products: ['Network', 'Lens'], stances: ['Composing', 'Binding', 'Dissecting'], note: 'web-search turn orchestration' }),
});
