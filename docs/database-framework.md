# The durable substrate — the database framework (from amino)

> Rooms are tables. Events are rows. `fold(events)` is the query. The store holds
> only ciphertext it cannot read.

eoreader's append-only log (`src/core/log.js`) is the source of truth, but it is
**in-memory**: readings evaporate with the tab. `src/store/` is the missing
persistence tier, pulled from **amino** (the encrypted immigration-law CRM) per
[`amino/docs/INTEGRATION-EOREADER4.md`](https://github.com/clovenbradshaw-ctrl/amino/blob/main/docs/INTEGRATION-EOREADER4.md)
Part B ("what eoreader gains from amino") and its suggested first step 3 —
*back `createLog` with amino's `EventStore` + `vault`/`envelope`*.

## Why this is cheap

Both apps are the **same machine cut at a different joint**: an append-only log
of the identical nine operators, reduced by a pure fold. amino built the durable
substrate (Matrix E2EE rooms, vault-encrypted store, recovery chain); eoreader
built the reading intelligence but keeps its log ephemeral. So porting the
substrate is an **envelope translation**, not a data-model rewrite — a stored
event folds through `projectGraph` unchanged.

## The layers (`src/store/`)

| module | what it is | ported from |
|---|---|---|
| `envelope.js` | pure Web-Crypto key hierarchy (AES-GCM + ECDH P-256): account key ← passphrase, identity keypair, ECIES-wrapped workspace key, payload seal/open | amino `src/crypto/envelope.js` — verbatim (zero DOM/Matrix deps) |
| `vault.js` | passphrase → in-memory AES-GCM key (PBKDF2); seal/open bytes at rest; lock/wipe | amino `src/vault.js` — decoupled from `localStorage`/`sessionStorage` (pluggable meta store, in-memory under Node) |
| `pack.js` | native event ⇄ compact binary; 16-byte header + JSON body; header-scannable for cursor/dedup without decoding bodies | amino `src/pack.js` — re-cut for eoreader's `{op, seq, t, …}` event shape |
| `backends.js` | byte sinks: `memoryBackend()` (Node/fallback) + `opfsBackend()` (browser) | amino `src/store.js` OPFS layer, split out as a byte sink |
| `event-store.js` | encrypted append-only store — one file per room/table; magic + header + AES-GCM chunks of `packBatch` bytes; dedup by seq; folded-state checkpoints | amino `src/store.js` (`EventStore`) |
| `persistent-log.js` | binds an `EventStore` to `createLog`: replay on open, persist on append | new glue (the seam) |
| `index.js` | the barrel + `createDatabase()` front door | new |

### Not IndexedDB

The browser durable path is **OPFS** (the Origin Private File System) — an
append-friendly real file — chosen deliberately over IndexedDB, matching amino's
own store. IndexedDB is used nowhere in this faculty. Under Node (and as the
fallback when OPFS is missing or the vault is locked) a room lives in an
in-memory byte file; the **same encrypted code path** runs in both.

## The seam

```js
import { createDatabase } from './src/store/index.js';

const db = createDatabase();
await db.unlock('reader@local', passphrase);     // one vault for every table

const { log } = await db.openLog('topic:dolphins');
log.append({ op: 'INS', id: 'dolphin', label: 'Dolphin' });   // persisted, encrypted
log.append({ op: 'CON', src: 'dolphin', tgt: 'boat', via: 'near' });

// …new tab, same passphrase — nothing in memory:
const db2 = createDatabase();
await db2.unlock('reader@local', passphrase);
const { log: log2 } = await db2.openLog('topic:dolphins');
projectGraph(log2);   // folds byte-identically to the first session
```

At the surface, `boot.js` exposes it as **`window.EO.db`**. Constructing it is
inert (no key, no disk touch); `db.unlock()` arms the vault, `db.openLog(roomId)`
hands back a durable log whose appends persist and whose reopen rehydrates.

## What holds it together

- **Fold-equivalence.** A rehydrated log produces an identical `projectGraph`
  result — the round-trip is loss-free because both sides are the same
  append-only nine-operator log. Pinned in `tests/store.test.js`.
- **Encrypted at rest.** Only `[iv][ct]` chunks reach disk; the file carries the
  `EOEV` magic in the clear and nothing else. A tampered chunk fails AES-GCM auth
  and is dropped, never silently trusted.
- **Recoverable.** A second `EventStore` over the same bytes rebuilds its cursor
  from a header-only scan and replays the whole log.
- **Multi-user ready (B3).** `envelope.js` carries the ECIES workspace-key grant
  flow, so a room key can be wrapped to a second reader's identity key — the
  primitive a shared corpus needs, ready when a transport (Matrix room) is wired.

## Verification

- `tests/store.test.js` — 14 Node tests: pack round-trip, vault seal/open + wrong
  passphrase, ECIES key sharing, encrypted persistence, ciphertext-on-disk,
  cross-instance recovery, seq dedup, tamper rejection, locked-vault degradation,
  checkpoints, and the fold-equivalence proof.
- The **OPFS** path (which Node cannot exercise) was verified in a real Chromium:
  unlock → `openLog` → append → the on-disk file is `EOEV`-magic ciphertext with
  the plaintext values absent → a fresh vault with the same passphrase rehydrates
  every event and folds identically.

## What's next (still amino's map)

The substrate is wired and durable per-device. The onward steps from the
integration doc, each independently shippable:
- back the reader session's own log(s) with `db.openLog` so readings survive
  reload through the encrypted store (rather than the current cleartext snapshot);
- a Matrix-room transport so a room syncs across devices and to a second reader
  (the `envelope.js` grant flow is already in place);
- tamper-evident, unbounded audit retention on the same store (amino B4).
