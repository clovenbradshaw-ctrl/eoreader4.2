# Persistence — durable memory for the corpus

> **Implemented.** The persistence tier lives in [`src/store/`](../src/store) and is
> documented in [`database-framework.md`](database-framework.md). This page is the
> short pointer; that page is the reference.

The append-only log (`src/core/log.js`) is the source of truth, but on its own it
is in-memory: a reload loses every loaded document and its reading. `src/store/`
closes that gap the same way the rest of the app works — on-device, no database
server, no API tier — while keeping the log as the single source of truth: **only
the log is stored; the graph, spans, and mentions are always rebuilt by replay.**

## Shape

- **backend** — *where* bytes live (`src/store/backends.js`). The browser durable
  path is **OPFS** (an append-friendly real file); Node and the no-OPFS fallback
  use an in-memory byte file. IndexedDB is deliberately not used.
- **vault / envelope** — *how* they are encrypted (`src/store/vault.js`,
  `src/store/envelope.js`). A passphrase derives an AES-GCM key (PBKDF2); the
  backend then holds only ciphertext, so there are no keys to leak.
- **event-store** — *what* a record is (`src/store/event-store.js`): one encrypted
  append-only file per room, dedup by seq, with folded-state checkpoints.
- **persistent-log** — the seam (`src/store/persistent-log.js`): rehydrate a log
  from the store on open, persist every append.

## Default (local, zero config)

```js
import { createDatabase } from '../store/index.js';

const db = createDatabase();
await db.unlock('reader@local', passphrase);   // OPFS in a browser, memory in Node
const { log } = await db.openLog('topic:dolphins');
log.append({ op: 'INS', id: 'dolphin', label: 'Dolphin' });   // persisted, encrypted
// next boot, same passphrase: openLog rehydrates and projectGraph(log) is identical
```

The module is inert until wired, and every write is best-effort — the in-memory
log stays authoritative, so persistence can never break a reading.

## Sync / share (optional, later)

`envelope.js` already carries the ECIES workspace-key grant flow, so a room key
can be wrapped to a second reader's identity key. A Matrix-room byte backend is
the natural transport when a reading should travel across devices or to a
colleague; it slots behind the same backend seam without changing anything above
it.

## Tests

`tests/store.test.js` and `tests/store-db.test.js` (`npm test`) cover the store
round-trip, incremental append, the encrypted-at-rest guarantee (ciphertext never
leaks the payload), tamper rejection, attach + faithful rehydrate, the
memory-fallback path, and the query/table/formula engine over a durable room.
