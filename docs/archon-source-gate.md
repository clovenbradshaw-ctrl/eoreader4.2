# The archon — write-time span-anchored grounding

> "It's just citing everything written to a source span."

Two orders of grounding are possible. eoreader's default is **write freely, then cite**: the
talker streams prose to the surface and the `bind` stage cites it afterward, flagging whatever it
could not bind (and allowing "void-grounded" prose — the model's own words, witnessed by nothing
read). The other order — the one this document describes — is **cite as you write**: a sentence is
admitted to the answer only once it already sources. Nothing unsourceable ships.

That second order is the **archon** (`src/enactor/ground/archon.js`): the magistrate the streaming
boundary gate consults at each **period**. It is armed only under the **Grounded** chip
(`ctx.grounding === 'grounded'`); `auto` and `free` are byte-identical to the incumbent writer.

## The rule

When a sentence closes, the archon decomposes it into **propositions** (a sentence can carry
several) and admits it only when **every** proposition is:

1. **grounded** in the document — the same figures stand in the same relation the document holds
   (`classifyProvenance`, `src/enactor/ground/provenance.js` — meaning, not lexical overlap), and
2. corroborated by at least **`minWitnesses` (default 2) distinct witnessing spans** — two
   different lines, not one match (`witnessesForProps`, `src/enactor/ground/reflect.js`).

A sentence's citations are the union of its propositions' witnessing spans, so a shipped sentence
carries *all* its witnesses: `Atlas ships in March.[s0][s1]`. A half-sourced sentence (one
proposition meets the bar, another does not) is refused **whole** — a half-sourced sentence reads
as fully sourced, so the archon drops the sentence, not just the proposition. A sentence that
asserts no proposition (a bare fragment) witnesses nothing, so it too is refused.

## Where it runs

- **The gate** (`src/weave/write/paragraphs.js`, `pump`): already forwards complete sentences only
  and already suppresses content before it streams (DONE, repeated openers). The archon is the same
  move at sentence grain — an unsourced sentence is dropped **before** it is forwarded, so it never
  streams and never enters the draft. The streamed text still equals the returned draft.
- **Arming** (`src/turn/stages.js`, `llm` stage): `buildArchon(ctx.doc, retrievedSpanIdxs,
  { minWitnesses: 2 })`, keyed on the explicit Grounded chip. When the archon refuses *every*
  sentence the turn answers the honest absence rather than falling through to the ungrounded path.
- **The record** (`src/turn/stages.js`, `bind` stage): on the strict path the answer is assembled
  straight from the archon's admissions (each sentence + its ≥2 citations), bypassing the lexical
  binder, which yields only one witness per claim.
- **The flag** (`src/turn/pipeline.js`): a non-refusing `ground-dropped` note says how many
  sentences were left out — never a gag on what remained.

## What counts as a witness

A span witnesses a proposition if it carries the relation in the graph (**meaning**, coref-aware and
order-insensitive: "Ben was trusted by Anna" witnesses "Anna trusted Ben") **or** literally contains
the proposition's figures and relation (**surface** — the same verbatim test grounding uses). The
surface pass matters: the relation extractor may key the graph on "Project Atlas" while the claim
says "Atlas", so meaning-matching alone would count a plainly-lifted claim as unwitnessed. By
default "unique witness" is a distinct source **span**; over a multi-source corpus, `{ byOrigin:
true }` requires distinct independent **origins** (`reflectAnswer`'s cross-source measure).

## The trade-off

The ≥2-witness bar is strict by design: a fact stated **once** in a single-source memo is dropped,
because one line cannot corroborate itself. This is the point — it refuses the plausible-but-single
claim rather than shipping it — but it means a Grounded answer over a terse memo can be short, or
decline entirely. `minWitnesses` is the one knob; a corrective "restate only what N lines support"
rewrite (reusing the paragraph loop's continuation) is the natural follow-on to dropping.

## Tests

`tests/npj-source-gate.test.js`: the gate drops an unsourced sentence and never streams it
(streamed === draft); strict-off ships everything (opt-in parity); the ≥2-witness bar; the lifted-
claim surface-witness case; and the memo end-to-end through `runTurn`.
