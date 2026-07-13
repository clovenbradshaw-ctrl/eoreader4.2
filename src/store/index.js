// EO: NUL·INS·CON(Void → Entity,Link, Making,Binding,Tending) — barrel
//
// store/ — the durable substrate, pulled from amino (see amino/docs/
// INTEGRATION-EOREADER4.md Part B) and re-cut for eoreader's native log.
//
//   "Rooms are tables. Events are rows. fold(events) is the query. The store
//    holds only ciphertext it cannot read."
//
// Layers, low to high:
//   envelope.js       pure Web-Crypto primitives (AES-GCM + ECDH key hierarchy)
//   vault.js          passphrase → in-memory AES key; seal/open bytes at rest
//   pack.js           native event ⇄ compact binary (header-scannable)
//   backends.js       byte sinks — in-memory (Node/fallback) + OPFS (browser)
//   event-store.js    encrypted append-only store — one file per room/table
//   persistent-log.js binds an EventStore to createLog (rehydrate + persist)
//
// A browser durable table lives in OPFS, NOT IndexedDB; under Node/tests it lives
// in memory. The same encrypted code path runs in both.

export {
  b64, unb64,
  deriveAccountKey,
  generateIdentityKeyPair, exportIdentityPublicKey, importIdentityPublicKey,
  wrapIdentityPrivateKey, unwrapIdentityPrivateKey,
  generateWorkspaceKey, wrapWorkspaceKey, unwrapWorkspaceKey,
  encryptPayload, decryptPayload,
  encryptBytesWithKey, decryptBytesWithKey,
} from './envelope.js';

export { Vault, vault, configureVaultStorage, listVaultUsers } from './vault.js';

export { packEvent, packBatch, unpackAll, unpackSince, scanMeta, HEADER_SIZE, OP_ORDER } from './pack.js';

export {
  memoryBackend, opfsBackend, autoBackend, opfsAvailable, requestPersistentStorage,
} from './backends.js';

export { EventStore, openEventStore, roomFileName, checkpointFileName } from './event-store.js';

export { attachStore, openPersistentLog } from './persistent-log.js';

import { vault as _vault } from './vault.js';
import { EventStore as _EventStore } from './event-store.js';
import { openPersistentLog as _openPersistentLog } from './persistent-log.js';

/**
 * The database front door: a small handle over a set of rooms (tables) that all
 * share one vault + namespace. This is what the surface membrane (window.EO.db)
 * hands out.
 *
 *   const db = createDatabase();
 *   await db.unlock('reader@local', passphrase);      // one vault for every table
 *   const { log } = await db.openLog('topic:dolphins'); // durable, encrypted log
 *   const table = await db.table('topic:dolphins');     // the raw EventStore
 */
export function createDatabase({ vault = _vault, namespace } = {}) {
  const tables = new Map();

  const table = async (roomId) => {
    if (tables.has(roomId)) return tables.get(roomId);
    const es = await new _EventStore({ roomId, vault, namespace }).open();
    tables.set(roomId, es);
    return es;
  };

  return {
    vault,
    /** Unlock (or first-time initialize) the shared vault. Returns true on success. */
    unlock: (userId, passphrase) => vault.open(userId, passphrase),
    lock: () => vault.lock(),
    isUnlocked: () => vault.isUnlocked(),
    /** The raw EventStore for a room/table (cached per db handle). */
    table,
    /** A durable, rehydrated, auto-persisting log for a room/table. */
    openLog: async (roomId, { docId } = {}) => {
      const store = await table(roomId);
      return _openPersistentLog({ roomId, docId, store, vault, namespace });
    },
  };
}
