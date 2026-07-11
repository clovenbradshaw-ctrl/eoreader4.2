// EO contracts for the coder — the Act/Site/Stance faces of the issue-detection
// wedge (docs/eot-coder-roadmap.md §4). Validated by tests/contracts.test.js
// against the cube's coherence guard. See docs/eot-coder-checkpoint.md.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/coder/checkpoint.js': contract({ ops: ['EVA', 'SIG'], targets: ['Network', 'Entity'], products: ['Lens'], stances: ['Binding', 'Tracing'], note: 'the assembly checkpoint — Appendix B typed errors read off the algebra (enactor door)' }),
  'src/coder/catalog.js': contract({ ops: ['DEF'], targets: ['Lens'], products: ['Paradigm'], stances: ['Dissecting'], note: 'the closed surface catalog — a pre-built vocabulary, never generated' }),
  'src/coder/index.js': contract({ ops: ['EVA', 'SIG', 'DEF'], targets: ['Network', 'Entity', 'Lens'], products: ['Lens', 'Paradigm'], stances: ['Binding', 'Tracing', 'Dissecting'], note: 'barrel' }),
});
