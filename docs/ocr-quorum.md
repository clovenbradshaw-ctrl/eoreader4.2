# OCR quorum + context — a set of witnesses, then a reading that edits itself

*Multiple eyes read one scan; the best reading is elected; the shaky lines are re-read as
what they likely mean — every layer on the append-only log, auditable and revertible.*

A single OCR engine is one eye. It reads a scan and ASSERTS a line, and there is no second
look to catch the letter it misread — a `v` for a `u`, a `]3` for a `B`, a `0` for an `O`.
For a record that matters (a contract, an exhibit, a filing) one eye is not enough. This
change makes OCR a QUORUM: several engines read the same image as independent witnesses, and
the system settles what they SAY and then guesses what they MEAN — the way the ear already
does for a waveform (`organs/in/hear.js`, "the hearing that edits itself").

It is the request said plainly — *"multiple OCR models load and do DEF EVA REC on which is
best, a set of witnesses, multiple eyes"* — plus the follow-on: *"the OCR returns what it
does, but our system can then make guesses as to what it likely means given the content of
what else we have, all of these layers easy to audit and revert."*

## The three layers

Each layer lands on the same append-only log, so none silently overwrites the one below it.

| Layer | What it is | Where it lives | On the log |
|---|---|---|---|
| **1 · Raw** | what each eye literally returned | `span.ref.witnesses` (never mutated) | the eyes' readings, kept verbatim |
| **2 · Quorum** | the elected reading, per line | `span.text` + `span.ref` | `INS`/`DEF` (the line), `EVA` (disagreements), `REC` (reliability) |
| **3 · Guess** | what a shaky line likely MEANS in context | `span.text` + `span.revisedFrom`; raw kept on `span.raw` | `SEG` retract · `INS` re-mint · `DEF` provenance · `EVA` reason · `REC` rule |

Because layer 3's edit RETRACTS the shaky reading rather than deleting it,
`revertOcrGuesses(doc)` peels the whole layer straight back off — and the reversal is itself
a logged, auditable act. Nothing is unwritten, in either direction.

## The EO story — the whole feature is the Interpretation column

The three operators the request named are the three cells of the cube's Interpretation
column (`docs/operators.md`):

- **DEF** (assert) — each eye asserts its reading; the quorum DEFs the elected one.
- **EVA** (evaluate) — the eyes' competing frames are weighed: which reading is best, and
  where they disagreed (the lines a reader must check).
- **REC** (learn) — a rule is learned from the page itself: how often each eye agreed with
  the consensus — its RELIABILITY — so *which eye is best* is measured, never declared.

`organs/in/ocr-quorum.js` carries the contract `DEF·EVA·REC(Lens → Lens, Paradigm)` — it
reads the eyes' competing readings (each a Lens, a reading under a frame) and yields the
elected reading (a Lens) plus the learned rule (a Paradigm, the frame-of-frames). It crosses
no column: DEF, EVA, REC are all native to Interpretation.

## Belief — a reading is an assertion, held below authored text

`ocrBelief` is structurally the ear's `hearingBelief` (`hear.js` §2a), with **agreement**
standing where the waveform stood. The truth is what independent eyes converge on, so
consensus leads and the model's own confidence only tempers — the ear's blend, unchanged,
told about pixels instead of pressure waves:

```
eyes ≥ 2:   w = 0.65 · agreement + 0.35 · confidence   (consensus leads, confidence tempers)
eyes = 1:   w = min(confidence, ½)                      (one voice of the two corroboration asks)
belief  = CONVERSATIONAL_CAP · w                         (an OCR line is SEEN, never authored)
```

Two consequences fall out, and both are flagged for the reader:

- A line **one eye** saw has no corroboration — the bar is two
  (`enactor/ground/corroboration.js`) — so it is kept as a real passage but believed at most
  half, and marked `single-eye`.
- A line the eyes **split** on is believed low and marked `disagreement` — never silently
  trusting whichever engine ran first.

The elected reading is always one an eye ACTUALLY produced — never a per-character
Frankenstein stitched from three. A reading is a witness's assertion; a line no eye read is
a line no witness will stand behind. The quorum PICKS; it does not fabricate.

## The reliability rule (REC) — "which eye is best", measured

Over the lines where a SECOND eye existed to check against, each eye's reliability is
`agreements / checked` — how often its reading fell in the elected group. A lone-eye line
teaches nothing about trust (there was no consensus to agree with), so it is excluded. The
top of that ranking is the DEF of the most reliable eye. On the probe's three lines, one eye
that dissented once lands at 50%; the steady eyes at 100%.

## The context layer — what it likely MEANS

`organs/in/ocr-context.js` is the reading's second pass. A garbled `cortract` on a
low-belief line, when the document confidently says `contract` elsewhere, is almost certainly
`contract` misread — so we guess it, and mark the guess a guess. It reuses the reader's OWN
primitives: the fuzzy matcher (`parse/fuzzy.js`, the same bounded-Levenshtein under a
length-aware ceiling the ear folds names with) and the entity admission (`parse/entities.js`),
never a bespoke dictionary. A garble is corrected only toward a term that is (a) a
near-spelling within the ceiling, (b) BETTER attested than the garble, and (c) vouched for by
a MORE-BELIEVED line than the one being edited — the "re-read the shaky one to the confident
one" rule, so a confident line is never dragged toward a shaky one.

The context is *"what else we have"*: the document's own confident vocabulary, its admitted
entities, and — when the caller threads one — the corpus lexicon (`resolveOcrInContext(doc, {
lexicon })`), so a name the current scan never spells right but the rest of the matter does
gets repaired.

## The eyes — pluggable, and woken by need

`rooms/reader/eo/ocr-eyes.js` is the registry of eyes and the policy for when to open the
expensive ones:

- **tesseract** (deterministic) — no download, reproducible, milliseconds. Always run.
- **florence2-ocr** (VLM) — `<OCR_WITH_REGION>` on the reader's already-warm vision organ,
  reused so a scan and its scene reading share one model load and one OPFS cache.

The default policy is `auto`: the cheap eye reads first, and the VLM eye is woken only when
that reading is DOUBTFUL (sparse, or low mean confidence) — a clean scan stays a one-eye,
no-download read; a smudged or handwritten one earns a second pair of eyes. `all` forces
every eye (maximum corroboration, when accuracy outweighs latency); `fast` is the
deterministic eye alone. The policy governs SPEND, never correctness — which reading is
believed is the quorum's call. Adding a third eye (PaddleOCR, TrOCR, a cloud engine) is one
entry in `EYES`; nothing downstream changes.

## What shipped

- `organs/in/ocr-quorum.js` — the pure reconciler: spatial mutual-nearest alignment,
  election, `ocrBelief`, the reliability rule, the DEF·EVA·REC ledger. Model-free, Node-tested.
- `organs/in/ocr-context.js` — the self-editing context pass + `revertOcrGuesses`.
- `organs/in/ocr.js` — `ingestOcr({ readings })` routes the quorum; one eye reads exactly
  like the classic single-list path (a superset, never a tax on the common case).
- `rooms/reader/eo/ocr-eyes.js` + `vision.js` `ocr()` — the browser eyes and the wake policy.
- `rooms/reader/import-file.js` — `fromImage` reads with the eyes, reconciles, and re-reads
  in context; falls back to one eye, then to the scene path, exactly as before.

## Tests and the probe

- `tests/ocr-quorum.test.js` — the belief spectrum, alignment, election of an actual eye's
  reading, the reliability rule, the disagreement flag, and byte-identical single-eye fallback.
- `tests/ocr-context.test.js` — the guess, the log trail, char-range reprojection after a
  length-changing edit, revert, the corpus lexicon, and inertness on a clean doc.
- `probes/ocr-quorum.mjs` — a runnable narrative: the quorum outvotes a cross-eye misread,
  the context layer repairs the single-eye garble the quorum could not, and the whole trail
  reverts. `node probes/ocr-quorum.mjs`.

## What is deliberately not built

- **Per-character consensus.** The quorum elects a whole line an eye produced; it never
  stitches a line from the best character of each eye (a reading no witness made). A
  character-level vote is a possible future layer, but it would manufacture assertions, so it
  is left out on principle.
- **Threading the project lexicon by default.** `resolveOcrInContext` accepts a corpus
  `lexicon` and `fromImage` forwards `opts.ocrLexicon`, but the reader does not yet assemble
  the project's vocabulary automatically — the intra-document context runs today; the
  cross-document one is one wire away.
- **A UI for the layers.** The belief, the witnesses, the disagreements, and the guesses all
  ride `doc.spans[i].ref` and the log; rendering the crop, the per-eye readings, and a
  per-guess revert toggle is UI work this change leaves addressable.
