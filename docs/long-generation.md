# Long generation across messages — the closure, run forward

> The intuition: long generation should be cheap. Feed back **the very end** of
> what was said, **the fold** of everything before it, and **a sense of where
> we're going**, with the next move **biased toward what's predicted to come
> next** — then realize that, check it, and fold the result back in. This doc is
> the in-grain version of that intuition: `runContinuation` in the `longgen`
> holon. It is `spec-generation.md` Piece 3 (the autoregressive closure) wired
> from pieces that already exist, with the one genuinely-new part — the
> **self-fold weld** — built explicitly.

## The four pieces, and where each already lived

The sketch has four parts. Three were already in the repo; only the fourth is new.

| the sketch | the piece | where |
|---|---|---|
| "the very end of what was said" | the recent **verbatim window** | `foldConversation` → `pastTurns` (`converse/history.js`, `session-fold.md`) |
| "the fold of what came before" | the **surfed recap** of older movers | `foldConversation` → `notes` (same) |
| "a sense of where we're going" | the forward distribution **p(next)** over moves | `predictNextMove` (`predict/predictor.js`) |
| "logits biased toward what's predicted to come next" | — | **this holon** |

The fourth is the one that needed care, and the care is a correction: in this
architecture the bias is **not** applied to the talker's token logits. It is
applied one level up, at the **plan**. The predictor draws the next *move-type*;
a resolver turns that into a concrete **proposition**; the proposition rides in
the prompt as the section's sub-claim; and the grounding floor checks the
rendering against it. The talker is biased toward what comes next by being
*told* what comes next and *checked* on it — not by editing its distribution.
This is `spec-generation.md` Piece 1's whole stance: an open slot is where a
small model reverts to its own priors and confabulates, so we never leave the
slot open at token grain.

## The loop

`runContinuation` is the arc's spine (`spec-the-arc`) with the source switched
from a **document** to the generation's **self**, and the supply switched from
retrieval to a fold of the conversation plus a ground pool:

```
reconstruct → direction → resolve → realize → floor → weld → (repeat)
```

1. **reconstruct** — `foldConversation(history)` rebuilds the tail (verbatim
   window) and the fold (surfed notes). Reused wholesale; these ride into
   `buildGroundedMessages` through the `conversation` slot that already exists.
2. **direction** — build a move-log over the **self** units accepted so far and
   call `predictNextMove`. The posterior is p(next) over the move alphabet; its
   argmax (or a temperature draw up the surprise quantile) is the structural
   intent. When the posterior goes **flat** the predictor declines to commit —
   its VOID — and the loop stops. Length is emergent, exactly as the arc's is.
3. **resolve** — turn the drawn move-type into a proposition by selecting the
   most-salient **uncovered** span from the ground pool. (The full cell-grain
   plan→proposition resolver of Piece 1 is the named seam below; this first cut
   resolves against ranked spans, monotone in coverage.)
4. **realize** — generate the unit with `generateSection`: the proposition is
   the sub-claim, the conversation fold is the context, the ground span is the
   only thing it may cite.
5. **floor** — `bindAndVeto` the rendering against that span (the arc's gate run
   forward, `spec-generation.md` Piece 2): bound → append; partly bound →
   truncate to the bound prefix; mostly unbound → regenerate once; else drop.
6. **weld** — append the **judged** unit (its verdict attached) to the running
   self-state. This is the firewall: the next step's predictor reads self-output
   **with its verdict**, never the bare assertion.

## The self-fold weld — the verdict becomes the strain

The new part, and the reason this is closure and not just another arc. The
floor's verdict on each unit is not only kept beside it; it is **read back as the
structural frame** the next prediction rides:

- a unit that bound cleanly → low strain → the routine body of generation
  continues (the predictor keeps drawing grounded moves);
- a unit that drifted (low bound fraction, a veto) → **high strain** → the
  structural prior leans the next draw toward `REC` / `VOID`, i.e. toward
  restructuring or stopping.

So the engine that starts to confabulate raises its own strain and stops itself —
the grounding floor is wired into the predictor as the break signal, not bolted
on as an external check. `strain = 1 − boundFraction`; the rest is the structural
prior reading it (`predict/structure.js`). An evaluation of self orients the next
step; it never grounds it. That is the weld `spec-generation.md` and
`grounding-floor` both list as outstanding, built here once.

## Across messages

The loop's return carries a resumable `state` — the accepted self-units and the
covered ground. A follow-up user message calls `runContinuation` again with that
state and the grown history; the fold widens, the self move-log lengthens (so the
recurrence prior now has real rhythm to read), and generation resumes where it
stopped. "Long generation across messages" is exactly: persist the state, feed it
back. Nothing in the loop knows or cares whether a step is the tenth of this
message or the first of the next.

## How we know it works

The controls are `spec-generation.md`'s, narrowed to the closure:

- **stops on its own** — given finite ground, the loop terminates by
  `ground-exhausted` or by the predictor going flat (`void`), never by a token
  count. The length-trace records which, per run.
- **drift raises strain** — an injected drifting unit must push the next
  prediction's mass toward `VOID`/`REC` relative to a clean unit. This is the
  weld firing; it is unit-tested directly.
- **resume is seamless** — running N steps, then resuming from the returned
  state for M more, yields the same units as running N+M at once (the state is a
  sufficient statistic; the loop is memoryless beyond it).

## The seams, named

- **The plan→proposition resolver (Piece 1).** This cut resolves a drawn
  move-type to *the next uncovered ranked span*. The full resolver selects an
  **edge on the referent-and-relation graph** that realizes the specific
  move-type (an `EVA` at a site becomes a specific *the family holds <…>*),
  leaving the talker nothing to invent. That is the inverse of the reader's
  clause→event typing and is still unbuilt; the move-type is preserved on every
  unit so wiring it later changes the resolution, not the loop.
- **Reading self back through the perceiver.** The self move-log here is built
  from the move-type each unit *realized* plus the floor's strain. The richer
  form runs the accepted prose back through the document reader so the recurrence
  and structural priors read the generated text's own figures — the same
  `buildMoveLog`, source=self. Left for when the closure is exercised on real
  (non-echo) output.

## Where it lives

| concern | file |
|---|---|
| the loop | `src/weave/longgen/continuation.js` (`runContinuation`) |
| direction (self move-log + p(next)) | `src/weave/longgen/direction.js` |
| the minimal plan→proposition resolver | `src/weave/longgen/resolve.js` |
| the public face | `src/weave/longgen/index.js` |
| tests | `tests/longgen.test.js` |
| reused: fold | `src/turn/converse/history.js` (`foldConversation`) |
| reused: predictor | `src/perceiver/predict/predictor.js` (`predictNextMove`) |
| reused: realize + floor | `src/weave/arc/index.js` (`generateSection`, `bindAndVeto`) |
