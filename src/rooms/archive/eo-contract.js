// EO contracts for the archive holon — the Act/Site/Stance faces of every module,
// with the Site face split into targets (what it reads) and products (what it writes).
// Generated from the per-holon analysis; validated by tests/contracts.test.js against
// the cube's coherence guard. See docs/eo-for-coders.md and docs/spec-good-watchmaker.md.
import { contract } from '../../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/rooms/archive/pin.js': contract({ ops: ['INS', 'SIG', 'CON'], targets: ['Void', 'Field'], products: ['Entity', 'Link'], stances: ['Making', 'Binding'], note: 'archive-pin: source permanence' }),
  'src/rooms/archive/matrix.js': contract({ ops: ['INS', 'SIG'], targets: ['Void'], products: ['Entity'], stances: ['Making', 'Binding'], note: 'matrix: optional account identity' }),
  'src/rooms/archive/deposit.js': contract({ ops: ['INS', 'CON'], targets: ['Entity', 'Field'], products: ['Link'], stances: ['Making', 'Binding'], note: 'deposit: authenticated permanent archive' }),
  'src/rooms/archive/checkpoints.js': contract({ ops: ['CON'], targets: ['Field'], products: ['Link', 'Network'], stances: ['Binding', 'Tracing'], note: 'checkpoints: content-addressed archive ledger' }),
  'src/rooms/archive/autosave.js': contract({ ops: ['INS', 'CON'], targets: ['Network', 'Field'], products: ['Link'], stances: ['Making', 'Binding'], note: 'autosave: silent opt-in genome checkpoints' }),
  'src/rooms/archive/file-crypto.js': contract({ ops: ['INS', 'CON'], targets: ['Void', 'Field'], products: ['Entity', 'Link'], stances: ['Making', 'Binding'], note: 'file-crypto: encrypted-attachment (AES-CTR) crypto' }),
  'src/rooms/archive/mxc.js': contract({ ops: ['SIG', 'CON'], targets: ['Network'], products: ['Link'], stances: ['Binding', 'Tending'], note: 'mxc: Matrix media repository client' }),
  'src/rooms/archive/chain.js': contract({ ops: ['CON'], targets: ['Field'], products: ['Link', 'Network'], stances: ['Binding', 'Tracing'], note: 'chain: append-only hash-linked block ledger' }),
  'src/rooms/archive/vault.js': contract({ ops: ['CON', 'INS'], targets: ['Network', 'Field'], products: ['Link', 'Entity'], stances: ['Binding', 'Making'], note: 'vault: encrypted hash-chained media store' }),
  'src/rooms/archive/vault-mount.js': contract({ ops: ['SIG', 'INS'], targets: ['Field'], products: ['Entity'], stances: ['Making', 'Binding'], note: 'vault-mount: the vault panel DOM surface' }),
  'src/rooms/archive/vault-backup.js': contract({ ops: ['CON', 'INS'], targets: ['Network', 'Field'], products: ['Link'], stances: ['Binding', 'Making'], note: 'vault-backup: encrypted key backup + recovery' }),
});
