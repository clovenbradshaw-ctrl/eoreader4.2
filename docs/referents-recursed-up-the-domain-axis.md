# Referents, recursed: the identity discoveries climbing the Domain axis

**Status:** design spec + landed primitives. Companion to `docs/unnamed-referents-relativistic.md`
(the referent work), `docs/cube.md` (the generator), and `docs/prompt-as-site.md` (the prompt
terrains). The argument is that the referent work is not a local fix to coreference but the
**Existence/Structure-row instance of a law the cube says holds at every Domain**, and a
point-by-point account of what that law predicts one row up — at Atmosphere, Lens, and Paradigm —
and therefore for reading, surfing, and prompting. Nothing here is a measured result yet; the
primitives ship behind opts, report-only, measurement-first — the honest seam at the end still binds.

Status key inside the recursion tables: ● built · ◐ instrumented / half-there · ○ new.

## What landed (primitives, behind opts, tested)

Four leaves that carry the recursion, each additive and byte-identical when its opt is off:

- **Fold-before-gate for the Lens** — `foldUnnamedFrames` in `src/surfer/surf.js`, surfaced as
  `out.unnamedFrames` under `opts.unnamedFrames`. Pools sub-null eigen-directions that share a
  barycenter (read in the same passages) and gates the POOLED mass — the creature recovery, one
  Domain up. `tests/unnamed-frame.test.js`.
- **Relativistic Atmosphere** — each anomalous window in `src/surfer/atmosphere.js` now carries its
  own **local tone**, so a document surfaces its several local keys instead of one global weather.
  `tests/atmosphere-local-tone.test.js`.
- **The append-only frame channel** — `src/surfer/frame-channel.js`:
  `proposeFrame / assertFrame / splitFrame / retractFrame` over a `foldFrames` quotient, checked by
  `evaluateFrameConvergence` with INCOMMENSURABILITY as the negative evidence (conflict defeats
  convergence, a split dominates a proposed merge, undo is a retraction). The referent trio
  (`field.js` + `evaluate.js` + `index.js`) recursed to the Lens/Paradigm grain.
  `tests/frame-channel.test.js`.
- **The steer as a re-rank** — `src/surfer/frame-rerank.js`: a pure primitive that points at the
  frame by ARRANGEMENT (selection + order, a SEG·EVA act OFF the SYN·Cultivating desert cell), with
  the fold-before-gate recovery of a scattered frame from the material itself. The grounder adopts
  it; it emits no prose. `tests/frame-rerank.test.js`.

Still ahead (deliberately, gated on measurement): the proposition-grain γ-kernel integration in the
main reading pass (D4's deepest form), wiring the frame channel and the re-rank into the live
grounder/turn pipeline, and the blind-frame membrane paralleling `src/model/blind-structure.js`.

## Measured (the frame-scatter probe)

`probes/frame-scatter.mjs` runs the three primitives over real texts (*Frankenstein*,
*Metamorphosis*, *Alice*) in the **structural significance basis** (`structure-basis.js` — operator
profiles, no embedder, the basis the column now prefers). It asserts nothing; it reports, and it
came back **mixed — which is the point.** Each measurement carries its own falsifier.

**M1 — fold-before-gate: NEGATIVE (in this basis).** Real lenses / total: 6/16 (*Frankenstein*),
4/16 (*Metamorphosis*), 6/16 (*Alice*); **unnamed frames recovered: 0 everywhere.** The operator
spectrum is steep (≈0.68, 0.21, 0.05, …) — the dominant readings clear the null individually and
the tail is too thin to pool. So in the operator basis, a frame is *not* split-mass, and
`foldUnnamedFrames` is **correctly inert** — do not wire it here. The original creature-scatter
claim was made in the MiniLM *meaning* basis; reproducing it there needs a meaning embedder and is
the outstanding measurement. Until it runs, the Lens fold stays a measured-inert primitive.

**M2 — relativistic reading: POSITIVE, and it reproduces the spec's own contrast.** Distinct local
keys per document (60-unit windows): 5 / 3 / 4. The sharp result is *Frankenstein*: its global key
"relate · interpretation" is the dominant key of **zero** local windows (99% diverge) — locally the
book reads "differentiate · structure/existence" throughout. The global reading is a diffuse signal
present everywhere and dominant nowhere: **the reconstructed-global-field pathology, reproduced** (a
body that "appears to dominate everywhere" but rules no frame). *Metamorphosis* is the control — the
most locally coherent (35% diverge, its global key *is* its dominant local key), exactly as it is
the clean non-firing case in the referent spec. **A relativistic, local-key read has real signal;
surfacing the per-window local tone (already landed) is worth wiring into the reader.**

**M3 — incommensurability: a CROSS-SOURCE signal, not a within-document one.** Within each work,
region 0 vs region 2 stays *below* the within-document baseline (0.11 vs 0.16; 0.15 vs 0.71; 0.17 vs
0.25) — one paradigm per work, commensurable, as it should be. Across works the commutator is far
larger (*Frankenstein*∦*Alice* 0.81, *Frankenstein*∦*Metamorphosis* 0.71, *Metamorphosis*∦*Alice*
0.50). So the frame channel's incommensurability conflict **fires between documents, not between
regions of one** — which says wire it into the **cross-source / crosswalk** path
(`docs/coreference-timeline.md`, multi-source corroboration), not the single-document read.

**What the measurement decides.** Wire M2 (local tone into the reader); wire M3 (the frame channel
into the cross-source crosswalk, where its conflict actually fires); **hold** M1 until a
meaning-basis run says whether a real frame is ever split-mass there. The re-rank (Track 4) is
orthogonal to all three and adoptable whenever the grounder wants it.

## The one move this document makes

`docs/cube.md` §"The recursion is the Domain axis" states the generator's own law:

> The Significance row is the Existence and Structure rows applied to stances instead of content.
> Atmosphere is the void-and-field of significance, Lens is the entity-and-link of significance,
> Paradigm is the kind-and-network of significance. Moving down the Domain axis … **is** the
> recursion, built into the generator.

The referent work lives in the Existence and Structure rows: a referent is an **Entity**
(Existence × Figure), the referent field is a **Field** (Structure × Ground), the quotient over
mentions is a **Network** (Structure × Pattern). Five things were discovered there and made to
run. If the recursion is real, each of the five is **already true one row up** — about frames, not
figures — and the significance column (`src/surfer/atmosphere.js`, the Lens/Paradigm passes in
`src/surfer/surf.js`) is where it has to show. The rest of this document is that mapping. It is
not a metaphor: the cube says the two rows are the same structure at different grains, so a
correction proven at the lower grain is a bug report against the higher one.

## The five discoveries, and their referent-row anchors

1. **A referent is a centre of mass, never in the text.** Every surface — proper name, definite
   description, pronoun — is a *manifestation*, none privileged; identity lives in the quotient
   (`field.js` `foldReferents`), not the spelling (invariants 2/3/4).
2. **There is no light vs dark referent.** The "dark referent" species was dissolved
   (`unnamed-referent.js:1-10`, commit 2acf12b): an unnamed body is as present as a named one and
   is weighed by the **same** machinery. A name is merely the brightest handle a referent wears.
3. **Weighing is gravitational, and you fold before you gate.** A body is weighed by the bound
   orbit it captures — rest-mass (head-dominance), luminosity (animacy), virial mass — not its own
   light (`censusUnnamedCentres`, `unnamed-referent.js:79`). The creature was invisible because its
   mass is **scattered across epithets** each below the star-scale gate; pooled onto one barycenter
   they clear a born/null floor (`admitUnnamedReferents` gates the POOLED mass). Fold, then gate.
4. **Resolution is relativistic; the frame is the proposition.** A pronoun resolves relative to a
   local frame/POV, not one global field; identity is frame-relative
   (`docs/unnamed-referents-relativistic.md` §"the essential correction"). Every post-hoc global
   pooling **collapses** (21 heads → one 282-mass blob) because a reconstructed field has no
   frames. Relativism must be *intrinsic to the reading*, computed in reading order, one fold — not
   a retroactive second cursor.
5. **The identity channel is append-only and defeasible.** assert / propose / split / retract, each
   carrying warrant + confidence; **conflict defeats convergence** (`evaluate.js`); undo is a
   retraction, never a rewrite (invariant 6).

## The recursion, discovery by discovery

### D1 → Lens: identity is a quotient, not a spelling — so a frame is not its thesis sentence

A Lens is currently an **eigenvector of ρ** (`core/spectral.js:180`, surfaced in
`surf.js:244-255`), which is already spelling-blind — good; that is the D1 shape by construction.
The recursion adds the missing corollary: **the frame a passage reads under is not the sentence
that states it.** A document's "argument" is a centre of mass over its readings; the thesis
sentence is one manifestation, the brightest handle, no more privileged than a name is. This is
why a Lens must never be keyed to, or admitted by, an explicit statement of it — the same way a
referent id is opaque `ref-N`, never a slug (`field.js:14-16`).

| referent row | recursed to the Lens |
|---|---|
| opaque `ref-N`, a name is one manifestation | the eigen-lens, the thesis sentence is one manifestation ● |
| `referentOf(surface)` → the quotient root | `lensOf(passage)` → which eigen-frame it reads under ○ |
| two equal strings may denote different referents | two passages that *state* the same claim may read under different frames ○ |

### D2 + D3 → the unnamed frame, and fold-before-gate

This is the load-bearing one. The Lens pass gates each eigen-frame on a **spectral null over the
eigenvalues** (`surf.js:249-252`): a lens is `real` only when its own weight beats what a random
spectrum throws up. That is exactly the **star-scale gate** the referent work proved kills the
split-mass case. A frame whose mass is **scattered** — a stance a text takes everywhere but never
concentrates into one dominant eigenvector (an evasive register spread thin across many clauses,
never a single loud one) — sits below the per-eigenvector null and is dropped, precisely as
creature/monster/wretch each sat below the per-epithet gate.

The correction recurses verbatim: **pool scattered interpretive mass onto one barycenter, then
gate the pooled body.** The `deriveNull` discipline is already the right shape for *mass* (the
Atmosphere pass uses it correctly over per-window KL, `atmosphere.js:201-208`; the born-rule fits
heavy-tailed positive mass, not bounded ratios — the referent spec's own finding). What is missing
is the **fold** before it: a step that recognizes several weak eigen-directions as manifestations
of one frame and adds their mass before the null decides admission.

And D2 names what admission then recovers: an **unnamed frame** — a tacit paradigm a text reads in
that no sentence states — is as present as a named one and must be weighed by the same born floor.
There is no "stated" vs "tacit" frame species, exactly as there is no light vs dark referent.

| referent row | recursed to Atmosphere/Lens | status |
|---|---|---|
| `censusUnnamedCentres` (rest-mass, luminosity) | a census of candidate frames by their bound orbit of readings | ○ |
| fold epithets onto one barycenter, gate the POOL | fold weak eigen-directions onto one frame, gate the pool (`foldUnnamedFrames`) | ● |
| born/null floor over candidate-mass | `deriveNull` over per-window KL (Atmosphere) / eigenvalues (Lens) | ● |
| the creature enters the cast | an unnamed frame surfaces (`out.unnamedFrames`); entering the reading proper | ◐ |

### D4 → the whole significance column is computed in the wrong basis of frames

The referent spec's central sentence — *"a reconstructed global field has no frames; the dark body
appears to dominate everywhere and bridges to everything"* — is a bug report against the
significance column as built:

- `atmosphere.js` builds one ρ over the whole document, then reads tone and departure off it
  (`atmosphereFromActivations`). It windows (`WINDOW = 5`), but a 5-sentence window is not a frame
  any more than a sentence was — it **smears two POVs** the way sentence-grain smeared *"Victor
  fled, but the creature stretched out its hand."* The spec's fix — proposition grain, a fractional
  coordinate `sentIdx + clauseOrdinal/clauseCount` — is exactly what the tone/departure read needs.
- The Lens pass diagonalizes one global ρ (`surf.js:245`). A document with a family frame that
  reads evaluative and a creature frame that reads unsettled has **two local significance suns**;
  one global ρ returns one dominant lens that reads the whole document in one key — the 282-mass
  blob, one row up.
- The Paradigm pass compares the document basis to the corpus basis **globally**
  (`paradigmReading`, `surf.js:287`), so it cannot see that the *mis-framing is local* to one
  stretch.

The relativity correction therefore cannot be a better global read; it must be **intrinsic to the
main reading pass, at proposition grain, in reading order** — the identical conclusion the referent
spec reached, and for the identical reason. The forward, POV-relative machinery already exists in
one basis: `surfer/referent-horizon.js` is an owned γ-decayed prior in the *referent* basis where
"two horizons with different histories feel different surprise — the subjectivity." The recursion
asks for the sibling in the *significance* basis: an atmosphere/lens horizon that accumulates
frame-relative, so the tone a passage reads in depends on whose gravity the reading is already in.

### D5 → the Lens/Paradigm terrain is missing its verb-set

The Paradigm site already speaks half of D5: on a measured basis-defeat it emits an **append-only
`REC_Composing_Paradigm`** carrying its `surpriseDelta`, with hysteresis so a single noisy reach
does not fire (`surf.js:331-341`; consumed by `horizon.js` re-grounding, `grow-basis.js`). That is
`retract`/`reground` in Paradigm dress. What has no channel is the rest of the referent verb-set at
the Lens grain:

- **assertFrame / proposeFrame** — "these passages read under one frame" (the Lens-grain ref-merge).
- **splitFrame** — "hold these two frames apart" (the ref-split; incommensurability is its
  negative evidence, the way a `bornOn` conflict is a referent's).
- **conflict defeats convergence** — a proposed reframe converges only when no incommensurability
  conflict, checked exactly as `evaluate.js` checks a merge against negative evidence.

`evaluate.js` is the template to copy up a row: pure over precomputed facts, verdict
`converge | conflict | held`, warrant on every emission, undo by appending.

## What it changes in reading

Reading is the Domain axis top-to-bottom (`docs/reading-levels.md`): existence → structure →
significance. The referent work makes one ordering law concrete — **instantiate the centre (INS)
before the bonding pass (CON), one fold in order, no second cursor** — and the recursion says the
significance level must obey the same law: the frame a reading rides is computed *as the reading
advances*, in the frames Level-2 carries, never reconstructed on a finalized ρ. Concretely, the
unnamed-centre-first ordering (`admitUnnamedReferents` runs in the main pass, not `finalize`) is
the pattern the atmosphere/lens read should adopt: a candidate frame is a first-class trace that
opens, binds satellite readings, and merges epithet-readings **relative to the local proposition
sun** — so a document is read in its several keys, not flattened into one.

## What it changes in surfing

`docs/cube.md` §"What this changes in surfing" already prescribes the column (Atmosphere beneath
the Lens, Paradigm above, each at its own stance grain) and it is built. The referent work supplies
the three things that make it honest:

1. **Fold-before-gate** (D3) so a diffuse-but-real frame is not gated away as noise.
2. **Proposition-grain relativity** (D4) so the surf reads local keys, not one global key.
3. **The antimatter idiom for unnamed frames** (D2). `individuation.js` types a present-but-nameless
   referent as `EMANON`/`PROTOGON` and the graph renders it as a **hollow, dashed, parenthesised,
   non-clickable** node — "present in the structure, carrying no name, never a pivot"
   (`tiered-graph.js:381-386`, `app/wiki.js:137-149`). That is the ready-made surface for an
   **unnamed Lens or Paradigm**: a frame the reading is demonstrably in, that no sentence states,
   shown as an antimatter frame — weighed, surfaced, but not offered as a named handle to pivot on.

## What it changes in prompting the model

Three concrete consequences, each with an existing anchor:

1. **Blind the frame the way `blind-structure.js` blinds the referent.** The blind-structure loop
   hands the model the opaque referent graph (`Referent7 -> Referent2 : imports`), lets it reason
   over shape, re-binds real referents on return, and gates fabricated propositions on
   *propositional continuity* — a relation among referents the input did not contain is a
   fabrication (`blind-structure.js:29-34`). Recursed: hand the model the **significance
   structure** over opaque frame-handles — which passages read under one frame, where the paradigm
   shifts — so it reasons about framing coldly without confabulating what the frame "should" mean,
   and gate a proposed reframe on the same continuity check. A **blind-frame** loop.
2. **You cannot name the atmosphere into the prompt.** `docs/prompt-as-site.md` measured the steer
   as Ground-grain prose over-represented ×10.7, inverted against the population gradient, landing
   on the **desert cell** (Cultivating) — "you cannot instruct Cultivating; you cultivate by
   arranging conditions," and the fix is "the steer becomes a re-rank of which spans get in and in
   what order, then is deleted from the prose." The referent work supplies the *why* at the
   ontology level: **the frame is an unnamed referent of the prompt.** You point at it by the
   arrangement of Figure-grain material (which spans, in which order — the barycenter), never by a
   Ground-grain sentence naming it. Writing the frame's name in the prompt is the *named-referent
   fallacy* — privileging one manifestation over the centre of mass. The re-rank *is* fold-before-
   gate for prompting: pool the spans that orbit the intended frame and let the model's reading
   mint it, rather than gating on an instruction the small model has the fewest words for and drops
   first.
3. **Key the decode per frame, as summaries already key per referent.** Cross-source summary
   prompting already runs one decode per referent in `sequential` mode so a foreign figure cannot
   be handed to the wrong namesake (`surfer/fold/summary-prompt.js`, a structural anti-fabrication
   guard). The recursion: one decode per **local frame**, so a reading made under one lens is not
   handed to the wrong paradigm — the same guard, one row up.

## Honest seam

This is a mapping argument, and mapping arguments overreach. Two guards:

- **It can come back negative.** The claim that a real frame is ever *scattered below the
  per-eigenvector null the way the creature was scattered below the per-epithet gate* is a
  measurement, not a fact — run it on labelled material before building the fold (the atmosphere
  pass already ships behind opts and defaults to the conservative reading for exactly this reason,
  `atmosphere.js:31-35`). If frames are never split-mass, D3 does not recurse and the global read
  is fine.
- **Grain discipline still binds.** Every pass named here must hold its own stance grain (Ground for
  Atmosphere — Tending/Clearing; Figure for Lens — Binding/Dissecting; Pattern for Paradigm —
  Tracing/Composing/Unraveling). Crossing grains inside the recursion is the same category error
  the diagonal forbids — do not let a Lens-grain "assertFrame" leak into the Atmosphere read.

## One line

The referent work is not about names; it is the lower-Domain proof that identity is a frame-relative
centre of mass folded in reading order and never a spelling — and the cube's recursion says that is
already the law of Atmosphere, Lens, and Paradigm, which is why the significance column must fold
before it gates, read in its local keys not one global key, carry an append-only frame channel, and
be pointed at in prompts by arrangement, never named.
