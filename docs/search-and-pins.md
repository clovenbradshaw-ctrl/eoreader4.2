# Search and pins — the record as the destination

> Search reads the record; pinning writes into it. Together they retire the
> conversational posture: you do not ask an agent a question, you search a
> knowledge base and pin what matters.

This spec defines the data model for the reader's next posture: **Ask and Chat
retire**; one first-class **Search** over the record (entities, claims,
passages, sources — extended outward to the web and the libraries) takes their
place, and **Pins** become the durable write path. Graph, Findings, Sources,
and Memo stay. The turn machinery (`runTurn`, `ask`, `askQuestion`) stays —
it loses its tab, not its job: it becomes the engine behind ingest-time claim
extraction and the rare novel question the record has not pre-answered.

The governing discovery, from mapping the engine: **nearly every primitive
this needs already exists, disconnected.** The durable anchor is built
(`rooms/archive/pin.js`, used only by the research room). The citation schema
with `char_span` and a fail-closed hash check is defined
(`organs/ingest/websource.js` `toWebCitation`/`verifyCitation`) and emitted
nowhere. A pure pin store is complete and unwired
(`rooms/workspace/lens.js`). The persisted-directive-that-reruns-live pattern
ships today as the topline steer (`weave/topline/feedback.js`). This document
is mostly a wiring diagram.

## The anchor — the unit of trust

Everything pinnable bottoms out in a passage, and a passage today has no
durable address: the ¶N shown in the UI is a sentence index re-derived on
every parse, chat cites carry a *composite-axis* index that shifts with the
turn's scope, and every jump resolves by verbatim-text prefix matching
(`scrollToText`). The anchor fixes this without inventing anything:

```
anchor = {
  sn, docId,                 // registry identity (S-registry row)
  sourceSha,                 // src.sha — whole-source fixity; survives sn
                             // renumbering; the space-sync content address
  unit,                      // SOURCE-LOCAL sentence index (never composite)
  charSpan: [start, end],    // offsets into src.text
  spanHash,                  // webContentHash(canon(spanText)) — local drift
  text,                      // the verbatim quote, embedded (≤280 chars) —
                             // pin.js's discipline: embedded, never merely linked
}
```

Every field composes from existing exports: `src.sha` and `webContentHash`
(websource.js), `locateSpan(text, quote) → {start, end, text}`
(archive/pin.js:118), the `canon` fold from `scrollToText`
(reader-render.js:411). This is `toWebCitation`'s dormant
`{source_id, segment_id, char_span, content_hash}` schema, generalized past
web sources.

**Resolution is a ladder, and drift is honest.** Resolve in order:
`sourceSha` matches → slice `charSpan`, verify `spanHash` → exact hit.
Source changed → re-locate by `locateSpan(text)` → verify → re-anchored hit,
marked. Still nothing → `scrollToText` canon-fold fallback → approximate hit,
marked. Nothing → the pin reports **moved** — the same "the ground moved"
discipline the topline uses for a claim whose footing was pulled. A pin never
silently rebinds and never silently vanishes; `verifyCitation`'s fail-closed
posture is the model.

Three tiny engine additions make anchors mintable everywhere (in dependency
order):

1. `segmentSentences` (or its `parseText` wrapper) also returns
   `unitSpans: [[start,end], …]` — sentences are verbatim slices of the raw
   text today, so this is an indexOf walk inside the existing split. Every
   existing `sentIdx` gains a charSpan for free.
2. `readerHtml` stamps `id="eo-p-"+i` on body `<p>` (reader-render.js:275-288
   — the loop index already exists). Jumps become `getElementById` with
   `scrollToText` as the fallback rather than the only path.
3. `citeOriginsOf` (turn/pipeline.js:44) keeps the `localIdx` that
   `doc.origin(i)` already computes instead of discarding it — chat cites
   become source-local and stop shifting with turn scope.

## The pin

```
pin = {
  id: 'pin' + n,                    // pn counter, beside sn/tn/ln/mn/wn
  kind: 'entity'|'claim'|'passage'|'source'|'query',
  refKey,                           // refKey(kind, stableId) — workspace/index.js:19
  topicId, workspaceId, at,         // scoping, the jobs pattern
  label, note,                      // the reader's own words, optional
  anchor,                           // passage/claim pins — the tuple above
  entity: { entityKey, docId, entId, sourceSha, wiki },   // entity pins
  claim:  { text, claimKey, status, anchors: [anchor] },  // claim pins
  query:  { q, ops, last: { at, counts } },               // pinned searches
}
```

Identity per kind is chosen for durability, not convenience:

- **entity** — `entityKey(label)` (the normalized label the summaries store
  already keys by) *plus* `{docId, entId, sourceSha}` so a re-parse can
  re-resolve when the opaque union-find id drifts. The confirmed wiki
  referent is **copied in** at pin time — `wikiCache` is session-only, and a
  pin must not lose its settled referent to a reload.
- **claim** — never `C{n}` (positional, regenerated per `findings()` call).
  `claimKey` = `webContentHash` of the normalized claim text + its lead
  anchor's `docId:unit`. The claim's text and anchors ride the pin.
- **passage / source** — the anchor; `sn`+`sourceSha` respectively.
- **query** — the query string and parsed operators; see live pins below.

**Storage:** `state.pins = []`, top-level beside `jobs` — one line in
`serialize()` (app.js:561), one in `restore()`, CRUD that calls
`persist(); emit('pins')`. Top-level is the right home: sources are already
global with topics referencing sns, jobs already scope by
`{topicId, workspaceId}`, and a pin must survive topic moves and deletion.
Pins are small plain JSON — safe on the 400ms structured-clone path; the
constraint that exiled audio bytes to OPFS does not bite. For shared
workspaces, space-sync gains one pass: mirror a pin manifest through
`spaces.save` (or ride `sendSignal('pins', …)`); sha-based anchors resolve on
the receiving side because the mirrored source text hashes identically.

`lens.js` stays what it is — per-lens *membership* (`pinned: [refKey]`) for
filing pins into views, if and when that surface is wanted. The payload store
above is the primary record; lens is an index over it, not a second truth.

## Search — one field over the whole record

One query, results grouped by kind, everything computed from producers the
app already exports. No engine change is required for record search; the
work is one memoized index module and a dispatcher replacing the single-kind
`_cmdkResults`:

| group | producer | opens via |
|---|---|---|
| entities | `entities({merge:true})`, `entityProfile` | `openEntity(docId, entId)` |
| claims | the findings projection (below) | `openViewer(sn, quote)` → Findings |
| passages | `doc.sentences` + `unitSpans` per source | `openViewer(sn, focus)` |
| sources | `topicSources()` — today's ⌘K, subsumed | `openViewer(sn)` |
| web / libraries | footer row → `searchTopic(q)` / `searchLibrary(libId, q)` | preview → `recordHit` |

The index is invalidated off the existing emit kinds
(`'sources'/'messages'/'topics'`), exactly the surface's `_entCache` pattern.
Operators parse off the query head, mirroring `NAMED_KIND`'s
`[prefix, matcher]` table (webfetch.js:225), and are surfaced as clickable
filter chips — nobody memorizes syntax:

- `entity:` → `entityKey` match; `source:` → sn / reg / domain
- `contradicts:` → Contested claims + `g.voids` + polarity `'−'` edges —
  signals that all exist and are simply un-indexed today
- `unique:` → merged rows with `sourceCount === 1`; single-witness claims
- `type:` → person / place / work, **derived, not stored**: composed from
  `looksProperNoun` + `nameCore`/ROLE_TOKENS, `typeOf(via)` on incident
  relations (kinship/role ⇒ person, located ⇒ place, authored ⇒ work), and
  the confirmed wiki `description`. The same composition drives the entity
  panel's high-confidence tier; themes/abstract terms are what fails it.

**Ranking:** grounded-in-record beats external, always; corroborated beats
single-witness; verbatim beats inferred. **Honesty:** an empty record group
says so and offers the outward extension — never a fabricated bridge. A
genuinely novel question falls through to `askQuestion()` — the one-shot
grounded turn, whose answer lands as claims in Findings, not as a thread.

## Live pins — a pinned query re-runs

A `kind:'query'` pin re-executes against the index. For record-scoped
queries this is free: recompute on the emits that invalidate the index — a
pure function over app state, the same way `applySteer` re-applies the
persisted steer on every topline regeneration. `pin.query.last.counts` keyed
by stable ids (`claimKey`, `entityKey`, `sourceSha`) yields the
"3 new conflicts since you pinned this" delta. Web/library-scoped queries
ride the `jobs` registry — a pinned outward search is structurally a job
that re-arms instead of settling, and the `kind:'search'` topic
(`t.query`, explicitly tagged for later re-run at app.js:1271) is its
existing substrate.

The steer's `unmet` discipline carries over: a pinned thing the record no
longer carries reports **no longer carried** — it never silently drops.

## The findings projection — claims stop being chat by-products

Today `findings()` (app.js:4297) walks the active topic's `msg.bound` — so
claims exist only as by-products of turns, capped at the last 24, keyed
positionally. Reading is full of claims; the projection should read all four
mints:

1. **the reading itself** — `readIngest` propositions, minted per source at
   record time, passage-warranted;
2. **summaries** — topline/digest closed-inventory objects with
   `witnessed/stated/contested` standing and citations, composed at ingest
   and on every click;
3. **murmur** — Tier-2 promoted connections (`promoteConnection`,
   enactor/connect/promote.js): document-witnessed, citation-carrying,
   `nominatedBy:'murmur'`, reafferent-doored so they can never witness a
   later claim. Tier-1 echoes stay marginalia — band void asserts nothing
   and renders as noticing, never as a claim card;
4. **turns** — `msg.bound`, as now.

Every claim in the projection carries its mint (`origin`) and its provenance
band, and the system-wide invariant follows from `core/provenance.js` for
free: document-witnessed, promoted-nominated, and void-band noticings are
visually distinct everywhere.

Re-deriving the projection also retires three latent defects the mapping
caught in the current derivation: the citation join is a substring test
(`String(b.citation).includes(String(c.idx))` — `'s12'` matches cite `1`);
the Contested join compares against a claim string `finishMessage`
reconstructs from entity *ids* (the verdict's `sentence` is dropped at
app.js:3088-3090, so the join essentially never fires); and `C{n}`/`P{n}`
ids are positional. Exact `'s'+idx` matching, keeping the verdict sentence,
and `claimKey` fix all three.

## Retiring Ask and Chat

Staged, and soft: unresolved template vals only warn (support.js walkText),
so removal can land in slices. The blast radius, enumerated: `tabDefs`
(index.html:6290); the `isAsk`/`isChat` blocks (630-846, 849-1043); the two
fallback val objects that hard-code `isChat:true` (6068, 6081); the default
tab and `'ask'` fallbacks (2658, 2836, 4580, 6130, 6949, 6973);
`hasChatExport` (7029, 585-604); and the stray copy that points users at the
dead tabs (1345, 1453, 1066). **Keep**: `sendChat`/`chatInput` (the search
field's question fallback rides them), the messages view-model
(6303-6395 — Search's answer cards reuse it), and every engine entry point.

## Build order

1. **Anchors** — `unitSpans`, `eo-p-N` ids, `localIdx` in cites,
   `anchorFor`/`resolveAnchor`. Smallest slice; everything else stands on it.
2. **Findings projection** — the four mints, provenance banding, the three
   derivation fixes, `claimKey`. Findings self-fills *before* the manual
   crank goes.
3. **Record search** — the index module, grouped ⌘K, operator chips.
4. **Pins** — the store, pin affordances on every result/card, live queries.
5. **Fold the web/library surfaces** into the search footer.
6. **Retire Ask and Chat**, Pins takes their slot.

## Where it lives

| piece | file |
|---|---|
| anchor kit (contentHash, locateSpan, #:~:text) | `src/rooms/archive/pin.js` |
| citation schema + fail-closed verify | `src/organs/ingest/websource.js` |
| pin membership store (unwired) | `src/rooms/workspace/lens.js`, `workspace/index.js` |
| persisted-directive precedent (steer) | `src/weave/topline/feedback.js` |
| durable-collection precedent (jobs) | `src/rooms/reader/app.js` beginJob/settleJob |
| murmur → claim promotion gate | `src/enactor/connect/promote.js` |
| ingest-time propositions | `src/organs/ingest/read.js` |
| claims/passages derivation to re-point | `src/rooms/reader/app.js` findings() |
| the ⌘K palette to grow | `index.html` (cmdk block + handlers) |
| snapshot seam for `state.pins` | `src/rooms/reader/app.js` serialize()/restore() |
