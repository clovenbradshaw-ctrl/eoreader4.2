// EO contracts for the dag holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/dag/causal.js': contract({ ops: ['SEG', 'CON'], targets: ['Field'], products: ['Link'], stances: ['Dissecting', 'Binding'], note: 'causal-clause reader / witness' }),
  'src/surfer/dag/complexity.js': contract({ ops: ['EVA'], targets: ['Network'], products: ['Network', 'Lens'], stances: ['Tracing'], note: 'the four complexities' }),
  'src/surfer/dag/discourse.js': contract({ ops: ['CON', 'SYN'], targets: ['Field', 'Link'], products: ['Network'], stances: ['Tracing', 'Composing'], note: 'cursor 1 — discourse DAG' }),
  'src/surfer/dag/index.js': contract({ ops: ['CON', 'SYN', 'EVA'], targets: ['Link', 'Network'], products: ['Network', 'Lens'], stances: ['Tracing', 'Composing'], note: 'asserted/corpus DAG, barrel' }),
  'src/surfer/dag/nul.js': contract({ ops: ['NUL', 'DEF'], targets: ['Network'], products: ['Lens'], stances: ['Dissecting', 'Clearing'], note: 'typed NUL for causal edge' }),
  'src/surfer/dag/stance.js': contract({ ops: ['DEF'], targets: ['Field'], products: ['Lens', 'Atmosphere'], stances: ['Dissecting'], note: 'dialectical CON stance' }),
  'src/surfer/dag/surface.js': contract({ ops: ['NUL'], targets: ['Network', 'Lens'], products: ['Void'], stances: ['Clearing'], note: 'mountDagSurface renderer' }),
});
