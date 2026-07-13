# `murmur` — implementation notes

The design is the spec (the faculty header in `src/murmur/`). This doc records **what
shipped**, **how to wire it**, and **what is deliberately deferred**, so a reader doesn't
have to infer the phasing from the code.

## What shipped

`src/murmur/` — the peripheral sense, nested the way the cube reads (one `index.js`
entrance per holon, each with its own `eo-contract.js`, all merged into
`src/core/contracts.js` and passing `tests/contracts.test.js`):

| holon      | module               | what it does                                                        |
| ---------- | -------------------- | ------------------------------------------------------------------- |
| `sense`    | `geometry.js`        | drift / concentration / novelty from fold geometry (dot products, no model) |
| `sense`    | `centroid.js`        | the running **session-topic centroid** — the drift anchor + deictic/shift rule (spec §5, §14) |
| `valence`  | `register.js`        | the four registers (unease / surprise / drift / recognition)        |
| `valence`  | `ring.js`            | the working-feel ring — decay, no-compounding, refractory, ttl (spec §8) |
| `steer`    | `collapse.js`        | the Born-rule collapse `P = |ψ|² = s·d`, stochastic commit (spec §4a) |
| `steer`    | `event.js`           | the `steer` event + the projection re-weighting `{towardAnchor, awayFromCluster, biasStrength}` |
| `narrate`  | `narrator.js`        | the tiny-LM mutter — **pluggable backend**, refractory-gated, ≤32 tokens, audit-only |
| `link`     | `index.js`           | the **connective nominator** (phase 4) — a `recognition` impression → a reafferent CANDIDATE connection between two reading loci; a read side-channel (`nominations()`), never a log write |
| `audit`    | `sink.js`            | impression → `rooms/audit` marginalia (refuses any non-impression record) |
| —          | `membrane.js`        | the §9 firewall guards, importable at every seam                    |
| —          | `config.js`          | `MURMUR` thresholds + `murmurConfig(over)` (pins `canEditPrompt:false`) |
| —          | `index.js`           | `createMurmur(...)` — wires the whole spine, **audit-only by default** |

This corresponds to **build-order phases 1–2 in full, plus the phase-3 narrator as a
pluggable interface** (spec §13). Phases 1–2 are what actually fix answers; the narrator
backend is left injectable because "share the answer weights vs. load a separate tiny
model" is a real WebGPU resource decision (spec §14), not something to hard-wire here.

## How to wire it (the one-line integration)

`murmur` subscribes; it does not sit in the critical path (spec §10). Build one at app
boot and feed it a normalized fold snapshot per fold stop. The snapshot decouples murmur
from engine internals — the wiring site extracts the fields, murmur imports nothing from
the turn pipeline:

```js
import { createMurmur } from '../murmur/index.js';
const murmur = createMurmur({ audit });            // audit-only; canAppendLog stays false

// at the fold stop (turn/stages.js `fold`, via the onStep(name, ctx) hook that carries the
// live ctx — the audit `step` clone truncates arrays/objects, so read ctx, not the clone):
await murmur.observe({
  ref: { turnId: turn.id, stepName: 'fold', t: ctx.foldTs },
  query: ctx.question,
  queryVec: await embedder.embed(resolvedQuery),   // MiniLM space (measuresMeaning:true)
  readingVecs: ctx.surf.stops.map(i => sentenceVecs[i]),
  concentration: {                                  // straight off ctx.referential + ctx.spans
    concentrated: ctx.referential?.concentrated,
    margin: ctx.referential?.margin, w: ctx.referential?.w,
    top: ctx.spans?.[0]?.score, focus: ctx.surf?.focus,
  },
  measuresMeaning: embedder.measuresMeaning,
}, { turn });

// then, non-invasively, the pipeline can consult:
murmur.shouldHoldStream();        // hold pending the deterministic checkers (spec §10)
murmur.confidenceModulation();    // a ≤1 multiplier the enactor already consumes
```

To enable the **steer** channel (the one log write), the projection must first grow a
steer consumer that calls `steerBias(events)`; only then flip
`config.membrane.canAppendLog` true and pass an `appendLog` callback. Until then a
collapse is recorded to `rooms/audit` and nothing touches the log.

## Live on the dc surface (the real-time murmur strip)

The wiring above is now live. `boot.js` builds one `createMurmur({ audit })` and exposes it as
`window.EO.murmur`; `rooms/reader/app.js` feeds it a fold snapshot at every turn's `fold` stop
(the turn's `onStep`), fire-and-forget, off the critical path — concentration comes straight off
`ctx.referential` (zero embedding cost), and when MiniLM is warm two cheap cache-backed embeddings
(the resolved query + the fold's assembled note) supply the drift/novelty geometry; cold, only the
concentration/unease signal fires. So it stays audit-only (`canAppendLog` never flips here).

For the surface, the barrel grew a read-only side-channel — `murmur.subscribe(fn)` (returns an
unsubscribe) and `murmur.state()` (the last snapshot). `index.html` renders a **real-time murmur
strip** on the main page under the tab bar: the drift · footing · novelty gauges and the live
registers (unease · surprise · drift · recognition) with their decayed intensity, plus the
narrator's mutter when one wakes. It is shown by default and hideable from **Settings** (persisted
as `eo_murmur`). The strip only ever reads impressions — it can never surface a citable fact.

## The firewall (why the log write is safe)

`src/murmur/membrane.js` is the mechanical statement of spec §9, importable at every seam:

- `assertLogAppendAllowed(rec, membrane)` — the only legal log write is a typed `steer`
  event, and only when `canAppendLog`. An `assertion`/`claim`/`impression` throws.
- `canCite` / `canGround` / `canPromote` — all return **false** for a `steer` or
  `impression`. Steer is never evidence.
- `assertNoMurmurInPrompt(fragment)` — throws if any murmur emission reaches the answer
  prompt. `canEditPrompt` is pinned false by construction.

These are exercised by `tests/murmur-membrane.test.js`.

## Tests

- `tests/murmur-replay.test.js` — the replay harness (spec §12): drift fires on the
  off-topic exchange **before** the generation timestamp; the phatic opener raises nothing
  (the control); the deictic follow-up is what makes the worst-movie catch possible; a user
  redirect re-anchors and does not read as drift.
- `tests/murmur-antirumination.test.js` — decay, no-compounding, ttl, refractory, and the
  Born-rule sampling/squaring behaviour.
- `tests/murmur-membrane.test.js` — the §9 invariants.
- `tests/murmur-steer.test.js` — the steer bias/decay and the narrator discipline.
- `tests/fixtures/murmur-sessions.js` — synthetic stand-ins (dolphin, worst-movie) with
  embedding vectors, since the real exported sessions aren't in the repo. Swap in real
  fold traces here to tune against them.

## Phase 4 — connective self-assertion (recognition → connection → graph → prose)

The peripheral sense stops throwing recognition away. The pipeline: murmur POINTS at a connection;
the DOCUMENT witnesses it; the idle gate promotes it. The membrane is not weakened — it is enforced
by the system's own §8 provenance type law (a reafferent nomination `canWitness === false`).

1. **Recognition linking** (`sense/centroid.js`, `sense/geometry.js`, `index.js`). The prior-reading
   ring now stores `{ vector, ref }`, so `senseSignal` emits `recognitionRef` — the LOCUS of the
   nearest prior reading, not just its similarity. `rooms/reader/app.js` `observeMurmur` enriches the
   fold `ref` with `{ docId, sentIdxs, cursor }`, so a recognition names the specific earlier passage.
2. **Candidate nomination** (`link/index.js`). A fresh `recognition` impression that carries a `link`
   becomes a reafferent CANDIDATE connection (`buildConnection`, `fromEnactor`, `grounded:false`),
   deduped per locus pair. It rides `createMurmur().nominations()` — a **read** side-channel like
   `state()` (spec §9.4). `canAppendLog`/`canEditPrompt` are untouched.
3. **Promotion gate** (`src/enactor/connect/promote.js`). The idle governor drains the queue and lets
   the document decide. A relation the reader already extracted at the `from` locus, whose subject
   RECURS at the `to` locus (a verbatim recurrence, or the kinship/social algebra via `checkClaim`),
   and which is not CONTRADICTED, is promoted. The witness set is filtered to EXAFFERENT edges exactly
   as `factCheck` does, so a murmur edge can never self-corroborate a later one.
4. **Graph write** (`rooms/reader/app.js` `connectTick`). **Tier 2** — a corroborated connection is a
   real `CON` edge carrying the earned citation + `nominatedBy:'murmur'`, reafferent-doored (grounded
   by citation, never a self-witness). **Tier 1** — every other echo is a firewalled `EVA`/`band:void`
   note (`buildReflection`), which `projectGraph` skips so it can never be mistaken for a fact. Both
   ride the deep-reader OVERLAY and surface in the existing Reflections drawer.
5. **Idle prosification** (`connectTick` → `prosifyConnections`). Grounded connections are voiced with
   the LOCAL model when it is warm (`talkThenVerify` behind the propositional veto), falling back to
   the model-free realizer (`speakTriples`) otherwise — the LLM is spent only when idle and loaded.

The whole pass runs only at rest (gated on `state.busy` + inactivity, beside deep reading) and never
on the critical path. New tests: `tests/murmur-link.test.js`, `tests/murmur-promote.test.js`,
`tests/murmur-connect-loop.test.js`, plus the phase-4 invariants in `tests/murmur-membrane.test.js`.

## Deferred (spec §14 open questions)

- The narrator **model backend** (in-browser resource decision).
- The **anchor decay/update tuning** (spec §14, the riskiest surface): the shift-vs-drift
  rule ships conservative (`topicShiftFloor`); earn any loosening in replay.
- **Cross-document** connections: the promotion gate compares entity ids within ONE doc, so a
  cross-doc echo falls to a Tier-1 note. Cross-source identity (the `same_as?` machinery) would let
  it promote — the seam is there; the wiring is not.
- **Per-entity reading identity**: the fold reading is one whole-note embedding, so the gate locates
  the bridging edge by the loci's `sentIdxs`; per-span/entity vectors would sharpen it.
- **Remote prosification + the redaction membrane** (`docs/llm-prosification-security.md`): local-only
  ships; the `redact`/`assertNoNameLeak` path stays ready for a hosted talker.
