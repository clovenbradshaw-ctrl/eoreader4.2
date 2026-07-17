# eoreader 4.2 — Calibration Mode
### Calibrating the fold → plan → chunk-prompt pipeline against a frontier model

> Version 0.1 (proposal).
> Canon: `src/metabolism/` (judge.js, challenger.js, proposer.js, lift.js, transfer.js,
> genome.js, fitness.js) — the existing evolutionary engine; `docs/fold.md` — the fold
> as a derive-then-verify generation pattern; `src/weave/write/plan.js`,
> `src/turn/stage-llm.js`, `src/frame/conversation-fold.js` — the live pipeline this
> mode calibrates. Reads as a companion to `docs/organ-level-evolution.md`, one
> objective over from the one it documents.

---

## §0 — What this is, in one paragraph

A small local model cannot hold the whole conversation, let alone the whole source
graph, in its context window. So the system does not hand it everything — it hands it
a **fold** (a slice of the graph judged relevant), which becomes a **plan** (an ordered
list of what to say, one step per generation call), which becomes a sequence of
**chunk prompts** (concise enough to fit the small model's window, complete enough to
produce the right output for that one step). Three narrowings, each lossy, each with
knobs. Calibration mode is the loop that tunes those knobs by comparing the narrowed
pipeline's output against what a frontier model produces when nothing is narrowed at
all — and, critically, blames the *right stage* when the two disagree.

This is not a new engine. `src/metabolism/` already runs almost exactly this loop —
frontier model as grader (`judge.js`), as simulated user (`challenger.js`), as breeder
(`proposer.js`), fitness as a falsified lift across two frozen local models
(`lift.js`, `transfer.js`) — aimed at the retrieval/surfer scaffolding. Calibration
mode points the *same* machinery at the fold/plan/chunk-prompt dials instead, and adds
the one thing that machinery does not yet do: **grade the intermediate stages**, not
only the finished answer, so a bad answer can be traced to a bad fold, a bad plan, or
a bad chunk prompt rather than shrugged off as "the model was wrong."

---

## §1 — The three narrowings, named against existing code

| user's term | this codebase | what it does | existing dial(s) |
|---|---|---|---|
| "the fold, with parameters adjusting its quality" | `turn/stages.js` fold slice, read by `weave/write/plan.js`'s `surfToPlan(surf, doc, fold, opts)` | selects which subgraph slice is live | `genome.js`: `foldWidth` (live width of the fold slice), `retrieveK` (forage breadth), `bindFloor` (grounding strictness — what counts as firm enough to enter the fold) |
| "a plan to answer" | `surfToPlan` → an ordered list of **cells** (`{op, args, kind, spans}`), one per beat/sentence; `weave/commission/plan.js`, `weave/longgen/shape.js`/`direction.js` for longer forms | turns the fold into an ordered sequence of things to say | same `foldWidth`/`bindFloor` (what the plan has to work with); `arcEpsilon` (when the plan's walk decides it has said enough) |
| "prompts concise enough for a small model's window, correct for that chunk" | `turn/stage-llm.js`'s per-turn generation call; the per-cell prompt the walk assembles for one step | one model call per plan step | `maxTokens` (output budget per call — also bounds how much a chunk prompt can ask for); `modelGate` (whether the model is warmed for this step at all) |
| "coherent across multiple messages" | `src/turn/converse/history.js` (bounded dialogue window), `src/frame/conversation-fold.js` (`stance`/`scope`/`warm` — which prior referents are still reachable) | how much of the conversation crosses into the next fold | `gamma` (recency horizon — "the attention span") |

The load-bearing observation: **every dial calibration mode needs already exists in
`genome.js`**, just not labeled this way. `GENES.foldWidth`'s comment literally reads
*"the live width of the fold slice held under attention... the token economy of the
fold"*; `GENES.gamma`'s reads *"shorter forgets faster... the attention span"* — exactly
the multi-message-coherence knob. Calibration mode does not invent a second genome. It
evolves the *same* genome the surfer-lift objective (`lift.js`) already evolves, under
a *different* fitness reading — one built from a frontier **ideal**, not from bare vs.
scaffolded on the same frozen model. See §4 for why the two objectives coexist rather
than fight over one gene pool.

---

## §2 — The ideal: full-context generation as the ceiling, not a rival mode

"We could definitely just stick the entire graph into the frontier model" — yes, and
that is not a competing feature to build, it is the **reference measurement**
calibration mode already needs. `lift.js`'s `gapClosed(withSurfer, bare, ceiling)`
wants exactly this: a `ceiling` score representing what the task is worth with nothing
narrowed. Calibration mode's `ideal(task)` is that ceiling, realized: a single
frontier call, no fold, no plan, no chunk budget — the frontier model gets the raw
question (and, when relevant, the raw source) and answers directly.

Nothing about `ideal()` runs in production. It exists only inside the calibration
cycle (§5), the same posture `judge.js`/`challenger.js`/`proposer.js` already hold:
*"the judge's own API cost is the operator's, not the organism's... development
scaffolding, outside the envelope."* A calibration run costs frontier-model calls in
proportion to how many cycles it runs, gated by the same budget objects (`{calls,
tokens}`) every other Claude channel in this faculty already enforces.

---

## §3 — Grading the stages, not only the answer (the actual gap)

`judge.js` grades a finished answer against a held source. `challenger.js` grades a
finished answer's satisfaction. Neither looks *inside* the pipeline. That is fine for
retrieval-lift (§4's objective is scoped to one number), but calibration mode needs to
know **which of the three narrowings failed** — a proposer that only sees "the answer
was bad" can only guess whether to widen the fold, restructure the plan, or lengthen
the chunk budget, and the essay in `proposer.js`'s own header is explicit that a
critique naming the *wrong* lever wastes a generation.

This is the one genuinely new piece: `src/metabolism/fold-plan-judge.js`, mirroring
`judge.js`'s exact shape (a pure request builder + a budgeted, dry-run-safe,
`call(request)`-injected grader — no key, no network, in this module) but grading two
new axes against the frontier **ideal** answer as the reference:

- **`gradeFold({ task, fold, idealAnswer })`** → `{ sufficient, salience, missing,
  rationale }`. `sufficient`: does the fold carry every fact the ideal answer actually
  relied on. `salience`: what fraction of the fold is content the task needed — a fold
  that is sufficient but bloated scores low here, not on sufficiency, so the two
  failure modes (too little / too much) stay distinguishable in the signal.
- **`gradePlan({ task, plan, idealAnswer })`** → `{ decomposition, coverage, ordered,
  rationale }`. `decomposition`: are the steps the right grain — neither so coarse a
  step's chunk prompt cannot fit the small model's window, nor so fine a single idea
  fragments across steps and reads as disjointed. `coverage`: if every step executed
  perfectly, how much of the ideal answer would the assembly produce. `ordered`: can
  each step be generated from only its own prompt plus what came before — the
  small-model-context-budget question, stated as a gradable property.

Both verdicts carry a `rationale` the same length and shape as `judge.js`'s, so
`proposer.js` (unmodified) can read a **stage-tagged critique list** — `[fold] the
fold never carried the Q3 revenue figure`, `[plan] the plan stops before the
conclusion`, `[answer] a bit thin on detail` — and its existing instruction to
*"ground your proposal in a SPECIFIC critique"* now has the granularity to name the
right gene: a `[fold]` critique points at `foldWidth`/`retrieveK`/`bindFloor`, a
`[plan]` critique at `arcEpsilon` (or a structural organ move, if the plan's shape
itself is the problem), an `[answer]`-only critique with nothing upstream flagged
points at `maxTokens` or a chunk-prompt template issue.

---

## §4 — Two objectives, one gene pool, kept apart by what "bare" means

`lift.js`'s existing objective: `quality(surfer + frozen model) − quality(frozen model
bare)`, where *bare* is the frozen model answering with **no scaffolding at all** and
the ceiling (when used) is the judge's own faithfulness reading. Calibration mode's
objective is the same shape with a different *bare* and a different *ceiling*:

```
retrieval-lift (existing, lift.js):
  bare      = frozen model, no surfer scaffolding
  ceiling   = judge's faithfulness score (checkable against the held source)
  withSurfer = frozen model + the surfer's retrieval/grounding

calibration-lift (this document):
  bare      = frozen model, no fold/plan/chunking — raw question in, raw answer out
  ceiling   = the IDEAL answer, scored against itself (→ 1.0 by construction)
  withPipeline = frozen model, run through fold → plan → chunk-prompt loop
```

Both are legitimate readings of `liftFitness`/`gapClosed`/`transferReading`
(`lift.js`, unmodified) over the *same* `genome.js` gene set, because the two `bare`
baselines answer different questions: "does scaffolding help at all" (retrieval-lift)
vs. "does narrowing the context hurt, and by how much, and which dial fixes it"
(calibration-lift). A calibration run and a retrieval-lift run can share one running
genome and simply log which objective produced which reading — they are not in
conflict any more than two different test suites asserting different properties of
the same function are in conflict.

**The transfer falsifier carries over unchanged and matters more here, not less.** A
fold/plan tweak that only helps because it leaked information the frozen model
happened to memorize, or because the chunk-prompt phrasing overfit one model's
quirks, is exactly the "prompt hack" `lift.js`'s header warns about — and it is a
*more* tempting failure mode for calibration mode than for retrieval-lift, because the
frontier ideal is right there to imitate stylistically without actually transferring
the *information*. `transfer.js`'s `createTransferProbe` already runs bare vs.
scaffolded on **two** different frozen models and keeps the weaker lift
(`keptFitness = min(liftA, liftB)`) — wired into calibration mode with zero changes
to that file (§6).

---

## §5 — The cycle

One pass, composing five already-independent pieces plus the two new grading axes:

```
 1. challenger.challenge()          — a frontier "user" poses a realistic task
                                       (an essay prompt, a question, a coding task),
                                       optionally grounded in real material.
 2. ideal(task)                     — the frontier model answers DIRECTLY, unconstrained.
                                       This is the ceiling (§2, §4).
 3. local(task, genome.express())   — the ACTUAL product pipeline: fold -> plan ->
                                       one prompt per chunk -> the frozen local model,
                                       run at the genome's live allocation.
                                       Returns { answer, fold, plan }.
 4. FOUR independent reads, each naming a stage:
      challenger.evaluate()          [answer]       grounded / flowing / resolved
      foldPlanJudge.gradeFold()      [fold]         sufficient / salient / missing
      foldPlanJudge.gradePlan()      [plan]         decomposition / coverage / ordered
      judge.grade()                  [faithfulness] validated against the ideal-as-document
 5. transferProbe.measure()         — the QUANTITATIVE falsifier (transfer.js, unchanged):
                                       bare vs. through-the-pipeline on TWO frozen models,
                                       kept lift = the weaker one.
 6. proposer.propose()              — the breeder reads the FOUR stage-tagged critiques
                                       and proposes ONE dial move on the genome. It
                                       proposes; the tournament (population.js/select.js,
                                       already wired) ratifies. The firewall holds
                                       (constitution.js: "the judge selects and never
                                       writes a weight") — nothing here writes the champion.
```

Implemented as `runCalibrationCycle` in `src/metabolism/calibrate.js`. Every step is
either an injected function (`ideal`, `local` — the caller wires in the real
`weave`/`turn` pipeline; this module never touches it directly, the same arm's-length
posture `challenger.js`'s `answerer` parameter already holds) or an already-armed
metabolism organ. Any one piece being absent or dry-run degrades *that one field* to
`null` — not the whole cycle — composing the dry-run-safety every module in this
faculty already guarantees individually.

`calibrationRunner({ id, backend, local, bare })` adapts a frozen backend plus the two
pipeline entry points into the `{ id, run({task, surfer, scaffolded}) →
Promise<string> }` shape `transfer.createTransferProbe` already expects — `surfer` in
that call is the calibration **allocation** (`genome.express()`), threaded through
exactly the way `transfer.js` already threads an opaque `surfer` argument to its
runners. No change to `transfer.js` itself.

---

## §6 — Assembled the watchmaker's way

```eot
# ── the two new surfaces, closed alone, added to the existing metabolism app ──

fold-plan-judge : surface
fold-plan-judge.room      = calibration
fold-plan-judge.contract.ops      = EVA                    # judge only — it never writes
fold-plan-judge.contract.terrains = Lens
fold-plan-judge.contract.stances  = Binding, Dissecting, Tending
fold-plan-judge.reads     = fold, plan, ideal-answer
fold-plan-judge.emits     = "fold-verdict | plan-verdict | null (dry-run)"
!EVA fold-plan-judge

calibrate : surface
calibrate.room            = metabolism
calibrate.contract.ops    = SIG, EVA, REC                  # attend the reads, judge, propose
calibrate.contract.terrains = Lens, Paradigm
calibrate.contract.stances  = Dissecting, Tracing, Composing
calibrate.reads           = challenger, fold-plan-judge, judge, proposer, transfer-probe
calibrate.forbid          = SYN                            # calibrate never generates an
                                                              # answer itself — ideal() and
                                                              # local() are injected, never
                                                              # authored here
!EVA calibrate

# ── closure: calibrate never writes the champion; only the tournament does ──
metabolism.surfaces = metabolism.surfaces, calibrate, fold-plan-judge
!EVA metabolism
```

Read the contract the way `docs/fold.md §8` reads its own: `calibrate` can `EVA/REC`
(judge the reads, propose a change) but **not** `SYN` — it cannot generate an answer,
only orchestrate the ones `ideal()`/`local()` already produced and hand the breeder a
critique. The separation the whole faculty already runs on — `proposer.js`: *"it
proposes, it does not promote"* — extends here without exception.

---

## §7 — Build order

1. **The two new reads (done in this proposal's companion patch).**
   `fold-plan-judge.js` — `buildFoldRequest`/`buildPlanRequest`,
   `parseFoldVerdict`/`parsePlanVerdict`, `createFoldPlanJudge`, mirroring `judge.js`'s
   dry-run/budget discipline exactly. `calibrate.js` — `runCalibrationCycle`,
   `calibrationRunner`, composing the five organs above with zero changes to any of
   them.
2. **Wire `local()` to the real pipeline.** A thin adapter in `src/rooms/` (or
   wherever the calling surface lives) that takes a task + allocation and drives
   `turn/stages.js`'s fold, `weave/write/plan.js`'s `surfToPlan`, and
   `turn/stage-llm.js`'s per-step generation, returning `{ answer, fold, plan }`. This
   is the one piece with no existing analog — everything else in this document reuses
   code untouched.
3. **A calibration harness script** (`tools/`, alongside `tools/judgment-battery.mjs`
   and `tools/e2e-local-llm/`) that runs N cycles against a fixed task set, logs the
   stage-tagged critique history, and reports the transfer-falsified kept-lift trend —
   the offline loop an operator runs "for a while," per `judge.js`'s own framing of
   itself as scaffolding removed once local generation tracks the standard.
4. **Two-frozen-model wiring for the transfer probe.** Two `calibrationRunner`s over
   two different local backends (e.g. a `webllm` model and a `wllama` model, per
   `tools/e2e-local-llm/`'s existing precedent), so `transfers`/`kept` are measured,
   not asserted.
5. **Multi-message coherence pass.** Extend the calibration task set with multi-turn
   tasks (a `material` sequence + follow-up questions), scoring `gamma`/`foldWidth`
   specifically against whether the plan for turn *k* correctly used the `warm`
   referents `conversation-fold.js` carried from turn *k−1* — the concrete test of
   "perpetually at the cusp of a coherent answer across multiple messages."
6. **Retire the scaffold.** Per `judge.js`'s own stated exit condition: once a
   population's calibration-lift saturates (the proposer stops finding critiques a
   dial move fixes), calibration mode's job is done for that task family — the
   fold/plan/chunk-prompt genome it tuned keeps running without the frontier calls
   that shaped it.

---

## §8 — Open problems (the honest remainder)

- **The `ideal()` ceiling is itself a single frontier sample, not a gold answer.**
  `docs/fold.md §6` already names the general version of this problem: no finite
  process reaches the Pattern coordinate. A calibration cycle's `ceiling` score is
  `idealAnswer` graded against itself (≈1.0 by construction, per §4), so the risk is
  narrower than "is the ideal *true*" — it is "did this one frontier sample happen to
  be an easy or a hard exemplar of the task." Mitigation is the same one `judge.js`'s
  `createJudgePool` already uses for evaluator drift: run calibration cycles across a
  *rotating* task set and a *pool* of ideal-generation calls, never tune against one
  fixed exemplar.
- **`gradeFold`/`gradePlan` are themselves frontier-authored judgments**, subject to
  the same Goodhart risk `fitness.js`'s header names for `validated`: a genome could,
  in principle, evolve toward folds/plans that *read* well to the grader without
  actually transferring — which is exactly why §4 insists the transfer probe (§5 step
  5), not the qualitative critiques, is what gates a promotion. The critiques choose
  *which* dial to try; the falsifier chooses whether the try is *kept*.
- **Chunk-prompt template quality** (as opposed to chunk *budget*, which `maxTokens`
  already governs) has no dedicated gene yet — `decomposition`/`ordered` from
  `gradePlan` are a proxy, not a direct measurement of prompt phrasing. If this proves
  to be the dominant failure mode in practice, it is the next gene to add to
  `genome.js`, following the same pattern (`default` = today's constant, `min`/`max`
  = the legal range, `resource` = what it spends) — not a parallel genome.
