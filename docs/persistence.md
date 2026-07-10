# Persistence — durable memory for the corpus

> Implements **B1/B2** of [`INTEGRATION-AMINO.md`](INTEGRATION-AMINO.md): the
> documents a reader opens, and the event logs folded from them, survive a
> reload — over a **pluggable backend**. Local (no homeserver) is the default;
> a Matrix room is an option, not a requirement.

## Why

Today eoreader4 holds the whole corpus in memory (`STATE.docs` in
`src/ui/app.js`). Only *settings* reach `localStorage`; a reload loses every
loaded document and its reading. `src/persist/*` closes that gap the same way
the rest of the app works — on-device, no database, no API tier — while keeping
the append-only log as the single source of truth: **only the log is stored; the
graph, spans and mentions are always rebuilt by replay.**

## Shape

```
src/persist/
  index.js            openCorpusStore(), and every export below
  store.js            createCorpusStore({ driver, envelope }) — put/get/list/remove/appendEvents/clear
  attach.js           attachPersistence(log, store, meta) · rehydrateLog(createLog, record)
  envelope.js         plainEnvelope() (default) · passwordEnvelope(pw) — optional AES-GCM at rest
  drivers/
    memory.js         memoryDriver()            — Node, tests, fallback
    idb.js            idbDriver()               — the default LOCAL backend (IndexedDB)
    matrix.js         matrixDriver(client,{roomId}) · fromMatrixClient(sdk,roomId) — OPTIONAL sync/share
```

Three seams, each swappable in isolation:

- **driver** — *where* bytes live. Four async string ops (`get/set/delete/keys`).
  `memory` · `idb` (default) · `matrix` (optional). Adding a backend is adding a
  driver; nothing above it changes.
- **envelope** — *whether* they are encrypted at rest. `plainEnvelope()` (default,
  no crypto) or `passwordEnvelope(pw)` (PBKDF2 → AES-GCM; the driver then holds
  only ciphertext, mirroring amino's "no keys to leak" model). Distilled from
  amino's `src/crypto/envelope.js`.
- **store** — *what* a record is: `{ docId, modality, name, source?, events,
  addedAt, updatedAt }`, plus a light `index` so `list()` never reads full logs.

## Default (local, zero config)

```js
import { createLog } from '../core/log.js';
import { openCorpusStore, attachPersistence, rehydrateLog } from '../persist/index.js';

const store = await openCorpusStore();               // IndexedDB in a browser, memory in Node

// when a document is ingested (doc.log comes from the adapter / parse pipeline):
attachPersistence(doc.log, store, {
  docId: doc.docId, modality: doc.modality, name: doc.name, source: rawText,
});

// on the next boot, bring the corpus back:
for (const entry of await store.list()) {
  const record = await store.get(entry.docId);
  const log = rehydrateLog(createLog, record);       // graph = projectGraph(log, frame), as always
  // ...re-register the chip from record.{docId,modality,name} + the rebuilt log
}
```

## Encrypted at rest (still local, still no homeserver)

```js
import { openCorpusStore, passwordEnvelope } from '../persist/index.js';
const store = await openCorpusStore({ envelope: passwordEnvelope(userPassword) });
```

## Optional: sync / share via a Matrix room

Only when you *want* a reading to travel across devices or to a colleague. The
same store logic runs unchanged over a room's state:

```js
import { createCorpusStore, fromMatrixClient, passwordEnvelope } from '../persist/index.js';

const store = createCorpusStore({
  driver: fromMatrixClient(matrixClient, roomId),    // matrix-js-sdk, or amino's MatrixLive
  envelope: passwordEnvelope(pw),                    // recommended when it leaves the device
});
```

`matrixDriver` speaks a minimal two-method client contract
(`getState`/`setState`), so it needs neither a hard `matrix-js-sdk` dependency
nor a homeserver to be tested. Caveat: a Matrix state event caps at ~64 KB;
large logs should be sharded or moved to the media path (as amino's
`blocks.js` does) — this driver is the correct baseline and the seam that richer
transport slots behind.

## Wiring into the UI

The one integration point is `src/ui/app.js`, where `STATE.docs` is populated
and drained:

1. Near boot (after `STATE` is created): `const store = await openCorpusStore();`
   then `for (const entry of await store.list()) { … }` to restore chips.
2. Where a freshly ingested `doc` is added to `STATE.docs` (see `STATE.doc = doc`
   around `app.js:229`): `attachPersistence(doc.log, store, {…})`.
3. Where a document is dropped (the chip-remove path near `app.js:271`):
   `await store.remove(docId)`.

The module is inert until wired, and every write is best-effort — the in-memory
log stays authoritative, so persistence can never break a reading.

## Tests

`tests/persist.test.js` (`npm test`) covers the store round-trip, incremental
append, the password envelope (including that ciphertext never leaks the payload
and that plaintext records still open), attach + faithful rehydrate, the
memory-fallback of `openCorpusStore`, and the Matrix driver over a fake
room-state client.
