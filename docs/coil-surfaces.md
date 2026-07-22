# Spec: The Coil Surfaces

### Rendering the fold as three shadows of one cube, wired into eoreader4.2

> Companion to `docs/deviation-waveform.md`, `docs/omnimodal-waveform.md`, and the
> individuation gate (`src/perceiver/individuation.js`). Canon for terms:
> `src/core/operators.js`, `src/core/faces.js`, `src/core/cube.js`.
>
> **Implementation status (2026-07-18):** build order items 1–3 are landed —
> `src/core/fold-trace.js` (FoldTrace), `src/rooms/scrubber/poincare.js` (the
> scrubber), and `src/surfaces/operator-clock/` (the coil seen end-on), plus the
> waveform-as-coil-shadow relabeling below. See `docs/fold-trace-spec.md` for the
> exact field-by-field derivation against this repo's real modules — this file is
> the spec as given; that one is its formalization. Items 4–10 (coherence-panel,
> coil, recurrence-ribbon, terrain-river, cast-score, coverage-treemap,
> discard-ledger, and the app wiring) are not yet built; §5's build order and
> checkpoints still govern picking them up.

---

## 0. One-paragraph thesis, for whoever picks this up cold

Reading a document is one climb of the operator helix (NUL→SIG→INS→SEG→
CON→SYN→DEF→EVA→REC) per accepted fold, run over and over across the
source. That sequence of folds is a **coil** — a helix wound along reading
position, one turn per fold, tight where fold-density is high and slack
where it's low. Every surface in this spec is a *projection* of that one
coil: a waveform is the coil seen edge-on, an operator clock is the coil
seen end-on, a coherence panel is the cube's own three faces laid flat.
None of these are independent visualizations invented per-surface. They
are views over one shared data primitive (§1), and the discipline of this
spec is: **compute the coil once, project it many ways, never let a
surface synthesize a signal that isn't really there.**

The binviz surface already underway is *not* one of these projections —
it sits upstream, on Void terrain, before any fold has happened. §6
covers exactly where it plugs in and how it shares a clock with
everything downstream of it without depending on it.

---

## 1. The data primitive: FoldTrace

Everything downstream reads one new room. Nothing computes its own copy
of fold data.

`core/fold.js` already logs accepted and rejected holons (per Michael:
"rejected holons are logged but never enter the tape or condition the
next step"). This spec extends that existing ledger — it does not
replace it or run a parallel computation. The extension is: every log
entry gains the fields a projection needs to render without re-deriving
them.

```eot
foldtrace : room
foldtrace.name = "Fold Trace"
foldtrace.contract.ops = INS, DEF, CON
foldtrace.contract.terrains = Entity, Kind
foldtrace.contract.stances = Making, Tracing, Dissecting
foldtrace.schema : kind
foldtrace.schema.reading_id = "text"
foldtrace.schema.pos_start = "int"          # byte/char offset into source
foldtrace.schema.pos_end = "int"
foldtrace.schema.ops_fired = "text"          # ordered subset of the helix this fold actually climbed
foldtrace.schema.site = "text"               # terrain landed: one of 9
foldtrace.schema.stance = "text"             # one of 9
foldtrace.schema.address = "text"            # canonical operator(Site,Stance) notation
foldtrace.schema.accepted = "bool"
foldtrace.schema.reject_reason = "text"      # grain-mixed | desert-cell | dependency | ~ if accepted
foldtrace.schema.cooked_height = "float"     # existing surprise/strain metric from s.field
foldtrace.schema.rec_fired = "bool"          # did this fold force a frame restructure
foldtrace.schema.discard_refs = "text"       # pointers into the typed-discard ledger, if any
foldtrace.schema.order_index = "int"         # monotonic fold sequence number
!EVA foldtrace
```

Every field above except `address`, `ops_fired`, `rec_fired`, and
`reject_reason` should already exist somewhere in the pipeline (`s.field`
surprise, coref/echo, position). The four new fields are the actual
delta: the coder needs to make the fold step *say what cell of the cube
it landed on and whether it forced REC*, not just whether it passed.

**Checkpoint for this assembly:** replay three known documents through
the existing fold pipeline with the extended logging on. Verify trace
length equals fold count on all three, verify at least one rejected
entry exists with a populated `reject_reason` (force a grain-mixed case
if the corpus doesn't produce one naturally), verify `order_index` is
strictly monotonic. Nothing downstream starts until this holds alone.

---

## 2. The shared clock: Poincaré scrubber

One cursor. Not one per surface. Every surface in §3 subscribes to it;
none owns it.

```eot
scrubber : room
scrubber.name = "Poincaré Scrubber"
scrubber.contract.ops = INS, DEF
scrubber.contract.terrains = Entity
scrubber.contract.stances = Making, Tending
scrubber.schema : kind
scrubber.schema.reading_id = "text"
scrubber.schema.pos = "int"          # current reading-position, shared unit with FoldTrace.pos_start
scrubber.schema.fold_index = "int"   # nearest FoldTrace.order_index at pos
!EVA scrubber

foldtrace -> scrubber
!EVA foldtrace, scrubber
```

The scrubber is pure UI state with a `pos`, and it is a **cutting plane**
by construction: at any `pos`, every subscribed surface reads FoldTrace
filtered to the fold(s) nearest that position and renders its own
projection of that instant. Dragging `pos` sweeps all surfaces in
lock-step because they all key off the same room. This is the whole
mechanism — there is no per-surface animation timeline to keep in sync
by hand.

`pos` must share units with binviz's byte offset (§6) even though binviz
doesn't read FoldTrace. That's the one seam between the two halves of
the system, and it should be a `CON` between `scrubber` and whatever room
binviz already exposes its raster from — not a shared implementation.

---

## 3. Surface catalog additions

Format matches the existing Appendix A table. Every row is a **view**,
not a computation — the renderer reads FoldTrace (+ scrubber) and does
no signal processing of its own beyond what's listed as its projection
rule.

| surface | contract.terrains | contract.ops | contract.stances | projection rule | renderer |
|---|---|---|---|---|---|
| `coil` | Entity, Kind, Network | NUL | Tracing, Composing | 3D parametric helix over FoldTrace, one turn per fold; pitch = `1 / local_fold_density`, radius modulated by `cooked_height` | WebGL/Three.js, orbit camera + scrubber-linked cutting-plane marker |
| `waveform` | Kind | NUL | Tracing, Dissecting | coil seen edge-on: `x = pos_start`, `y = cooked_height`. *Already exists per `deviation-waveform-spec.md` — this entry just reclassifies it as the coil's own side-shadow rather than a standalone chart* | existing waveform renderer, unchanged |
| `operator-clock` | Kind | NUL | Tracing | coil seen end-on: 9-spoke radial dial, spoke lit = `ops_fired` of the fold nearest scrubber `pos` | radial SVG dial |
| `coherence-panel` | Kind, Network | NUL | Tracing, Dissecting | unfold the cube's Act/Site/Stance faces as three 3×3 grids; light the cell(s) matching `address` of the fold at `pos`; on `accepted=false` with `reject_reason=grain-mixed`, render `impossible-object` (below) instead of three independently-lit grids | three synced SVG 3×3 grids |
| `impossible-object` | — (invoked by coherence-panel, not independently surfaced) | NUL | Tracing | a Penrose-triangle-style figure whose three faces are drawn from the three faces that *didn't* agree — the geometric impossibility is the error message | SVG, procedurally generated per the specific mismatched triple |
| `recurrence-ribbon` | Kind, Network | NUL | Tracing | self-similarity matrix over reading position, keyed off the existing echo/novelty signal (not recomputed) — a diagonal band under the waveform, dense where the reading rhymes with itself | canvas heatmap, one row/col per fold `order_index` |
| `terrain-river` | Kind | NUL | Tracing, Tending | streamgraph of terrain mix (the 9 Site values) over reading position, band widths = local terrain frequency in a sliding window of FoldTrace entries | d3 streamgraph |
| `cast-score` | Entity, Link | NUL | Tracing, Binding | orchestral-score layout: one lane per referent from the individuation gate, vertical position = presence role (FOREGROUND / PRESENT / LATENT per the individuation gate), horizontal = reading position, edges = `projectGraph` coupling | canvas/SVG piano-roll |
| `coverage-treemap` | Entity, Kind | NUL | Dissecting, Tracing | 1000-ish-square treemap of source spans, color = deepest `ops_fired` step reached per span (how far up the helix, not whether meaning happened) — explicitly a coverage/audit view, never framed as showing process | d3 treemap |
| `discard-ledger` | Entity, Network | NUL | Dissecting, Tracing | Harris-matrix DAG: nodes are FoldTrace entries and their `discard_refs`, edges are "deposited after." `rec_fired=true` nodes render as a fold/fault break in the stratigraphy, not a flat layer boundary — this is the one place the sediment metaphor is allowed, and only with the fault drawn | DAG layout (dagre or similar), stratified by `order_index` |

Two behaviors are cross-cutting rather than owned by one surface:

- **INS-lock micro-interaction.** Any fold whose `ops_fired` includes INS
  gets a ~200ms lock/snap animation wherever that referent is rendered
  (typically `cast-score`, sometimes `coil`). This is a `stances=Making`
  event, not a new surface — implement as a shared animation hook that
  any surface can opt into, keyed off `ops_fired` containing `INS`.
- **REC break.** Any fold with `rec_fired=true` should visually interrupt
  its host surface rather than blend in — a notch in the coil, a fault in
  the ledger, a discontinuity in the terrain-river. This is the one
  event type every surface must render as a break, never as smooth
  accretion. If a surface can't show a break for REC, it shouldn't
  render REC events at all rather than silently flattening them.

---

## 4. Non-goals (read before building any of the above)

- **No surface computes a new signal to make itself prettier.** If a
  projection rule in §3 needs a field FoldTrace doesn't have, the fix is
  to extend FoldTrace (§1, its own checkpoint), not to derive the field
  privately inside a surface. Two surfaces disagreeing about the same
  fold because they computed it differently is the failure mode this
  spec exists to prevent.
- **`coverage-treemap` never claims to show process.** It shows coverage.
  Label it that way in the UI. It answers "how much, how deep," never
  "how."
- **`discard-ledger` is not allowed to render `rec_fired` as ordinary
  stacking.** If the fault-break rendering isn't done, don't ship the
  layer view — a sediment picture that hides REC is worse than no
  picture, per the essay this spec follows from.
- **`impossible-object` renders only real mismatches.** It is generated
  from the actual three faces that failed to agree, not a generic error
  glyph. If the specific mismatch can't be reconstructed from the reject
  event, fall back to the typed error text from Appendix B, not a fake
  impossible figure.

---

## 5. Build order (watchmaker assemblies, helix order)

Each numbered item is one assembly with its own checkpoint. Do not start
item *n+1* until item *n*'s checkpoint passes standalone.

1. **FoldTrace extension** (§1). Checkpoint as specified there. **Landed** —
   `src/core/fold-trace.js`, `tests/fold-trace.test.js`.
2. **Scrubber room + CON to FoldTrace** (§2). Checkpoint: dragging `pos`
   in a throwaway harness returns the correct nearest `order_index` for
   at least ten hand-checked positions across one document. **Landed** —
   `src/rooms/scrubber/poincare.js`, `tests/poincare-scrubber.test.js`.
3. **`operator-clock`** and **`waveform`-as-coil-shadow** (relabel only,
   no new code for waveform itself). These are the simplest consumers —
   single-fold lookups, no cross-fold aggregation — and validate that
   the scrubber wiring actually drives a surface correctly before
   anything harder depends on it. **Landed** — `src/surfaces/operator-clock/`,
   `tests/operator-clock.test.js`; the waveform relabel is documentation-only
   (docs/fold-trace-spec.md), no code changed in `src/surfaces/waveform/`.
4. **`coherence-panel`** + **`impossible-object`**. Needs `core/faces.js`
   / `core/cube.js` cell data joined against `address`. Checkpoint: feed
   it three accepted folds and one hand-constructed grain-mixed reject;
   verify the three grids light coherently on the accepted ones and the
   impossible-object path fires on the rejected one. *Not yet built.*
5. **`coil`**. Needs the full trace plus the pitch calculation
   (`1 / local_fold_density`, windowed). This is the first surface that
   aggregates across many FoldTrace rows rather than reading one, so it's
   sequenced after the single-fold surfaces prove the join works.
   *Not yet built.*
6. **`recurrence-ribbon`**. Depends only on the existing echo/novelty
   signal — no new upstream dependency, can build any time after step 2,
   but sequenced here because it's easiest to eyeball-validate against
   the coil once the coil exists (motifs should show up as both coil
   pitch changes and ribbon diagonals — cross-check the two).
   *Not yet built.*
7. **`terrain-river`**. Windowed aggregation over `site`, same shape of
   work as the coil's density calc — reuse the windowing code from step
   5 rather than reimplementing it. *Not yet built.*
8. **`cast-score`**. Depends on the individuation gate being wired
   (mass × coupling × presence role) — it is (`src/perceiver/individuation.js`,
   `src/weave/waveform/cast.js`), so this assembly is unblocked whenever it's
   picked up. *Not yet built.*
9. **`coverage-treemap`** and **`discard-ledger`**. Lowest priority,
   least novel engineering (both are standard layouts over data already
   sitting in FoldTrace by this point), and the ledger specifically
   benefits from being built last since the fault-break convention (§4)
   is easiest to get right once you've watched REC events render
   correctly in five other surfaces first. *Not yet built.*
10. **The reader app**: `SYN` of everything above under the shared
    scrubber, `home` = `coil` (or `waveform`, whichever reads better once
    both exist side by side — decide empirically, not in advance).
    Closure checkpoint per Layer 3: the app's contract is the computed
    envelope of the nine surfaces' contracts above, nothing invented.
    *Not yet built — see `coil-demo.html` for a throwaway harness that
    exercises steps 1–3 without touching the live reader app.*

---

## 6. Where binviz plugs in

Binviz is not a projection of the coil and should not be built as if it
were one. It renders the Hilbert-curve/entropy raster over the **raw
byte stream**, before SIG has flared any attention and before INS has
minted anything — that's Void terrain, the ambient substrate prior to
differentiation, which is a different room from FoldTrace entirely.

```eot
binviz : room
binviz.name = "Binary Entropy Raster"
binviz.contract.ops = NUL
binviz.contract.terrains = Void
binviz.contract.stances = Tending, Tracing
binviz.schema : kind
binviz.schema.reading_id = "text"
binviz.schema.byte_offset = "int"
binviz.schema.entropy = "float"
binviz.schema.hilbert_xy = "text"
!EVA binviz

binviz -> scrubber
!EVA binviz, scrubber
```

The only integration point is the `CON` to `scrubber` in §2, on shared
`pos`/`byte_offset` units. That single link buys the whole payoff: drag
the scrubber and watch the Void-terrain static (binviz) and the
post-fold structure (coil, waveform, coherence-panel, all of it)
sweep together — the file and the shape, on one plane, at one instant.
Nothing about binviz's own build needs to change for this; it just needs
to expose `byte_offset` on whatever axis it's already scanning, and to
accept an external `pos` to highlight its own cursor when the shared
scrubber moves. Land that contract now, even before binviz is finished,
so the agent building it isn't retrofitting the hook later.

**Do not** let binviz read FoldTrace, and do not let any §3 surface read
raw bytes. The Void/Entity boundary in this spec is not incidental — it's
the same boundary the individuation gate and the omnimodal perceiver
contract already draw between "structure the perceiver hasn't found yet"
and "structure the fold pipeline has validated." Crossing it in either
direction is exactly the kind of grain-mixing §3's `coherence-panel`
exists to catch in FoldTrace data; don't reintroduce it at the binviz
seam by hand.

**Repo note (2026-07-18):** the byte-structure surface landed in this tree
as `src/surfaces/binvis/` (docs/binvis-surface.md) — spelled "binvis" (Aldo
Cortesi's original name), not "binviz" — after this document's build order
1–3 branched but before this note was written. It renders the same
Hilbert-curve/entropy raster over raw bytes this section describes, with
its own `buildScene`/`renderToContainer` split, but does **not** yet expose
a `byte_offset` axis or accept an external `pos` — the `CON` to `scrubber`
described above is still unbuilt on the binvis side. `scrubber.pos` is
built to the contract above regardless (§2, `src/rooms/scrubber/
poincare.js`), so wiring the `CON` is a matter of adding `byte_offset` +
an external-cursor hook to `src/surfaces/binvis/`, not a mechanism that
needs to change on the scrubber's side.

---

## 7. File layout (proposed)

```
docs/
  fold-trace-spec.md              # formal spec for §1, sibling to deviation-waveform-spec.md
core/
  fold.js                          # existing — extend logging per §1, don't fork it
src/reader/geometry/
  coil.js                          # §3 coil: helix geometry + density/pitch calc
  poincare.js                      # §2 scrubber controller — shared cursor, subscriber registry
  windowing.js                     # shared windowed-aggregation helper (coil density, terrain-river) — build once at step 5, reuse at step 7
src/reader/surfaces/
  operator-clock.js
  coherence-panel.js
  impossible-object.js
  recurrence-ribbon.js
  terrain-river.js
  cast-score.js
  coverage-treemap.js
  discard-ledger.js
src/reader/binviz/                 # owned by the other agent — only touch to add the scrubber CON hook
  (existing files)
```

**Repo note (2026-07-18):** this layout is idealized — eoreader4.2's real
convention is holon-per-directory with an `eo-contract.js` per holon
(`src/core/fold-trace.js`, `src/rooms/scrubber/poincare.js`,
`src/surfaces/operator-clock/`), not a `src/reader/geometry|surfaces/`
tree. See `docs/fold-trace-spec.md` for the actual paths items 1–3
landed at, and follow that same per-holon convention for items 4–10.

---

## 8. Definition of done

The spec is satisfied when: dragging the scrubber from position 0 to the
end of a real document shows (a) binviz static resolving into structure
on the left, (b) the coil visibly changing pitch in step with that
resolution, (c) at least one REC event in the document rendering as a
break — not a blend — in both the coil and the discard-ledger
simultaneously, and (d) forcing one grain-mixed reject (synthetic if
needed) produces an actual impossible-object render, not a red toast.
If all four hold on one real document, ship it and find a second
document to break it on.
