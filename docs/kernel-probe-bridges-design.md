# The Kernel Probe — bridge designs (pre-code)

**Status:** design, not implementation. No code changes in this doc. Follows from `docs/kernel-probe-2026-07.md`'s Probe B and Probe C findings, which found two claimed bridges — meaning as gradient descent on `D`, structure as a Fisher-metric-derived edge geometry — with no code behind them. This doc designs both, grounded in what's actually in the tree, and names falsifiers for each so they stay testable rather than becoming the numerology the original spec warns against.

**Correction to the probe report while scoping this:** `project.js`'s edge `coupling` is not the bare `e.coupling ?? 1` it looked like in isolation — tracing it back (`core/project.js:143`, `perceiver/parse/pipeline.js:690-709`, `perceiver/parse/relations.js:278-280`) shows it's already evidentially grounded: a named/certain bond couples at 1; a field-resolved pronoun or inherited subject rides a fractional weight; a one-off (non-recurrent) relation verb is discounted. That discount is a hardcoded `0.5` (`pipeline.js:706`) — a fourth "derive, don't hardcode" site, same shape as the three the probe report already named. Flagging it here so it isn't lost; it belongs on the existing fix list, not in this design.

---

## Bridge 1 — meaning as descent

### Where descent cannot go, and why

`core/enacted/loop.js`'s cursor is forward-only by construction (`step` throws on a non-increasing cursor, comment cites §5). Before designing around it, it's worth naming *why* that constraint exists, because it changes whether "descent" should touch it at all: `loop.js` is building an **append-only event log** — a trace of what the reader noticed, in the order it noticed it. That's not an attention mechanism that happens to scan forward; it's closer to a wavefunction-collapse history. You can't un-notice something at position 5 after moving to position 10 without rewriting the past, which is a different kind of operation (revision/retraction) than "which direction reduces surprise fastest." Making this loop gradient-following would conflate "where the reader's interest points" with "what has been logged as having happened" — two different things that are currently, correctly, separate.

**Recommendation: leave `loop.js`'s invariant alone.** Not because it's untouchable in principle, but because the real site for descent turns out to be somewhere else entirely, so there's no forcing function to touch it. Flagging this as the decision point from our scoping conversation: if that reasoning doesn't hold up, this is the place to push back.

### Where it can go: candidate-selection, not cursor-position

Three places in the tree already hold multiple candidate interpretations open and pick — or refuse to pick — among them, using ad hoc rules instead of a shared scoring function:

1. **`surfer/holons.js:100-109`** — the dominant-lens switch. Currently: any lens change becomes a boundary unless the run is shorter than a fixed `minLen` (flicker absorption). This is *already* on the probe report's fix list as a "derive, don't hardcode" item — but it's also literally a descent problem: at each candidate switch point, the question is "does committing to the new lens reduce surprise enough to justify a boundary, versus staying with the carried lens." That's a two-candidate comparison, not a threshold on run-length.

2. **`perceiver/structure/binding.js:212-224`** — `resolveSuperposition`. Currently binary: either `corroborates`/`predicate` decisively picks a candidate, or the result is `INDETERMINATE` and the superposition survives untouched. There's no middle: "evidence that makes candidate A meaningfully more likely than B, short of proof."

3. **`surfer/surf.js`**'s reach expansion — already reads the whole window statelessly (`readingAt(doc, c)` for every `c` in `[lo, hi]`, filtered post-hoc by `deriveNull`). The reach boundaries themselves (whether to widen forward, re-review backward, or narrow and force a local resolution) are decided elsewhere without reference to which direction would reduce total local surprise.

All three are instances of the same shape: **a small, discrete candidate set, and a choice among them that should be a genuine steepest-descent step using the machinery that already exists** (`relEntropy`/`surpriseAt`'s `bayesBits`), not a hand-set threshold.

### The mechanism

A single function, call it `descendCandidates(candidates, context)`, in `core` (alongside `surprise.js`, since it consumes `relEntropy`/`bayesBits` directly):

- For each candidate `cᵢ`, compute the resulting divergence if the reader provisionally commits to it — `relEntropy(posteriorGiven(cᵢ), prior)` (reusing the exact quantum-relative-entropy machinery, or `surpriseAt`'s `bayesBits` where the lighter-weight scalar form is what's already in scope at the call site).
- Run those scores through `deriveNull` — the **same existence gate used everywhere else in the reader** — over the candidate-score distribution itself (leave-one-out on the current best, exactly `DEF`'s pattern in `spectral.js`).
- If the best candidate clears the null: commit (a boundary, a switch, a resolved reference). If nothing clears it: **stay a superposition.** This is not a new abstention rule — it's the existing "ambivalence is a preserved output" property (`docs/segment-by-significance.md`, §0), now produced as a side effect of the same null-gate that decides existence everywhere else, rather than as a separate hand-written case.

This is deliberately not continuous-gradient machinery (no vector field, no step size) — the candidate sets here are small and discrete (which lens, which referent, which reach direction), so steepest-descent-over-a-finite-set is the right-sized tool, and it's built entirely from primitives that already exist and are already exact (`relEntropy`, `deriveNull`). Nothing new is invented; three ad hoc decision rules converge on one function.

### Falsifier

On a held-out set of currently-ambiguous cases (existing `band:'void'`/superposition instances, plus the `holons.js` flicker cases), `descendCandidates` must (a) resolve confidently where a human annotator would also confidently resolve, more often than the current threshold rules do, and (b) correctly abstain (stay superposed) on cases that are genuinely ambiguous to a human reader. If it either never resolves anything beyond what the current thresholds already catch, or it resolves confidently on cases annotators find genuinely ambiguous, the bridge has failed and should be reported as such — not patched with a tuning knob, which would just reintroduce the hardcoded-constant problem one level up.

---

## Bridge 2 — structure as compatibility-weighted coupling

### What's actually being bridged

`project.js`'s edge weight is `(log(1+fS) + log(1+tS)) · coupling · exp(-dist/τ)`. Mass (`log-count`) and recency (`τ`, already correctly derived) are settled — this bridge is only about `coupling`, the one remaining factor, and specifically about *adding* a second component to it, not replacing the recurrence-based one described above.

The quantum-information core (`vonNeumann`/`relEntropy`/`commutator`) is exact and already computes exactly the right *kind* of quantity — "how compatible are two frames/bases" — but it's walled inside `src/surfer/`, operating on ρ built from `structure-basis.js`'s per-unit operator profiles (the nine-operator Act-face activation). `project.js` never sees this.

### The mechanism

For an edge between entities A and B, build a small local ρ_A and ρ_B from each entity's own operator-profile activations (the same `operatorProfiles`/`buildDensity` pipeline `structure-basis.js` already uses, just windowed to each entity's own sightings rather than the whole document). Compute `relEntropy(ρ_A, ρ_B)` (or, if a lighter scalar is preferable at this call site, `commutator(projectorFrom(eigenLenses(ρ_A)), projectorFrom(eigenLenses(ρ_B)))`) as a **compatibility score** — low divergence / small commutator means the two entities tend to be described by the same kinds of operations (both frequently instantiated-and-bonded, say), which is a genuinely different signal from "how often do they co-occur" (mass) or "how far apart are they" (recency).

Fold this in as a second multiplicative factor on `coupling`, gated the same way the keep-floor already is — through `deriveNull` over the background of compatibility scores for the reading's edges, so a thin/noisy background (too few sightings per entity to build a stable ρ) makes the reader abstain to the current recurrence-only `coupling`, not silently multiply by an unstable number. This is the same cold-start-safe pattern `project.js`'s existing `deriveNull`-gated floor already uses — no new abstention philosophy needed.

Mechanically, this means `core/project.js` starts importing from `core/index.js`'s spectral exports (`relEntropy`/`commutator`/`buildDensity`/`eigenLenses`) — currently a boundary only `src/surfer/` and one `src/weave/longgen/field.js` caller cross. That's a within-`core` reach (both files already live in `src/core/`), not a layering violation — the wall the probe report found is a *usage* wall, not an *architectural* one, so removing it here is low-risk.

### Falsifier

On a corpus where entity-bond strength has been independently judged (or where `DEF`'s downstream group-detection accuracy can be measured), does adding the compatibility factor improve group-detection over mass × recency alone — or is it redundant with the already-existing recurrence-based `coupling`, or dominated by estimation noise (most entities have too few sightings to build a stable per-entity ρ, so the "compatibility" score is mostly measuring sample size)? If the factor doesn't move group-detection accuracy, or moves it no differently than simply lowering `alpha` on the existing floor would, report that plainly — this is the more speculative of the two bridges and has a real chance of failing that test.

### A corollary, explicitly out of scope for this pass

`solar-system.js`'s orbit renderer (`Probe C`'s finding: orbit position is a function of array index only, no mass or salience feeds it) would have a real quantity to read once this bridge exists — mass × compatibility could set orbit radius/tightness instead of ring-and-index decoration. Not proposing that here; it's a visualization change downstream of the math actually working, not a reason to build the math.

---

## Sequencing, once (if) this design is approved

The two bridges plus the already-known fix list share primitives enough that they're not independent projects:

1. **`descendCandidates`** (Bridge 1) subsumes the `holons.js` lens-switch fix that was already on the fix list — one build, not two.
2. The **acoustic.js floors**, the **median-band cluster**, and the **pipeline.js `0.5` recurrence discount** (newly found while scoping Bridge 2) are all independent, mechanical "derive via `deriveNull` instead of hardcode" fixes — cheapest to do first, and each gives a real before/after to test the capability corollary directly, the same way the τ fix already did.
3. **Bridge 2's compatibility factor** is the most speculative piece here — it's a real hypothesis with a real falsifier, but it's also the one most likely to fail its own test (estimation noise on sparse entities). Worth prototyping behind a flag and measuring before it's load-bearing anywhere.

Open decision for you: whether to greenlight Bridge 2 as an experiment (build it, measure it, possibly discard it) or leave it as a documented-but-unbuilt hypothesis and focus effort on Bridge 1 + the mechanical fix list, which have clearer payoff.
