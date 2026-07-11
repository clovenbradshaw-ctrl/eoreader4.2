# The assembly checkpoint — issue detection as the wedge

`src/coder/` implements the sharpest thing in `docs/eot-coder-roadmap.md`: **issue
detection as a consequence of the algebra, not a linter bolted onto a generator.**
Given an *assembly* — a room, a link, a surface, or an app — with its declared
contract, the catalog, and the prior context, the checkpoint reads off the full
Appendix B typed-error taxonomy (`docs/eo-for-coders.md`), each defect carrying its
**face**, its **address**, its **fix**, and the **earliest point that could catch
it**.

> A general coding agent finds issues by running the code. The EOT coder finds a
> whole class of issues without running anything — and hands you the address.

## The two modules

```
src/coder/
  catalog.js     the closed surface catalog — ten pre-built, contracted surfaces
  checkpoint.js  checkpoint(assembly, context) → typed findings, addressed
  index.js       one mouth
```

`checkpoint(assembly, context)` returns `{ id, ok, findings, introduced }`. Every
finding is `{ error, address, message, face, severity, detectableAt, stage, fix }`.
It is pure and non-throwing: a malformed assembly surfaces its whole worklist of
findings, the way `core/contract.js` surfaces a contract's whole error list, rather
than crashing on the first defect.

## The taxonomy is the single source of truth

The roadmap's Stage 1 relocates a class of defects into the decoder as a token
mask — but only if the mask derives from the **same kernel source** as the
checkpoint, or the two drift and the guarantee is void. So the checkpoint owns the
classification, as data:

| Error | Face | Earliest detection | Stage |
|---|---|---|---|
| `grain-mixed` | all three | **token** — the coherence guard, once two faces are fixed | 1 |
| `desert-cell` | Act + Site | **token** — SYN@Ground is never sampled | 1 |
| `dependency` | Act (helix) | **token** — a reference to an un-INS'd target | 1 |
| `contract-violation` | any | **token** — an op/terrain/stance outside the part's region | 1 |
| `unknown-surface` | catalog | **token** — the catalog is a closed vocabulary | 1 |
| `unassembled` | Law 2 | **parse** — an assembly boundary with no `!EVA` | 1 |
| `terrain-mismatch` | Site | **checkpoint** — needs the room's actual fields | 0/3 |
| `stance-violation` | Stance | **checkpoint** — needs the surface's contract | 0/3 |
| `narrowing-violation` | composition | **checkpoint** — needs the container's contract | 0/3 |
| `closure-violation` | composition | **checkpoint** — needs the whole envelope | 0/3 |

`detectionPoint(error)`, `MIGRATES_TO_DECODER`, and `STAYS_AT_CHECKPOINT` expose
this table as code. The top block migrates to the decoder at Stage 1 (it becomes
*unrepresentable*); the bottom block depends on facts the decoder cannot see
locally and stays at the checkpoint, where the Stage 3 repair agent consumes it.
The partition is exact — a test pins it so a new error cannot slip in unclassified.

## Built on the existing kernel

Nothing here is new algebra — the checkpoint is a fold over primitives that already
exist:

- `grain-mixed` is `core/cube.js`'s `coherence` guard: Act, Site, and Stance must
  agree on grain; a Figure operator at a Ground terrain is the confabulation the
  cube already forbids.
- `desert-cell` is `core/contract.js`'s `DESERT_CELL` (SYN·Field·Cultivating, empty
  across 41 languages).
- `dependency` reads the `HELIX` order: a reference before its INS.
- `contract-violation`, `narrowing-violation`, and `closure-violation` are region
  membership over `contract()` objects.

The catalog (`unknown-surface`, `terrain-mismatch`, `stance-violation`) is the one
piece of new data: ten surfaces, each with a contract region (`home` terrains, the
`ops` it fires, the `stances` it accepts). A surface the catalog lacks is a catalog
gap, **reported, never invented** — widening the catalog is a human, once-off act
(roadmap Stage 2), not a coder task.

## The watchmaker chain

`checkpointChain(assemblies)` threads what each set-down leaves behind: a room's id
becomes reachable to every later assembly; an INS'd instance becomes a legal
reference downstream. So a link before its room is a `dependency`, and the same link
after it is clean — **order is the helix, made operational.** A valid prefix
survives an invalid tail: stopping mid-chain leaves valid, provisioned assemblies
behind (the interruptibility property, roadmap §1).

## Run it

```js
import { checkpointChain } from './src/coder/index.js';

const app = [
  { id: 'cases', kind: 'room',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'INS', id: 'case', terrain: 'Entity', stance: 'Making' }], closed: true },
  { id: 'case_board', kind: 'surface', surface: 'board',
    room: { terrains: ['Entity'] } },        // board home is [Entity, Field] — Field is missing
];

const { ok, results } = checkpointChain(app);
// ok === false
// terrain-mismatch @ case_board.board [Site, catch-at: checkpoint]
//   — surface 'board' needs Field; the room provides Entity
```

Add `Field` to the room's schema and the same chain checkpoints clean. The typed
error names the face that failed and the address it failed at — no runtime
traceback, because none is needed.

## The semantic mask — Stage 1, the top block made unsamplable

`src/coder/mask.js` is the first half of roadmap Stage 1: it relocates the four
**token-block** errors from a check we run afterward to a property of the surface
we emit on. Given an event drafted so far, `maskField(face, draft, partial)` returns
the legal completions of that face — filtered against the cube's coherence guard,
the desert cell, and the part's declared region:

```js
import { maskField, maskEvent } from './src/coder/mask.js';

const partial = { contract: { ops: ['INS', 'DEF', 'SEG'], terrains: ['Entity', 'Field'], stances: ['Making', 'Dissecting'] } };
maskEvent({}, partial).op;                        // ['SEG', 'DEF', 'INS']  — region only
maskField('terrain', { op: 'INS' }, partial);     // ['Entity']            — INS is Existence
maskField('stance', { op: 'INS', terrain: 'Entity' }, partial);  // ['Making'] — the third face is pinned
maskField('stance', { op: 'SYN', terrain: 'Field' });            // []       — the desert cell is unreachable
```

Two roadmap claims, now executable:

- **Once two faces are fixed, the third is constrained to a computable set.** Fix an
  operator (which fixes Mode and Domain) and a terrain (which fixes grain), and the
  stance mask is a singleton — there is exactly one coherent completion.
- **The desert cell is unreachable.** SYN at Ground (`SYN·Field`) has *no* legal
  stance, so a decoder constrained by the mask can never sample it.

**The no-drift invariant.** `admits(partial, event)` — the mask's ground truth — is
defined *through* `checkpoint()`, so the mask can never permit an event the
checkpoint would flag with a token-block error. `tests/coder-mask.test.js` proves
the face masks agree with `admits` **exhaustively across the whole cube** (every
op × terrain × stance): the executable statement of "the mask must be derivable
from the same kernel source as the checkpoint." What remains for Stage 1 is the
purely mechanical outer layer — compiling these per-step masks into a token-level
logit mask against a specific tokenizer — which needs a model and a grammar
back-end, not more algebra.

## What it catches, and what it does not

This catches **incoherence**, not **inappropriateness**. A perfectly coherent,
contract-satisfying app can still be the wrong app. The person is the judge of that;
no amount of checking substitutes for it (roadmap §4, restated because it is the
caveat that bites).

`tests/coder-checkpoint.test.js` is the defect corpus (roadmap Stage 0): one minimal
assembly that triggers each of the ten errors, a clean twin beside each that
triggers none, and the watchmaker-order demonstration.
