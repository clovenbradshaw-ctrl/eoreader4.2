# Organ-level evolution — grow the body, not just tune its dials

> Weight-tuning is natural selection with the phenotype held constant: you get the
> best-adjusted version of the organism you already drew, and never a new organ.

The metabolism (`src/metabolism/`) began as **weight-tuning** — a heritable genome of
allocation parameters (`genome.js`) mutated under scarcity. That is selection on a *fixed
body plan*, and it has a ceiling: a surfer that can only re-weight its existing faculties
becomes the ideal reader of the reading it already knows how to do, and cannot grow the
sense it does not yet have. The leap is unreachable partly because the organ that would
make it does not exist to be tuned — the clerk's ceiling.

This layer lets evolution change the **body**. An organism is now a regulatory **genome**
(weights) *and* a structural **soma** (organs on a holon substrate), varying as one through
the same selection loop.

## An organ is a contract; the desert is the unexpressed phenotype

The architecture was already the developmental toolkit. A holon is a part that is also a
whole, validated in isolation, weakly linked, declaring one contract in three fields — a
genome format. An **organ** (`organ.js`) is exactly that: a contract claiming **one cell of
the cube** (an operator × a grain → its stance and terrain) on a holon-path substrate.

The current faculties cluster in the **Figure** column, where language is rich and a
designer can name what he builds. The 27 diagonal cells minus the ones organs occupy are the
**desert** — the unexpressed phenotype, the developmental space evolution grows into. Under
frequency-dependent fitness an empty niche is worth taking *because* it is empty, so growth
drifts **down into the sparse Ground and Pattern rows** the designer avoided. The new species
are the ones we could not build because we had no words for the work they do: the
**void-keeper** (NUL·Ground — holds an unbound thread), the **habitat-builder** (INS·Ground —
leaves the ground better than it found it), the **legislator** (REC·Ground), the **monitor**,
the **federation** (CON·Pattern — the deme become a unit of selection).

## Organogenesis is REC on the set of organs

`soma.js` grows the body through the three routes evolution actually uses for novelty, each an
operator the system already has:

- **SYN duplication + divergence** (the default) — fork an organ; the copy drifts its contract
  toward an unclaimed cell while the original keeps running. Safe for the reason gene
  duplication is safe.
- **CON recombination** — splice one organ's read-half to another's write-half.
- **symbiotic fuse** — two organs fuse into one composite, inherited as a unit, for less upkeep
  than running them apart (a mitochondrion kept rather than beaten). A thrift move a lean season
  reaches for instead of pruning.

### The developmental discipline (morphogenesis, not cancer)

A new organ is **not admitted by fiat**. It passes three gates or it is refused, the body
unchanged:

1. its own **isolation checkpoint** — a valid contract on the cube (`organ.validate()`);
2. the body's **re-closure** — the whole envelope closes with the new part inside (`soma.close()`);
3. the **constitution** — the mutation's target must be an open locus.

Blind structural proliferation is how you get a tumor. The coherence guard is the constraint
that lets a body grow new parts without the growth being lethal.

### The metabolism pays for the organs

Every organ costs resource to run, every turn, forever (`UPKEEP_BY_OP` — reasoning organs are
expensive, mechanical holds near-free). Under a lean budget an organ that does not return more
grounded quality than it consumes is a limb the body cannot afford, and it atrophies and is
pruned. So the ecology **grows structure when structure earns its keep and sheds it when the
season turns** (verified: grow under plenty, prune under famine). The **neutral reservoir**
protects the most structurally-novel organs from the cull — a perfectly efficient body cannot
evolve, because it has burned the slack novelty grows from. The **hidden horizon** holds: the
body computes no death countdown.

## The freeze boundary — how deep evolution goes

`constitution.js` draws the line, explicitly and enumerated, because the line is a judgement
imposed on the code, not a property the code carries — and a population under selection is a
machine for finding the rule you filed on the wrong side. Four bands, deepest first:

| band | status | what |
|---|---|---|
| **core** | frozen forever | the nine operators, the cube, the coherence guard, the log, the three-field contract — the alphabet evolution is written in |
| **constitution** | frozen (the human's pen) | the fitness function, the guard *as* the guard, the proposer/disposer firewall, append-only, checkpoint-before-wiring, the hidden horizon |
| **operational** | open | governance (Ostrom's third principle) |
| **body** | wide open | organs, substrate, weights, wiring, routing, the region of the cube an organ claims |

Everything is **frozen by default**: a locus nobody opened is refused, not free. The tell that a
rule belongs in the constitution: *a self-interested population would weaken it.*

### The ground that cannot be tuned away

Beneath even the constitution sits one law of the *space*, not a rule of the game: you may
**dwell** in the Void (hold a true-but-unbindable apprehension — NUL at Ground) but you may
**not fabricate** from it (SYN at Ground, the desert cell — the one verb no language has). A
good that can be optimized will be optimized away, so this cannot be a fitness term. It is
enforced structurally by the coherence guard, which validates every organ and is validated by
none. You cannot evolve past it any more than a reading can evolve past coherence.

## The Void-respect term — the investigator, made breedable

A fitness anchored only to the held source breeds a superb **clerk** and starves the
**investigator** — the pattern seen before it can be cited. The two look identical on every
metric that scores only the Figure column. The Void is the axis they come apart on:
confabulation *fills* the Void (a binding with no source); Void-respect *holds* the thread open
until the world grounds it.

`fitness.js` makes it breedable exactly one way:

- **never** reward the unbound claim (the confabulator, and unmeasurable besides);
- **never** reward the *holding* (that breeds the **false vigil** — the courtier who fakes
  patience with empty threads);
- reward **only the held thread that later binds**, credited retroactively across the
  append-only log, scaled by **precision over a spray baseline** so holding-everything-cheaply
  cannot harvest coincidental bindings.

A fabricated thread never binds, so the delayed judge starves the liar and feeds the one who
waited. Courage rendered as patience — un-gameable, because faking it requires actually
predicting the future.

### Structure frozen, magnitude measured (the Born-rule move)

*How much* one precise delayed binding is worth against a joule is **not a hard rule**. A
hand-picked constant is domain-blind; a population-tuned weight gets optimized to zero (the clerk
scores today). So the magnitude is `voidValue` — an **exchange rate read off the observed
structure**, calibrated from the un-authored lift a held-then-bound thread actually delivered.

The prior and the signal are both folded into the **transfer discipline** (`lift.js`), so no free
constant is left:

- The **born prior is the `TRANSFER_FLOOR`** — before any evidence a held thread is worth only what
  provably transfers, i.e. nothing beyond the floor. Conservative by construction, not a free 1.0.
- The **calibration signal is the *kept* lift** — `keptFitness = min(liftA, liftB)` across two
  frozen models: what the gain is worth *when the leaf is swapped*. A gain overfit to one model
  (great on A, nil on B) barely moves the rate; a transfer ceiling caps runaway self-reward.

Every observation pulls the rate off the floor toward the measured worst-case value. Neither the
human's thumb nor the population's strategy — the world's measurement. `condition()` surfaces
`signalRate` (how much of the weight is measured vs. the transfer-floor prior), so *how much of the
weighting is actual contextual signal* is legible at runtime. What stays frozen is only the
**structure** — retroactive-only, precision-gated, that a held-then-bound thread is rewarded at all
— because that is the part a cheater would weaken.

### Standing up model B — the floor is measured, not asserted

`liftA`/`liftB` only mean something if the second frozen model actually exists. `transfer.js`
(`createTransferProbe`) stands it up: it runs the surfer's output through **two** frozen models,
bare and scaffolded, scores each against the held source (the judge — faithfulness, checkable), and
computes the **kept** lift `= min(liftA, liftB)` for real. A prompt hack that lifts one model and
not the other collapses to kept ≈ 0 and its overfit tax is surfaced — the talker/grounder split
enforced by measurement, not doctrine. That measured kept lift is exactly what the Void-respect
exchange rate reads, so the transfer floor is now **measured, not decreed**. `modelRunner` adapts a
real `src/model` backend (echo / webllm / wllama) into a probe runner; `judgeScorer` grades with the
judge and falls back to an un-authored overlap proxy offline. It is the slow true signal — run on
survivors and to re-anchor the cheap proxy, not every turn. The surface runs it live.

**Human interaction** is added as the strongest anchor — un-authorable by construction and, in
time, the primary evolver. It selects genomes directly.

## The judge's material is foraged from the real world

A judge that grades against the same fixture every run is an author after all — the population
overfits it. `forage.js` pulls random documents from a **wide range of real sources** (Wikipedia,
Wikinews, Wikiquote, Wikibooks, Wikisource, Simple Wikipedia, Project Gutenberg), so the
un-authored anchor is anchored in the actual world, across genres. This is also the material the
delayed-binding falsifier needs: real documents surfacing over time is how a held thread later
grounds.

## The surface

`evolution.html` (open it under `npm run serve`) starts the evolution and shows the real
feedback: the body growing into the cube's sparse cells, the season turning, fitness and
void-respect, the lineage of genome edits, the ecology, and the freeze boundary. Human 👍/👎
feeds the strongest anchor; a forage button pulls diverse real material.

## The one thing that cannot evolve

The machine can revise every belief it holds and none of its values, because the fitness
function is the ground it stands on to evaluate anything at all — poured in once at the top and
frozen harder than the frozen model. That is not the flaw; it is the only place a value is safe.
A good that could be optimized would be optimized away. So:

> Evolution goes as deep as the body. Judgement stays with you. That division is not a stage of
> the design — it is the design.
