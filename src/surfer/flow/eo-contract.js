// EO contracts for the flow holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/flow/index.js': contract({ ops: ['EVA', 'SYN', 'SEG'], targets: ['Network', 'Paradigm', 'Field'], products: ['Lens', 'Network', 'Field'], stances: ['Tracing', 'Composing', 'Dissecting'], note: 'flow witness; trajectory scorer' }),
  'src/surfer/flow/select.js': contract({ ops: ['EVA', 'INS'], targets: ['Field', 'Void'], products: ['Paradigm'], stances: ['Binding', 'Making'], note: 'installed-prior resolver + loader' }),
});
