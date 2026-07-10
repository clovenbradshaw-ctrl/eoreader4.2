// EO contracts for the commission holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Validated by tests/contracts.test.js against the cube's coherence guard.
// See docs/eo-for-coders.md and docs/commission.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/weave/commission/brief.js': contract({ ops: ['DEF', 'SEG'], targets: ['Field'], products: ['Lens'], stances: ['Dissecting', 'Binding'], note: 'read the ask into a brief' }),
  'src/weave/commission/index.js': contract({ ops: ['SYN', 'INS', 'EVA'], targets: ['Field', 'Network', 'Atmosphere'], products: ['Network', 'Paradigm', 'Lens'], stances: ['Composing', 'Making', 'Tracing'], note: 'barrel' }),
  'src/weave/commission/template.js': contract({ ops: ['REC', 'SYN'], targets: ['Field', 'Network'], products: ['Paradigm'], stances: ['Composing', 'Making'], note: 'the EOT structure template' }),
});
