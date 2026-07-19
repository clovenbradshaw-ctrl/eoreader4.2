# The Kernel Probe — Findings

**Status:** completed investigation. Every claim below is anchored to a file:line citation gathered by direct code reading (not inferred from docs or comments alone, except where explicitly noted as "doc-only"). Where the spec's falsifier fired, it is reported as fired — the elegant reading is not defended over the honest one.

**One-line verdict:** the theory is **half right**. There is a real, exact, three-primitive quantum-information core (`vonNeumann`, `relEntropy`, `commutator`) that behaves exactly as advertised — but it is a walled garden used only inside `src/surfer/`. The engine's actual workhorse — the thing that runs everywhere, `deriveNull`/`boundedNull` — is a different mathematical object (extreme-value order statistics, not `D_KL`), related to relative entropy only by family resemblance (both are "does this beat a null"), not by shared formula. The three-orders claim (existence = 0th, meaning = 1st, structure = 2nd) is **confirmed at 0th order and falsified at 1st and 2nd**: the meaning-face "cursor" is a hardcoded forward scan with a threshold gate, not gradient descent on anything, and the structure-face edge geometry (`project.js`) never touches the ρ/Fisher machinery (`spectral.js`) — the two subsystems don't import each other. The gravity seam is real but worse than feared: "gravity" names four independent, uncoupled mechanisms, one of which (the EOGraph orbit renderer) is pure array-index decoration with no mass term at all. The basis question and the capability corollary fare better — the operator-space basis is a genuine, well-reasoned replacement for the embedding basis, and one of the three named "reinventions" (the τ hardcoding) already has a real, in-the-wild before/after that confirms the capability corollary directly.

---

## §1 Inventory — site verification

All seven sites named in the spec exist and were read in full.

| # | Site | Verified form |
|---|---|---|
| 1 | `src/core/voidnull.js` `deriveNull`/`boundedNull`/`extremeValueZ` | Real extreme-value statistics: `z = Φ⁻¹((1−α)^(1/N))` solving `Φ(z)^N = 1−α`, then `μ + zσ` (or its log-scale lognormal form). "Born rule" is a naming/branding choice — there is no `\|ψ\|²` anywhere in the file. |
| 2 | `src/core/spectral.js` `buildDensity`/`eigenLenses`/`DEF` | `buildDensity` and `eigenLenses` are **exact**: `ρ = Σₖ wₖsₖ\|vₖ⟩⟨vₖ\|` (trace-normalized), ranked by eigenvalue. `DEF` is a gap-elbow detector gated by `deriveNull` on the log scale — structural, not literal entropy. |
| 3 | `src/core/index.js` → `vonNeumann`, `relEntropy`, `commutator`, `projectorFrom` | **All four exact.** `vonNeumann = −Σλ ln λ`. `relEntropy(ρ,σ) = Tr(ρ ln ρ) − Tr(ρ ln σ)` (quantum/Umegaki relative entropy — the operator generalization of KL). `commutator = ‖AB−BA‖_F`. `projectorFrom = Σ\|v⟩⟨v\|`. |
| 4 | `src/core/project.js` edge weight, ~line 288 | `base = (log(1+fS)+log(1+tS))·coupling`, `weight = base·exp(−dist/τ)`, `τ = mean(edge distances)`. Real and derived, but τ itself is a plain arithmetic mean — **not** gated by `deriveNull`. Only the optional keep-floor (`edge_floor:'born'`) genuinely calls `deriveNull`. |
| 5 | `src/core/surprise.js` `NOVELTY_RESERVE`/`Z`/`predBits` | **Exact.** `Z = Σmass + novelty` is a literal partition function; `predBits = Σₐ mₐ·(−log₂pₐ)` is literal mass-weighted cross-entropy; `surpriseAt`'s `bayesBits` is a literal `D_KL(posterior‖prior)` in bits. |
| 6 | `src/surfer/structure-basis.js` operator-space basis | Confirmed directly by source comment: ρ used to be built over a 27-cell MiniLM-cosine projection ("imported the distributional theory of meaning... the LLM bet EOreader4 exists to refute") and now over the nine-operator Act-face profile. |
| 7 | `src/perceiver/text/waveform.js` / `audio/waveform.js` | Confirmed. Both funnel a modality-specific signal through the same core primitive `boundedNull` — text calls it directly on subject-position shares; audio calls it one level down, inside `deriveClusterRadius`, on cosine distances between log-band-energy frames. |

Nothing in the inventory is fabricated or missing. The divergence from the spec's framing starts at Probe A.

---

## §2 Probe A — is there one divergence?

Rewriting each site as `D(p‖q)`:

- **Exact.** Site 3 (`vonNeumann`, `relEntropy`, `commutator`, `projectorFrom`) and Site 5 (`surprise.js`'s `Z`, `predBits`, `bayesBits`) are literally `D` or its direct building blocks (`−Σp log p`, `Σp log(p/q)`). Site 2's `buildDensity`/`eigenLenses` are the exact 0th-order object (a genuine probability distribution over eigenstates).
- **Structural.** Site 1 (`deriveNull` family) is a monotone-in-spirit cousin — "does this exceed a threshold derived from a null population" — but it is computed as a Gaussian/lognormal tail bound (`μ+zσ`), not as a likelihood ratio or KL divergence. It shares zeros and ordering with a one-sample `D` test but is not one in the code. Site 4's edge weight (`log(1+fS)+log(1+tS)`, `exp(−dist/τ)`) is a plain bilinear-log-mass interaction kernel — structural in the same loose sense, not `D` itself.
- **Cosmetic.** The "Born rule" branding applied to `deriveNull`/`boundedNull`/the edge-weight's τ derivation is naming, not math: none of these compute an amplitude, a squared overlap, or a probability-ratio anywhere in their bodies. The word choice is deliberate and well-motivated in the comments (§0's own three-order framing, `voidnull.js:17-21`) but it is advertising a kinship the code doesn't literally implement at that site.

**Finding — a real fault line, not a spectrum.** The codebase contains two genuinely different mathematical families wearing overlapping vocabulary:

1. **The quantum-information core** (`vonNeumann`/`relEntropy`/`commutator`/`projectorFrom`, `src/core/spectral.js` + `src/core/index.js`) — exact, literal, and used *exclusively* inside `src/surfer/` (plus one caller in `src/weave/longgen/field.js`). No file in `src/perceiver`, `src/enactor`, `src/organs`, or `src/model` imports any of these four functions.
2. **The extreme-value-null core** (`deriveNull`/`boundedNull`/`extremeValueZ`, `src/core/voidnull.js`) — the actual workhorse, called from `project.js`, `individuation.js`, `stance.js`, `surf.js`, `gate.js`, both `waveform.js` perceivers, and dozens more. This is order statistics (max-of-N tail bound), not relative entropy.

These two families never merge into one functional in the code. `project.js` (family 2) never imports `spectral.js` (family 1); the reverse is also true. **This is Probe A's falsifier firing on a subset of sites** — not all seven reduce to one shared `D`. The honest report: the reader has *one exact D-based subsystem* (real, small, powerful, walled off in `surfer/`) and *one much larger extreme-value-statistics subsystem* (the actual "null-gated" backbone everywhere else) that is motivated by the same philosophy but is not the same formula. "One divergence" is true of a labeled subset of the reader, not of the reader.

One genuine, unflagged structural echo worth noting: `src/perceiver/individuation.js`'s `salienceOf = log(1+mass) + log(1+rho)` and `src/core/project.js`'s edge `base = log(1+fS) + log(1+tS)` are the *same functional form* — both are "sum of log(1+count)," i.e. joint self-information of two independent counts. That's a real, narrow unification inside family 2, just not the grand one the spec proposes.

---

## §3 Probe B — the three-orders claim

**0th order (existence) — CONFIRMED.** `deriveNull`/`boundedNull` (`voidnull.js:113-149, 219-222`) are pure functions of a flat array of scores — mean, std, quantile, extreme-value z. No gradient, no direction, no metric appears anywhere in their signature or body. Every existence-gating decision traced (edge-keep floor, agency line, cluster radius, group count via `DEF`) reduces to this same shape.

**1st order (meaning as gradient descent on D) — FALSIFIED.**
- `src/weave/write/idle.js:104`'s `quiesce = rec < medianBand` looks like a stationary-point test, but `rec` is not computed in `idle.js` at all — it's a field on an *injected* `surf(...)` callback (`idle.js:72`), and no real implementation of that callback was found wired into `createIdleLoop` anywhere in `src/`. The gradient-descent claim for this site is unverifiable because the module it depends on isn't instantiated in the tree.
- `src/core/enacted/loop.js`'s cursor (`step`/`runTo`, lines 396-458) is a **strictly monotonic integer scan** — `step` throws if the cursor doesn't increase — driven by `units.map((_, c) => readingAt(doc, c))` and `runTo(units.length - 1)` at the call site (`src/enactor/enact/index.js:59-71`). The cursor is the sentence's array index, walked start to end. The KL scalar (`readings[c].bayes`) is used only as a threshold test (`if (s > impulseNow()) rec(...)`) at each fixed stop — never as a step direction.
- `src/surfer/surf.js:59-62` confirms this in its own comment: "the field is stateless in the cursor, so it can be read anywhere" — an exhaustive linear scan over a fixed range, filtered post-hoc by `deriveNull`, not a descent toward anything.

**Conclusion:** the meaning-face is a hardcoded document-order scan with a Born-derived arrest/stop rule. KL is real and computed at each stop, but nothing in the code moves the cursor in the direction that reduces it. This is not yet 1st-order math — it's exactly the "reinvention that should route through the kernel" the spec's own methodology anticipated as a possible outcome (§3).

**2nd order (structure as Fisher/Hessian) — FALSIFIED.** A repo-wide search for `Fisher`, `hessian`, `curvature` returns nothing but an unrelated Fisher–Yates shuffle comment. `src/core/project.js` (the edge-weight/structure-face code) never imports `src/core/spectral.js` (the ρ/relEntropy/commutator code), and the reverse is also true — confirmed by direct grep of both files for each other's exports. The edge weight is a plain bilinear-log-mass × exponential-decay kernel; it is not derived from, tested against, or even referenced alongside ρ anywhere. There is no code computing a local quadratic approximation to `D` near coincidence, and no path from ρ's eigenstructure to the graph's edge geometry.

**Net for Probe B:** the three faces are not three orders of one functional. Existence genuinely is 0th-order math. Meaning and structure are their own, separate mechanisms — a scan-and-threshold and a log-mass interaction kernel, respectively — that happen to sit under the same "null-gated" philosophy but do not derive from a shared potential. Per the spec's own instruction: report this as the weaker result rather than forcing the expansion.

---

## §4 Probe C — the gravity/relativity seam

**"Gravity" is not one thing in this codebase — it is four.**

1. **`src/rooms/reader/solar-system.js`** — the literal "EOGraph gravity well" the spec names. Its orbit mechanics (`rx`, `phase`, `omega`, lines 96-104) are functions of **array index and ring number only** — no `salience`, `mass`, or `weight` value from any claim feeds the computation. It is an SVG animation metaphor, not a force or curvature derived from anything the reader measured.
2. **`src/perceiver/individuation.js`**'s `salienceOf = log(1+mass) + log(1+rho)` (line 92-93) — a real, Born-gated admission heuristic that even reuses the word "orbited" (`orbited = rho >= gates.rnull`, line 109) — genuinely mass-derived, but operates on referents, not claims, and never calls or is called by `solar-system.js`.
3. **`src/weave/write/gravity.js`** — a third, unrelated sense: rhetorical "weight of the turn," weighting REC turns by Bayesian-surprise margin.
4. **Pure prose metaphor** — `src/wiki/absence.js:58`, `src/wiki/terrains.js:104`, `src/core/cube.js:32` all use "gravity well" as shorthand for "the densest cube cell," with zero associated computation.

These four share the English word and nothing else — no formula, no null, no data structure connects them. Combined with Probe B's finding that `project.js` and `spectral.js` are disjoint subsystems, this is worse than the spec's feared outcome: it isn't that Gravity-A's source and Gravity-B's curvature use *different* metrics (the "cosmetic" case the spec's falsifier anticipated) — Gravity-B (`solar-system.js`) has **no metric at all**. **Falsifier fires as written**: the gravity language is cosmetic across the interaction (`project.js`) and well (`solar-system.js`) faces, and the debt is real and unpaid.

**τ, however, is genuinely well-built and confirms the more interesting half of Probe C.** `project.js:282-319`'s comment states directly: a fixed decay constant (`γ=0.7`/sentence) drove a 1242-line document's edge field to `~1e-193` (underflow, one live edge survived). The fix — deriving `τ` as the reading's own mean edge-distance so `exp(−dist/τ)` stays O(1) "whatever its length" — is exactly a conformal/self-rescaling move, not a fixed screening length. This is the spec's own preferred answer to measurement C.1, confirmed directly in the code and its comment. Note: the referenced `docs/born-edge-weight.md` does not exist in the repo — a dangling citation, and the bug itself lives only as an in-code comment, not in git history (`git log --all` for "1242"/"1e-193"/"tau underflow" returns nothing) or any separate doc.

Measurement C.2 (is log-mass a gradient of endpoint entropies, an entropic-gravity/Verlinde-style test) and C.3 (does edge-weight geodesic distance on a Fisher metric recovered from ρ reproduce the exp(−dist/τ) falloff) are **untested** — no code anywhere attempts either computation, and given Probe B's finding that `project.js` and `spectral.js` don't share a derivation path, C.3 in particular has no substrate to test against. These remain open, not confirmed and not refuted.

---

## §5 Probe D — the basis question

**Operator-space basis is real and well-reasoned, but coexists with the embedding basis rather than having replaced it.** `structure-basis.js`'s header states plainly that ρ used to be built over 27-cell MiniLM-cosine projection and is now built over the nine-operator Act-face profile, explicitly framing the embedding basis as "now rightly a VOX/surface organ" (`structure-basis.js:1-17`). But that MiniLM-cosine basis is still live and load-bearing in `src/surfer/atmosphere.js:40-44` ("The load-bearing basis (Track A)... ρ's eigenvectors are FRAMES, not topic clusters") for a different pass (departure-tracking) than `structure-basis.js`'s structural-significance column. Two bases coexist for two purposes; "the basis moved" is true for one column, not for the whole reader.

**`commutator()` is a real frame-compatibility test, functionally close to a pointer-basis check — but the codebase never uses decoherence/einselection vocabulary.** Confirmed call sites: `surf.js:305-307` (document ρ's top eigenbasis vs corpus σ's, baselined against splitting the document itself in half), `frame-channel.js:36-45` (two readings' projectors vs the pooled material's own halves), `structure-basis.js:158-161` (two documents' operational bases). All are genuine "do these two frames commute, gated against a within-document baseline" tests — exactly the shape of a robustness/pointer-basis check. But a repo-wide search for "einselection" or "pointer basis" turns up exactly one hit: a bare bibliography citation to Zurek 2003 in `docs/eo-wiki.md`, never connected in prose or code to `commutator()`. The analogy is apt as an outside reading of the code; it is not a term the codebase itself claims.

**A direct side-by-side entropy/trace comparison across the embedding basis and the operator basis for the same document was not found** — only the indirect commutator-based incommensurability test exists, and that's between reading-vs-corpus or reading-vs-reading within one basis, not basis-vs-basis for one reading.

**Ambivalence-holding is real and extensively confirmed** — `band:'void'` (held-open reads, `fold/substrate.js`, `fold/deep-reading.js`), `same_as?` (a cross-source identity proposal held as a question, `organs/in/composite.js:124`, `core/asterisk.js:171`), a full `superposition`/`resolveSuperposition` mechanism in `perceiver/structure/binding.js:124-224` that explicitly documents "a superposition rules NOTHING out," and the `carry` idiom in `holons.js:88-98` (a unit with no cast keeps the previous lens rather than forcing a boundary). This part of Probe D holds up well: the reader genuinely refuses to collapse in several distinct, well-documented places, consistent with holding ambivalence where frames don't commute — though no code was found that explicitly correlates a *high commutator norm* with *where* the reader chooses `band:'void'`; the two mechanisms exist in parallel, not demonstrably wired together.

---

## §6 Probe E — the scale question

**The grain ladder is a stated design goal, not yet a built fact.** `docs/segment-by-significance.md` is explicit about this itself: "The plan is therefore not to write a segmenter — it is to name the one that exists" (lines 63-67), proposing a not-yet-written `core/segment.js` exporting `segmentBySignificance`. That function and file **do not exist** — confirmed by `find` and by grep for callers, both empty.

What *does* exist: the underlying primitives (`deriveNull`, `buildDensity`→`eigenLenses`, `SEG`) are genuinely reused across grain levels, but through **different wrapper functions at each level** — `detectVocabulary` (clause/paragraph, `perceiver/structure/signals.js:174`), `detectHolons` (scene, `surfer/holons.js`), `detectGrain` (window/byte-block, `surfer/levels.js`, which explicitly uses a `2·√n` cost-budget clamp the doc itself calls out as "a cost budget, not a meaning boundary" — deliberately outside the null-gated unification). These are not literally the same call site reused verbatim; they're independently-written siblings sharing a philosophy and some primitives.

**No semigroup/path-independence test exists anywhere** — grep of `tests/` and the whole repo for "semigroup," "coarse-grain... twice," "idempotent," "associative" near `SEG`/`SIG` finds nothing but one unattested prose line in `docs/eo-wiki.md:18689` ("Some operators are associative under self-composition... Others are order-dependent"). This claim is asserted in documentation, never tested in code.

**The cross-domain universality claim is explicitly gated, and the gate is stated as not yet passed.** `docs/segment-by-significance.md:190-193` names its own falsifier for this — `F-omnimodal`, "the same primitive, fed an audio frame-energy curve, reproduces `acoustic.js`'s signal/noise runs... without its hand-tuned floors" — and instructs: "Do not make any caller default to the primitive until its parity/falsifier passes." The universality claim made throughout the docs (`writing-code-in-eo`, `eo-wiki.md`, `fold.md`, `eo-for-coders.md`) is a design aspiration the docs themselves have not yet validated, not an established fact.

**Net for Probe E:** honest basin structure — the primitives are shared, the unifying operator and its universality are a named, falsifiable, *unexecuted* plan.

---

## §7 Probe F — the capability corollary

**The three reinventions the spec names are real and precisely where `docs/segment-by-significance.md`'s own fix list puts them:**

1. **`holons.js:107`** — an unconditional dominant-lens switch cut into a boundary, gated only by a fixed `minLen` flicker-absorb rule, with caller-hardcoded `k` (`holarchy`'s `coarseK=6, fineK=5`, lines 151-155) — never gated against `boundedNull`, `k` never derived via `DEF`.
2. **The median-band cluster** — `surf.js:172` (a fallback that competes with `deriveNull`), `core/enacted/loop.js:117-134`, `weave/write/idle.js:64,104`, plus further occurrences in `fold/deep-reading.js`, `co-read.js`, `enacted/stance.js`. Confirmed genuinely **separate, independently-computed** implementations — no single shared function. Notably, this cluster is **not** caught by `docs/redundant-systems-audit-2026-07.md` (a different audit, scoped to file-level duplicate implementations, not hardcoded-vs-derived-constant reinventions) — it's documented only in `segment-by-significance.md`'s narrower fix list, and only one of its several occurrences (`surf.js:172`) is named there explicitly.
3. **`src/organs/in/acoustic.js`'s hand-tuned floors** — `windowThreshold`'s 20th-percentile-plus-`marginDb` floor never below a hardcoded `absFloorDb=-55`, plus a separate hardcoded `silenceCut = max(floorLin*1.5, 1e-4)` — exactly as named, confirmed at lines 165-192.

**One historical natural experiment already confirms the capability corollary directly, without needing to run the battery.** The τ-underflow bug documented in `project.js:288-295` *is* Probe F's predicted pattern already realized: the old hardcoded `γ=0.7`/sentence decay silently collapsed a 1242-line document's edge field to `~1e-193` with one live edge — a hand-tuned coefficient pinning the reader to short-document regimes. Deriving τ from the reading's own mean edge-distance fixed exactly this class of input, with no regression on short documents (the derived τ reduces to a similarly-scaled value for short reads). This is a genuine, already-shipped instance of "the kernel/derived version handles inputs the hand-tuned version silently failed on."

**The formal battery (baseline vs. kernel-routed, measured on a held-out corpus set) was not run in this investigation** — running it requires code changes (replacing the three hardcoded sites with null-derived equivalents) that are out of scope for a research pass. Recommend it as concrete follow-up work, using the τ fix as the template: for each of the three sites, the falsifiable prediction is that a longer/more extreme input than the hand-tuned constant was calibrated for will parse under the derived version and silently misbehave (not error — misbehave, e.g. `holons.js` over-segmenting on a flicker, `acoustic.js` missing quiet speech) under the current hardcoded one.

---

## §8 The numerology guard — self-check

Applying the spec's own discipline to this report:

- **A probe that cannot fail is numerology.** Every probe above produced at least one concrete falsifier firing (Probe A: two families, not one; Probe B: 1st and 2nd order both falsified; Probe C: gravity is four uncoupled things, one with no metric at all; Probe D: basis coexistence, no einselection vocabulary; Probe E: the unifying operator doesn't exist yet). None of the six probes came back a clean, unfalsified "yes."
- **What survived, survived because the code is honest about it, not because the theory demanded it.** The τ derivation, the operator-space basis, and the ambivalence-holding mechanisms are all independently well-documented in the code's own comments — they weren't discovered by squinting for confirmation.
- **The single most load-bearing finding is the split between the two mathematical families** (§2): a small, exact, walled-off quantum-information core (`surfer/` only) and a much larger extreme-value-statistics core (everywhere). Michael's conjecture — "closer to the origin ⇒ more capable" — has exactly one confirmed instance (τ, Probe F) and zero confirmed instances of the stronger three-orders claim (Probe B). The theory should be downgraded from "seven formulas are one formula seen seven ways" to: **the reader has one real relative-entropy subsystem (small, powerful, underused outside `surfer/`) and one real extreme-value-null subsystem (large, load-bearing, the actual engine) that share a philosophy — "measure against your own null" — but not, in most of the seven sites, a shared formula.**
