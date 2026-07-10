// EO contracts for the audit holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/audit/eot-ledger.js': contract({ ops: ['NUL', 'SIG'], targets: ['Void', 'Entity'], products: ['Void', 'Atmosphere'], stances: ['Tending', 'Binding', 'Clearing'], note: 'EOT operation ledger (append-only)' }),
  'src/rooms/audit/eot-terminal.js': contract({ ops: ['NUL'], targets: ['Void', 'Atmosphere'], products: ['Void'], stances: ['Clearing'], note: 'EOT ledger terminal drawer (DOM)' }),
  'src/rooms/audit/index.js': contract({ ops: ['INS', 'NUL', 'SIG'], targets: ['Void', 'Entity', 'Kind', 'Atmosphere'], products: ['Void', 'Entity', 'Kind', 'Atmosphere'], stances: ['Making', 'Tending', 'Binding', 'Clearing'], note: 'barrel' }),
  'src/rooms/audit/log.js': contract({ ops: ['INS', 'NUL'], targets: ['Void', 'Entity'], products: ['Entity'], stances: ['Making', 'Tending'], note: 'per-turn audit trail (ring)' }),
  'src/rooms/audit/schema.js': contract({ ops: ['NUL'], targets: ['Kind'], products: ['Kind'], stances: ['Clearing'], note: 'audit record schema/version' }),
});
