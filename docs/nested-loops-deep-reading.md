# Nested loops of deep reading — metacognition and cross-connections

> `src/surfer/fold/weave.js` · `tests/weave.test.js`. Deep reading (`deep-reading.md`) is one loop:
> when not otherwise busy, the reading surfs to the place of most interest, folds it, and deposits
> a reflection. This makes it a **nest** — a loop over that loop's output (metacognition), and
> bonds *between* its held interpretations (cross-connections) — without ever breaching the firewall.

## The three concentric loops

```
research session (across corpuses)            ← one log, frames = topics   (research/)
  └─ deep reading (loop 1, per document)       ← surf → fold → EVA reflection   (fold/deep-reading.js)
       └─ metacognition (loop 2)               ← fold the reflections → EVA about the pattern
            + cross-connections                ← CON bonds between held interpretations
```

Each loop **quiesces on its own physics**, so an outer loop never has to police an inner one:
deep reading habituates on the *place* and stops when no fresh peak beats its band; metacognition
habituates on the *pattern* and stops when no fresh pattern remains; connection is a single fold
over what already exists (it links, it does not loop).

## Metacognition — the reflection about the reflections (loop 2)

`deepReading` folds the **document** at its peak. `metaReflect` folds the reading's **own
reflections** (`readReflections`) and evaluates their pattern — the same **EVA** operator one grain
up, a pattern (SYN grain) over `layer:'reflection'` events. Model-free by default ("thinking needs
no model"), reading two patterns straight off the log:

| pattern | what it names |
|---|---|
| **recurring-focus** | the reading returned to the same figure ≥ `minRecur` times |
| **standing-strain** | a focus that *only* ever strained, never confirmed — an open question, or a place the reading cannot resolve (also the honest rumination tell) |

Each meta-reflection is sourced to the prior reflections it folds — **claim-src on its own acts**.
It is tagged `meta:true, order:2, layer:'metacognition'` and, crucially, **not** `reflection:true`,
so `readReflections` never folds it back in: loop 2 reads loop 1, never itself. `createMetaReader`
is the governed loop (the metacognitive sibling of `createDeepReader`); it habituates on the pattern
*signature*, so a pattern is noticed at most once — the cure for meta-rumination.

## Cross-connections — CON bonds between held interpretations

A connection is **CON** (Relate × Structure — the central operator), carried at band `void`,
reafferent, sourced to *both* endpoints, and **never upgraded** (the no-upgrade discipline of
`dag/stance.js`). Three kinds:

- **echo** — two reflections that are the **same proposition** (`perceiver/proposition-equivalence`,
  **Born-rule gated** — no hand threshold). A cross-*document* echo is a genuine cross-**corpus**
  connection: the reading found the same idea in two texts.
- **bears-on** — a reflection whose focus touches a held `eo:Tension` or an earlier `eo:Reframing`
  (pure, no embedder).
- **analogy** — same *relational* structure, *different* surface entities (structure-mapping, its
  own section below).

`connect` folds the reflections across one doc or many. Echo is **firewalled**: under a
spelling-space embedder (`measuresMeaning === false`) a cosine measures nothing, so nothing is
asserted (`live:false`). Same-doc echoes land on that doc's log; a multi-doc corpus has no shared
log, so pass one via `log:` (as a `research` session does) or take the returned events uncommitted.

## The epistemics — the firewall holds at every level

A meta-reflection and a connection are **both reafference** (`fromEnactor`, `canWitness === false`,
§8). A meta-reflection reads the reading's own prior EVAs but never promotes them; a connection
links two `void` nodes and is itself `void`. `projectGraph` skips EVA/CON-at-void, so — exactly like
a first-order reflection — they can **only** surface as substrate nodes (`eo:MetaReflection`,
`eo:Connection`, beside `eo:Reflection`/`eo:Tension`/`eo:Reframing`), never as depicted facts. Only a
human's witness act could ever promote any of them. So the whole nest can run unattended without
laundering self-talk into record — the firewall is the **type**, not a flag, and it is preserved by
composition rather than re-checked at each level.

## The API

```js
import {
  metaReflect, createMetaReader, connect, weaveReading,
  readReflections, readMetaReflections, readConnections, buildSubstrate,
} from '../fold/index.js';
import { surfFold } from '../surfer/index.js';

// loop 2 alone — fold the reading's own reflections, notice a pattern, hold it void
const m = metaReflect(doc);                        // { pattern, focus, sources, event, canWitness:false }
createMetaReader({ doc }).arrive();                // the governed loop — habituates, quiesces

// cross-connections over one doc (echo + bears-on), or a corpus (cross-doc echo)
const substrate = buildSubstrate({ structure, reflections: readReflections(doc) });
const { connections } = await connect(doc, { embedder, substrate });     // embedder must measure meaning
const cross = await connect([docA, docB], { embedder });                 // cross-corpus echoes

// analogy — structure-mapping across a corpus (no embedder; pure topology)
const { connections: analogies } = analogize([docA, docB]);

// the whole nest in one call — loop 1 → loop 2 → echo + analogy, every product held void
const woven = await weaveReading(doc, { surf: surfFold, embedder, corpus: [docA, docB] });
```

## Analogy — structure-mapping across the corpus

Echo connects reflections that are the *same proposition* (content). Analogy is its complement: the
*same relational structure* with *different* surface entities. "Acme employs Bob, partners Corp, …"
and "Umbra hires Kane, allies Vortex, …" share no words, but their relation graphs are isomorphic —
`Acme↔Umbra`, `Bob↔Kane`. Gentner's structure-mapping: map by the **relations**, ignore the objects.
So the signal is graph **topology**, not the edge labels — which are exactly the surface that differs.

`analogize(docs)` reads each document's directed, polarity-typed relation graph off the level-2
structure surface (`relationGraph`), then computes a **label-abstracted Weisfeiler–Lehman role
signature** per node (`wlColors`): a node's colour starts as its directed-degree/polarity profile
(labels stripped) and is refined `k` rounds by the multiset of its neighbours' colours. Two nodes
with the same refined colour occupy the same structural role. A correspondence is asserted only when
it is **systematic** (Gentner) — it participates in a *preserved* relational structure (≥ 1 incident
edge of A maps to a real edge of B under the correspondence), never an isolated same-degree
coincidence. The mapping is built greedily, anchoring on the highest-degree nodes and choosing, within
each shared-role class, the counterpart that preserves the most edges.

It is deliberately **conservative** (the `dag/` stance: *the one thing worse than missing a cause is
inventing one*): exact-colour matching declines to fabricate a partial map when the structure is
perturbed, and a structurally unrelated document contributes no correspondence. Each analogy is an
`eo:Connection` of `kind:'analogy'`, band `void`, reafferent, sourced to the passages that proposed
the mapped relations on both sides, carrying the systematicity fraction as its `sameness` — and,
like every stance in `dag/`, never upgraded. `weaveReading({ corpus })` folds analogy into the nest.

**Honest limits.** The mapping is only as rich as the parser's relation extraction (sparse on free
prose; clean on SVO), so it finds a *floor* of the analogies a corpus supports, not all of them. WL
colour equality is strict — it favours precision over recall. A fuller SMT-style largest-consistent
partial mapping, and reading the signature off the stance-typed `assertedDag` (`dag-corpus.md`) rather
than the bare relation surface, are the next levers.

## Where it lives

| concern | file |
|---|---|
| metacognition (loop 2) + cross-connections + analogy | `src/surfer/fold/weave.js` |
| the new substrate nodes + the log readers | `src/surfer/fold/substrate.js` (`eo:MetaReflection`, `eo:Connection`, `readMetaReflections`, `readConnections`) |
| loop 1 it composes over | `src/surfer/fold/deep-reading.js` |
| the Born-gated sameness echo rides | `src/perceiver/proposition-equivalence.js` |
| the relation graph analogy reads | `src/perceiver/surfaces.js` (`structureSurface`) |
| the firewall every level rides | `src/core/provenance.js` (§8, `canWitness`) |
| tests · local-model demo | `tests/weave.test.js` · `tools/weave/weave-demo.mjs` (`npm run weave:demo`) |

Relates to: `deep-reading.md`, `significance-loop.md`, `dag-corpus.md`, `proposition-equivalence.md`,
`nested-task-levels.md`, `subjective-frame.md`.
