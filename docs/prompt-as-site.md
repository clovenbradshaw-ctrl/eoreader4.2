# The prompt as a Site

> `model-as-contracted-part.md` contracts what the model may EMIT. Nothing contracted what
> it was HANDED. In cube terms an uncontracted prompt is an undeclared Site: it is the
> terrain the model's events land on. That is not a gloss. It means the Site face fixes
> the catalog, the population gradient fixes the budget, the desert cell names a live bug,
> and grain-coherence between material and instructed stance explains the patch treadmill.
> The prompt is also a projection, not a struct — and before this document's build landed,
> it was neither.

Status key: ● landed on this branch · ◐ instrumented, measurement open · ○ future work.

## Tier 0: what is established

- The population gradient. Figure > Pattern > Ground, at every Mode, in every Domain,
  across 41 languages and 32,000+ classified verbs (v1), 19,764 clauses / 9,221 consensus
  (v2). See docs/eo-wiki.md "EO Lexical Analysis v2" and docs/eo-for-coders.md. The Ground
  row is sparse everywhere: 6.2% of consensus clauses.
- The desert cell. SYN at Ground, `SYN(Field, Cultivating)`, empty or nearly empty in
  every language tested (0.6% of consensus clauses; the sparsest generate cell). No module
  contract may declare it (core/contract.js `DESERT_CELL`).
- Grain coherence. Act, Site, and Stance share the Object axis or the event is grain-mixed.
- The Stance face carries the strongest geometric signal (z = +12.70) of the three faces.

## Tier 1: the diagnosis EO makes that nothing else does

### 1. The catalog is the nine terrains, not a list ●

Eleven ad-hoc block names was not a catalog. Nine Site terrains is, and it closes by
derivation, so completeness is checkable:

| terrain | grain | what rides there |
|---|---|---|
| Void | Ground | what the reading did NOT find (the absence clause) |
| Entity | Figure | the verbatim spans, the orientation |
| Kind | Pattern | the shape exemplar, the reply's form (budget) |
| Field | Ground | the settled common ground, the conversation's ambient state |
| Link | Figure | one named bond (the cursor's typed edge) |
| Network | Pattern | the fold's graph, the arc |
| Atmosphere | Ground | the register, the voice, the steer |
| Lens | Figure | the live question as framed, the walk's inferences |
| Paradigm | Pattern | what counts as an answer in this turn |

**Landed:** `src/model/bands.js` — every band the three builders can emit, tagged with its
terrain, cross-checked against the kernel's Site face (core/cube.js) by
tests/prompt-golden.test.js. `unknown-band` became `unknown-terrain`, which cannot happen:
a band that fits no terrain is a `closure-violation` at the checkpoint, surfaced, never
invented inline.

### 2. Ground-row inflation is the accretion pathology ● measured

The prediction: a small model's distribution is Figure-dominant, so Ground-row
instructions are the ones it has the fewest words for and the first ones it drops. Every
audit failure is then patched with another Ground-row line, which is the row that does not
hold. The file's own header already reported the symptom: "an over-steered frame made a
small model answer more stiffly than it naturally would."

**Measured (probe P1, tools/prompt-census):** corpus gradient Figure 78.5% > Pattern
15.3% > Ground 6.2%; the prompt's fixed instructional prose **Ground 66.4% > Pattern
28.0% > Figure 5.7%** — the Ground row over-represented **×10.7 by prose mass** (×7.7 by
band count). The population gradient is not merely exceeded; it is inverted. The falsifier
(Ground row not over-represented) did not fire. Whether that mass DOES anything is P2's
question, not P1's.

### 3. The desert cell is occupied, and it names a live bug ● flagged

The steer asks the model to generate a whole reply governed by an ambient condition (what
the user is after). Generate mode, Ground grain: Cultivating — the rarest generate stance
in every language measured, and its Structure-domain cell is the desert.

The steer's own history records the failure this predicts: "a read that said the user
wanted an overview of dolphins still answered with whatever spans surfaced, because the
read only rode along as passive steering." The fix applied then was to move it later and
let it lead the answer clause. EO predicts that fix will keep under-delivering however it
is worded, because there is nothing in language for the instruction to land on. And EO's
remedy is the one this file already discovered once, as a one-off correction: "Structure
stays in the grounder: in selection, in order."

You cannot instruct Cultivating. You cultivate by arranging conditions. **The steer should
become a re-rank of which spans get in and in what order, and then be deleted from the
prose.** ○ (the re-rank is future work; deletion is gated on it)

**Landed meanwhile:** the steer band declares its own cell (`SYN·Cultivating`) in the
catalog, and the `!EVA prompt` checkpoint flags it `desert-cell` on every steered turn —
the worklist stays visible instead of accreting silently.

### 4. Grain-mixing between material and instructed stance is the patch treadmill ● flagged

`SUMMARY_GUARD` exists because "a small model handed a summarize turn tends to reword a
single excerpt as the whole answer." It does that because it is handed a pile of
Entity-grain spans and then instructed toward a Pattern-grain stance (Composing: "draw the
lines together"). The material wins. The material always wins, because that is where the
mass is.

The remedy is not a better guard. It is: do not instruct Composing over Entity material.
Hand a summary turn Kind-grain and Network-grain objects (the fold's structure levels, the
graph) and the stance falls out of the composition. Then delete the guard. ◐ (probe P3
tests it; the guard stays until P3 rules)

**A prompt's stance is an OUTPUT of its band grain. It cannot also be declared in prose
alongside it.** Every instruction that asks for a stance at a different grain than the
material will need a patch, forever.

**Landed meanwhile:** the guard declares `SYN·Composing`; the checkpoint flags
`grain-mixed` exactly when Composing is instructed with no Pattern-grain material band in
the assembly — and goes quiet when the fold rides along (the remedy, encoded as the
check).

### 5. The prompt is a projection, not a struct ●

`buildGroundedMessages` took a bag of pre-computed ctx fields. That was state. The
architecture says there is no state; there is an append-only log and projections computed
at read time.

The law PRs #77, #83, and #91 each rediscovered separately: a second decode or a second
surf is firing **INS** where **NUL** was called for. INS once per grain per turn; NUL
(hold, encounter, read) as many times as you like.

**Landed:** the three builders are projections over the band catalog (`projectBands`),
byte-identical to the hand-rolled assembly they replaced — pinned fixture-by-fixture by
tests/prompt-golden.test.js, which is the migration test the projection makes free
(byte-identity IS projection equality). A projection cannot fire an act, so a second
assembly is NUL by construction; tests/one-act.test.js pins the decode side of the law.
Provenance-as-projection (`evidenceSeqs` on the ledger's generate record) remains ○ —
docs/model-as-contracted-part.md move 5.

## Tier 2: probes, each with its falsifier

Measurement before building. All four are read-only and all four can return negative.

**P1. Terrain census.** ● run. `node tools/prompt-census/census.mjs`. Result above: ×10.7,
gradient inverted. *Falsifier (the Ground row is not over-represented) did not fire.*

**P2. Ablate the Ground row.** ◐ instrumented. `EO_PROBE=p2` drops the Atmosphere and
Field user-bands through the projection's probe hook and runs the battery
(tools/evalkit/config.probe.yaml).
*Prediction: little degradation, because the model was already dropping them.
Falsifier: quality drops. Then the Ground row is doing real work and §2's mechanism is wrong.*

**P3. Grain-match the summary path.** ◐ instrumented. `EO_PROBE=p3`: Pattern-grain digest
in, `SUMMARY_GUARD` out, on summary turns.
*Falsifier: it still rewords a single excerpt. Then §4 is wrong and the guard earns its keep.*

**P4. The head-to-head.** ◐ instrumented — run it first. `EO_PROBE=p4` moves the absence
band (the boundary) BEFORE the material and the answer clause. EO says a boundary must
precede the bond and the synthesis, so false-reach should drop. The codebase's current
belief (stated in the band comments) says a small model attends hardest at the end, so it
should rise. *This pits EO's helix ordering directly against the folklore, on metrics the
grounding suite already carries (quotes_are_real, refuses, not_contains). It is cheap, and
it can return negative.*

The probes flip REAL bands — the same projection production runs — via
`buildGroundedMessages({ ..., probe })`, default null, byte-identical, pinned by the
golden test. A CPU battery run is hours; `EO_DRY=1` shows what each probe changes in the
assembled prompt in milliseconds.

## Tier 3: the build

1. **The one-act law, named and tested.** ● tests/one-act.test.js: one decode per clean
   turn; assembly and surf are reads, free to repeat; the revise cap is the sanctioned
   repair bound (the same shape as the coder pipeline's cap-2). Pins the #77/#83/#91
   class.
2. **`speak(model, messages, opts)`, the one decode organ.** ● src/model/speak.js. The
   swallow-to-fallback liveness pattern the call sites each hand-rolled
   ({maxTokens, temperature, minPredict, signal} + try/catch → fallback) is one organ now;
   the hand-rolled sites migrated where semantics map 1:1. Streaming paths keep
   `streamPhrase` — that is their organ. Ordinary engineering, as the caveats below say.
3. **`model/bands.js`, indexed by terrain.** ● byte-identical on day one (50 golden
   fixtures). The `if (flag && precondition)` chain became the catalog's `when` clauses —
   data, not control flow.
4. **`!EVA prompt` between `reason` and `llm`.** ● src/model/prompt-checkpoint.js, wired
   in the turn pipeline's prompt stage as `ctx.promptVerdict`. Typed verdicts:
   `grain-mixed`, `desert-cell`, `contract-violation`, `closure-violation`, and
   `ground-inflation` (the Ground-row share against the corpus gradient via `deriveNull`).
   Same verdict shape as src/coder/checkpoint.js — one discipline on both doors. Advisory
   by design: structural errors fail `ok`; the measured verdicts are the visible worklist.
   (It does not yet ride `src/coder/`'s repair loop — there is nothing to repair on the
   input side until the probes rule on what to delete. ○)
5. **Delete, do not patch.** ○ gated on the probes, deliberately. The steer becomes a
   re-rank (P2 + the desert-cell flag are its case); the summary guard becomes a grain
   change (P3); every Ground-row instruction that survives P2 has to justify itself
   against the gradient. Nothing was deleted ahead of measurement — the probes can return
   negative, and the falsifiers are the point.

## What EO does not buy here

Repair-with-cap-2 is Hora, not EO. The `speak()` organ is ordinary engineering. The band
terrain assignments in §1 are defensible but individually disputable — P1's census makes
them explicit and reviewable (each band's assignment is a line in the catalog with its
rationale), which is what makes them testable at all. The desert-cell reading of the steer
(§3) is the strongest claim in this document and the least established; it rests on the
cell's emptiness (Tier 0) plus an operator assignment (`SYN·Cultivating`, now declared on
the band itself) that a reasonable reader could dispute. P2–P4 are instrumented, not run:
this branch ships the instruments and the P1 measurement, and holds the deletions until
the battery rules.

The claim is not that EO decorates the prompt. It is that the prompt was the one part of
the engine with no Site, no Stance, no contract, and no checkpoint, in a tree where every
other part has all four and is checked on every run. As of this branch it has all four:
the Site catalog (bands.js), declared stance cells on its instruction bands, a declared
width (deriveWidth / the catalogs themselves), and a checkpoint on every grounded turn.
