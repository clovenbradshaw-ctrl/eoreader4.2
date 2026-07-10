// EO contracts for the archive holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/archive/pin.js': contract({ ops: ['INS', 'SIG', 'CON'], targets: ['Void', 'Field'], products: ['Entity', 'Link'], stances: ['Making', 'Binding'], note: 'archive-pin: source permanence' }),
});
