// EO: NUL·INS·CON(Void → Entity,Link, Making,Binding,Tending) — barrel
//
// store/ — the durable substrate + database engine over eoreader's native log.
//
//   "Rooms are tables. Events are rows. fold(events) is the query. The store
//    holds only ciphertext it cannot read."
//
// Layers, low to high:
//   vault.js          passphrase → in-memory AES key; seal/open bytes at rest
//   pack.js           native event ⇄ compact binary (header-scannable)
//   backends.js       byte sinks — in-memory (Node/fallback) + OPFS (browser)
//   event-store.js    encrypted append-only store — one file per room/table
//   persistent-log.js binds an EventStore to createLog (rehydrate + persist)
//   types.js          value coercion + column-type inference
//   rows.js           row model — fold entities / imported records → rows
//   table.js          the grid engine — buildTable / listSets
//   query.js          filter (26 typed ops) · sort · group · aggregate · FK
//   formula.js        Airtable-dialect formulas + rollups
//   database.js       createDatabase() — substrate + engine in one handle
//
// A browser durable table lives in OPFS, NOT IndexedDB; under Node/tests it lives
// in memory. The same encrypted code path runs in both.

export { Vault, vault, configureVaultStorage, listVaultUsers } from './vault.js';

export { packEvent, packBatch, unpackAll, unpackSince, scanMeta, HEADER_SIZE, OP_ORDER } from './pack.js';

export {
  memoryBackend, opfsBackend, autoBackend, opfsAvailable, requestPersistentStorage,
  resolveOpfsDir,
} from './backends.js';

export { EventStore, openEventStore, roomFileName, checkpointFileName } from './event-store.js';

export { attachStore, openPersistentLog } from './persistent-log.js';

// ── the spreadsheet-database engine over a room's fold ──
export {
  isEmpty, toNum, toTime, strOf, ciEq, asArray, asList, nfold, inferType,
  coerce, coerceValue, displayValue,
} from './types.js';

export { foldToRows, materializeRecords, resolveLinks, recordLabel, importRows, parseCSV, parseJsonRows } from './rows.js';

export { buildTable, buildTableForSet, listSets } from './table.js';

export {
  OPERATORS, OP_ALIASES, resolveOp, compileFilter, sortRows, aggregate, query,
  relatedRecords, linkedSetsFor, indexRows,
} from './query.js';

export { evaluate, evaluateRollup, FUNCTIONS, ROLLUP_FNS } from './formula.js';

// The database front door — durable substrate + spreadsheet engine in one handle.
export { createDatabase } from './database.js';
