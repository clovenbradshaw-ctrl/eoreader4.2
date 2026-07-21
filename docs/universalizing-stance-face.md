# Universalizing the Stance Face

## One instrument, one name, every Mode

**Status:** Landed. `src/core/stance-face.js` (`readStanceFace`, `clearedComponents`,
`cellForGrain`, `makeStanceCapability`) is the shared instrument; `src/surfer/stance.js`
and `src/weave/generate-row/stance.js` are thin adapters over it;
`src/surfer/dag/causal-warrant.js` and `src/core/enacted/calibration-fold.js` are the
two renamed modules, each with a one-release re-export shim at its old path;
`tests/stance-registry.test.js` is the vocabulary self-check. `npm test` — 3067 tests,
3066 passing, 1 pre-existing environment skip (Python not installed on this host),
zero net new skips.

**Decision:** there is exactly one Stance face in this system — `core/cube.js`'s
Mode × Object cross, the answer to "how it is done." Exactly one module reads it off
evidence. Every caller that needs to know how something should resolve — a reading
cursor, a claim-ledger row, or any future caller — asks that one module. No other
module may define, export, or informally reuse the word "stance" for anything else.

> ## As built — implementation status
>
> Four points where the shipped code diverges from this document's illustrative
> pseudocode, each because the pseudocode did not survive contact with the real,
> already-shipped test suite it had to stay green against:
>
> 1. **`legalCellFor` was kept, not deleted.** §13's build order says "`legalCellFor`
>    and its `domainHint` parameter are deleted, not deprecated — nothing outside this
>    file called it directly." That premise is false for this tree:
>    `tests/row-stance-templates.test.js` imports and calls `legalCellFor` directly, in
>    three tests, to lock in §3.1's desert-cell re-homing behavior. Deleting it would
>    break the "byte-identical... zero fixture edits" requirement (§12 test 19) the
>    same build order names. `legalCellFor(shape, domainHint)` is kept as a public
>    export and re-implemented as a genuine thin adapter over `cellForGrain` (a
>    `{shape → (mode, domain, grain)}` table, one entry per shape, instead of the old
>    `{shape → (op, site, stance)}` table that named an operator by hand). `domainHint`
>    is accepted for backward compatibility but was always inert here — see point 3.
> 2. **`stanceLegality`'s `cell` field stays the `{op, site, stance}` object shape, not
>    the `StanceReading.cell` string key.** §2.2's `StanceReading.cell` is documented as
>    `cellOf(...).key` (a string like `'REC_Making_Lens'`). But
>    `tests/row-stance-templates.test.js` asserts `r.cell.op`, `r.cell.site`,
>    `r.cell.stance` directly — it needs the object shape `legalCellFor` always
>    returned. `stanceLegality` calls `readStanceFace` for the grain decision, then
>    resolves the returned grain's cell through `legalCellFor`, preserving the object
>    shape every existing caller and test depends on.
> 3. **The `readout` shape (n=1) resolves through `readStanceFace` at (Relate,
>    Structure), not (Generate, Interpretation).** §10.2's illustrative code calls
>    `readStanceFace({ spectrum: [1], mode: 'Generate', domain: 'Interpretation', ... })`
>    for the n=1 case — but that resolves to `REC(Lens, Making)`, not the
>    `CON(Link, Binding)` a single sourced proposition has always cited with (a bond,
>    not a minted lens — two different faces of the cube, both Figure-grain). The
>    shipped code calls `readStanceFace` with `mode: 'Relate', domain: 'Structure'`
>    instead, which resolves to exactly `CON(Link, Binding)` — the same cell as
>    before, now produced through the shared instrument's real operator lookup instead
>    of a hardcoded table, which is the actual point of routing it through
>    `readStanceFace` at all (per this doc's own §10.2 commentary). This is also why
>    `legalCellFor`'s per-shape table names `(mode, domain)` pairs rather than
>    hardcoding `REC` for every non-readout shape — `readout` is the one shape whose
>    (mode, domain) is not (Generate, Interpretation).
> 4. **Both adapters import `readStanceFace` (and friends) from `core/index.js`, not
>    `core/stance-face.js` directly.** §10.1/§10.2's illustrative code imports the deep
>    path. `tests/boundaries.test.js` enforces this repository's holon-boundary law (a
>    module outside a holon may only import that holon's `index.js`, or a declared seam
>    in `core/seams.js`) — `surfer/stance.js` and `weave/generate-row/stance.js` are
>    each in a different holon than `core`, so a direct `core/stance-face.js` import is
>    an undeclared crossing. `core/stance-face.js`'s exports are re-exported from
>    `core/index.js` (the entrance every other core primitive already rides), and both
>    adapters import from there — no seam needed, and no behavior change.
>
> None of these are reasons the design in the body of this document is wrong; each is
> a place its illustrative code sample was approximate and the actual constraint
> (an existing, must-stay-green test, or this repository's own boundary law) settled
> the literal implementation.

## 0. Why this spec exists now

`docs/generate-row-stance-templates.md` built `weave/generate-row/stance.js` as, in its
own words, "a direct sibling of `surfer/stance.js`'s `updateStance`." Reading both
instruments side by side to write that sibling surfaced four things that a single
one-off spec had no mandate to fix:

1. **The word "stance" names four unrelated concepts in this codebase**, only one of
   which is the cube's Stance face:
   - `core/cube.js` / `core/faces.js` — the Mode × Object Resolution face. The real one.
   - `surfer/stance.js` — the per-cursor instrument that *reads* the real one off a
     reading field. Correctly named; it is an instrument for the face, not a new face.
   - `surfer/dag/stance.js` — the "dialectical CON stance": `accidental` /
     `essential` / `generative`, a warrant strength for a causal verb reading. Has
     nothing to do with Mode × Object.
   - `core/enacted/stance.js` (re-exported by `enactor/enact/stance-fold.js`) — "the
     stance layer as a fold": a drift-calibration threshold (`band`, `step`) for what
     counts as normal surprise. Also unrelated to Mode × Object.

2. **The one correct instrument only ever reaches two of the three grains.**
   `surfer/stance.js`'s `updateStance` returns Making, Cultivating, or Clearing —
   never Composing — because a continuous per-cursor field carries no relation graph
   to traverse. That is a legitimate boundary, but nothing in the code *declares* it;
   a reader has to infer it from the fact that `MOVES` only has three entries and one
   of them is Differentiate-mode. An undeclared boundary is indistinguishable from a
   bug until someone reads the source.

3. **`weave/generate-row/stance.js`'s domain re-homing is dead code.** `legalCellFor`'s
   `CELLS.cultivating` entry hardcodes `{ op: 'REC', site: 'Atmosphere' }`
   unconditionally, so the `domainHint === 'Field'` branch recurses into a call that
   returns the identical cell regardless of the hint. The desert cell
   (`core/contract.js`'s `DESERT_CELL`, `SYN(Field, Cultivating)`) can never arise from
   this function today — not because the guard fires, but because the only operator
   this function ever names is REC, which cannot reach Structure domain at all. The
   test suite's `"no test fixture... can produce SYN·Field·Cultivating"` passes
   trivially. This is latent, not active: it becomes a live bug the moment a caller in
   the Structure domain is added, which is exactly what "reused everywhere" implies.

4. **The small-n floor is a second, unconnected significance budget.**
   `clearedComponents` uses `deriveNull`'s `alpha`-based null above `MIN_SAMPLES`, and
   a bare `EPS = 0.05` below it, with no derivation and no relationship between the
   two thresholds. A caller tuning `alpha` for its hallucination budget has no lever
   over the floor that actually governs almost every real row (2–6 propositions).

None of these are reasons the shipped row-stance code is wrong today — its own tests
pass, and its comments are honest about points 2–4 where they touch it. They are
reasons a second caller cannot be added safely without a shared foundation under both.
This spec is that foundation.

## 1. Existing machinery this composes

| Concern | Existing mechanism | Role here |
|---|---|---|
| The Stance face's static vocabulary | `core/cube.js` (`STANCES`, `stanceOf`, `SIGNATURES`) | The nine names, by Mode × Grain. Unchanged — this spec adds a reader, not a new vocabulary. |
| The three-face model | `core/faces.js` (`FACES`, `facesOf`, `cellAt`, `cellsOf`) | `cellAt` is the existing diagonal-safe cell constructor; the new reader routes through it, never around it. |
| The confabulation guard | `core/cube.js` (`coherence`) | Rejects any candidate cell whose faces disagree on grain. |
| The static desert-cell check | `core/contract.js` (`DESERT_CELL`, `contract()`) | Catches a declared module contract that names SYN + Cultivating. This spec adds the dynamic counterpart — catching a constructed cell at read time. |
| The spectral null | `core/voidnull.js` (`deriveNull`, `MIN_SAMPLES`) | The large-n significance test. Kept as-is; this spec only unifies its small-n neighbor. |
| The density/spectrum machinery | `core/spectral.js` (`buildDensity`, `eigenLenses`, `applyStance`, `vonNeumann`) | Unchanged; both existing callers keep building their own input vectors. |
| Operator lookup by (Mode, Domain) | `core/operators.js` (`OPERATORS`, `operatorForMode`) | Each of the nine operators has a unique (mode, domain) pair; the shared instrument uses this to find the right operator instead of a caller hardcoding one. |
| The existing per-cursor instrument | `surfer/stance.js` (`updateStance`, `applyMeasuredStance`) | A thin adapter over the shared instrument. Its physics (why Ground splits into Cultivating vs. Clearing by comparing to the field's median) stays exactly as specified. |
| The existing per-row instrument | `weave/generate-row/stance.js` (`stanceLegality`, `legalCellFor`) | A thin adapter over the shared instrument. Its join-axis construction (`activationVectors`) stays. |

The new work is one shared reading instrument, two capability declarations, one
dynamic forbidden-cell guard, one unified small-n floor, two renames with shims, and a
registry self-check that keeps "stance" meaning one thing.

## 2. Normative objects

### 2.1 StanceCapability

A caller's declaration of which grains its own evidence can ever support, and why not
for any it can't. Declared once, at the call site, not inferred from behavior.

```js
StanceCapability = {
  mode: 'Differentiate' | 'Relate' | 'Generate',
  reachableGrains: ['Ground', 'Figure'],       // subset of GRAINS, caller's own claim
  unreachable: {                               // required for every grain NOT listed above
    Pattern: 'continuous per-cursor field carries no relation graph to traverse'
  }
}
```

`reachableGrains ∪ Object.keys(unreachable)` must equal all three grains — a capability
that is silent about a grain is invalid, not permissive. `makeStanceCapability` throws
at construction if this doesn't hold.

### 2.2 StanceReading

The shared instrument's return value:

```js
StanceReading = {
  mode: 'Generate',
  grain: 'Figure',
  stance: 'Making',                 // core/cube.js STANCES[mode][grain] — never authored
  cell: 'REC_Making_Lens',          // cellOf(...).key, or null if refused
  firmness: 0.62,                   // how hard the read applies; caller-specific scale
  guard: false,                     // true iff grain === 'Ground' (the confabulation guard firing)
  refused: false,
  reason: null,                     // set when refused: 'off-capability' | 'desert-cell' | 'off-diagonal'
  capability: StanceCapability,     // echoed back, for the audit trail
  spectrum: { clearedCount: 1, floor: 'epsilon', floorValue: 0.05 }
}
```

A `refused` reading is not an error — it is the instrument's own honest output when
the evidence can't support any grain the caller is capable of reaching, or when the
only cell the numbers point to is forbidden. Callers render their own fallback; the
shared instrument does not pick the fallback for them.

## 3. The canonical vocabulary — one axis, one home

`core/cube.js`'s `STANCES` table is unchanged and remains the sole source of the nine
names. Nothing outside `core/cube.js`, `core/faces.js`, and `core/stance-face.js` may
export a symbol whose name collides with the Stance vocabulary: `STANCES`, `stanceOf`,
`stanceFold`, `createStance` (`updateStance` stays — it names an adapter, not a
competing vocabulary). `tests/stance-registry.test.js` makes this a load-time check.

The two colliding modules keep their real content and get names that describe what
they actually measure:

| Old path | Old export names | New path | New export names |
|---|---|---|---|
| `surfer/dag/stance.js` | `STANCES`, `proposeStance`, `readPolarity`, `readModality` | `surfer/dag/causal-warrant.js` | `WARRANTS`, `proposeWarrant`, `readPolarity`, `readModality` |
| `core/enacted/stance.js` | `stanceFold`, `createStance`, `BORN_FRAME` | `core/enacted/calibration-fold.js` | `calibrationFold`, `createCalibration`, `BORN_FRAME` |

Both renamed modules keep a re-export shim at the old path, so nothing downstream
breaks in the same release that renames the source of truth. `tests/stance-registry.test.js`
verifies the shims stay shims (no local re-definition), and `tests/contracts.test.js`
covers both the renamed modules and their shims.

## 4. The shared instrument: `core/stance-face.js`

The one function that reads a Stance-face grain off a spectrum, for any Mode. Both
`surfer/stance.js` and `weave/generate-row/stance.js` independently decided "one clean
component → Figure, several orderable ones → Pattern, otherwise → Ground" and
independently routed the result through `cellAt`. That test is what moved here:

```js
export const readStanceFace = ({
  spectrum, mode, domain, capability, orderable = false, alpha = 0.05, firmnessOf,
}) => StanceReading;

export const clearedComponents = (spectrum, { alpha } = {}) => number[];

export const cellForGrain = (mode, domain, grain) => Cell | { refused: true, reason: 'desert-cell' };
```

`readStanceFace`'s body:

```
cleared = clearedComponents(spectrum, { alpha })
if cleared.length === 0: grain = 'Ground'
elif cleared.length === 1: grain = 'Figure'
elif cleared.length >= 2 and orderable: grain = 'Pattern'
else: grain = 'Ground'   // multi-part, unorderable: reserve, don't invent order

if grain not in capability.reachableGrains:
    return refused('off-capability', grain)

cell = cellForGrain(mode, domain, grain)
if cell.refused:
    return refused(cell.reason, grain)

return StanceReading{ mode, grain, stance: stanceOf(mode, grain), cell: cell.key, guard: grain === 'Ground', ... }
```

Two things this generalization does NOT take over, on purpose:

- **Ground-grain disambiguation for non-Generate Modes.** `updateStance`'s specific
  rule for splitting Ground into Cultivating-vs-Clearing (`peakBayes <= reachMedian`)
  is real domain content, not a fact about the cube. `readStanceFace` returns the
  grain (`Ground`); the caller still decides which Mode's Ground applies.
- **Building the spectrum.** `activationVectors` (row-specific) and the surf's own
  reach-trace construction (cursor-specific) stay caller-specific by design.

## 5. The unified small-n floor

```js
export const clearedComponents = (spectrum, { alpha = 0.05 } = {}) => {
  if (spectrum.length > MIN_SAMPLES) {
    const nul = deriveNull(spectrum, { alpha, leaveOut: spectrum[0] });
    return spectrum.filter((w) => w > nul);
  }
  const epsilon = 1 / Math.sqrt(Math.max(spectrum.length, 1) * (1 / alpha));
  return spectrum.filter((w) => w > epsilon);
};
```

Above `MIN_SAMPLES`: `deriveNull`'s leave-one-out null, untouched. At or below it: a
closed-form floor derived from `alpha` — conservative (wide), not a tight estimate, but
now one knob, documented and shared, instead of an unrelated hardcoded `0.05`. Verified
against the full `tests/row-stance-templates.test.js` / `tests/row-plans.test.js` suite
(65 tests) byte-for-byte.

## 6. The dynamic desert-cell guard

```js
export const cellForGrain = (mode, domain, grain) => {
  const op = operatorForMode(mode, domain);
  if (!op) return { refused: true, reason: 'off-diagonal' };
  const terrain = terrainOf(domain, grain);
  const stance = stanceOf(mode, grain);
  const candidate = { op: op.id, terrain, stance };
  if (isForbiddenCell(candidate)) return { refused: true, reason: 'desert-cell' };
  const cell = cellAt(op.id, { site: terrain, stance });
  if (!cell) return { refused: true, reason: 'off-diagonal' };
  return cell;
};
```

For today's two real callers (both REC, Interpretation-domain), `isForbiddenCell` never
fires — REC can never equal SYN. The moment a Structure-domain caller is added, this
becomes live: `operatorForMode('Generate', 'Structure')` resolves to SYN,
`terrainOf('Structure', 'Ground')` resolves to `Field`, and a Ground-grain reading would
be caught before a cell is ever returned.

## 7. Capability declarations for the two real callers

`surfer/stance.js`'s `SURFER_CAPABILITY` reaches Ground/Figure only (Pattern is
structurally unreachable — a continuous field has no relation graph). Its Ground branch
also declares a `CLEARING_CAPABILITY` for the Differentiate-mode Clearing move (Ground
only — the guard never dephases at Figure or Pattern here).
`weave/generate-row/stance.js`'s `ROW_CAPABILITY` reaches all three grains.

## 8–9. What "reused everywhere" licenses; the registry self-check

Any future Stance-face reader — including a Structure-domain one (SYN) this spec keeps
returning to as the concrete example that exercises §6's fix — declares a
`StanceCapability`, builds its own spectrum, calls `readStanceFace`, and renders its own
fallback for a refusal. `tests/stance-registry.test.js` is the enforcement mechanism for
§3: it walks `src/` and fails if any file outside the allowed set locally defines
`STANCES`, `stanceOf`, `stanceFold`, or `createStance`.

## Release invariants

1. One face, one name — mechanically checked (`tests/stance-registry.test.js`).
2. One reading instrument — `core/stance-face.js` is the only module implementing the
   cleared-vs-Ground/Figure/Pattern test.
3. Declared, not inferred, capability — every `readStanceFace` caller passes a
   `StanceCapability`; `makeStanceCapability` throws if a grain is uncovered.
4. No dynamic desert cell, structurally — `cellForGrain` cannot return the desert cell
   for any (mode, domain, grain) input.
5. One small-n floor — documented, `alpha`-derived, shared.
6. No behavior change for existing callers — `surfer/stance.js` and
   `weave/generate-row/stance.js` are byte-identical to their pre-migration selves
   across every existing fixture (`npm test`, 3067 tests).
7. A refusal is not an error — `readStanceFace` returning `refused: true` is a
   first-class, tested outcome with a `reason`.
8. The Ground-disambiguation seam stays with the caller — `readStanceFace` never picks
   which Mode's Ground stance applies when two are plausible.
