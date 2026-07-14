# The database — durable, encrypted, and queryable

> Rooms are tables. Events are rows. `fold(events)` is the query. The store holds
> only ciphertext it cannot read.

eoreader's append-only log (`src/core/log.js`) is the source of truth, but on its
own it is **in-memory** and **unqueryable-as-a-table**: readings evaporate with
the tab, and there's no spreadsheet view over what a reading recorded. `src/store/`
adds both missing halves — a durable, encrypted persistence tier, and a
spreadsheet-database engine over the fold.

## Two halves, one faculty

```
src/store/
  # the durable substrate
  envelope.js       pure Web-Crypto key hierarchy (AES-GCM + ECDH P-256)
  vault.js          passphrase → in-memory AES key (PBKDF2); seal/open bytes
  pack.js           native event ⇄ compact binary; header-scannable
  backends.js       byte sinks — memory (Node/fallback) + OPFS (browser)
  event-store.js    encrypted append-only store — one file per room/table
  persistent-log.js binds an EventStore to createLog (rehydrate + persist)

  # the spreadsheet-database engine
  types.js          value coercion + column-type inference
  rows.js           row model — fold entities / imported records → rows
  table.js          the grid engine — buildTable / listSets
  query.js          filter (26 typed ops) · sort · group · aggregate · FK
  formula.js        Airtable-dialect formulas + rollups

  database.js       createDatabase() — the front door tying the two together
  index.js          barrel
```

## The durable substrate

A room's whole append-only event log lives as one **encrypted byte file**; the
fold (`projectGraph`) is the query over it. The vault derives an AES-GCM key from
a passphrase (PBKDF2); every chunk written to a backend is `[iv][ciphertext]`.

**Not IndexedDB.** The browser durable path is **OPFS** (the Origin Private File
System) — an append-friendly real file — chosen deliberately over IndexedDB.
Under Node (and as the fallback when OPFS is missing or the vault is locked) a
room lives in an in-memory byte file; the **same encrypted code path** runs in
both.

- **Fold-equivalence.** A rehydrated log produces an identical `projectGraph`
  result — the round-trip is loss-free because both sides are the same
  append-only nine-operator log.
- **Encrypted at rest.** Only `[iv][ct]` chunks reach disk; the file carries the
  `EOEV` magic in the clear and nothing else. A tampered chunk fails AES-GCM auth
  and is dropped, never silently trusted.
- **Recoverable.** A second `EventStore` over the same bytes rebuilds its cursor
  from a header-only scan and replays the whole log.
- **Multi-user ready.** `envelope.js` carries the ECIES workspace-key grant flow,
  so a room key can be wrapped to a second reader's identity key — the primitive
  a shared corpus needs, ready when a transport (a Matrix room) is wired.

## The spreadsheet-database engine

Over the fold, the engine turns any room into tables you can query the way you'd
query a spreadsheet. It is all pure functions on a **row model**:

```
row  = { _id, _set, _label?, ...fields, _links? }     // an entity, or an imported record
conn = { source, target, type }                        // an edge / foreign-key link
```

`foldToRows(projectGraph(log))` projects every fold entity into a row (its props
become fields, its `type`/`set` prop chooses its table) and every edge into a
connection. Imported CSV/JSON tables land in the same shape via `importRows` /
`materializeRecords`, so both sources query identically.

| tool | what it does |
|---|---|
| `inferType(values)` | guess a column's type: number · date · select · boolean · text · json (money-tolerant; dates before numbers) |
| `buildTable(rows, {schemaFields})` | ordered columns (declared schema first, then data-only extras) + rows |
| `listSets(rows)` | every table the corpus holds, with row counts |
| `query(rows, opts)` | `{ filter, sort, group, search, offset, limit }` → `{ page, total, groups }` |
| `compileFilter(node)` | a typed predicate **tree** — `and`/`or`/`not` over 26 operators (`is`, `contains`, `gt`, `between`, `isAnyOf`, `hasAllOf`, `before`, `within`, `isChecked`, …) |
| `sortRows(rows, keys)` | multi-key, stable, empties always last (number → date → locale string) |
| `aggregate(rows, spec)` | `count` · `sum` · `avg` · `min` · `max`, optionally grouped |
| `relatedRecords(id, …)` | follow foreign keys, grouped by direction · relation · set |
| `evaluate(expr, {record})` | Airtable-dialect formulas — 90+ functions (math, text, logic, date, regex, array). Tokenized + parsed to an AST and walked, **never `eval()`'d** |
| `evaluateRollup(cfg, …)` | aggregate a field across a relation: `sum`/`count`/`avg`/`min`/`max`/`list`/`concat`/`and`/`or` |

Formulas reference fields as `{Bracketed Name}`, guard non-finite results, and
trap errors through `ISERROR`/`IFERROR` — a field named `{Value}` or `{Count}` is
safe because names resolve case-insensitively rather than by upcasing the source.

## The front door

`createDatabase()` ties both halves into one handle — what the surface adopts as
`window.EO.db`:

```js
import { createDatabase } from './src/store/index.js';

const db = createDatabase();
await db.unlock('reader@local', passphrase);        // one vault for every table

const { log } = await db.openLog('crm');            // durable, encrypted, rehydrating
log.append({ op: 'INS', id: 'c1', label: 'Alice' });
log.append({ op: 'DEF', id: 'c1', key: 'type', value: 'client' });
log.append({ op: 'DEF', id: 'c1', key: 'age', value: 30 });

await db.query('crm', { filter: { field: 'type', op: 'is', value: 'client' },
                        sort: [{ field: 'age', dir: 'desc' }] });   // { page, total, groups }
await db.buildTable('crm', { setName: 'client' });                  // { cols, rows }
await db.aggregate('crm', { agg: 'avg', field: 'age', groupBy: 'type' });
await db.related('crm', 'c1');                                      // foreign-key neighbours
db.formula('{age} * 2', { age: 30 });                              // → { ok: true, value: 60 }
```

Constructing it is inert (no key, no OPFS touch). `db.unlock()` arms the vault;
everything after reads/writes the encrypted store and folds it into tables.

## Verification

- `tests/store.test.js` — the persistence tier: pack round-trip, vault seal/open,
  ECIES key sharing, encrypted persistence, ciphertext-on-disk, cross-instance
  recovery, seq dedup, tamper rejection, locked-vault degradation, checkpoints,
  and the fold-equivalence proof.
- `tests/store-db.test.js` — the engine: type inference, row projection + import,
  the grid, every filter category + boolean tree, multi-key sort, aggregation,
  foreign keys, the formula language + rollups, and the whole engine over a
  durable, encrypted room.
- The **OPFS** browser path (which Node can't exercise) is verified in real
  Chromium: unlock → append → the on-disk file is `EOEV`-magic ciphertext with the
  plaintext absent → a fresh vault with the same passphrase rehydrates every event
  and folds identically.

## What's next

- back the reader session's own log(s) with `db.openLog` so readings survive
  reload through the encrypted store (rather than a cleartext snapshot);
- a Matrix-room transport so a room syncs across devices and to a second reader
  (the `envelope.js` grant flow is already in place);
- schema-declared computed columns: wire `formula`/`rollup` into `buildTable` so a
  declared `formula`/`rollup` field materializes its values per row.
