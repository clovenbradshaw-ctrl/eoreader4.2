# Witness diversity — the standing of a proposition, made first-class

> The proposition (`src/core/proposition.js`) is the floor of **meaning** — the least structure that
> is a coherent distinction. **Witness diversity** (`src/core/witness.js`) is the floor of its
> **standing**: how many independent voices, through how many channels of the world, hold that
> distinction up. A proposition asserts *that* something is so; its diversity says *on how much* it
> rests. One voice is a claim; two independent voices is corroboration; two **senses** is
> cross-modal — the paper and the tape both holding the fact, channels that never touched.

## Why it is its own currency

The diversity of a proposition's witnesses was already *measured* — but scattered across three
sites, in three half-shapes, with no shared object:

- `reflect.js` inlined a tier ladder per answer-relation (`origins ≥ 2 && senses ≥ 2 ? 'cross-modal' : …`);
- `corroboration.js` counted meaningfully-distinct **voices** per answer (mirrors and reprints collapsed);
- `witnessesForProps` reported **spans** and **origins** per document proposition.

Three consumers, three re-derivations of the same idea. So the measure becomes a **currency**, the
same move `proposition.js` made for meaning: **one frozen descriptor**, four named dimensions and a
derived tier, that *any* proposition can carry and *any* faculty can read. The ladder is now defined
exactly once (`diversityTier`); `reflect.js` and `corroboration.js` **mint** the currency instead of
re-deriving it. The diversity of a proposition travels *with* the proposition — first-class, not a
number recomputed at each reader.

## The four dimensions (`WITNESS_DIMENSIONS`)

| dimension | what it counts | grain |
|---|---|---|
| `spans`   | distinct witnessing **spans** within one source — two sentences of a memo, not one hit | within-source |
| `origins` | distinct independent **root** documents — a doc and the note taken off it fold to one | cross-source |
| `voices`  | distinct meaningfully-distinct **sources-of-record** — mirrors and reprints collapsed | cross-source |
| `senses`  | distinct **sense-channels** the world was read through — text, sight, hearing, tabular… | cross-modal |

`voices ≤ origins` always: a voice is an origin after mirrors, reprints, and one-publisher hosts
collapse (`corroboration.js`, by **identity facts**, never a tuned similarity bar). When no voice
measure is available — a single document cannot tell mirrors apart — **voices default to origins**,
so a caller that only has origins gets the honest same-as-origins reading.

## The tier ladder (`DIVERSITY_TIERS`)

A total order, weakest → strongest, **derived** from the dimensions so "corroborated" means the same
thing everywhere it is read:

| rung | condition |
|---|---|
| `unwitnessed`    | no witness of any kind |
| `interpretation` | witnessed only through the **enactor door** (the engine's own notes — reafference cannot corroborate the engine) |
| `single-source`  | one voice in the world holds it |
| `corroborated`   | ≥ 2 meaningfully-distinct voices, one sense |
| `cross-modal`    | ≥ 2 voices through ≥ 2 senses — independent channels of the world both holding the fact |

The corroboration rungs key on **voices**, not raw origins: two Wikipedia mirrors are two origins but
**one** voice, so they read as `single-source`, not `corroborated` — the refinement
`corroboration.js` makes and `reflect.js`, on `docId` alone, could not.

## The API

```js
import {
  makeDiversity, diversityOf, diversityTier, withVoices, mergeDiversity,
  moreDiverse, attachDiversity, diversityOfProposition, EMPTY_DIVERSITY,
} from '../core/witness.js';

diversityOf([{ origin: 'a.txt', sense: 'text' }, { origin: 'b.txt', sense: 'sight' }]).tier;
// → 'cross-modal'

// corroboration refines the voice count and the tier re-derives (not cosmetic):
withVoices(makeDiversity({ origins: 2 }), 1).tier;   // 'corroborated' → 'single-source'

// the standing rides ON the proposition:
const p = attachDiversity(prop, diversity);
diversityOfProposition(p).tier;
```

`makeDiversity` returns a **frozen** descriptor whose `tier`/`rank` are consistent with its
dimensions by construction — you cannot hold a "corroborated" tier over one voice. `attachDiversity`
binds it to a proposition as a first-class companion (`p.diversity`), leaving the proposition's slots
untouched (`isProposition(p)` still holds).

## Where it lives

| piece | module |
|---|---|
| the currency — dimensions, ladder, `makeDiversity`, `diversityOf`, `attachDiversity` | `src/core/witness.js` |
| per-proposition minting (document grain) | `src/enactor/ground/reflect.js` — `witnessesForProps`, `reflectAnswer` |
| the **voices** refinement + census | `src/enactor/ground/corroboration.js` — `corroborationCensus`, `distinctVoices` |
| tests | `tests/witness.test.js` (and the unchanged `tests/reflect.test.js`, `tests/corroboration.test.js`) |
