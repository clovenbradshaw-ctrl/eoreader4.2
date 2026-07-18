# FoldTrace: the cube-labeled projection of a WaveformModel

> Formalizes `docs/coil-surfaces.md` §1 (build order item 1) against this repo's
> real modules. Sibling to `docs/deviation-waveform.md` and
> `docs/omnimodal-waveform.md` — read those first; FoldTrace is a projection
> *over* their `WaveformModel`, not a competing computation.
>
> Implementation: `src/core/fold-trace.js` (`buildFoldTrace`). Tests:
> `tests/fold-trace.test.js`.

## 0. What this is, in one paragraph

`docs/coil-surfaces.md` describes FoldTrace as an extension of "the existing
fold pipeline" that logs accepted and rejected holons. In eoreader4.2 there is
no single `core/fold.js` playing that role — the closest real analogue,
per-reading-position and modality-blind, is `WaveformModel`
(`src/weave/waveform/build.js`): one row of structural signal (`strain`,
`confidence`, `frames`, `turns`, `echoes`, `cast`) per reading unit, already
built, already tested, already used nowhere near a Q&A turn's ephemeral state.
FoldTrace's whole job is to **label** that already-computed signal with the
cube's own vocabulary — `core/operators.js`'s nine operators, `core/cube.js`'s
27 diagonal cells, `core/contract.js`'s `HELIX` order and `DESERT_CELL` — so
every later surface (coherence-panel, coil, terrain-river, …) reads one
consistent address per unit instead of re-deriving one from raw strain
numbers. `buildFoldTrace(waveform, opts)` computes no new numeric signal: it
reads `strain`/`confidence`/`frames`/`turns`/`echoes`/`cast` and returns one
row per unit, unchanged in count and order.

## 1. Field-by-field derivation

| field | source | notes |
|---|---|---|
| `reading_id` | `opts.readingId` | Reading carries no id of its own (`src/perceiver/contract.js`'s shape has no `id` field) — the caller supplies one. |
| `pos_start` / `pos_end` | the unit's own ordinal, `i` / `i+1` | **Ordinal-granular, not byte-granular.** No perceiver in this tree exposes char/byte offsets today — `buildTextReading`'s own `resolve(span) => ({sentIdx, preview})` (`src/perceiver/text/waveform.js`) never returns one. `pos` is one reading-unit wide until a perceiver adds real offsets; when it does, the fix is there, not a private conversion inside FoldTrace or the scrubber. This is the seam `docs/coil-surfaces.md` §6's binviz `CON` will need to cross — not yet built either (see that doc's repo note). |
| `order_index` | array position, `i` | Strictly monotonic by construction — one row per unit, built in ordinal order. |
| `cooked_height` | `waveform.strain[i]` | The frame-relative local strain `src/weave/waveform/frames.js` already computes (pass 2 of its two-pass fixpoint) — never recomputed here. Rounded to 3 decimals for a stable display/test surface. |
| `rec_fired` | `waveform.turns.some(t => t.ordinal === i)` | A WaveformModel "turn" *is* a confirmed frame restructure — the direct analogue of the spec's REC. |
| `ops_fired` | see §2 | A subset of `HELIX` (`src/core/contract.js`), filtered and ordered by that fixed constant — never hand-ordered. |
| `site` / `stance` / `address` | `cellOf(op, grain)` (`src/core/cube.js`) off the fold's primary op/grain — see §2 | `address` is the literal `${op}(${terrain}, ${stance})` notation, matching `core/faces.js`'s `notate` convention. |
| `accepted` / `reject_reason` | see §3 | Three real mechanisms, not three fabricated labels. |
| `discard_refs` | `i` when rejected, else `null` | A pointer *into* the ordinal space, the same key `WaveformModel.discard.get(ordinal)` (its own DiscardLedger) already accepts — FoldTrace doesn't carry a copy of that ledger, just the key to look one up. Present only "if any" (spec's own wording) — set only on a reject, where there is something to explain. |

## 2. Choosing the primary op, and `ops_fired`

Every unit is checked against four structural facts WaveformModel already
computed, in priority order — the first that matches fixes the *primary* op
and its grain (`core/cube.js`'s Ground/Figure/Pattern), which together fix
one coherent cell via `cellOf`:

1. **Confirmed turn** (`turns[].ordinal === i`) → `REC` at `Pattern` grain →
   `Paradigm/Composing`. This matches existing convention elsewhere in the
   tree: `src/turn/pipeline.js`'s own comment names a measured basis-defeat
   "an append-only `REC(Paradigm,…)`" — FoldTrace reuses that exact cell,
   not a new one.
2. **A referent is minted** — some `onCast` cast lane's *first* presence run
   starts here with role `FOREGROUND` (`src/weave/waveform/cast.js`'s
   `presence` RLE) → `INS` at `Figure` grain → `Entity/Making`. Only
   `onCast` referents count: a raw sighting doesn't mint, a gate-cleared one
   does (`src/perceiver/individuation.js`'s `REFERENT_TYPES`).
3. **A frame boundary starts here**, excluding the document's own start
   (`frames[].start === i && i > 0`) → `SEG` at `Figure` grain →
   `Link/Dissecting`.
4. **Echo membership** (`echoes[].span_a === i || span_b === i`) → `CON` at
   `Figure` grain → `Link/Binding` — CON's own native Figure-grain cell
   (`core/operators.js`: "CON — the central operator... what makes a
   citation hold a claim to a source"; an echo *is* that same bond between
   two spans).
5. **A referent is present** (any `onCast` lane's FOREGROUND/PRESENT
   presence covers `i`) **and** `confidence[i] >= 0.5` → `EVA` at `Figure`
   grain → `Lens/Binding`. EVA reads a unit's strain *in relation to* a
   referent under evaluation; bare continuous deviation with nothing to
   evaluate is not itself a verdict.
6. **Otherwise** → the desert fallback: `SYN` at `Ground` grain →
   `Field/Cultivating` — `core/contract.js`'s own named `DESERT_CELL`, "SYN
   at Ground... empty across 41 languages." A unit with no referent and no
   structural event *is* the ambient medium cube.js's own commentary names
   the Ground column as ("the ambient medium the reader rides"), not a
   meaningless gap — its honest address is the desert cell, rejected.

`ops_fired` is the *set* of everything that matched (not just the winning
primary), filtered through `HELIX` so it always reads in the fixed helix
order regardless of which check happened to fire first in code: a unit can
legitimately carry `INS,REC` when a referent is minted at the exact ordinal
a turn confirms — see §3.

## 3. `accepted` / `reject_reason` — three real mechanisms

The spec's enum (`grain-mixed | desert-cell | dependency`) is implemented as
three genuinely distinct code paths, not three arbitrary strings:

- **`desert-cell`** — the primary op resolved to the fallback (§2.6). Every
  desert-cell fold is rejected; `SYN·Cultivating` never ships as an accepted
  address anywhere in this tree (`tests/contracts.test.js` enforces the same
  rule at the *module*-contract level — FoldTrace's own contract, note the
  distinction: a module may never *declare* it fires SYN at Cultivating;
  individual runtime folds classifying *into* it as a rejected outcome is
  exactly what that rule is for).
- **`grain-mixed`** — when `ops_fired` contains both `REC` (Interpretation
  domain) and `INS` (Existence domain) for the same unit, `coherence({op:
  'REC', terrain: 'Entity'})` (`core/cube.js`'s own guard) is asked to
  adjudicate. It always says no — REC's domain is Interpretation, `Entity`'s
  is Existence — and that `domain-mismatch` verdict, not a hand-written
  check, is what rejects the fold. This is a genuine ontological conflict a
  document can produce naturally (a referent's first mention landing exactly
  on a confirmed structural turn) and can also be forced deterministically
  in a fixture (`tests/fold-trace.test.js`'s own grain-mixed test), matching
  `docs/coil-surfaces.md` §1's checkpoint wording exactly ("force a
  grain-mixed case if the corpus doesn't produce one naturally").
- **`dependency`** — the *later* half of an echo pair (`primaryOp === 'CON'`
  and this unit is not the pair's earlier ordinal) inherits rejection from
  its own antecedent: if `trace[earlier].accepted === false`, the later fold
  cannot honestly claim to bond to something that itself never individuated,
  so it rejects too. Computed sequentially — `buildFoldTrace` walks ordinals
  in increasing order specifically so a later row can read an earlier row's
  already-decided `accepted`.

Everything else is accepted, `reject_reason: null` (the spec's own `~`
shorthand for "n/a").

## 4. What downstream surfaces read

`src/rooms/scrubber/poincare.js`'s scrubber resolves a `pos` to the nearest
`FoldTrace` row via `nearestFoldIndex` (binary search over `pos_start`/
`pos_end`, which for FoldTrace today is just `pos_start === order_index`
since positions are ordinal-granular — see §1's note). `pos` and
`fold_index` are the only two fields every subscribed surface reads;
`docs/coil-surfaces.md` §2's "one cursor, not one per surface" mechanism.

`src/surfaces/operator-clock/` is the first, simplest consumer (build order
item 3): a 9-spoke dial, one spoke per `HELIX` operator, lit by the nearest
fold's `ops_fired`, with `rec_fired` rendered as a break (a notch) rather
than an ordinary lit spoke — `docs/coil-surfaces.md` §3's REC-break
cross-cutting rule, applied here first so later surfaces (coil, discard-
ledger) have one working example to match.

`waveform`-as-coil-shadow (build order item 3's other half) needed no code
change: `src/surfaces/waveform/render.strict.js` already draws exactly
`x = pos_start, y = cooked_height` off a `WaveformModel` (its own `strain`
array) — the relabeling is that this same trace is now understood as the
coil seen edge-on, a second projection of the same FoldTrace rows the
operator-clock reads, not an independent chart. No file under
`src/surfaces/waveform/` changed for this.

## 5. Non-goals carried over from docs/coil-surfaces.md §4

Everything §4 says still applies to this implementation specifically:
`buildFoldTrace` computes no signal a surface could otherwise fake — every
numeric field traces to `WaveformModel`, every label traces to
`core/operators.js` / `core/cube.js` / `core/contract.js`'s already-named
vocabulary. If a future surface (coherence-panel, coil, …) needs a field
FoldTrace doesn't carry, the fix is to extend `buildFoldTrace`, with its own
new checkpoint — never to derive it privately inside that surface.
