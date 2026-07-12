# The chorus of surfers — the lineup

> A chorus of surfers traverses the graph, separates the signal from the noise
> of what they find, rewards itself evolutionarily, and lets its voices build on
> each other, cooperatively.

`src/surfer/lineup/` is a holon in the surfer faculty. A *lineup* — the surfers'
word for the group waiting in the water together — of graph surfers, each a
different way of moving over the same field, cooperative and evolutionary. It
composes parts the engine already earned: the reasoning walk (`surfer/reason`),
the noise null (`core/voidnull`), the web-search gate (`turn/propose`'s posture),
and the metabolism's commons, reputation, and selection (`metabolism/`).

Everything is model-free and injected at the seams — the walk and the web search
both stub in tests and wire to the real surfaces in production — so the whole
loop is deterministic and replay-stable, save the one honestly-nondeterministic
organ, the net.

## The cast is a basis, not a bag of archetypes

"Some have ADHD, some are Type A" is a real intuition, but a hand-tuned five is a
non-orthogonal *sample*. The generative matrix is the operator set itself: the
nine operators are **Domain × Mode**, and because that set is complete (every
transformation decomposes into the nine) and minimal (none removable), the nine
pure operator-biases span the whole taste space. A *taste* is a bias over moves;
every move is a composition of the nine; so the nine pure biases are the basis and
everything else is a convex mixture.

```
                 DIFFERENTIATING   RELATING        GENERATING
                 (cut / commit)    (link / test)   (mint / reframe)
EXISTENCE          NUL voider        SIG spotter     INS seeder
STRUCTURE          SEG splitter      CON weaver      SYN synthesist
SIGNIFICANCE       DEF recorder      EVA auditor     REC reframer
```

- **Domain = phase in a line.** Existence opens (is there something to work
  with?), Structure builds (organize it), Significance closes (commit, judge, or
  reframe). A cast missing a phase cannot complete a reasoning line: no openers →
  stagnation; no closers → no committed findings → no signal.
- **Mode = character of the move.** Differentiating reduces, Relating bridges,
  Generating mints. Mode imbalance *is* the Goodhart axis: all-Generator is
  novelty with no ground, all-Differentiator is premature commitment, all-Relator
  connects without cutting or creating.

A temperament is therefore a simplex weight `w` over the nine operators, and its
**knobs are derived**, not tuned. The walk exposes four dials
(`reason/walk.js`): `gamma` (how fast the prior is forgotten), `epsilon` (how
flat a reach must get before the line is abandoned), `selfReachBudget` (how far
past the ground it reaches into the Void), and `maxSteps` (its span). The spec
does not fix these — `temperaments.js` reads them off the operator semantics,
anchored on the two presets handed down (Type A ≈ pure DEF at `selfReach 1`;
daydreamer ≈ pure REC at the deep-reach peak), and flags the mapping as the
holon's inference:

- `epsilon` rises with myopia and novelty — Existence openers and Generators quit
  a line for the next surprising thing; sustainers and closers hold it.
- `gamma` rises with Structure + Significance — builders and closers must sustain
  a line to connect and commit; Existence openers can be myopic.
- `selfReachBudget` rises with Generating × Significance, **peaking at REC** —
  reframing operates on one's own prior operations (the spiral jump); DEF and EVA
  are frame-internal, hence shallow.

The folk archetypes survive only as **labeled mixtures** (`ARCHETYPES`): `adhd =
{SIG .6, SYN .25, NUL .15}`, `typeA = {DEF .7, EVA .2, CON .1}`, and so on — the
vocabulary maps, but the runtime basis is the nine. Two gaps the matrix exposed
in the folk five are now first-class pure voices: **INS/seeder** (the only
anchor-minter — nothing else introduces new grounded entities) and **SEG/splitter**
(boundary-drawing, previously folded into the weaver).

## One surfer, one traversal

`surfer.js` binds a temperament to an injected walk and reads the committed steps
back as **findings**: the operator, the figures it touched (a stable key, because
two surfers reaching the same move over the same figures is the consensus the
chorus reads), the grade the log assigned it (`grounded` / `warranted` /
`conditional` / `idle` — never elected, read off the log), and its surprise in
bits. The walk's firewall holds: every step is reafference (`canWitness` false, by
type), so nothing the chorus commits can later witness itself.

The one subtlety is `proposeFrom`: the walk hands it the live `profile`, so it
computes each candidate's real surprise and lets taste choose only among moves
that clear the temperament's quit-threshold. Taste never steers the walk into a
spurious saturation on a boring move while a surprising one is on offer — the
field measures, taste breaks toward the personality only where the field leaves
room.

## Separating signal from noise

`signal.js` makes the cut the way the whole engine does — not a count, not a fixed
floor, but the **noise null** the findings' own bulk throws up by chance
(`core/voidnull.deriveNull`), lifted by two things a single reader cannot see:

- **Consensus** — a move independent voices each reached (they forked the same
  graph, so they did not copy each other) is corroborated. ADHD's scattered lead
  and the closer's methodical confirmation landing on the same figures is the
  strongest thing the lineup produces, and it counts even when neither voice was
  loud alone. This is the cooperative payoff.
- **Ground** — a finding an exafferent witness graded `grounded` is signal by
  provenance. Idle reaches get no such pass; they must earn it by consensus or by
  beating the null.

The noise tail is kept **with its keys** — a lead the chorus could not yet confirm
is a record, not a silence — exactly as the chorus governor keeps its silent tail.

## When to reach for the net, and what to keep

`sources.js` carries two disciplines, both borrowed:

**The gate (`needsWeb`).** `turn/propose.js`'s posture is *a sound turn never
reaches for the net* — a search fires only on a **measured void** the material
cannot close. The walk already measures it: a surfer that saturated on
*ground-covered* (it ran out of corpus-anchored moves and only reaches remained)
with an open idle lead has hit a gap the graph cannot fill. That, and only that,
earns a forage. A surfer that closed cleanly on ground asks the world nothing —
which is why the chorus does not search wastefully even though every voice can.
Emergently, the exhaustive closers (DEF, EVA) are the ones that discover the graph
is spent and reach out first.

**The commons (`createSourceCommons`).** `metabolism/commons.js`'s niche
construction — a shared store that appreciates on what proves useful and decays
what does not, evicting stale grounding rather than hoarding it. Here the store
holds **sources**, and "useful" has a sharp meaning: a source is meaningful iff
one of the chorus's **signal** findings actually used it. A foraged page that
grounded nothing the chorus kept is never contributed — it lived only in that
surfer's fork and is gone at round's end. A page that did is contributed,
**borrowable by every voice next round**, and must keep proving useful or it
decays out. So the chorus does not store everything forever: it keeps what a
signal was built on, and only while it stays load-bearing.

Sources enter a surfer's graph through the **perceiver door** (witnessed external
material, so a bond onto one can grade grounded), bonded only to the corpus
figures their text actually names — so an off-topic page bonds to nothing, is
never walked, never proves meaningful, and is evicted. The relevance filter falls
out of the admission, not a separate rule. Foraging is the **INS/anchor-minting
channel**: a Seeder-heavy voice brings back more sources when it does forage
(`fetchN` scales with INS weight), though the *decision* to forage is always the
gate's, never an appetite.

## Rewarding the voices, without silencing one

`reward.js` is the chorus's selection. Fitness resists the obvious Goodhart —
reward step count and every voice spams idle reaches — so it is **corroborated
signal per unit spend**, split among the voices that agreed on a finding, minus a
tax on the noise a voice committed. A voice that found one corroborated thing
cheaply outscores one that committed twenty leads nobody could confirm. A forage
costs spend, so a needless search lowers fitness.

Selection is a replicator on the shares — a fitter voice earns a deeper walk next
round — but against a **diversity floor applied to the nine pure operator-shares**,
as a reserved allocation (every voice gets `floor` up front, the rest distributed
by fitness) so the renormalization can never push a floored voice back under. This
is what actually keeps a voice from going extinct, and it is the precise form of
"the openers feed the builders feed the closers": Existence mints the distinctions
Structure weaves and Significance commits and reframes. The falsifier is named:
drop the floor to zero and the lineup collapses toward monoculture — measurable
(`monoculture` in the readout), not assumed away.

The **room monitor** (`metabolism/reputation.classifyRoom`) names the equilibrium
every round. Cooperation is not guaranteed by construction: the voices could
collude — corroborate each other's ungrounded reaches so everything reads as
consensus signal while nothing is anchored outside. So the reward measures the
honest external check — how much of the kept signal is anchored to witnessed
material (the corpus graded it, or a foraged source touched it) — and the
collusion falsifier fires precisely when the chorus corroborates *idle* reaches
nothing outside it backs.

## The loop

`index.js`'s `createLineup({ corpus, walk, search, … })` runs one beat as:

1. **Borrow** the sources the chorus has already proven meaningful (seeded free).
2. **Surf** a fork of the graph with each temperament.
3. **Forage** the web — only on a measured void — then re-surf the enriched graph.
4. **Separate** signal from noise across every voice.
5. **Keep** only meaningful sources; decay and evict the rest.
6. **Reward** the voices, evolve the shares against the diversity floor, and name
   the room.

Each round returns a frozen readout (the audit trail): who found what, what was
signal, the per-voice fitness and evolving shares, the room, the monoculture
index, and the source commons's level and borrowable records.

## Run

```
node --test tests/lineup.test.js
```

The suite pins the nine-operator basis and the two knob anchors, the divergence of
openers vs. closers, the signal/noise cut (consensus and ground), the search gate,
meaningful-only retention with eviction, the diversity-floor no-extinction property
(and its zero-floor falsifier), the collusion falsifier, and the whole cooperative
loop borrowing sources across rounds.
