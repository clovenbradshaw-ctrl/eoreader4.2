# Redundant systems — the 2026-07 audit, the merge, and the map

A sweep for redundant systems — two modules independently solving the same
problem, where one should defer to the other — followed by the manifest this
sweep earns: a system map of how `src/`'s holons — and the 64 per-holon EO
manifests underneath them — fit together, so a merge decision can
be checked against how the tree actually fits together rather than against
name collisions alone. The method: enumerate every duplicate basename and
every duplicate-sounding subsystem (856 files, 135k lines), read enough of
each pair to tell a shared *word* from shared *logic*, and for the genuine
ones, merge toward whichever side is more complete rather than inventing a
third shape. A file is not redundant for sharing a name — `project.js`
appears nine times because "fold the log into a view" is one recurring EO
idiom applied to nine different domains; `eo-contract.js` appears sixty-four
times because it is a per-holon manifest, the same way `package.json` repeats
its keys in every package. Redundancy is two files computing the same thing
twice, not two files sharing a word.

## The system map — how the holons fit together

The tree is layered along the HELIX (`core/contract.js`): existence before
structure before significance. Each layer only imports the ones below it
(enforced mechanically — `tests/boundaries.test.js` walks the import graph;
`src/core/seams.js` is the empty, healed registry of the few crossings that
cannot ride a holon's entrance).

```
 core/          the genome. Depends on nothing; everything depends on it.
                the nine operators, the append-only log, the EO contract
                factory, the cube (Act·Site·Stance), σ (supersession) — and,
                as of this pass, the shared log-fold memoizer and the shared
                stopword list every higher holon used to keep its own copy of.
   │
 frame/         ONE interior structure (open/bind/complete), instantiated
   │            per modality — the discourse spine conversation threads on.
   │
 perceiver/     the PERCEIVER faculty — Existence · constitute. Reads the
   │            unit stream into structure: parse, coref, referents, the
   │            per-modality waveform readers (text/audio/tabular/binary).
   │
 surfer/        the SURFER faculty — Structure · navigate/find. Moves through
   │            the constituted field: retrieval, folding, prediction, the
   │            persistent Horizon (ρ across turns).
   │
 enactor/       the ENACTOR faculty — Significance · commit, modality-blind.
   │            Judges and commits: grounding, fact-check, the gate, the
   │            answerer, the commitment ledger (durable corrections).
   │
 turn/          the named-stage pipeline — composes all three faculties into
   │            one runTurn() fold (route → … → settle, PIPELINE order now
   │            read from stage-faces.js's own table, not copied twice).
   │
 ┌─┴──────────────────────────────────────────────────────────────────────┐
 │  infrastructure, used by turn/ and everything above it:                │
 │  model/    swappable LLM backends + embedder + prompt assembly         │
 │  store/    the durable substrate — vault, event-store, the DB engine   │
 │  organs/   in/out modality adapters — ingest (acquire) → in (structure)│
 └──────────────────────────────────────────────────────────────────────┘
   │
 ┌─┴──────────────────────────────────────────────────────────────────────┐
 │  applications, built on the faculties + infrastructure:                │
 │  rooms/    the UI — one holon per surface (reader, chat, data, audit…) │
 │  weave/    long-form generation — arc (the primitive) → essay, longgen │
 │  murmur/   the impressionistic background sense — cheap pre-verbal hunches│
 │  wiki/     terrain-typed article rendering                            │
 │  metabolism/ the evolutionary loop — organs proposed, judged, selected │
 │  coder/    plain text → EOT → code, the watchmaker loop for code       │
 │  attest/   custody · witness · anchor · watch — source provenance      │
 │  surfaces/ standalone visualization surfaces (waveform, binvis, clock) │
 └──────────────────────────────────────────────────────────────────────┘
```

Every module in every holon declares an EO contract (`eo-contract.js`, a
per-holon manifest built on the one shared `contract()` factory in
`core/contract.js`); `core/contracts.js` merges all 64 into the one registry
`tests/contracts.test.js` checks for 100% coverage. That registry is *why*
this audit could tell a real duplicate from a shared word with some
confidence: two contracts with the same `note` and the same Act/Site/Stance
cell are a much stronger redundancy signal than two files with the same
basename, though in practice reading the code still settled every call below.

## What was found, and fixed

| cluster | verdict | fix |
|---|---|---|
| `enactor/ledger.js` vs `rooms/audit/log.js` vs `rooms/audit/eot-ledger.js` | **false positive, on inspection** — see below | none; documented |
| `src/store/backends.js`, `rooms/chat/opfs-store.js`, `organs/ingest/opfs-store.js`, `rooms/reader/audio-store.js` — four independent "resolve an OPFS directory, fall back to a Map" implementations | **genuine** | extracted `resolveOpfsDir()` into `store/backends.js`, exported from `store/index.js`; the other three now call it and keep only their own key-shape-specific API |
| `core/project.js`, `frame/project.js`, `perceiver/credence/project.js`, `weave/essay/project.js`, `rooms/research/project.js` — five hand-rolled "memoize a fold over an append-only log" caches | **genuine** | extracted `memoizeOnLog`/`memoizeOnLogAt`/`canonicalJSON` into new `core/memo-log.js`; all five now call it |
| `rooms/doc/ground.js` vs `enactor/ground/spans.js` — two "content word" stopword lists that had quietly drifted apart (24 words only one stopped, 6 only the other, despite spans.js's own comment saying they should be "the same shape") | **genuine** | extracted the union into new `core/stopwords.js`; both now share it (each keeps its own tokenizer regex — doc/ground.js counts bare numbers as content on purpose, spans.js does not, and that difference is real, not drift) |
| `turn/web.js`'s STOP list | **genuine — exact subset** | `web.js`'s list was byte-for-byte a prefix of `turn/research.js`'s larger one; `research.js` now exports `RESEARCH_STOPWORDS` and `web.js` imports it instead of keeping the smaller copy |
| `turn/pipeline.js`'s `PIPELINE` array vs `turn/stage-faces.js`'s `STAGE_SPEC` key order — the 19-stage list hand-copied in two places, kept in sync only by a comment | **genuine** | `pipeline.js` now imports `PIPELINE_STAGES` from `stage-faces.js` instead of keeping its own array; the two cannot drift apart again |
| `src/rooms/reader/eo/embed.js` — a second MiniLM-embedder implementation with its own cache, unreferenced anywhere (only named as a string in its own manifest entry), and its own comment admitting it duplicates `model/embed-cache.js` | **dead code** | deleted, with its manifest entry |
| `src/surfer/motion.js` — a second "which video track is real" implementation, exported from the surfer barrel but with zero callers anywhere (`organs/in/motion.js` is the one actually wired to `rooms/reader/video-frames.js` and covered by tests) | **dead code** | deleted, with its manifest entry and barrel export |
| `src/store/envelope.js` — 228 lines of Web-Crypto (AES-GCM + ECDH) multi-user envelope encryption, re-exported from `store/index.js` but with no production caller; `docs/shared-vault.md` shows the multi-user "shared vault" feature this looked like it was for deliberately reuses `rooms/chat`'s Megolm stack instead ("adds no second login and no second crypto stack") — this was flagged as a dead reserve in the prior `docs/eo-compliance-2026-07.md` audit and never resolved | **dead code, confirmed twice over** | deleted, with its manifest entry, its barrel export, and its now-orphaned test block in `tests/store.test.js` |
| `attest/eot.js`'s `lit()` vs `organs/ingest/eot-emit.js`'s `valueLiteral()` — near-identical value-literal quoting, and they've drifted (one leaves bare identifiers unquoted, the other always JSON-stringifies) | **genuine, left alone** | `attest/eot.js`'s own comment states the constraint: "kept local so this leaf imports nothing — the attest surface is simple by design." Importing the canonical helper would fix the drift but break a stated isolation boundary for a cosmetic gain; left as documented debt for a maintainer to decide, not silently overridden |
| `rooms/data/query.js`'s `STOPWORDS` vs the general content-word list | **false positive, on inspection** — see below | none |

### Reclassified: the ledger/audit triad is layering, not duplication

`enactor/ledger.js`'s own header says "the audit ring and the EOT ledger both
record assertion and self-correction" — the strongest single signal in this
whole audit that pointed at real duplication. Tracing the actual runtime
wiring (`rooms/reader/boot.js`, `rooms/reader/eot-feed.js`,
`turn/pipeline.js:361`) reverses that reading:

- `rooms/audit/log.js` is the primary recorder — a generic per-turn trail
  (prompt, steps, sources, `revisions`, …) written directly by the turn
  pipeline. It derives nothing; `revisions` is whatever the caller passes.
- `rooms/audit/eot-ledger.js` is never written to independently — it is fed
  exclusively through `eot-feed.js`, a dedicated one-way adapter that reads
  the audit log's own stream (and the app log, and murmur) and translates it
  into EOT-surface verb calls. One translator, wired once at boot.
- `enactor/ledger.js` folds the *same* raw turn outputs (`verdicts`,
  `revisions`, `selfLine`) into a *differently shaped, durable* record —
  typed corrections (`via: revision | contradicted | self-mismatch | expired
  | absence`) feeding `statusOf`/`standing`/`supersede`, a cost-of-being-wrong
  accounting the two rings were never built to answer, and specifically built
  because both rings are lossy (`capacity`-bounded) and neither survives past
  their ring size.

Three sinks of one event, not one piece of logic implemented three times —
exactly the "fold one log into several views" idiom the rest of the tree
uses on purpose (see the system map). No merge performed.

### Reclassified: `rooms/data/query.js`'s stopword list is not the same list

`rooms/data/query.js` filters table-Q&A term matches against a ~130-word
list that reads, at a glance, like a fourth copy of the general content-word
stopword set. A direct diff says otherwise: it is missing 20 words the
general list stops (`will`, `would`, `can`, `could`, `may`, `might`, `must`,
`shall`, `should`, `now`, `once`, `it's`, `nor`, `yet`, `am`, `him`, `me`,
`do`, `does`, `did`) and adds ~44 of its own (business/numeric jargon:
`total`, `sum`, `rank`, `inc`, `llc`, `fintech`, …). It is a genuinely
different, independently-curated closed class for a different job
(quantitative term matching over account/ARR data), not copy-drift of the
grounding stopword list. Unifying it would have changed which words a
financial-data query treats as salient, for no real dedup gain — left alone.

## What was investigated and found clean

Six clusters were checked in depth and confirmed to be shared **vocabulary**,
not shared **logic** — each pair/group reads the code and finds a distinct
algorithm or a distinct data shape behind the shared word:

- **`organs/in/` vs `organs/ingest/`** — a pipeline stage relationship
  (structuring adapters consuming acquisition clients), not a fork.
- **`organs/out/{limner,publish,speech}`** — three unrelated output
  modalities (live SVG, durable archival artifacts, the talker's SEG
  segmenter), no shared render logic.
- **`weave/{arc,essay,longgen}`** — `arc` is the canonical one-section
  generation primitive; `essay` and `longgen` both import and build on it
  (`generateSection`, `ceilingFor`, …) rather than reimplementing it. Not
  siblings needing consolidation — already-correct layered reuse.
- **The nine `project.js` files as a group** — one recurring idiom ("fold
  the append-only log into a view") applied to nine unrelated domains (the
  parse graph, the task tree, the essay, the credence book, the research
  report, the article render, …); the fold-caching *boilerplate* was the
  real duplication (fixed above), the fold *logic* in each was never shared.
- **`core/witness.js` vs `attest/witness.js`, `surfer/horizon.js` vs
  `metabolism/horizon.js`, `perceiver/referent.js` family, `perceiver/text|tabular|audio|binary`
  vs `perceiver/classify`** — each pair layered or genuinely unrelated
  despite the shared name; `horizon.js`'s two `createHorizon`s (a density
  matrix vs a game-theory endgame hazard) are the one pure naming collision
  in the tree worth a rename if either is touched again, but not a logic
  duplicate.
- **The model/LLM backend layer** (`anthropic.js`, `openai-local.js`,
  `webllm.js`, `wllama.js`, `echo.js`) — a clean, consistent design already:
  every backend implements one shape over `model/interface.js`, and the
  parts that are genuinely shared (decode gating, streaming, context
  guarding) already are.

## Verification

Every change above was checked against the full suite (`npm test` — 2697
passing, 1 pre-existing skip, unchanged; one test was deliberately removed
alongside the dead code it tested) after each step, plus the tree's own
mechanical conformance checks specifically: `tests/contracts.test.js` (100% manifest coverage, no
orphan contracts, no desert cell), `tests/boundaries.test.js` (no undeclared
holon-boundary crossing — the new `store/index.js` imports from `organs/`,
`rooms/chat/`, and `rooms/reader/` all ride entrances, so none needed a seam
declaration), and `tests/size-ratchet.test.js` (no pinned over-250-line file
grew; several shrank). All green.

## Open, left for a maintainer

- **`store/envelope.js`'s deletion removes B3 (multi-user key sharing) test
  coverage entirely**, not just the dead implementation — if that feature is
  still wanted, it should be rebuilt on `rooms/chat`'s Megolm stack per
  `docs/shared-vault.md`, not resurrected in its old ECIES shape.
- **`murmur`'s steer/attention half**, flagged unconsumed in the prior
  compliance pass, was not re-investigated here — out of this audit's scope
  (background-sense wiring, not a redundant *system*).
- **`perceiver/shared/cluster.js` vs `weave/arc/cluster.js`** — two
  independent single-pass online-clusterer implementations (one
  radius-generic, one cosine-threshold-fixed). Not byte-duplicate and
  serving different pipelines, so not forced together here, but a shared
  "online clusterer" primitive would remove the parallel implementation if
  either is revisited.
- **The god-module long tail** (`rooms/reader/app.js`'s remaining pinned
  sections, `perceiver`'s 964-line parser, seventeen surfer files over the
  250-line floor) is a size problem, not a redundancy problem, and is
  already the size ratchet's territory (`tests/size-ratchet.test.js`) —
  untouched here.
