# Segment by significance — one null-gated operator, at every grain, in every modality

**Status:** design established by reading + measurement; the core primitive already exists and is
proven modality-blind; the work is to NAME it, route the reinventions through it, and add the
name/weld segmentation as a new caller. Build gated on the falsifiers in §8, in the discipline of
`length-is-a-property-of-the-field.md`.

This document records a principle the codebase already half-embodies and a plan to finish it. It
was surfaced by using the War & Peace essay questions as a falsifier battery for parse quality:
the questions demanded a clean cast, the cast came back welded (`About Mikhelson`, `Natásha Prince
Andrew`, `Moscow Pierre`), and walking that back led not to a name-splitting patch but to the
reader's core segmentation physics.

---

## 0. The one idea

There are no hard rules — only **signals measured against their own noise null**, and **meaning is
what emerges where a signal beats chance**. Every decision the reader makes about *where a thing
begins and ends, and what binds to what* — a name boundary, a clause cut, a scene, a musical
phrase, a byte-block, an image region — is the **same measurement** (`significance = observed vs
the null`) applied at a different **grain**. It is one operator, `SEG`/`SIG` at a ladder of
resolutions, never a per-decision or per-modality rulebook.

Three properties follow, and they are the answers to the three questions that shaped this doc:

1. **It stacks.** Signals from different grains compose as accumulating log-evidence (this is what
   `gravity` already is). They may **reinforce or cancel** — a coarse read (a token's binding is
   spread across many partners, i.e. it is a *moon*) can pull *against* a fine read (that token has
   high referent-gravity), and the stronger-vs-its-null wins. Not monotone accumulation; a
   competition of evidence.
2. **The null is the stopping rule.** You refine finer (to cut) or coarser (to merge) *while each
   step surfaces structure that beats chance*, and stop where the measurement no longer beats its
   own `deriveNull` — where the signal dissolves into noise. No external max-depth. This is the same
   self-termination as the adaptive-reach surf ("as much as it needs, bounded by signal, not a
   window") and `fieldIsVoid`.
3. **Ambivalence is a preserved output, not a failure.** When grains conflict and neither
   decisively beats the other's null, the honest result is a **held superposition**, collapsed only
   by later evidence — never a coin-flip. The codebase already carries this: `band:'void'`, the
   `owner:'ambiguous'` of the evaluation modeler ("divergence preserved, capture refused"), the
   defeasible append-only merge, the `carry` idiom in `holons.js`, `DEF`-to-`VOID`.

---

## 1. The primitive already exists in `core` — modality-blind

The map (verified) found that both arms of a modality-general segmenter are already written, over
scores/vectors, never over text:

- **The cut arm — `core/voidnull.js` `SEG(scores, {alpha, tol})`.** Reads *any* per-position score
  curve — "a departure (`relEntropy`), an incommensurability (commutator norm), any streaming change
  signal" — and keeps the boundaries whose peak clears `boundedNull` (the N=2 Born line), suppressing
  peaks within `tol`. Pure, state-free, script-free.
- **The group arm — `core/spectral.js` `buildDensity → eigenLenses → SIG`,** with
  `voidnull.js` `DEF(eigenvalues)` **deriving how many groups** the spectrum holds from a
  `deriveNull`-gated eigen-gap. So even "how many units is this?" is already a null-decided question.

The surfer already wires these three ways: `surf.js` adaptive reach (`deriveNull(scoreSeries,
{leaveOut:sc})` → `verdict = sc>nul ? 'SYN' : 'NUL'` — the textbook null-gated cut), `holons.js`
`detectHolons` (group by `buildDensity`+`eigenLenses`, then cut into runs of one dominant lens), and
`levels.js` `detectGrain` (fold to coarse units).

**The plan is therefore not to write a segmenter — it is to name the one that exists.** A
`segmentBySignificance(units, adjacency, {alpha})` belongs in `core` (a thin `core/segment.js`
re-exported through `core/index.js`, which `holons.js` and `surf.js` already import from) as the
public face of `SEG` (the 1-D curve case) + `buildDensity→eigenLenses→SIG`+`DEF` (the graph/community
case). Every modality — and the name/weld split — calls the same primitive.

---

## 2. The name/weld split as the legible instance (with the measured ladder)

The greedy name scanner (`entities.js` `CAP_RE`) concatenates any run of capitalised words, so a span
absorbs both an opener glued to a name (`About Mikhelson`) and two adjacent names (`Natásha Prince
Andrew`). Walked as the significance ladder, each rung is one null-gated read (numbers measured on
War & Peace, Gutenberg #2600):

| grain | the read | measured | drives |
|---|---|---|---|
| **token** | is this run a referent, or filler capitalised by position? (cap-rate = MI with referent-hood) | `about` .016, `show` .027, `and` .049 (filler) vs `prince` .82, `moscow`/`natásha`/`pierre` 1.0 (names) | admit / refuse (INS) |
| **bigram** | do adjacent runs bind into one name? (association vs null) | PMI: `anna·pávlovna` +7.7, `prince·andrew` +5.2, `márya·dmítrievna` +9.0 (bound) vs `natásha·prince` −3.8, `moscow·pierre` −1.6 (weld) | SEG the weld / CON the name |
| **head** | is a bound component spread across many partners? (binding entropy) | `anna`→`pávlovna` AND `anna`→`mikháylovna` both high ⇒ `Anna` is a moon (two people) | moon → refuse bare figure |
| **variant** | do two forms co-refer? (subsequence + MI) | `bonaparte` ⊂ `napoleon bonaparte` | SYN merge |

Two lessons the measurement forced, both confirming §0:

- **A single signal force-fits.** A lone t-score null (θ≈21) correctly cut `Natásha|Prince` but
  *also* cut the real names `Márya Dmítrievna` (t=9.4) and `Napoleon Bonaparte` (t=1.4) — t-score
  conflates frequency with name-hood. You must **stack** direction (PMI) with trust (count), which
  is why this belongs in the principled core null, not a bespoke threshold (a hand-rolled trust
  floor collapsed to 1.0 on hapax-dominated counts, and `Moscow·Pierre`'s PMI even flipped sign
  between capitalised-only and full-frequency counts).
- **The moon is not a separate rule.** `isMoon` is the *head-grain* read of the *same* binding
  distribution the bigram PMI measures — a token whose association is spread across ≥2 partners each
  above the null. It is derivable from the adjacency statistics, not a honorific list.

An interim, already-shipped step (`entities.js` `isFiller`/`trimWeld`, the cap-rate token-grain read)
handles the opener welds (`About Mikhelson`→`Mikhelson`); it is the token rung of this ladder and is
superseded by the bigram rung once the split routes through `segmentBySignificance`.

---

## 3. Genuine modality-specific signals to KEEP (do not over-unify)

The map was explicit that unification has a limit — some signals are *real external boundaries*, not
heuristics to null-gate away:

- **`levels.js` `HEADING_RE`** reads an **author-declared** cut (the writer split the chapters). That
  is a true boundary *source*, and its detection is text-specific (audio's equivalent is a
  silence/track/shot marker, not a heading regex). Keep it as a source; its *status* as a true cut
  may still defer to significance once a per-unit signal exists.
- **The `2√n` window clamp** (`detectGrain`) is a **cost budget** for the O(dim³) surf hot path, not
  a meaning boundary. Keep.
- **`routeDomain`'s MEANING/CAST markers** are a routing prior, orthogonal to segmentation. Keep.

---

## 4. The fix list (reinventions to route through the primitive)

Confirmed by the map + adversarial verify:

- **`holons.js:107` (critical).** A persistent dominant-lens **switch is cut into a boundary
  unconditionally**, with only a fixed-count flicker rule (`(last.hi-last.lo) < minLen`) and a
  **caller-hardcoded `k`** (`holarchy` `coarseK=6/fineK=5`) — the switch strength is never gated
  against `boundedNull`, and `k` is never derived via `DEF` even though `detectHolons` already holds
  the Born spectrum `DEF` consumes. Gate each switch on the null; derive `k` from the spectrum;
  preserve the existing `carry` as the superposition-hold.
- **`surf.js:172`.** A median `band` fallback competes with the `deriveNull` verdict as a
  parity-gated alternative. Drop it so the null is the sole arrest rule.
- **`acoustic.js` (audio organ).** Signal/noise segmentation by **hand-tuned constants**
  (percentile floor + `marginDb` + `absFloorLin`) instead of a null. Re-derive the floor as a
  `deriveNull` over the frame-energy distribution (it already re-derives a percentile per sub-window
  to make holons nest — the null is the principled version of that move).
- **Binding force-resolve sites** — *pending the second grounding workflow* (superposition collapse
  in `perceiver/structure/binding.js`; argmax/first-match-wins that discard a live alternative). To
  be appended.

---

## 5. Why this is the omnimodal payoff

`deriveNull` takes any score distribution; `buildDensity`/`eigenLenses` take any vectors; `SEG` takes
any curve. None of them knows what a letter is. So the *same* `segmentBySignificance` that splits a
name weld will cut an audio phrase (frame-coherence curve), grow an image region (patch-similarity),
find a table block (cell-affinity), and segment an unknown binary format (byte-transition surprise) —
each gated by its own null, each holding a superposition where the field is genuinely undecided. The
name split is not a text feature; it is the first new caller of the reader's one segmentation
operator, and getting its ambivalence-preserving shape right is getting that operator right for
everything.

---

## 6. Build order

1. **Name the primitive.** `core/segment.js` `segmentBySignificance` = the public face of `SEG` +
   `buildDensity→eigenLenses→SIG`+`DEF`; re-export via `core/index.js`. No behaviour change — a
   naming/consolidation pass with tests pinning byte-parity to the current `SEG`/`holons` output.
2. **Name split as first caller.** In `entities.js`, feed the scanned span's adjacency-significance
   (bigram association vs the null) to the primitive; emit each cohering sub-run as a name, hold a
   superposition where a boundary is borderline, and let the head-grain moon read fall out of the
   same distribution. Retire `isFiller` into the token rung.
3. **Route the reinventions** (`holons.js:107`, `surf.js:172`, `acoustic.js`) through the primitive,
   one at a time, each behind its own byte-parity/falsifier gate.

---

## 7. What we are NOT doing

- No new per-decision or per-modality rulebook — one operator, called at each grain.
- No hard max-depth for grain — the null terminates it.
- No forced collapse of a genuine ambivalence — a superposition is a valid, carried output.
- No erasure of a real external boundary signal (author-declared cuts, cost budgets) in the name of
  unification.
- No hand-picked threshold where `deriveNull` can decide.

---

## 8. Falsifiers (gate the defaults)

- **F-parity** — `segmentBySignificance` reproduces the current `SEG`/`detectHolons` output
  byte-for-byte on the existing fixtures before any caller switches to it. A rename that changes
  behaviour is not a rename.
- **F-split** — on a labelled set of true names vs welds (built from the W&P cast), the null-gated
  bigram split beats both the greedy scan and the interim `isFiller` cap-rate trim on precision AND
  recall, and returns the genuinely-ambiguous pairs (`Napoleon Bonaparte`, weakly bound in this
  corpus) as *held*, not forced.
- **F-holon-null** — replacing the `holons.js:107` fixed `minLen`/`k` with the null-gated switch +
  `DEF`-derived `k` does not degrade the holon segmentation on the existing holon fixtures, and
  removes at least one hardcoded constant.
- **F-omnimodal** — the same primitive, fed an audio frame-energy curve, reproduces `acoustic.js`'s
  signal/noise runs within tolerance without its hand-tuned floors.

Do not make any caller default to the primitive until its parity/falsifier passes.
