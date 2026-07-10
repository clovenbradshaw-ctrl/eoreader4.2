# The evolutionary engine

*How a fixed weak model is carried as far as a better substrate can carry it — and how a
population holds a commons with no sovereign — stated as one design, with every falsifier named.*

This is the companion to the essay *"Something to Lose."* That essay argues the metabolism is a
self-maintenance loop under scarcity — a system that must continuously spend to stay itself. This
note is the engine underneath: the parts that make the getting-good **evolution** rather than mere
thrift, and the parts that make competition **grow an ecosystem** rather than collapse to a
monoculture. It lives in `src/metabolism/`. Every claim below is pinned by a test that fails if the
mechanism is decorative; the tests are the argument, and they are cited inline.

---

## 1. The reframe: the editor and the author

Selection is real, but it is only an **editor**. It does not create anything — it edits what
variation, cooperation, and habitat-building produce. "Survival of the fittest" is Spencer's phrase,
not Darwin's mechanism; a design that builds the editor alone optimizes straight to a brittle
monoculture — the cod collapse, not a living system. So the engine keeps selection but **demotes it
to one force among several**, and brings the author: preserved variation, cooperation, merger, and a
habitat the population builds rather than only fights over.

The single decision that carries most of this: **the shared pool is not only a resource to consume
but a habitat to build.** Consumption-only is zero-sum, and zero-sum is where the gladiatorial
picture comes from. Every large step in real evolution was the opposite — a cooperative merger
(endosymbiosis, multicellularity, eusociality). `scarcity.js` is the pool's *depleting* face;
`commons.js` is its *appreciating* face. The difference between the two faces is the difference
between an arena and an ecosystem, and between an enclosure and a commons.

## 2. The fixed order: substrate → governance → competition

The many-turn analysis inverts the tempting build order. Identity, memory, mutual attention, and an
open horizon are not a detail bolted onto a tournament — they are the **preconditions** for any of
the rest to produce cooperation rather than collusion or predation. So they are the system, built
**first**. Building competition first guarantees the collusion room: without the substrate you cannot
even tell a collusive monoculture from success, because you have nothing to measure the difference
with. The order is not a preference; it is fixed by the theory.

```
  scarcity ── genome ── fitness ── select        the four evolutionary parts (Something to Lose)
      │         │          │         │
      └─────────┴──── population ────┘            the competitive ecology (relative, virtual)
                          │
                lift  ·  judge                    the OBJECTIVE and the ENVIRONMENT
                          │
        horizon · reputation                      the SUBSTRATE (built first in theory, the precondition)
                          │
            commons · demes                       the HABITAT the population builds, and the accountant
```

---

## 3. The layers, each with its falsifier

### 3.1 The pressure — `scarcity.js`
The external constraint the whole faculty answers to: a single energy currency the five resources
(model, tokens, time, fetch, storage) convert into, a per-period budget, and a lean-season regime
that periodically starves. Plenty is deliberately inert (nothing is forced); scarcity must come from
outside. *Falsifier* — `metabolism.test.js :: "scarcity: plenty is inert; a lean regime periodically
starves"`: a seasonal regime must reach famine **and** plenty (the slack exploration needs), and the
model call must be the costliest act.

### 3.2 Variation — `genome.js`
The allocation parameters, made a heritable genotype, with **REC** as the mutation operator:
directed by the strain that forced it, bounded, logged, and reversible (`revert` toward the
default). No RNG — the direction comes from the break, so a replayed log reproduces the same
lineage. *Falsifier* — `metabolism.test.js :: "genome: defaults equal today, mutation is bounded +
directed, and stays REC-reachable"`: a `fetch` strain relieves the forage gene; no mutation escapes
`[min,max]`; any gene can be pulled back toward its default (the path-dependence escape).

### 3.3 The signal, and the objective — `fitness.js`, `lift.js`
`fitness.js` is quality per unit resource, with two Goodhart defenses: coverage (claiming less
shrinks the numerator) and an **un-authored anchor** (part of fitness must rest on something the
system cannot author; absent it, fitness is honestly `provisional`). *Falsifier* —
`metabolism.test.js :: "fitness: quality per resource, coverage guards Goodhart, external anchor
tethers it"`.

`lift.js` is the objective stated so it **only rewards what can improve**. Three things produce an
answer — the surfer (the organism), the frozen local model (fixed physics), the frontier judge (the
environment) — and only the surfer evolves. So fitness is a **lift, not a level**:

> `lift = quality(surfer + frozen model) − quality(frozen model bare)`, per unit resource.

Subtracting the bare model removes what evolution cannot change. And the one hard falsifier that
separates "the surfer got better" from "the prompt got tuned" is **transfer across frozen models**: a
genuine gain lifts a *second, different* frozen leaf too; a prompt hack only helps the one it was
shaped against, so its kept fitness (the weaker of the two lifts) collapses to ~0 and it is filtered —
the prompt leashes itself. *Falsifiers* — `lift.test.js`: `"lift subtracts the model out"`, `"FALSIFIER
— transfer across frozen models"`, `"lift per resource"`, `"dual economy — the cheap proxy re-anchors
toward the expensive judge"`, and `"liftWorld — the ecology optimizes lift-not-level with no change to
population.js"` (it plugs into the ecology's injectable `world`).

### 3.4 Selection — `select.js`, `population.js`
`select.js` is the single-lineage tournament: a challenger inherits only by beating the champion by a
margin over more than one lucky turn (hysteresis), and exploration is gated on slack (no exploring in
famine). *Falsifiers* — `metabolism.test.js :: "selection: a challenger inherits only by beating the
champion"` and `"the slack guard forbids exploration under famine"`.

`population.js` makes selection **relative**: many virtual systems compete for one scarce shared
pool, filtered by exclusion (the wasteful genome dies because the budget will not feed it). The
competitors are virtual — only the champion runs for real, calibrating a world-model the rest are
evaluated against — so genome-space is searched without A/B-ing every mutation on expensive real
turns. It also protects a **neutral-variation reservoir** (Kimura): the most genome-distant variants
survive the cull even when low-energy, so directed REC keeps a base to escape local optima from
(deterministic, replay-stable). *Falsifiers* — `metabolism.test.js :: "population: a competitive
ecology sustains life and promotes a fitter genome"`, `"determinism: a replayed run reproduces the
same evolutionary lineage"`, and `judge-access.test.js :: "the neutral reservoir preserves standing
variation the greedy cull would burn"`.

### 3.5 The environment — `judge.js`
A stronger external model (Claude) is the un-authored anchor, and its access is split on the EO line
between the two objects it grades:

- **Faithfulness to source is the phenomenon** — finite, held, decidable. The judge is a **hard
  oracle** holding the **full document**, because certifying a *refusal* is a claim about the whole
  source (you confirm an absence only by seeing everything), and because lift's subtraction needs a
  stable, complete reference or it turns to noise. Blinding the judge here adds error, not humility.
- **Interpretation is the noumenon** — held by no finite process, the judge included. Here it is a
  glass box: a **defeasible, cite-or-veto panel** whose disagreement is kept as signal, never one
  gold ruling from a confabulating oracle. The Red Queen target moves by **rotating anchored
  judges**, not by blinding them — moving, but every position stays true.

*Falsifiers* — `judge-access.test.js`: `"faithfulness is a HARD ORACLE — the judge holds the full
document"`, `"meaning is DEFEASIBLE — cite-or-veto"`, `"the interpretation PANEL keeps disagreement as
signal"`, `"rotation moves the target while every position stays TRUE"`. And the judge is budgeted and
gated so wiring it up can never run away with the API (`metabolism.test.js :: "judge: … gating stays
honest"`, `"its own API budget caps spend"`).

**The firewall (proposer ≠ disposer).** The judge **scores but never authors a weight**. It sets the
target, holds the source, scores the lift — and exerts force *only through selection* (killing and
feeding), never by editing. Variation is REC in the surfer's own hand, from its own logged strain; a
little neutral noise underneath for the ridge directed REC cannot see. Fuse proposer and disposer and
you get reward-hacking in one direction or drift in the other; split them and you get evolution.
*Falsifier* — `judge-access.test.js :: "FIREWALL — the judge scores but never authors a weight; every
genome edit is REC"`.

### 3.6 The substrate — `horizon.js`, `reputation.js`
The precondition layer. A repeated game holds cooperation only under the **shadow of the future**, so
the endgame is **engineered away, not hoped away**: `horizon.js` is a probabilistic continuation with
no `lastRound()` to call — a hazard deterministic in `(id, period, seed)` only, hidden from the player
but determined for the record, so no genome can backward-induct from an end it cannot find.
`reputation.js` carries identity, memory, **SIG recognition + assortment**, **tit-for-tat with
forgiveness**, and the **room monitor**. *Falsifiers* — `substrate.test.js`:

| claim | test | assertion |
|---|---|---|
| the endgame is unreachable | `"the horizon is structurally HIDDEN"` | no `lastRound`; the hazard rate matches δ; the `knownHorizon` control does expose it |
| the shadow of the future | `"a hidden horizon sustains the cooperation a known horizon unravels"` | hidden → coop ≥ 0.9; known (computable) → coop ≤ 0.2 |
| forgiveness is load-bearing | `"forgiveness recovers from a single error; grim reciprocity locks"` | one stochastic slip: forgiving recovers, grim locks into mutual defection |
| assortment decides invasion | `"SIG recognition lets cooperators resist invasion; blind, defectors feed"` | with recognition cooperators out-earn invaders; blind, the advantage collapses |
| reputation is earned | `"reputation is earned, not declared"` | optimistic prior, but a pure defector reveals itself to 0 standing |

### 3.7 The habitat — `commons.js`, `demes.js`
`commons.js` is niche construction (Odling-Smee & Laland): a genome that grounds a claim contributes
it to a shared, appreciating store; a later turn on the same topic is subsidized — cheaper to ground,
higher lift. What the population builds becomes the habitat the next cohort is selected in
(ecological inheritance), and it **decays unless rebuilt** (a maintained difference).

`demes.js` is multi-level selection (D.S. Wilson), the accountant that makes contributing *pay*.
Contributing bears a private cost for a shared benefit, so within one group a free-rider wins;
partition into demes and let a deme's productivity (the commons its members built) weight
reproduction, and **altruism that loses within every group wins between them** — Simpson's paradox,
the principled parasite cure, no moralizing, only the nested structure. *Falsifiers* —
`commons.test.js`: `"niche construction — an enriched topic subsidizes later turns"`, `"ecological
inheritance + a maintained difference"`, the two **compositions** — `"niche construction RAISES lift"`
and `"the room monitor catches a STARVED commons even under high social cooperation"` — and `"FALSIFIER
— multi-level selection: altruism that loses within every deme wins between them (Simpson)"`.

### 3.8 The outward record — `persist.js`
Heritability's outward face: **genome edits only**, hash-chained into a tamper-evident ledger and
(when armed) committed to a permanent archive. DNA only — no document, question, or answer can enter
a block — and gated (dry-run by default; a permanent public write is a deliberate act). *Falsifiers* —
`metabolism.test.js :: "persist: only genome edits, DNA only, hash-chained, gated"` and `"chain head
survives across sessions"`.

---

## 4. The epistemic stance: measure, don't prove

The folk theorem is the honest, uncomfortable center. Cooperation is **reachable but not selected**:
stable predation and stable collusion are equilibria of the *same* repeated game. So this system
**cannot be shown good by construction.** You can prove it is *capable* of cooperation; you cannot
prove it *will* cooperate. The only way to know which room the population walked into is to
instrument it and look — which is why the substrate carries `classifyRoom` / `isWrongRoom`, and why
`demes.js` exposes selection strength as a knob (`lambda`) rather than a theorem: at `lambda = 0` the
free-rider wins, and that is not a warning in a comment but an **assertion that passes** — the tragedy
is a real equilibrium of this code. Both rooms live in the same module; which one you get is a fact
about initial conditions (`lambda`, the deme structure, the horizon's δ), read off the monitor every
run.

**Collusion is the subtle room.** The members can cooperate *with each other* beautifully while
gaming the judge — high internal cooperation with low external validation is not success, it is the
wrong room wearing success's face. Cooperation requires **both**: they held the commons *and* the
output survived the outside. *Falsifier* — `substrate.test.js :: "the ROOM MONITOR names which
equilibrium the population walked into"`, and the composition `commons.test.js :: "the room monitor
catches a STARVED commons even under high social cooperation"`.

---

## 5. The civic register: the machine as the argument

Everything above is the same claim the reporting makes, in formal dress. The tragedy of the commons
is not a law of nature; it is the **one-shot special case** — Hardin universalized a corner solution.
Real commons are repeated games, and in a repeated game cooperation is not virtue imposed from
outside but the **rational equilibrium** that emerges when players are known, remembered, and
expecting to meet again (Ostrom's empirical finding, derived from the incentives). Enclosure and the
Leviathan referee are the two responses that make sense **only if you believe the one-shot story**.

Build the reputation substrate and the open horizon, and the third path is not idealism — it is what
the math gives you once the game is allowed to repeat. So the machine is a **working model of the
civic claim.** The Simpson's-paradox test is the existence proof in miniature: a contribution that
loses in every local market wins overall *once the structure is nested* — which is exactly Ostrom's
principle 8, the nested-enterprise principle, realized as multi-level demes. If a population of
genomes can hold a commons without an oracle and without an enclosure — purely on identity, memory,
and the shadow of the future — that is a small, artificial, real existence proof for the thing the
journalism asserts about people and their cities. The surveillance state and the extractive
partnership are one-shot architectures, built as if there were no tomorrow to answer to. The commons
is the many-turn architecture. **The failure mode of the design and the failure mode of the city are
the same failure mode — and so is the fix.**

---

## 6. Ledger: built and falsified

| mechanism | module | biology | named falsifier (test) |
|---|---|---|---|
| directed, reversible variation | `genome.js` | REC / facilitated variation | genome: bounded + directed + REC-reachable |
| lift-not-level objective | `lift.js` | isolate the axis that evolves | lift subtracts the model; **transfer across frozen models** |
| relative selection (virtual ecology) | `population.js` | competition under carrying capacity | ecology sustains + promotes; determinism |
| neutral reservoir | `population.js` | Kimura neutral theory | reservoir preserves standing variation |
| hard-oracle faithfulness | `judge.js` | phenomenon (decidable) | judge holds the full document |
| defeasible interpretation | `judge.js` | noumenon (glass box) | cite-or-veto; panel keeps dissent; rotation |
| proposer ≠ disposer | `judge.js` / `genome.js` | the Significance triad | firewall: every genome edit is REC |
| hidden horizon | `horizon.js` | shadow of the future | hidden sustains what a known horizon unravels |
| forgiving reciprocity | `reputation.js` | generous tit-for-tat | forgiveness recovers; grim locks |
| SIG recognition + assortment | `reputation.js` | assortment resists invasion | recognition lets cooperators resist invasion |
| the room monitor | `reputation.js` | folk theorem (measure) | names predation / collusion / cooperation |
| niche construction | `commons.js` | Odling-Smee & Laland | enriched topic subsidizes; raises lift |
| multi-level selection | `demes.js` | D.S. Wilson | **Simpson's paradox** (loses within, wins between) |
| DNA-only provenance | `persist.js` | heritable, tamper-evident record | DNA only, hash-chained, gated |

## 7. Designed, not yet built (each with the falsifier it will need)

The extended-synthesis design names more author-side machinery than is yet in the code. Named here so
the gaps are legible, not implied away:

- **Merger / symbiosis** (Margulis; the major transitions) — two *holons* fusing into a composite
  selected as a unit (endosymbiosis), which is stronger than gene-level crossover. *Falsifier:* a
  merged forager+generator out-survives its two parents run apart on a stream that needs both.
- **Crossover / recombination** — one genome's forage module spliced with another's generation
  module. *Falsifier:* a spliced child of two viable parents is viable (modularity holds).
- **Phenotypic plasticity** (West-Eberhard) — a genome as a reaction norm, lean-season and abundance
  behavior in one organism. *Falsifier:* one plastic genome across regimes beats a zoo of rigid
  specialists at lower upkeep.
- **Frequency-dependent fitness** — reward being *different*, not only better (rock-paper-scissors).
  *Falsifier:* a rare niche out-scores the same genome when common.
- **The prompt-language gene** — the prompt handed to the small model as a heritable, LLM-suggestable
  allele. *Falsifier:* a prompt gain that survives the **transfer test** (§3.3) is kept; an overfit
  one is filtered — the leash is already built, the gene is not.
- **Horizontal gene transfer** — a successful gene spreading between genomes (contagion), not only by
  descent. *Falsifier:* a beneficial allele reaches non-descendants faster than vertical inheritance
  alone would carry it.
- **A non-stationary, coevolving arena** (Van Valen) — a task stream whose difficulty drifts with the
  population's competence, so there is no fixed peak to converge on. (`scarcity.js` already makes the
  *budget* non-stationary; the *task* is not yet.) *Falsifier:* diversity stays rewarded and the
  champion keeps changing while the arena drifts; freeze it and the population converges.

## 8. How this ports up into the governance spec

The engine and the Ostrom layer are two materials for one design. The mapping is direct: the
**shadow of the future** (`horizon.js`) is why the repeated game escapes the one-shot tragedy;
**recognition + memory** (`reputation.js`) are boundaries and monitoring (Ostrom principles 1–4);
**forgiving reciprocity** is graduated sanctions (principle 5); **multi-level demes** (`demes.js`) are
nested enterprises (principle 8); the **commons** (`commons.js`) is the co-constructed resource
itself; and the **room monitor** is the empirical instrument that keeps the whole claim honest —
because the folk theorem forbids proving goodness by construction, the spec must ship its falsifiers
and be measured every run. That is the through-line: keep selection, since scarcity and competition
are real forces, but demote it to one force among several inside a system whose creativity lives in
preserved variation, cooperation, merger, and a habitat the population builds rather than only fights
over.
