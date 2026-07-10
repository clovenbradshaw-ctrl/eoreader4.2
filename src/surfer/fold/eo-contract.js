// EO contracts for the fold holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/fold/audit.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network', 'Field'], products: ['Lens'], stances: ['Tracing', 'Tending'], note: 'the monologue audit; is it helping?' }),
  'src/surfer/fold/deep-reading.js': contract({ ops: ['EVA'], targets: ['Field', 'Network'], products: ['Lens'], stances: ['Binding', 'Tending'], note: 'deep reading; the idle reflection' }),
  'src/surfer/fold/impression.js': contract({ ops: ['SIG', 'SEG'], targets: ['Field'], products: ['Field'], stances: ['Tending', 'Clearing'], note: 'vague-query density fold' }),
  'src/surfer/fold/index.js': contract({ ops: ['SEG', 'SYN', 'CON', 'EVA'], targets: ['Field', 'Network', 'Lens'], products: ['Field', 'Network', 'Lens'], stances: ['Clearing', 'Composing', 'Binding', 'Tracing'], note: 'barrel' }),
  'src/surfer/fold/integral.js': contract({ ops: ['SEG', 'NUL'], targets: ['Field'], products: ['Field'], stances: ['Clearing'], note: 'foldNote; the integral fold' }),
  'src/surfer/fold/project.js': contract({ ops: ['NUL', 'SEG', 'EVA'], targets: ['Network'], products: ['Void'], stances: ['Clearing', 'Dissecting'], note: 'the membrane; talker-facing notes' }),
  'src/surfer/fold/reflect-prompt.js': contract({ ops: ['DEF', 'SEG', 'EVA'], targets: ['Field', 'Void'], products: ['Lens', 'Void'], stances: ['Dissecting', 'Binding'], note: 'the reflect prompt + output discipline' }),
  'src/surfer/fold/significance.js': contract({ ops: ['CON', 'EVA'], targets: ['Field', 'Network'], products: ['Link', 'Network'], stances: ['Binding', 'Tracing'], note: 'inferred significance edges' }),
  'src/surfer/fold/substrate.js': contract({ ops: ['SYN', 'EVA', 'NUL'], targets: ['Field', 'Network'], products: ['Network', 'Void'], stances: ['Composing', 'Binding', 'Clearing'], note: 'the reading substrate (typed graph)' }),
  'src/surfer/fold/verdict.js': contract({ ops: ['EVA', 'DEF'], targets: ['Network', 'Lens'], products: ['Lens'], stances: ['Tracing', 'Binding'], note: 'living-or-dead + sayable-or-not' }),
  'src/surfer/fold/weave.js': contract({ ops: ['EVA', 'CON'], targets: ['Lens', 'Network'], products: ['Paradigm', 'Link'], stances: ['Tracing', 'Binding'], note: 'metacognition + cross-connections' }),
});
