# The tiny model is a form surface

> Once the fold has decided what is true and in what order, the only work left for a
> model is **surface realization** — turning a validated holon into a sentence a human
> can read. That is not a knowledge task. It is a **form** task, and form is the one
> thing small models are good at. So the summarizer is a *contracted part* whose
> contract is the tightest in the catalog, and "extraordinarily effective" is a
> property of the **verifier**, not the model.

Home: `src/weave/topline/surface.js`. It is the verifier layer under the topline
(`docs/topline.md`) — the topline already composes a summary *before* it is written
(closed inventory, two passes, the model-free containment gate); this adds the
**typed contract, the output-grain verdict, best-of-*k*, the extractive floor, and the
replay receipt** the essay calls for, and wires the verdict + receipt onto every
generated topline (`topline.js`).

## The summarizer's contract

```eot
summarizer.contract.ops      = DEF      # assert within a frame — and nothing else
summarizer.contract.terrains = Lens     # one reading of one holon set
summarizer.contract.stances  = Making   # produce a specific thing
```

`FORM_SURFACE_CONTRACT` is a real `contract()` on the cube, proven `.valid` in
`tests/surface.test.js`. Its narrowness is the point: **every class of summarization
failure is an operator the contract does not grant.** Hallucination stops being a
vibe-level property a bigger model suppresses and becomes a set-membership test on a
region of the cube:

| the model's move | classified as | `classifyToken` |
|---|---|---|
| invented a fact / name / number | minted an entity not in the tape | **INS** |
| invented a thesis / "what this means" | synthesised a whole the kernel didn't compose | **SYN** |
| reframed the corpus | restructured the frame it was handed | **REC** |
| flipped a polarity ("did *not* decline") | originated a judgment with no prior event | **EVA** |
| editorialised / set a tone / hedged | fired at Atmosphere in an empty room | **terrain violation** |

`verifyForm(output, { anchor, holons, maxChars, oneSentence })` returns a typed
verdict, not a boolean: `checks` (anchoring · numeric fidelity · budget · coverage),
`violations` (the typed cube-region rejections above), and — named, never hidden —
the `residue` it *cannot* check cheaply: **paraphrase-fidelity** and **implicature**.
Only entailment catches those; a cross-encoder NLI pass is the standing project that
closes the hole, and until it exists the verdict says so rather than claiming a check
it isn't running.

## What shipped, mapped to the essay

- **§2 Selection is accountable** — `verifyForm`'s `coverage` check: every holon in
  the window must be represented, none silently dropped; `missing` names the losses.
- **§5 A verifier at the output grain, and honesty about its ceiling** — the `checks`
  are exactly the essay's cheap deterministic list; the residue is printed, not
  papered over.
- **§5/§6 Best-of-*k*, then the floor** — `realizeForm` draws up to *k* samples,
  verifies each, takes the first that passes; on total failure it emits the
  **extractive floor** (`extractiveFloor`) — the anchored span itself, marked
  extractive. The downside of a tiny model is a quotation, never a hallucination, and
  that asymmetry is what makes tiny-model failure *safe*.
- **§8 Replay** — `formReceipt` logs model descriptor, prompt hash, output hash, seed,
  sample index, **mask width** (the vocabulary the realizer was permitted), contract
  width, mode, and verdict. Pure and deterministic (no `Date.now`/`Math.random` — the
  seed and index are passed in), so a summary sentence is a claim replayable to the
  token.
- **§9 Coverage composes pessimistically** — `composeCoverage` is the min ratio and
  the union of everything dropped below. What a section drops, the document cannot
  recover; the number reaching the top is real, sometimes embarrassing, and printed
  anyway.

## What is deliberately *not* here

- **§4 Sampler-side vocabulary masking.** Making INS *undrawable* (masking the logit
  distribution to the anchor's vocabulary) needs per-token logit access the local
  backends don't yet expose — `propose` is greedy one-hot today
  (`src/model/wllama.js`). Until then the contract is enforced *after* the fact by
  `verifyForm` rather than *a-priori* in the decoder. `CONTRACT_WIDTH` and the
  receipt's `maskWidth` are already the declared, logged knobs that mask would widen,
  so the seam is shaped for it.
- **§7 Form from the corpus.** Mining instruction-tuning corpora for the *shape* of
  sentences (form) while the fold supplies the *content* (slots) is complementary work
  the topline's definer chorus (`chorus.js`) already gestures at; not touched here.

## The dispatcher — a surf parsed into pattern-quests, model-free

`src/surfer/fold/dispatch.js`. The head of the synthesis pipeline: given a *surf*
(a region of the graph already routed to), cut it into the discrete pattern-quests
the parallel folds will pursue. Parsing a surf into quests is **graph algebra, not
language** — the quest count falls out of the born spectrum
(`voidnull.DEF(eigenvalues)`), never out of a model's choice — so the dispatcher is
**model-free by default**. It runs the significance triad as a loop:

- **DEF — `discretize(surf)`** proposes the quests off the graph's own geometry:
  one per referent (salience = incident bond mass), one per significance bond-group
  (a recurring co-occurrence), and `DEF(spectrum).k` per resolved reading. Pure,
  deterministic, replayable.
- **EVA — `findable(...)`** evaluates whether that discretization is discrete
  *enough to be found*: ≥2 distinguishable things **and** real structure among them
  (a bond to hunt, or a spectrum that resolved). A bag of disconnected referents over
  a flat spectrum is a blur — ≥2 things, nothing separating them — and that *measured*
  verdict is what sends it on.
- **REC — `pullApart(surf, model)`** runs the local model **only when EVA fails**,
  and only to propose a **search plan** (angle labels), each re-grounded against a
  referent or bond-via actually present in the surf — an ungrounded angle attaches to
  nothing and is dropped. The model is the exception, never the hot path; a thin surf
  with no model abstains to one honest coarse quest rather than inventing
  discretization it cannot measure.

The dispatcher decides *where to look*, not *what's true* — it fires `SEG`/`SIG`,
never `DEF`/`EVA` on the content — so a small model in the REC slot is a bounded,
safe search hint, and the whole fan-out stays replayable to the token. The one
boundary condition: dispatch is model-free *iff the semantic frame the query needs is
already reified in the graph* (the typing/edges exist). If a quest needs a
distinction the graph doesn't carry, that is a gap in the **read**, fixed upstream at
perceive-time — never papered over by a model in dispatch.

## The one-line version

Build the verifier. The model is the easy part.

## Where it lives

| piece | file |
|---|---|
| the form-surface contract + typed verifier | `src/weave/topline/surface.js` |
| the set-containment anchoring axis it reuses | `src/weave/topline/contain.js` |
| verdict + receipt wired onto every topline | `src/weave/topline/topline.js` |
| the module's own EO contract | `src/weave/topline/eo-contract.js` |
| tests | `tests/surface.test.js` |
