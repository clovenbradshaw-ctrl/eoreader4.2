# Unnamed referents: the gravitational read, threaded relativistically through the meaning level

**Status:** design spec + landed milestone. Companion to `docs/reading-problems-multi-source.md`
(P1 arc) and the referent-first identity work (`src/perceiver/referents/`, PR #406). Written from the
empirical investigation logged below — every claim here is reproduced on the real *Frankenstein* and
*Metamorphosis* texts.

## What landed

The whole arc below is now IMPLEMENTED. In reading order:

1. **The gravitational census** (`censusUnnamedCentres`) — rest-mass = head-dominance (a noun vs a
   substantivized adjective, via the determiner-taker discriminator), luminosity = animacy (a figure
   binds he/she satellites; a setting is a medium pronouns fly through), plus agency and recurrence.
   A person-role inhibitor keeps a bit-player ("the father", "the sailor") off the one nameless body.
2. **Fold before gate** — epithets pool onto one body (`foldUnnamedReferents`, absorbing only a
   luminosity-compatible synonym), and the star-scale test is applied to the POOLED mass. So the
   creature enters Frankenstein's cast as `creature/monster/wretch/devil`, not a scattered handful,
   and not inflated by adjectives/weather/roles.
3. **The relativistic, per-proposition, main-pass integration** (`createCentreScanner`, wired in
   `pipeline.js`) — the body is discovered up front (like the uncased read) and admitted INLINE as
   its epithets are read, a first-class coref candidate in the activation field at PROPOSITION grain.
   So its "it/he" chain binds to it by activation instead of leaking to the last-named figure: on
   *Frankenstein* the creature is the subject of ~53 of its own actions (stretched, swore, strangled,
   begged, murdered), and "Frankenstein pursued the wretch" resolves the object onto the creature.
   No retroactive second cursor — the centre is instantiated (INS) before it is bonded (CON), in
   reading order. *Metamorphosis* stays clean: the named Gregor is the local sun, so "the creature"
   is his. Full suite green.

Still open: distinct minor nameless figures are held off the protagonist by the person-role inhibitor
(a backstop), not yet separated by full coreference; and the creature's mass reported in the cast is
still its explicit-description count (its pronoun activity rides the edges, as a named figure's does).

## The thesis

A referent is never in the text. It is a **centre of mass** the mind mints to point at something
out there; a proper name, a definite description, and a pronoun are all **manifestations** of it,
none privileged. There is no "light" referent (named) and no "dark" one (unnamed) — every referent
is pointed at, and a name is merely the brightest handle one may happen to wear. (`Move 1`, landed:
the "dark referent" species was dissolved — `unnamed-referent.js`, the `kind:'dark'` tag removed,
the read reframed as ordinary reading.)

The consequence the reader must honour: **a figure with no name — Frankenstein's creature, only
ever "the creature"/"the monster"/"the wretch" and a hail of pronouns — is as present as any named
one, and must be weighed by the SAME machinery**: the activation field, the gendered pronoun
binding, the descriptor channel, the born/null admission floor. Today it is not — it is a
distributional census bolted onto `finalize()` with the coref field switched off (the retro
"second cursor" passes `staticCoref = { field: () => [] }`). That is the bug.

## The math is gravitational

You cannot see the body; you weigh it by the **bound orbit it captures**. Four measurements, each
validated on the real texts:

| quantity | astronomy | measurement | separates |
|---|---|---|---|
| **rest mass** | is it a body at all | head-dominance `asHead / (asHead + attrib)` | a NOUN (creature 0.59, wretch 0.81, devil 0.80) from an ADJECTIVE/modifier (great 0.08, old 0.07) — a substantivized adjective ("the great") is a property, not a body |
| **luminosity / binding class** | star vs dark cloud | **animacy**: fraction of appearances co-occurring with a personal pronoun (he/she/him/her) | a FIGURE that binds animate satellites (devil 1.00, creature 0.77, monster 0.70, murderer 0.74) from a SETTING pronouns fly through (sea 0.25, mountain 0.25, wind 0.18, tree 0.06) |
| **virial mass** | `M = <v²>r/G` | own agentive sightings + γ-bound captured pronouns; the coref activation field *is* the potential, its γ-decay the `1/r` falloff | a real body from an incidental one |
| **admission floor** | detection threshold | the **born/null rule** (`deriveNull`) over the mass distribution of ALL candidate description heads — chance clustering is the null; a real body spikes above it | measured floor 42.6 on *Frankenstein*: no single epithet clears it, only a pooled body does |

**Why the creature was invisible — and why the star-scale gate "worked" but was wrong.** The old
`unnamed-referent.js` gate required a single description head to reach 50% of the top named
referent's mass (floor ~45 on *Frankenstein*). The creature's mass is **scattered across epithets**
— creature (13) + monster (23) + wretch (14) + fiend + devil — each below the floor, so none
admitted. The gate was the only thing separating a protagonist from the flood (see below), but it
killed exactly the split-mass case a dark body always presents.

**Split-epithet pooling is a shared barycenter.** The epithets orbit ONE centre (one animate
pronoun chain, never distinct co-actors in a frame), so their masses **add** — the dark body
reaches star-scale as one system (~56 on *Frankenstein*, clearing the born floor 42.6). This is the
whole recovery, and it is the piece PR #406 flagged as "still ahead."

## Why the born rule fits mass but not the ratio cuts

`deriveNull` finds signal spiking above a noise floor (`mean + z·σ`). That is the right shape for
**mass** (heavy-tailed positive; few real bodies above chance) — use it for the admission floor.
It is the WRONG shape for the bounded 0..1 **ratio** discriminators (dominance, animacy): the
distributions are continua, not flat-noise-plus-spike, so `deriveNull` overshoots (it returned an
animacy floor of 1.35 — above the maximum possible value). Rest-mass and luminosity are therefore
cut with distributional thresholds; **mass** is where the born rule belongs.

## The essential correction: relativism, threaded through the meaning level

Every attempt to compute this **post-hoc** — reconstruct a global field after the main pass, then
pool — collapses. On *Frankenstein* the pooling merged 21 heads (creature, monster, wretch, father,
professor, door, cottage, ice, window, …) into one 282-mass blob. The reason is fundamental:

> **Reference resolution is relativistic.** A pronoun resolves relative to a **local frame / POV**,
> not in one absolute global field, and identity is frame-relative. The creature is the dominant
> mass in *its* frame (its chapters); "the father" is dominant in the family frame; they never
> share a frame, so they must not bridge. A reconstructed global field has no real frames — the
> dark body appears to dominate everywhere and bridges to everything.

The frame structure is exactly what the **main reading pass** carries and a post-hoc reconstruction
throws away: which referent is the local sun as the γ-window slides, whose gravity a given pronoun
falls into. The EOGraph solar surface (`src/rooms/reader/solar-system.js`) already renders this —
each entity is the sun of its own egocentric frame, POV pivots on click. The *reading* must compute
in those frames, not just draw them.

So the correction cannot be a better pooling heuristic. **Relativism must be intrinsic to the
meaning-level reading:** the unnamed centre must be a first-class candidate in the coref field
*during* the main pass, so that —

1. "the creature" **opens** a centre the first time it is pointed at (a definite, agentive,
   animate, rest-massed description with no active compatible antecedent);
2. the following "it"/"he" bind to it by activation + gender, **within the local frame**, exactly as
   they bind to any named figure;
3. "the wretch"/"the monster" **merge** into it by the same coreference every name gets — because in
   that frame the creature centre is the local sun (it dominates the FULL field, names included),
   not because "heaviest noun wins";
4. *Metamorphosis* non-fires for the right reason: there the named Gregor is the local sun, so "the
   creature" resolves to **him** — no rival centre accrues mass. (Confirmed: its description heads
   are sparse and sub-scale regardless.)

This is the dependency-order / wave-fold point made concrete: instantiate the centre (INS) **before**
the bonding pass (CON), so the fold happens once, in order, with no retroactive second cursor.

### The frame is the PROPOSITION, not the sentence

Relativism lives at the meaning level, and meaning lives in propositions. A sentence may carry two
agents in two clauses — *"Victor fled, but the creature stretched out its hand"* — with two local
frames; the "its" is zero propositions from the creature's clause and one from Victor's. Binding at
sentence grain smears the two. So the field is read and deposited at **proposition grain**: a
position `sentIdx + (clause ordinal / clause count)`, a fractional coordinate the γ kernel (a numeric
distance, `Math.pow(gamma, d)`) carries with no change. Clause spans come from the total read's own
`segmentClauses` (§3); named traces stay at integer positions; mixing is arithmetic. The local sun
is therefore the sun **of the proposition** an epithet sits in.

## Implementation path

The read stops being a `finalize()` census and becomes part of the main pass:

- **Pre-pass (up front, like `discoverUncasedReferents` / `induceCalendar`)** — census the recurring
  agentive definite-description heads and score each by rest-mass (dominance) and luminosity
  (animacy). This proposes the candidate centres; it does NOT gate hard (the born mass floor decides
  admission after the reading accrues real mass). Adjectives (low dominance) and settings (low
  animacy) never become centres, so they never pollute the field.
- **Main pass** — a candidate centre is a first-class coref trace. Description subjects open/continue
  a centre relative to the local field; pronouns bind through `fieldCompatible` as they already do;
  epithets merge when the centre is the local sun. All frame-relative, all in reading order.
- **Admission** — a centre is kept when its virial mass (own sightings + bound pronouns, pooled
  across its barycenter epithets) clears `deriveNull` over the candidate-mass null. Replaces the
  star-scale gate.
- **Retire** the retroactive second cursor (`pipeline.js` finalize) — the bonds land in reading
  order now.

Golden movement is expected and is the ontology becoming true (the creature entering the cast, its
pronoun mass re-routing off the named figures that currently absorb it). Each moved golden is to be
confirmed as a correct re-reading, not merely accepted.

## Reproduce

The investigation scripts live in the session scratchpad; the signals reproduce over the real texts
fetched per `probes/reading-diagnostic-questions.mjs`:

- head-dominance separates adjectives from nouns;
- animacy separates figures from settings;
- `deriveNull` over head masses yields the admission floor (~42.6 on *Frankenstein*);
- a global (non-relativistic) field collapses all bodies into one — the proof that frames must be
  intrinsic to the reading, not reconstructed after it.
