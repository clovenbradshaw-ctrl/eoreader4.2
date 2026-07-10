# The significance the reader infers — promoted to the graph, with its provenance

> The inner monologue is supposed to make the connections that are **not explicitly in the text** —
> the significance of it all. For those to matter they have to reach the physics: a claim can't
> become corroborated or contested by a thought that never touches the graph. This is that channel —
> the reader's inferences promoted as real edges that **carry their provenance**, so they move the
> reading without ever being mistaken for what a source witnessed.

## The gap this closes

`deep-reading.js` voices a reflection as a plain-text note; `weave.js` connects reflections across
the corpus (echo · bears-on · analogy). Both are held **only as substrate nodes** — they enrich the
reading but cannot *move* it:

- a reflection is op `EVA`, and `projectGraph` skips `EVA` by type — no edge;
- a `weave` connection carries no `src`/`tgt` endpoints — no edge.

So the significance the reader reads was inert to the physics. The future surface
(`EOReader.dc.html`) is a **provenance graph** whose load-bearing edges are lateral —
`corroborates`, `contradicts`, `bears-on` between passages — and *those are exactly the relations no
single source states*. The reader infers them. They need to be on the graph.

## The key fact that makes it safe: `projectGraph` carries provenance per edge

`projectGraph` builds an edge from every `CON`/`SIG` event **and rides the event's provenance onto
the edge** (`core/project.js`: *"the DOOR rides through the projection … an enactor-door edge can
orient but never corroborate a claim as world"*). So the witnessed record is not "the edges without
the inferences" — it is the **`canWitness`-true subset** of the edges:

- a **parser** edge has no provenance → `canWitness` true → *witnessed*;
- an **inference** edge carries `fromEnactor` provenance → `canWitness` false → *the reader's own*.

The firewall was never "keep inferences off the graph." It is "keep them **distinguishable** on the
graph." That is already the architecture — this channel just uses it.

## Two readings, one firewall (`fold/significance.js`)

There are two ways to reach a connection the text never states, and they differ in *what feeds them*.

**Structure-fed** (`inferSignificance`) — read off the witnessed **structure** (`structureSurface`).
Cheap, total, blind to what the reading cared about; every same-neighbour pair is proposed equally.

| kind | what the reader infers | read off |
|---|---|---|
| **contradicts** | the same bond affirmed and denied — a tension the text never resolves (→ a claim goes *contested*) | a polarity clash on `(src, stem(via), tgt)` |
| **connects** | two figures that never meet in the text but both bear on a third — the latent link "in potential" | a shared target neighbour with no direct edge |
| **corroborates** | the same bond asserted from two places — convergence that *strengthens* a claim | one bond, one polarity, ≥2 distinct sentences |

**Fold-fed** (`inferFoldSignificance`) — read off the **fold** the reading takes at its places of
most interest (the surf's surprise peaks; requires an injected `surf`). The connection is drawn
between the figures the reading **strained over together** — where its own significance arrested, not
everywhere the graph converges. This is the part that *isn't just latent in the structure*: the fold
carries the meaning **in potential** (the surprise, the held tension), and the connection is the
reading recognising its **own recurring concern**. On the *Metamorphosis* arc — *"Grete brought
Gregor food … Grete decided he was no longer her brother … Grete felt relief"* — it binds **Gregor**
to **relief**, an arc no sentence asserts and the structural reading never pairs. Anchored on each
fold's focus (linear, not a fan-out), gated by the `strain` verdict, attention-weighted.

Either way, each is promoted as a `CON` edge that is **reafference** (`fromEnactor` → `canWitness`
false, the §8 firewall), band **void**, tagged `inferred:true`, **between the real figures** — so
`projectGraph` depicts it (the impact) carrying its provenance (the safety). `weaveSignificance` runs
the structure-fed reading always and adds the fold-fed one when a `surf` is supplied, deduped, under
the one firewall.

## What it does to the physics — measured

`eoreader4-eval/significance-physics.mjs`, model-free, `weaveSignificance(doc, { surf })` (both readings):

| doc | connections inferred | edges + | surf field L1 | facts added | inferred overlay | firewall |
|---|---|---|---|---|---|---|
| affirm-and-deny | 1 contradicts · 1 connects | +2 | 0.49 | **0** | 2 | intact |
| convergence (echolocation) | 4 connects | +4 | 0.73 | **0** | 4 | intact |
| alliances (common adversary) | 3 connects | +3 | 0.67 | **0** | 3 | intact |
| grete-arc (**fold-fed**: Gregor↔relief) | 1 connects | +1 | 0.18 | **0** | 1 | intact |

Every promoted connection is a real edge the surf, retrieval and the provenance graph read — the
attention field **moves**, a figure becomes reachable from another it never met — while the
**witnessed record is byte-unchanged** (`factsAdded 0`) and the inferences ride as a labelled overlay
(`inferredAdded N`, every edge `canWitness` false). *Impact without laundering.*

```js
import { weaveSignificance, readSignificance, firewallAudit } from './src/surfer/fold/index.js';
import { surfFold } from './src/surfer/index.js';

const w = weaveSignificance(doc, { surf: surfFold });   // structure-fed + fold-fed, committed as reafferent edges
w.kinds;                                                // { contradicts, connects, corroborates }
readSignificance(doc);                                  // read them back off the log
firewallAudit(doc);                                     // { factsAdded: 0, inferredAdded: N, intact: true }
```

## The audit was measuring it wrong — now it isn't

`firewallAudit` (`fold/audit.js`) previously counted **any** added edge as `factsAdded`, so a
legitimate provenance-tagged connection read as a breach. It is now **provenance-aware**: it strips
by the reader-inference tag (`reflection | connection | inferred`) and counts `factsAdded` over the
**witnessed** subset only. A reafferent connection lands in `inferredAdded` (intact); a reflection
*mis-minted* with a world-door prov still lands in `factsAdded` (breach). The teeth stay; the false
alarm is gone. See `docs/monologue-audit.md`.

## Where it lives

| concern | file |
|---|---|
| the connector (infer + promote) | `src/surfer/fold/significance.js` (`weaveSignificance`, `inferSignificance` structure-fed, `inferFoldSignificance` fold-fed, `readSignificance`) |
| the provenance-aware firewall | `src/surfer/fold/audit.js` (`firewallAudit`: `factsAdded` vs `inferredAdded`) |
| the physics battery | `eoreader4-eval/significance-physics.mjs` |
| tests | `tests/significance.test.js` |
| the edge that carries provenance | `src/core/project.js` (the `prov` spread onto a `CON`/`SIG` edge) |
| the firewall type it rides | `src/core/provenance.js` (§8, `canWitness`) |
| the connections it complements | `src/surfer/fold/weave.js` (echo · bears-on · analogy, held as nodes) |
