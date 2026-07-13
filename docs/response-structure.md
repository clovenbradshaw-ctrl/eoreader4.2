# Response structure — the answer's typed frame

> The structural twin of `docs/answer-expectation.md` (tone) and the render-side
> sibling of `docs/answerability.md` (existence). Answerability asks *is there
> anything to say?* and the tonal predictor (`turn/shape.js`) asks *does this read
> like the right KIND of answer?* — and by its own law it never gates: *form is a
> smoke alarm, taste is not refusable.* This asks the third question, the one nothing
> in the tree currently answers: **does the answer have a SHAPE an auditor can point
> at — a typed frame of slots, each one seated by a claim the record witnesses, or
> else a plainly-said absence?** Not *is it grounded* (the gate already decides that)
> and not *does it sound right* (taste), but *is it built like an artefact instead of
> poured like prose.*

## The three asks, and which are already met

The brief was three things: **more structured**, **grounded**, **less interested in
responding to any random thing.** Two of the three are already deep in the engine.

- **Grounded** is the whole posture. `enactor/gate.js` (`runGate`) collapses only the
  propositions that beat a derived null — support × relevance × redundancy, a multiply
  where any zero factor blocks the assertion; the rest VOID. `enactor/answer/void.js`
  types the absence and renders its receipt. `enactor/ground/spans.js` pincites every
  surviving claim to its sentence. `enactor/factcheck/propositions.js` decomposes an
  answer into the propositions that can be checked. The record-witnessed discipline is
  not missing — it is the spine.
- **Less interested in responding to any random thing** is `docs/response-demand.md`,
  landed to rung 3: a `phatic` direction in the route relaxation short-circuits a
  greeting to a one-line reply *before the planner is ever spent*, and never fires on a
  referential continuation (the fold's incumbent out-competes it). A hello no longer
  drags the grounding pipeline into inventing a document-flavoured non-answer.

**Structured** is the gap. And the gap has a specific, measurable shape.

## The gap: tone is measured, structure is not — and the library is tuned the wrong way

`turn/shape.js` is a genuinely careful FORM predictor: it reads the nearest sample
answers to a question, then scores a draft's move-grammar against the intent's own
held-out margin (`turn/shape-grammar.js`, `data/shapes.json`). But its verdict is a
*soft* `answerFormError` — `gates: false`, always. That is correct for tone. It leaves
the artefact unmeasured on the axis the brief actually names:

- a draft can read exactly like a `summary` and still be a wall of prose with **no
  named slots** — nothing a surface can arrange, nothing an auditor can index;
- a claim with **three witnesses can sit beside a claim with none** and the prose gives
  no sign — grounding is a property of the *selection*, but once selected, the surface
  loses the seam between the witnessed and the confabulated;
- the only place structure exists today is the **mechanical answerers**
  (`enactor/answer/mechanical.js`): `answerRelation`, `answerWho`, `answerConfirm` all
  return `{ route, text, sources }` with `[sN]` pincites and an explicit *"the document
  does not say."* — beautifully structured, and **narrow**. Everything outside their
  regexes falls to free prose scored only for mood.

And the mood it is scored toward is the problem. `data/exemplars.jsonl` is 430 authored
answers across ~22 intents, and counting them, the space is **dominated by tone and
stance**: `playful` (14), `dry` (14 as an intent, 38 as a tag), `emphatic`, `warm`,
`tender`, `wry`, `conversational-aside` (24), `acknowledge-good-question` (14),
`commit-opinion` (14). The library is, in aggregate, tuned to **respond charmingly to
anything** — to always have a graceful thing to say. That is the exact instinct the
brief pushes against. Being *less interested in responding to any random thing* is not
only a gate before the planner; it is a **refusal to let tone stand in for substance**
once the planner runs. If the frame has nothing to seat, the answer is an absence —
said plainly — not a mood emitted to fill the turn.

## Where it lives: the speech organ, and nowhere else

The brief said this should all live in the specific chat-organ part. It does, and the
architecture already names which part. `organs/out/speech` is the **speech output
organ** — a *bare renderer* (add-on 3 §1): props → language. Its one existing job is
`segment.js`, which cuts the model's murmur INTO candidate propositions. The judging
moved OUT of the organ to the enactor faculty (`enactor/gate.js`), on purpose:
**organs render, the enactor grounds.** That separation is exactly what lets structure
land cleanly.

> **Structure is a rendering concern.** *Which* claims survive is the gate's call
> (grounding, refusable). *Where each survivor lands* — which slot of which frame — is
> the organ's. So the new module is `organs/out/speech/schema.js`, seated beside
> `segment.js` as its mirror image: segment.js is murmur → propositions (SEG); schema.js
> is committed-propositions → a typed frame (DEF·SEG). It does no judging. It cannot
> assert anything the gate did not already witness.

This is `STRUCTURE` as the structural sibling of `shape.js`'s `FORM`, and it sits
**above** tone: a grounded `answer` frame has no `playful` variant and no `dry` one.

## The taxonomy collapse: ~22 tonal intents → 4 cube tasks + the void family

`turn/intent.js` already reads the turn's task off the question as physics, onto four
cube cells (its `TASK_CUBE`). Those four are the response KINDS. The exemplar library's
~22 intents are not 22 kinds — they are the four kinds crossed with tone and stance.
Collapse them:

| exemplar intent(s) | cube task | frame it seats into |
| --- | --- | --- |
| `lookup` | **answer** · Existence × Figure → Entity | one `fact` slot (+ optional `reorient`) |
| *(enumeration)* | **list** · Structure × Pattern → Network | `member` slots, each witnessed |
| `connect-passages`, `expand-on-prior` | **explain** · Interpretation × Figure → Lens | `figure` + `step` slots |
| `synthesis`, `notice-pattern` | **summary** · Interpretation × Pattern → Paradigm | `frame` + `support` (+ optional `tension`) |
| `hedge-uncertain`, `say-what-youd-need`, `refusal-without-condescension`, `out-of-scope-offer` | **the void family** | the typed absence — `enactor/answer/void.js`'s receipt, not a new reply kind |
| `clarify-question`, `reframe-the-question` | **the ask** | `fold.awaiting` (`docs/response-demand.md` §7) — a posed choice, not free prose |
| `name-tension`, `correction-of-self`, `disagree-with-source` | **a slot, not a kind** | ride *inside* a content frame as the optional `tension` slot |
| `dry`, `playful`, `emphatic`, `warm`, `tender`, `wry`, `commit-opinion`, `conversational-aside`, `acknowledge-good-question`, `pushback-repair` | **tone** — collapses out | at most a thin post-filter over a seated frame; never decides what the frame holds |

The payoff is the last two rows. A *tension* the reader notices is not a free-form
"let me disagree with the source" turn — it is a **typed slot the summary frame carries
and must not smooth over.** A *correction of self* is not a new mood — it is the same
slot pointing at a prior turn. And the register tags stop being response kinds
entirely: they are a coat of paint the organ may apply *after* the frame is seated, and
the frame is seated regardless of whether any paint is left.

## The two laws the frame inherits

`schema.js` (`renderStructured`) enforces two laws, each inherited from the faculty it
borders — so nothing new is asserted, only *arranged*.

1. **Witnessed-or-absent** (from the gate). A slot is filled by a claim that carries a
   witness (`sources` non-empty) or it is not filled at all. An unwitnessed claim is
   **dropped** — the structural echo of the gate refusing to collapse an ungrounded
   proposition (support 0 → product 0 → cannot collapse). There is no *structured but
   unsourced* state; the frame cannot represent one. `everySlotWitnessed(structure)` is
   the checkable invariant, the property the free-prose path could never offer.

2. **Unfillable-is-void** (from answerability). When a **required** slot has no
   witnessed claim to fill it, the frame does not degrade to a charming near-miss. It
   renders the typed absence — the measured verdict's own receipt when one exists
   (`answerVoid` → `"quokkas" is not in this document.`), else the fixed conscience
   token `VOID_TOKEN` (`enactor/gate.js` — *"The text does not say."*, never reworded).
   **This is "less interested in responding to any random thing," made structural.**

## How it composes — no new physics

`schema.js` is a renderer over what the faculties already produce. The seam is one map,
per turn, from the gate's output to the frame's input:

```
  runGate(...)            enactor/gate.js
    → committed[]         grounded propositions, pincited by ground/spans.js
    → voided / VOID       the typed absence when a target had only absence
        │
        ▼   (the one seam, a future rung)
  claims = committed.map(c => ({ text: surfaceOf(c), sources: citesOf(c), role: roleOf(c) }))
        │
        ▼
  renderStructured({ task, claims, voidVerdict })   organs/out/speech/schema.js
    → { route, text, sources, structure }           the mechanical-answerer shape + the frame
```

- **the gate** decides membership; the frame arranges the members. A claim the gate
  did not commit never reaches a slot.
- **the void answerer** supplies the absence receipt; the frame renders it verbatim
  when a required slot is empty.
- **factcheck's propositions** are the natural grain of a slot — a slot holds one
  proposition, so the same decomposition that `enactor/factcheck/propositions.js`
  already computes is what `roleOf`/`surfaceOf` read.
- **the phatic gate** runs *before* any of this — a turn that never wanted work never
  reaches the frame at all.
- **`shape.js`'s FORM** now scores the *rendered frame's* prose for tone, subordinate
  to structure: it can still flag "this doesn't read like a summary," but it can no
  longer be the only thing measured, and it still never gates.

The `structure` payload is the machine-readable frame — JSON-serializable, every
content slot carrying its witnesses — so the Provenance DAG surface and `limner`/
`publish` render richer layouts from it while `text` remains the honest prose fallback.

## The frames (the schemas)

Defined in `schema.js` `TASK_SCHEMA`, one per cube task, each slot typed by cardinality
(`one` / `many` / `opt`) and marked `required`:

- **answer** — `fact` (one, required) + `reorient` (opt). The pointed lookup; the
  reorient slot is the *"…again"* case (`data/exemplars.jsonl` `lookup-title-reorient`).
- **list** — `member` (many, required). Several members render as a real list, each
  cited; one renders as a sentence.
- **explain** — `figure` (one, required) + `step` (many, required). One figure read
  under a frame, then the reasoning, each step witnessed.
- **summary** — `frame` (one, required) + `support` (many) + `tension` (opt). The
  framing claim, its supports, and the contradiction it must not smooth over.

## Build ladder

| Rung | What | Model? | Status |
| --- | --- | --- | --- |
| **1** | `schema.js` — `TASK_SCHEMA` (the four typed frames) + `renderStructured` (seat committed claims, drop the unwitnessed, void the unfillable) + `everySlotWitnessed`. Pure, model-free, inert-on-empty. Registered in `organs/eo-contract.js`; `tests/speech-structure.test.js` pins both laws, the drop, the void fallback, and the JSON payload. | no | **done** |
| **2** | The seam: `roleOf` / `surfaceOf` / `citesOf` mapping `runGate` `committed[]` → `claims[]`. `roleOf` reads the cube grain the register already sets (`turn/intent.js` `cubeOf`) — a Figure claim is a `fact`/`figure`, a Pattern claim a `frame`/`member` — so slotting is derived, not hand-labelled. Model-free. | no | pending |
| **3** | Wire `renderStructured` into the turn as a candidate surface for the gate's already-committed output, behind the `RULES_REV` flag `organs/out/speech/index.js` already reads, so the free-prose path stays byte-identical until the framed path wins the Metamorphosis battery (`docs/` §10). | flag | pending |
| **4** | Demote the tonal intents in `data/exemplars.jsonl`: re-tag `dry`/`playful`/`emphatic`/… from `intent` to `shape_tags`, so the shape library navigates over the four kinds + void family and tone rides only as a tag. Re-fit `data/shapes.json`. | no (data) | pending |
| **5** | The `tension` slot as a first-class summary output: surface a measured source-contradiction (`enactor/factcheck/correspond.js`) into the optional slot, so a synthesis that elides a contradiction reads as *incomplete*, not merely short. | no | pending |
| **6** | Register post-filter (opt-in): a thin tone pass over a *seated* frame, gated by `shape.js`. Never alters which claims are seated — paint, not structure. | flag | pending |

Rung 1 is landed here — the pure renderer and its two laws, tested — with the wiring
left as flagged seams exactly as the grounded-speech path (`RULES_REV`) and the shape
grammar already are. The behavioural change is opt-in and non-breaking by construction.

## Non-goals

- **Not a schema the model emits.** The frame is filled from the gate's *already-
  committed* propositions, never by asking a small model for JSON — the same discipline
  `docs/discourse-routing.md` is emphatic about: *a constrained vocabulary is JSON with
  fewer braces*, and a model asked for a label reverts to its priors.
- **Not a new grounding check.** `schema.js` asserts nothing. If the gate did not
  witness a claim, the frame drops it; the frame never *re-admits* on its own.
- **Structure never overrides taste's non-refusability the other way.** A frame that
  seats cleanly but reads oddly is still emitted — tone flags, structure arranges, and
  only *grounding* refuses.
- **The tonal intents are not deleted, they are demoted.** Warmth is still available as
  a post-filter; it simply stops being a response KIND that can stand in for a witnessed
  claim.

## EO mapping

Seating a committed proposition into a slot is a **DEF** (declare the typed frame — the
form) over a **SEG** (cut the committed props into slots), reading a **Network** of
grounded claims and a **Void** verdict, producing a **Lens** (the framed reading)
rendered to a **Field** (the surface), resolving `Dissecting` (the cut) and `Binding`
(claim to slot to witness). No new operators; the vocabulary the engine already speaks
(`docs/operators.md`). It is the organ's half of the same DEF·EVA·REC the gate runs:
the gate's EVA·REC selected; the organ's DEF·SEG arranges.

## Files

- the renderer + the four frames + the two laws: `src/organs/out/speech/schema.js`
- its contract: `src/organs/eo-contract.js` (`out/speech/schema.js`)
- its tests: `tests/speech-structure.test.js`
- the grounding it renders over: `src/enactor/gate.js` (`runGate`, `VOID_TOKEN`),
  `src/enactor/answer/void.js` (`answerVoid`), `src/enactor/ground/spans.js`
- the tonal sibling it stands above: `src/turn/shape.js`, `src/turn/shape-grammar.js`,
  `data/exemplars.jsonl`, `data/shapes.json`
- the register that supplies the task + cube grain: `src/turn/intent.js` (`cubeOf`,
  `TASK_CUBE`)
- the demand gate on the turn before it: `docs/response-demand.md`
- the sibling that types absence: 4.1 `docs/answerability.md`
