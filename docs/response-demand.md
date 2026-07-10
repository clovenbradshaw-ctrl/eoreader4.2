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

## Levels: reflex, continuation, attention — and why brevity is not the signal

The gate is one cut in a ladder of attentiveness, and naming the whole ladder keeps rung 4
honest:

- **Reflex** — the small model, immediate. A self-contained light turn ("Good morning",
  "thanks") is answered *by the small model itself*, warmly, with no deliberation and no
  reading. The reflex tier both recognises the turn and voices the reply; the big model
  never wakes.
- **Continuation** — the fold. A short turn that *points back* ("do again", "no", "shorter",
  "that one") is resolved by what it references and continues the incumbent act — re-run it,
  refine it, reject and redirect it.
- **Attention** — the big model, deliberate. A novel substantive ask is planned and grounded
  or researched.

The trap rung 4 must not fall into: **brevity is not reflex.** "do again" and "no" are the
shortest turns there are and they reference the *most* — their meaning is entirely in the
thread they point at. A reflex tier that answered on surface length would fire its canned
warmth at "no" and drop the whole prior operation on the floor. What licenses a reflex is
**referential emptiness**, not shortness: a greeting references nothing; "do again" references
everything just done. Same length, opposite depth.

This is already the guard rungs 1–3 install, and it is why `phatic` is a *direction in the
relaxation* rather than a length threshold: a short referential turn arrives with a live
incumbent carrying its `REST` potential and the `continue` current, so it settles on
continuation, not phatic — the reflex responder is never reached. Only a read that is both
light *and* points nowhere out-competes the incumbent to `PHATIC`. The small model may answer
the greeting; it never answers "no".

## Prediction is the demand meter — grading the referential turn

The law above ("do again" / "no" are short but reference the thread) raises the real question:
given the fold, can we tell whether a bare "no" is simple or one that *requires attention*? The
codebase already carries the instrument — the forward predictive channel (`src/core/surprise.js`:
`forwardDist`, `feltSurprise`; `src/surfer/predictive-competency.js`: `predictiveCompetency`).
Point it at the discourse and the demand of a referential turn is **its surprise against what
the fold predicted**:

- The fold carries a forward prediction. After an assistant turn that opened a fork — "Shall I
  also cover the treaty?", a yes/no, an offered choice — `forwardDist` over the fold's profile
  concentrates on that fork's answers. "no" then arrives at **low felt-surprise**: the fold
  already holds both branches, so the resolution is mechanical (drop the offered branch) — a
  simple turn, handled at the reflex/continuation tier, no big model.
- When nothing in the fold framed a fork — "no" rejects a substantive answer with the
  redirection unstated — the arrival is **high felt-surprise**: the fold did not scope it, so
  *what* is negated and *what to do* next is exactly the open question the attentive tier exists
  for.

So surprise is the demand meter, and phatic / continuation / attention are its bands: a
referentially-empty greeting reads phatic; a *predicted* referential turn ("do again" mid-
compose, "no" to a fork) is low-surprise continuation; an *unpredicted* one is high-surprise
attention. One axis — deviation from the fold's own prediction — grades all three, and it is
model-free measurement: it decides whether to spend a model without spending one.

**"Sufficiently?" — competency is the sufficiency gate, and it fails safe.** `predictiveCompetency`
says whether the fold is even in a position to predict. Reflex/continuation is licensed only
when the prediction is *competent* **and** the surprise is *low*; a low-competency fold (it
never scoped a fork) or a surprise that clears its null defaults to attention. We never reflex a
complex "no" — the cost of an uncertain read is one unnecessary attentive turn, the safe
direction, the same discipline answerability keeps: *assume an answer until the void is
measured; here, assume attention until simplicity is measured.*

## Do we need a corpus? — the fork is free, the general prior is trained

Mostly no, and where yes it fails safe. There are two sources of prediction, and only one needs
training:

- **The fork — an efference copy, no corpus.** When the assistant's own last turn opened a fork
  ("shall I also cover the treaty?", a yes/no, an offered choice), it already holds an outstanding
  *copy* of the answer-space. A matching "no" is **reafferent** — the system sensing the consequence
  of its own question — and `feltSurprise` attenuates it to **zero**
  (`tests/demand-prediction.test.js`: a predicted "no" scores 0 bits; the same "no" out of nowhere
  scores 3.32). The fold only has to carry the question-copies the assistant emits when it asks;
  nothing is trained.
- **The general continuation — the flow-prior, trained.** A softer follow-up that no explicit fork
  offered — "shorter", "more like that one", the predictable next move after an essay — is *not* in
  the conversation's own atoms, so the backward profile cannot foresee it. That is where a
  corpus-trained forward model (`src/perceiver/predict`, a grammar over discourse sequences) earns
  its keep: it has learned the shape of what follows what. Without it, `forwardScore` knows only the
  atoms that have already arrived.

Both degrade the safe way: no outstanding copy **and** no trained prior → the arrival is exafferent →
high surprise → attention. So the fork case ships now, corpus-free; the trained flow-prior is a later
lift that only ever *reduces* unnecessary attentive turns — it can never cause a wrong reflex.

## The question-copy, implemented — and who writes the cheap turn

The fork half of the demand meter is now live machinery in the fold
(`src/core/conversation-fold.js`), model-free and tested (`tests/fold-awaiting.test.js`):

- `projectFold` exposes **`fold.awaiting`** — `outstandingQuestion(events)` reads the assistant's
  own last turn and, if it was a question or offer, names the answer-space it opened: `polar`
  (yes/no), `choice` (a disjunction — "the animal or the team?"), or `open` (a wh-question).
- **`answersAwaited(fold, message)`** scores the next user turn against that copy with `feltSurprise`.
  A reply drawn from the answer-space, adding nothing unbidden, is **reafferent** → `{answered: true,
  demand: 'continuation'}` with the recovered `polarity` ("no") or `choice` (["animal"]). A reply that
  adds world content — "no, tell me about whales instead" — is exafferent → `demand: 'attention'`.

This is exactly the dolphins turn's missing half. Had the reader **asked** "the animal or the Miami
Dolphins team?" instead of silently binding the animal at `margin 0.56`, the user's "the animal" would
resolve here as a choice answer — a cheap continuation that re-scopes the essay, no re-planning.

**Who then writes the cheap turn.** A continuation or a reflex reply should not wake the 3B — the
model that stalled after the dolphins preamble (`route: "stopped"`, `rawOutput: null`). The
prediction-driven generator is the producer: `helixGenerate` (a model-free forward draw over a
learned sequence) and `renderContinuation` (`src/weave/longgen/render.js`) already emit
natural-language drafts without the big model. That is the "prediction-driven first draft" — rough
today (a low-order walk), sharpened by `docs/fold.md`'s grammar-licensing so the predictor only ever
*ranks* what the grammar allows. Paired with the demand meter it closes the loop: the meter decides a
turn is reflex/continuation, the prediction generator writes it, and the big model is spent only on
the turns that measured as attention — the ones a stall actually costs something to lose.

## Stage 1, implemented — the subject-sense-collision gate

The disambiguation pipeline's first gate is now live machinery (`src/turn/sense.js`), model-free and
tested (`tests/sense.test.js`). Before a query is generated, `senseCollision(subject, entities,
{hints})` reads the recorded entity graph (`senseEntities` builds the rows from `projectGraph`) and
returns one of three exits:

- **shortcut** — one real sense ("photosynthesis") → a trivial query, no steer.
- **steer** — several senses but a concrete hint resolves one → a *discriminating anchor* ("cetacean"
  for the animal, chosen because it co-occurs with that sense and never the collision), model-free.
- **ask** — several senses, nothing resolves → a choice question ("Which dolphins — Miami Dolphins
  (nfl) or Dolphin (cetacean)?") that feeds `fold.awaiting`, so the reply resolves through
  `answersAwaited` as a cheap continuation. This is the branch the dolphins turn skipped.

**The ambiguity test is a real-sense floor, not a margin.** The reader's existing confidence
(`perceiver/referent.js`, margin 0.15) is *post-retrieval* — in the audit it read `concentrated:true`
at margin 0.56 *after* retrieval had already committed to a basin. That is the wrong signal: a
football-heavy corpus makes the team dominate salience, yet the animal (51 mentions) is still a real
sense. Collision is "≥ 2 basins each clear a real-sense floor", so a salience-dominant sense that
co-exists with another strong one is *still* ambiguous and still asked — exactly what the dolphins
turn needed.

### The pipeline, mapped to code

| Stage | What | Where |
| --- | --- | --- |
| 0 intent | subject + senseHints | caller |
| 1 ambiguity gate | shortcut / steer / ask | **`turn/sense.js` (here)** |
| 2 sense resolution + anchor | discriminating anchor, model-free | **`turn/sense.js` (here)** |
| 3 query generation | the one steered LLM call | `turn/web.js` `formulateSearchQuery` |
| 4 query validation | typed pre-flight checks | **`turn/sense.js` `validateQuery` (here)** |
| 5 search + basin check | results in target basin vs collision → escalate | **`turn/sense.js` `resultBasinCheck` (here)** + `turn/research.js` walk |
| 6 emit | `{query, results, senseResolved, escalations}` | caller |

### The two decisions

- **Sense clusters are corpus-derived, not a lexicon.** The engine has no standing sense lexicon (the
  centroids are EO-cell-grain), the basins *are* the recorded graph, and only corpus co-occurrence can
  score a *discriminating* anchor. Drift is guarded by the real-sense floor (the null); provenance falls
  out. A cold subject (no basin) routes to ask/fetch, never a lexicon guess; any lexicon should be a
  decaying seed the corpus overrides the moment it has signal.
- **The stage is pure `(subject, entities)`, so sync/batch is the driver's call.** The interactive
  reader runs it synchronously — the gate shortcuts every unambiguous subject, so the cost is paid only
  on real collisions. A batch harvester groups the single steered inference across subjects and keeps
  the typed checks per-item and streaming (a pipeline, not a barrier).

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
| **5** | The question-copy: `fold.awaiting` (`outstandingQuestion`) + `answersAwaited` grade a reply to a fork (polar/choice) as a reafferent continuation, else attention. Model-free, `tests/fold-awaiting.test.js`. | no | **done** |
| **6** | The producer: wire `helixGenerate`/`renderContinuation` as the prediction-driven first-draft for reflex/continuation turns, so the cheap path never wakes (or stalls) the big model. | no (draft) | pending |
| **7** | Stage 1 — the subject-sense-collision gate: `senseCollision` over the recorded graph, three exits (shortcut/steer/ask), the ask feeding `fold.awaiting`. Model-free, `tests/sense.test.js`. | no | **done** |
| **8** | Wire Stage 1 into the live turn (`app.js` `ask`): on ambiguity pose the choice question and stop; when the reply answers it, fold the chosen sense back into the original ask (`effectiveQ`). Model-free, fail-soft. | no | **done** |
| **9** | Stages 4–5 as pure functions: `steerQuery` (fold the anchor in), `validateQuery` (typed pre-flight), `resultBasinCheck` (post-flight basin verdict + escalate). Model-free, `tests/sense.test.js`. | no | **done** |
| **10** | Live wiring: `formulateSearchQuery` takes the steer anchor and runs `validateQuery` (regenerate once on failure); the research walk runs `resultBasinCheck` and escalates with a bounded retry. | yes | pending |

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
