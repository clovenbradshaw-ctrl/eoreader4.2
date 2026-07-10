# Response demand — the light-turn gate before the planner

> The twin of answerability (4.1 `docs/answerability.md`). Answerability asks
> *is there anything in the reading to say?* and answers a measured VOID when the
> field is empty. This asks the question one step earlier: *does this turn ask for
> a real answer at all — or only a word back?* It reads the **discourse** (what the
> metacognition says the turn is) and the **fold** (whether a live thread is running)
> and assesses **how much answer is needed** before the planner is ever spent.
> The difference between someone saying *"Good morning"* and *"hey, how do you get
> to Waterloo Street?"*

## The gap this closes

The router (`docs/discourse-routing.md`, `src/turn/meta-route.js`) settles every
turn onto one of `compose | ground | research | isolate`, with `continue` folding
to the incumbent. Every one of those spends the machine: it warms the talker, reads
the fold, and — with a document loaded — reaches into the reading. **There is no
outcome that means "this needs almost nothing."** A greeting has nowhere to land but
a route built for work.

The one thing that catches a greeting today is a regex, and it is gated shut exactly
when it is most needed:

- `answerSmalltalk` (`src/enactor/answer/mechanical.js`) is five anchored patterns —
  `GREET`, `BYE`, `HOWRU`, `JUSTHI`, `THANKS`. It is the whole of the system's
  "does this need a real answer" faculty.
- It is consulted only inside `if (!docs.length)` (`src/rooms/reader/app.js`, `ask`).
  **With a document open, `"Good morning"` skips it entirely** and enters `runTurn` —
  the full grounding pipeline tries to answer a pleasantry against the reading. The
  cheapest possible turn takes the most expensive possible path, and often invents a
  document-flavoured non-answer to a hello.

This is the same failure `discourse-routing.md` diagnosed one grain up: a brittle
string-match standing in for a measurement, breaking on the paraphrase. `"morning!"`,
`"you around?"`, `"appreciate it"`, `"was just checking in"` all defeat the anchors,
and a bigger anchor list is the wrong repair for the same reason a bigger route
whitelist was — the string is not self-contained, and the vocabulary is unbounded.

## The shape: a cascade, cheapest tier first

Your instinct — *a tiny model that listens for a short response, the larger model for
planning* — is the right architecture, and it maps onto tiers this codebase already
onto tiers this codebase already has: `src/model/webllm.js` exposes a **Fast 1B / Fluent 3B**
lever, both q4‑quantized (`src/model/wllama.js`'s SmolLM2‑135M is the deeper CPU‑only fallback).
The listener is the quantized 1B, the planner the quantized 3B. Render it as a two-tier cascade, each tier
gated by the one before it:

```
  message ┐
          ├─▶ TIER 0  the demand gate  (cheap, ALWAYS runs — docs loaded or not)
          │      "is this a light, social turn, or does it want real work?"
          │        · light  → a warm one-line reply. STOP. Never ground, never plan.
          │        · work   → fall through
          │
          └─▶ TIER 1  the planner       (expensive, runs ONLY on a work turn)
                 the existing metaRoute discourse read + fold →
                 compose | ground | research | isolate, and the answer itself
```

Tier 0 is the "short-response listener." Tier 1 is the planner. The point is not that
Tier 0 is *accurate about the route* — it decides nothing about compose-vs-ground. It
decides only **whether the planner runs at all**, the way answerability decides whether
the talker runs at all. A greeting never reaches the part of the system that would
misread it.

## Tier 0 is a measurement, not a verdict — the same discipline as everywhere else

`discourse-routing.md` is emphatic (and correct): do not ask a small model to *emit*
the decision — "a constrained vocabulary is JSON with fewer braces," and a small model
asked for a label reverts to its priors and confabulates one. So Tier 0 is built the
way every other gate here is built — **propose a structure, measure it against a
chance null, act only when it beats chance** (the "witness does not decide" rule, from
answerability and `read/voidnull.js`):

- **A `phatic` direction in the route measurement.** As built, `phatic` is a fifth
  member of `ROUTE_EXEMPLARS` beside `compose | ground | research | isolate | continue`,
  so its **substantive contrast is the other directions themselves** — the crosstalk
  null is derived against a rich background (every work direction's exemplars), which
  keeps it finite and holds phatic apart from them structurally, the same mechanics as
  `clarify ⟂ actionable` / `develop ⟂ brief` but with the work directions as the null.
  The exemplars are **metacognition speech** (the model describing the turn), not the
  user's words:
  - *phatic* — "they are just greeting me, a friendly hello, nothing to look up";
    "a social pleasantry — they want a warm word back, not an answer"; "an
    acknowledgement, a thanks, a nod — no task, nothing to research or compose";
    "they are saying goodbye, closing the chat kindly"; "checking in on how I am —
    a light exchange, no work to do."
  - *the substantive alternatives* are the standing directions — a `ground`
    doc-question, a `research` "found out in the wider world", a `compose` "piece
    made". A read that lands on any of those clears their nulls, not phatic's.
- **Two ways to source the read, and they compose (cold → warm, continuously):**
  1. **The instant floor — no model at all.** Measure the *user's own words* against
     the phatic basis (and keep `answerSmalltalk` as the seed, folded in at `SEED`
     weight the way `isExplicitCompose` already is — it informs, it does not decide).
     `"Good morning"`, `"thanks"`, `"bye"` clear on their own, offline, in the
     zero-download default. This is strictly better than today: the regex stops being
     the decision and becomes the floor, and it runs **with a doc loaded**.
  2. **The graded layer — the tiny model speaks, and is measured.** For the paraphrase
     the floor misses (`"you around?"`, `"was just checking in"`), the same one-line
     discourse read the planner would take (`discoursePrompt`) is measured for
     phatic-ness *first*. Pin that read to the **quantized 1B (Fast)** build — it
     only has to say *"they're just saying hello"* legibly, which the small quantized
     model does well. Reserve the **quantized 3B (Fluent)** talker for turns that survive the gate. **You do
     not warm the big model to say good morning.** That is the compute your two-tier
     framing buys, made concrete.

`phaticDrive` rides out of the measurement as a graded scalar, exposed regardless of
the settled route — the response-scale twin of `researchDrive`/`clarifyDrive`. The
caller thresholds a number instead of pattern-matching greetings.

## The fold is what makes it safe

A demand gate that fired on *short* would be a disaster mid-thread — `"do it"`,
`"shorter"`, `"sure, go on"` are the exact anaphora `conversation-fold.md` exists to
bind. They are short **and** substantive: their substance is inherited from the fold,
not spoken in the string. So Tier 0 reads the fold, and the cleanest rendering reuses
the router's own physics rather than inventing new gating:

> **Add `phatic` to `ROUTE_ALPHABET` as a fifth direction whose "win" means
> short-circuit.** When the relaxation settles on `phatic`, the verdict is a new
> terminal (`PHATIC`) and the caller returns a light reply. Everything else is the
> existing `relaxRoute`: the incumbent stance carries its `REST` potential and the
> `continue` current flows to it, so **a bare acknowledgement inside a live compose or
> ground thread keeps settling on continuation** — the incumbent out-competes the
> phatic current through the same lateral inhibition that already keeps continuation
> the default. `"sure, go on"` mid-essay continues the essay; `"Good morning"` on a
> fresh turn has no incumbent to beat and settles phatic. The fold interaction is not
> new code — it is the physics `meta-route.js` already runs, given one more direction
> to settle over.

That is the literal meaning of *leverage the discourse and the fold*: the discourse
read says "this looks social," the fold says "but we are mid-composition," and the
relaxation resolves the two without a hand-written rule.

## Good morning vs Waterloo Street — the worked contrast

| Turn (fresh chat, a doc loaded) | phatic | substantive | ground/research | Settles | What runs |
| --- | --- | --- | --- | --- | --- |
| `"Good morning"` | clears its null | under null | under null | **phatic** | a one-line reply; planner and reading untouched |
| `"hey, how do you get to Waterloo Street?"` | under null¹ | clears | research clears² | **research → GROUND** | the planner, then a web/ground answer |

¹ `"hey"` is a greeting token, but the substantive current dominates — the metacognition
re-speaks it as "they want directions to a place," which lands on *substantive*, not
*phatic*. The crosstalk null keeps a lone social token from tipping a real ask.
² Directions to a street are not in the loaded reading and not a pleasantry — the world
has to answer, so `researchDrive` rises and the planner routes it outward, exactly as
today.

## EO mapping

A light turn is a **NUL** — the empty slot recognised, nothing lifted into structure —
answered by a **DEF** to a small, social resolution. This is answerability's own move
(`NUL` + `DEF` to VOID) applied to a different axis: answerability reads response
**existence** (is there anything to say?), the demand gate reads response **scale**
(how much does this ask for?). Both are the witness-does-not-decide rule — propose,
measure against the null, act only past chance. No new operators; the vocabulary the
engine already speaks (`docs/operators.md`).

## Fallback contract

Cold model, empty speech, or a paragraph that clears no null → the gate abstains and
the caller runs exactly as today: `answerSmalltalk` on the no-docs path, `runTurn` on
the docs path. Never worse than the current build; the measurement acts only as far as
it beats chance and abstains where it cannot — the same continuous degradation the rest
of the router keeps. The one behavioural change on the floor alone (no model) is the
strict improvement you asked for: `answerSmalltalk` now runs **with a document loaded**,
so `"Good morning"` at an open book gets a hello instead of a grounded non-answer.

## Build ladder

| Rung | What | Model? | Status |
| ---- | ---- | ------ | ------ |
| **1** | `phatic` exemplars (metacognition speech) added to the route bases + a `phaticDrive` export in `meta-route.js`; its crosstalk null is derived against the other directions (which *are* the substantive alternatives). Tested like every other basis — `tests/meta-route.test.js` pins self-recovery and the phatic⟂isolate separation. | no | **done** |
| **2** | `phatic` in `ROUTE_ALPHABET`; `VERDICT_OF.phatic = 'PHATIC'`; small-talk moved out of `isolate`; the social case named in `discoursePrompt`. The fold's incumbent/`REST` physics come for free. | no | **done** |
| **3** | The caller: `app.js` `ask` runs `answerSmalltalk` (now doc-aware) **before** the `!docs.length` branch, so a doc-loaded greeting short-circuits to a warm line instead of grounding. | no | **done** |
| **4** | The tiny-model triage: measure the pre-planner discourse read for phatic-ness on the quantized **1B (Fast)**; only warm the quantized **3B (Fluent)** for work turns. Bench the compute saved. | yes | pending |

Rungs 1–3 are landed here — the bug you named (a doc-loaded greeting) is fixed with **no
model** and no new physics, and the measured `phatic` direction is ready for the read to be
live-wired. Rung 4 is the "tiny listener, big planner" optimisation on top.

## Non-goals

- **Not a bigger smalltalk list.** The regex shrinks to a floor/seed; the decision is
  the measurement.
- **The gate never fires on a continuation.** A short utterance inside a live thread
  settles on the incumbent, not phatic — guaranteed by the relaxation, not by a check.
- **A light reply never grounds against the reading and never consults the planner.**
  That is the whole point: the expensive path is not merely cheap on a greeting, it is
  *not taken*.
- **Tier 0 decides only whether to plan, never how to route.** compose-vs-ground stays
  the planner's job.

## Files

- the measurement + exemplars: `src/turn/meta-route.js`
  (`PHATIC_EXEMPLARS`, `phaticDrive`, `phaticDemandOf`, `ROUTE_ALPHABET`, `VERDICT_OF`,
  and one clause in `discoursePrompt` naming the social case)
- the floor it seeds from, now a seed not a decision: `src/enactor/answer/mechanical.js`
  (`answerSmalltalk`)
- the caller, gate before the docs branch: `src/rooms/reader/app.js` (`ask`)
- the model tiers the triage rides: `src/model/webllm.js` (quantized Fast 1B / Fluent 3B),
  with `src/model/wllama.js` (SmolLM2‑135M) as the CPU-only fallback
- the sibling gate on the other axis: 4.1 `docs/answerability.md`
- tests: `tests/meta-route.test.js`
