// EO contracts for the reason holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/surfer/reason/cursor.js': contract({ ops: ['SEG', 'EVA', 'REC'], targets: ['Field', 'Network'], products: ['Network', 'Lens', 'Paradigm'], stances: ['Unraveling', 'Tracing', 'Composing'], note: 'CURSOR_REV, the generalized fold' }),
  'src/surfer/reason/index.js': contract({ ops: ['SYN', 'CON', 'REC', 'SEG', 'EVA'], targets: ['Field', 'Network', 'Link'], products: ['Network', 'Link', 'Paradigm', 'Lens'], stances: ['Composing', 'Binding', 'Tracing', 'Unraveling'], note: 'barrel' }),
  'src/surfer/reason/walk.js': contract({ ops: ['SYN', 'CON', 'REC', 'INS'], targets: ['Network', 'Link'], products: ['Network', 'Link', 'Paradigm'], stances: ['Composing', 'Binding'], note: 'the reasoning walk' }),
});
