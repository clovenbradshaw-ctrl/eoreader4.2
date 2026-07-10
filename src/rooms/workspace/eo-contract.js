// EO contracts for the workspace holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/workspace/index.js': contract({ ops: ['CON', 'SYN', 'SEG'], targets: ['Field', 'Link'], products: ['Network', 'Link', 'Field'], stances: ['Binding', 'Composing', 'Dissecting'], note: 'virtual folder filing layer' }),
  'src/rooms/workspace/lens.js': contract({ ops: ['CON', 'INS', 'DEF'], targets: ['Entity', 'Lens'], products: ['Lens', 'Link'], stances: ['Binding', 'Making', 'Dissecting'], note: 'pinned-source lens layer' }),
  'src/rooms/workspace/relationships.js': contract({ ops: ['SYN', 'CON', 'INS'], targets: ['Field', 'Network'], products: ['Network', 'Link', 'Field'], stances: ['Composing', 'Tracing', 'Making'], note: 'typed-edge db from log' }),
});
