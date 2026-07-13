# Length is a property of the field — falsifiers first

**Status:** diagnosis established by reading; build gated on the falsifiers in §7 of the
spec. This document records what the reading found, what the falsifiers returned, and the
build decision each one licensed. The three falsifiers ship as runnable tools:

- `tools/falsify-f1-length.mjs` — does the field predict length better than the regex?
- `tools/falsify-f2-grammar.mjs` — does the corpus grammar beat the hand-derived phase bias?
- `tools/falsify-f3-faithfulness.mjs` — does the walk beat the plain path on faithfulness?

The headline: **F2 refuses the §5 wiring, and F1/F3 cannot be measured in a headless
environment. No empirical gate licenses a change to the length/long-form machinery, so
none was made.** The instruments that would license it are now in the tree; run them where
the corpus and the model exist.

---

## 1. Diagnosis — confirmed, with one correction

The wiring the spec describes is real and reads as claimed **with one factual correction that
matters for §3**:

- `LONGFORM_RE` / `wantsLongform` / `LONGFORM_MAX_TOKENS` live in `src/rooms/reader/app.js`
  (lines 158–160). A long-form ask sets `maxTokens: 1600, longform: true` on the `runTurn`
  call (app.js:1982).
- `src/turn/stages.js` passes `longform` through to `buildChatMessages` (stages.js:803) and
  gates the paragraph loop on it (`maxParagraphs: ctx.longform ? null : 1`, stages.js:877).
- `src/weave/longgen/` (21 files) is unwired on the answer path: only `answerabilityGate`
  (from `answerable.js`, via stages.js:33) and `relax` (via `frame/bind.js`, `turn/intent.js`,
  `turn/meta-route.js`) run. `model-entry.js` re-exports `walk, frameLeak, progressAgainst,
  buildSkeleton, loadInstalledPrior` and **no one consumes the re-export**. `weave/commission/`
  has no functional call site (only an `eo-contract` import). `weave/essay/` (`runEssay`) is
  **also** dead in the same way — re-exported, never called.

**Correction (bears on §3).** `CAPABILITY_CUE` is **not wired**. It is defined in
`src/model/prompt.js` and re-exported from `model-entry.js`, but **no band or stage renders
it**: the grounded prompt's `shape`/`register` slot is deliberately left empty
(stages.js:791–793, "nothing rides the shape slot here"), and the chat path's long-form band
renders `LONGFORM_DIRECTIVE`, not `CAPABILITY_CUE`. `LONGFORM_DIRECTIVE` is the opposite of an
apology — it instructs the model to "Write it out in FULL … Aim for depth and length; do not
stop after a sentence or two" (`bands.js:95`). So the live long-form policy is
**regex → (`maxTokens:1600` + uncapped paragraph loop + a "pad it out" directive)**, not the
self-deprecating cue the spec quotes. The cue is dead (and misleading) code; the spec's
premise that "the apology … is currently the only long-form policy" does not hold against the
current tree.

The *spirit* of the diagnosis stands regardless: length is selected by a regex over the
question and then handed to the mouth as a prose directive. Whether that directive says
"be short and humble" (the dead cue) or "pad it out" (the live directive), the model — a
next-token predictor — governs length, not the field.

## 2. The gate

The spec is explicit that the build is gated: "build gated on the falsifiers in §7," "Run
this before touching stages.js" (F1), "before making the walk the default" (F3), "If the
product does not beat both, keep the seat and drop the grammar" (F2). These are
pre-registered decisions. The falsifiers were built and run first; the code decisions follow
from them.

## 3. F1 — field vs regex as a length predictor

`node tools/falsify-f1-length.mjs`

The regex baseline over all 430 exemplars (`data/exemplars.jsonl`, question → known-good
answer):

| measure | value |
|---|---|
| regex fires on | **6 / 430** questions (1.4%) |
| mean good-answer length \| regex fires | 120.7 words |
| mean good-answer length \| regex quiet | 59.9 words |
| point-biserial r(regex, answer words) | **0.204** |
| long answers (top tercile, ≥72 words) **missed** by the regex | **140 / 144 (97%)** |

The regex catches almost none of the length that real answers carry: 97% of the actually-long
good answers come from questions the regex never fires on. As an incumbent length signal it is
weak and low-recall — substantiating "a regex over the user's adverbs is not a measurement of
the field."

**But the field side cannot be measured here.** `buildSkeleton(ground).planned` needs real
retrieved spans `{idx,text,score}`; the exemplar corpus pairs a question with a `response` but
carries only a prose `context_sketch`, not ground. No `(question, ground, good-answer)` corpus
exists in the repo. The harness runs the full head-to-head when given one via
`--ground <file.jsonl>`. **Verdict: INCONCLUSIVE** — the incumbent is characterized and looks
poor, but the inversion is not confirmed. Per the spec's gate, `buildSkeleton` is **not**
licensed as the length authority in `stages.js` until F1 can complete. `stages.js` was not
touched.

## 4. F2 — corpus grammar vs hand-derived phase bias  ·  **FAIL**

`node tools/falsify-f2-grammar.mjs`

Held-out log-likelihood of real responses' move sequences (430 exemplars, depicted alphabet
`[NUL,SEG,SIG,CON,INS,SYN,VOID]`; the pooled grammar refit on the train split only — no
leakage). Metric is mean per-move log2-likelihood (higher = better).

| predictor | 100-holdout | 5-fold CV |
|---|---|---|
| phaseBias-only | −3.0024 | −3.0293 |
| grammar-only | **−0.7441** | **−0.7664** |
| product (grammar × phaseBias) | −0.7621 | −0.8038 |

- product − grammar = **−0.0181** bits/move (holdout), −0.037 (CV) — the product is *worse*.
- product − phaseBias = +2.24 bits/move.

The pooled grammar alone predicts real responses far better than the phase bias (the SEG→CON
0.93 / NUL→NUL 0.82 structure is highly regular). But multiplying the grammar by
`phaseBias(phase)` — exactly the §5 proposal — makes it predict real responses *worse* than the
grammar alone. The two do **not** cover different blind spots; the hand-assigned open/develop/
land multipliers pull the draw away from how real responses actually move. Per the
pre-registered rule ("If the product does not beat both, keep the seat and drop the grammar"),
**the §5 wiring is refused.** The grammar was not wired into `predictDirection`.

(A note for a future run: grammar-alone dominates both the product and the phase bias, so if
anything the phase bias is the weaker component. But wiring grammar-alone is a *different*,
un-pre-registered change to the walk's draw — and the walk is not on the answer path — so it
was not made either. It would need F1/F3 to clear first to be validated end-to-end.)

## 5. F3 — walk vs plain path on faithfulness  ·  BLOCKED

`node tools/falsify-f3-faithfulness.mjs --questions <file.jsonl> [--key <k>]`

`compareModes` (already in `longgen/generate.js`) runs planner-on and planner-off on the same
question and returns `faithfulnessDelta` / `plannerAtLeastAsFaithful`. F3 requires a **live
model** and **real ground**. The reader's dependable talker is the hosted `claude` backend,
which needs an API key and the browser SDK; there is no headless model in the repo and no key
in this environment, and no live `(question, ground)` set. The harness executes the full
`compareModes` loop end-to-end (verified against the offline `echo` backend), but produces no
meaningful verdict without a real talker. **Verdict: INCONCLUSIVE.** Per the spec, the walk is
**not** licensed as the long-form default until F3 clears. If it cannot beat the plain path on
faithfulness, the correct long-form policy is a short grounded answer — the plain path
(`planner: false`) plus the answerability gate — reached by measurement rather than by asking
the model how it feels about itself.

## 6. The build the falsifiers licensed

| spec step | gate | result | shipped |
|---|---|---|---|
| §4 wire the walk into `stages.js` | F1 (before touching stages.js), F3 (before default) | F1 inconclusive, F3 blocked | **no** |
| §5 grammar × phaseBias prior in `predictDirection` | F2 | **FAIL** | **no** |
| §3 delete `CAPABILITY_CUE` | — | dead code, but premise misdiagnosed; also referenced by `tools/prompt-census` | **no** (see below) |
| §3 delete regex / budget / pass-through | F1, F3 | inconclusive/blocked | **no** |
| §7 falsifier instruments | — | built + run | **yes** |

Nothing in the length/long-form machinery was changed. Every empirical gate the spec placed
in front of those changes either failed (F2) or could not run (F1, F3), and the discipline the
codebase runs on — "flag off → byte-identical," "bench-validated before it changes the
reading," "the toggle IS the measurement" — is exactly the discipline §7 encodes. The dead
`CAPABILITY_CUE` was left in place rather than removed piecemeal: its deletion is byte-identical
at runtime but would also require editing `tools/prompt-census/census.mjs`, and its §3 rationale
rests on the misdiagnosis corrected in §1. It is flagged here as dead + misleading so the team
can retire it deliberately.

## 7. To complete the gate

- **F1:** assemble a `(question, ground:[{idx,text,score}], answer)` corpus of ~50 varied-length
  pairs (the reader's own retrieval output on real docs is the natural source) and run
  `falsify-f1-length.mjs --ground <file>`. If `r(buildSkeleton.planned, answer)` beats
  `r(wantsLongform, answer)`, the inversion holds and `stages.js` may be rewired.
- **F3:** point `falsify-f3-faithfulness.mjs` at a keyed model (browser / headless-chromium,
  like `tools/verify-shapes.mjs`) and ~50 live grounded questions. If the planner is at least as
  faithful as the plain path, the walk may become the default; if not, route long-form asks to
  the plain path + gate.
- **F2:** re-run if the exemplar corpus grows; the current verdict (refuse the product) holds
  at n=430.
