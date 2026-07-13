// EO contracts for the store holon — the durable substrate pulled from amino
// (amino/docs/INTEGRATION-EOREADER4.md Part B). Each module spelled on all three
// faces (Act / Site / Stance), the Site face split into targets (reads) and
// products (writes). Validated by tests/contracts.test.js against the cube guard.
import { contract } from '../core/contract.js';

export const CONTRACTS = Object.freeze({
  'src/store/index.js': contract({ ops: ['NUL', 'INS', 'CON'], targets: ['Void'], products: ['Entity', 'Link'], stances: ['Making', 'Binding', 'Tending'], note: 'barrel — the database front door (rooms are tables)' }),
  'src/store/envelope.js': contract({ ops: ['DEF', 'CON', 'SEG'], targets: ['Lens'], products: ['Field', 'Link'], stances: ['Binding', 'Dissecting'], note: 'stable-key envelope encryption (AES-GCM + ECDH) — derive/wrap keys, seal/open payloads' }),
  'src/store/vault.js': contract({ ops: ['DEF', 'SEG', 'NUL'], targets: ['Lens'], products: ['Field'], stances: ['Clearing', 'Dissecting'], note: 'local at-rest vault — passphrase→AES key (PBKDF2), seal/open bytes, lock/hold' }),
  'src/store/pack.js': contract({ ops: ['SEG', 'DEF'], targets: ['Network'], products: ['Field'], stances: ['Dissecting', 'Unraveling'], note: 'binary event codec — pack/unpack the log to bytes, header-scan for cursor/dedup' }),
  'src/store/backends.js': contract({ ops: ['NUL', 'INS', 'SEG'], targets: ['Void'], products: ['Entity', 'Field'], stances: ['Making', 'Clearing'], note: 'byte-sink backends — in-memory (Node/fallback) + OPFS (browser, not IndexedDB)' }),
  'src/store/event-store.js': contract({ ops: ['INS', 'NUL', 'CON', 'SEG'], targets: ['Void', 'Network'], products: ['Entity', 'Link'], stances: ['Making', 'Binding', 'Tending'], note: 'encrypted append-only event store — one file per room/table' }),
  'src/store/persistent-log.js': contract({ ops: ['INS', 'CON', 'SIG'], targets: ['Void'], products: ['Entity', 'Link'], stances: ['Making', 'Binding', 'Tending'], note: 'durable log — bind an EventStore to createLog: rehydrate on open, persist on append' }),
});
