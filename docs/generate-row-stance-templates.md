# Row-Stance Templates: generating a claim-ledger row

**Status:** Implementation spec. No production code changed by this document.
**Depends on:** `core/cube.js` (the Object diagonal), `core/faces.js` (`cellAt`),
`core/contract.js` (`DESERT_CELL`), `surfer/stance.js` (`updateStance`,
`applyMeasuredStance`), `core/verdicts.js` (`VERDICTS`), `weave/topline/phrase.js`
(`phraseMechanical`), `enactor/ground/veto.js` (the veto-battery pattern), and
`docs/EOReader_Question_Result_Update_Spec.md` (`PropositionGroup`, the claim
ledger, the display-text constraint). Sibling to `docs/terrain-typed-templates.md`
(template chosen by Site position) and `docs/fold-trace-spec.md` (label an
already-computed signal with the cube's own vocabulary) — this spec does the
same thing one face over: **template chosen by Resolution position**, for one
row of the claim ledger rather than one wiki article.

> Status key: ● landed · ◐ instrumented, measurement open · ○ future work (this
> whole document, unless marked otherwise — nothing here has shipped).

## 0. What this is, in one paragraph

A claim-ledger row (`PropositionGroup`, §9 of the Question Result spec) is
currently rendered one way: verdict badge, `displayText`, witness counts. That
is correct for a single settled fact and wrong for everything else — a
contested split, a causal chain, a dated sequence all get squeezed into the
same badge-plus-sentence shape, which is exactly the "one shape covers every
subject" collapse `docs/terrain-typed-templates.md` diagnoses for Wikipedia
articles, one face over. This spec gives the ledger row four shapes, and picks
among them the same way the codebase already picks a stance for an answer
cursor (`surfer/stance.js` `updateStance`): by **measuring the field around
the row's own evidence**, never by asking a model to choose a template or
write a paragraph. The four shapes are diagonal-legal cells of the Resolution
face (`docs/cube.md` §"The nine stances") plus one pre-stance default for the
degenerate one-proposition case. Nothing is generated in the LLM sense — every
row is *computed*, in the same sense `docs/EOReader_Question_Result_Update_Spec.md`
§28 uses the word for `assembleQuestionResult`.

## 1. The problem: one row shape collapses stance

The current `PropositionGroup` renderer implicitly assumes every row is a
**pointed** fact: one claim, some support, a verdict word. That assumption
holds for `Axon acquired Fusus in 2024.` It does not hold for:

- a genuine two-way split (`MOU value was $15M or $18M`) — forcing it into one
  sentence either erases a side or writes the model's own "approximately
  $16.5M" compromise, which §31.2 of the Question Result spec explicitly
  forbids;
- a causal chain (`the board approved the deal because financing closed`) —
  one witness count cannot carry two propositions and the relation between
  them;
- a dated sequence (`$15M draft, then $18M executed`) — collapsing three
  timestamped propositions into one badge discards the order, which is the
  content;
- a genuine void, where the honest row is an admission of absence, not a
  verdict badge with nothing under it.

Each of these needs a different **shape**, not a different color of the same
badge. The shape is not a display preference — it is a claim about how much
the evidence supports committing to a single figure, which is exactly what
`surfer/stance.js` already measures for an answer cursor. This spec reuses
that measurement for a ledger row.

## 2. The four shapes ○

| Shape | Cell (`op(site, stance)`) | Domain / grain | What it renders |
|---|---|---|---|
| **Pointed readout** | `CON(Link, Binding)` | Structure / Figure | One proposition, one evidence roster. The telegram. |
| **Cultivating survey** | `REC(Atmosphere, Cultivating)` | Significance / Ground | A spread of readings, no winner named. The honest reserve. |
| **Making argument** | `REC(Lens, Making)` | Significance / Figure | One committed claim, built from ≥2 joined propositions that agree. |
| **Composing essay** | `REC(Paradigm, Composing)` | Significance / Pattern | A regularity across ≥3 joined, ordered propositions (a chronology, a causal chain). |

All four sit on the Object diagonal (`core/cube.js` `coherence`/`isDiagonal`):
grain, site-grain, and stance-grain agree, so `core/faces.js` `cellAt(op,
{site, stance})` resolves each to a real cell rather than returning `null`.
This is the same discipline `surfer/stance.js`'s `MOVES` table already follows
for Making/Cultivating/Clearing — this spec is that table, extended with the
Pattern-grain Generating cell (Composing) it does not need and one
Structure-grain Figure cell outside the Generating row (Binding) for the
singleton case.

**Why Pointed readout is not a Generating-mode cell.** A row with exactly one
proposition and no join has nothing to survey, argue, or compose across — it
only needs to *point*: bind the claim to its evidence. That is `Binding`
(Relating × Figure), the stance `docs/cube.md` §"the nine stances" describes
as connecting specific things, at the Structure-domain Figure site (`Link`) —
the same cell `fold-trace-spec.md` §2.4 already uses for a citation echo
("CON's own native Figure-grain cell... what makes a citation hold a claim to
a source"). A Pointed readout never enters the Significance domain: it makes
no claim about how well-supported the reading is, only that the claim and its
evidence are bound. Significance-domain judgment (survey, argument, essay)
only enters once there is a **join** — see §5.

**Why the Generating row, not Clearing/Dissecting/etc.** Rendering a row is
itself a Generating act — it writes a new thing (the rendered row) that was
not there — which is `docs/cube.md` §"The Mode axis is the engine of
direction"'s definition of Generating exactly. So the row-stance chooser only
ever resolves to a Generating-mode cell (Cultivating/Making/Composing) or,
for the pre-Significance singleton case, Binding. It never resolves to
Clearing (`surfer/stance.js`'s third MOVE): Clearing is a *defeat* of an
existing commitment, not a row's first render. A ledger row that should be
retracted is a REC event superseding an earlier row (append-only, matching
`src/wiki/migrate.js`'s supersession discipline), not a Clearing-shaped
template.

## 3. Falsifiable stance-legality rules over ρ ○

The row-stance chooser is `chooseRowStance(propositions, options)` — a direct
sibling of `surfer/stance.js` `updateStance`, reading the same kind of
measurement over a differently-scoped ρ.

```text
chooseRowStance(propositions, { alpha = 0.05 } = {})
  1. n = propositions.length
  2. if n === 1:                              → Pointed readout. No ρ built.
  3. rho = buildDensity(vectors, weights)      // core/spectral.js buildDensity,
                                                //   one vector per proposition's
                                                //   significance activation
                                                //   (the same construction
                                                //   surfer/stance.js's caller
                                                //   already builds "over the
                                                //   doc's significance
                                                //   activations")
  4. spectrum = eigenLenses(rho).map(l => l.weight)
  5. nul = deriveNull(spectrum, { alpha, leaveOut: spectrum[0] })
  6. cleared = spectrum.filter(w => w > nul)
  7. if cleared.length === 1:                  → Making argument
     (one component clears the null — a single dominant reading; commit)
  8. if cleared.length >= 2:                    → Composing essay
     (≥2 components jointly clear — a genuine multi-part regularity, not
     noise; the ordering slot, §4, must be filled or this degrades to
     Cultivating, §3.1)
  9. if cleared.length === 0:                   → Cultivating survey
     (the field is flat around every candidate reading — no direction to
     commit to; the honest reserve, never a coin flip)
```

Every branch is a numeric predicate over `spectrum`, so the rule is
**falsifiable**: given the same `propositions` array, `chooseRowStance` always
returns the same shape, and a test can assert the boundary (`cleared.length`
crossing 0/1/2) directly rather than trusting a description. This is the same
discipline `surfer/stance.js` documents for its own three-way split — "manner
has a measured-correct answer read off the field, never authored" — extended
one branch further.

### 3.1 The forbidden desert cell, and why Cultivating still always exists

`core/contract.js` names exactly one Generating × Ground cell as forbidden:
`DESERT_CELL = { op: 'SYN', terrain: 'Field', stance: 'Cultivating' }`. That
is a **Structure-domain** Cultivating cell. The row-stance chooser never
constructs it directly — its own Cultivating cell is `REC(Atmosphere,
Cultivating)`, a Significance-domain cell, a different address on the same
Ground-grain row. But a join whose propositions are themselves about an
**unstated rule** (a Field-terrain absence — "the contract does not specify a
penalty clause") is Structure-domain content wearing a Significance-domain
row. The legality rule for step 9 above is therefore two-part:

- if the joined propositions' own site resolves to `Atmosphere`, `Void`, or
  any site other than `Field` → render `REC(Atmosphere, Cultivating)`, the
  legal survey;
- if the joined propositions' own site resolves to `Field` → the row must
  **not** render `SYN(Field, Cultivating)`. It re-homes to the
  Significance-domain `REC(Atmosphere, Cultivating)` cell instead (the survey
  reads *about* the unstated Field rule, which is itself a legitimate
  Atmosphere-grain thing to survey — "the rules nobody has stated" is
  `docs/terrain-typed-templates.md`'s own headline absence for Atmosphere).
  It never falls through to a raw `SYN·Cultivating` render. If re-homing
  still cannot produce three or more grounded joined claims to survey, the
  row degrades one step further to **no-commit** (§6), never to the desert
  cell.

This is the crucial distinction this spec preserves end to end: **Cultivating
is the universal honest fallback** — every Generating-row shape that cannot
clear a Making or Composing threshold lands there, by construction, in every
domain — but the one specific domain pairing named `DESERT_CELL` is carved
out and permanently forbidden as a *shipped address*, exactly as
`docs/fold-trace-spec.md` §3 already enforces for FoldTrace rows ("every
desert-cell fold is rejected; `SYN·Cultivating` never ships as an accepted
address anywhere in this tree"). A row-stance test suite that only checks "is
this cell on the diagonal" would pass a desert-cell row; §13's legality tests
check the stronger property.

## 4. Closed proposition and relation slots ○

A row's data is a fixed, enumerable set of slots — no open text field except
the pre-approved template strings of §6. `PropositionGroup` (Question Result
spec §14) is extended, not replaced:

```js
RowSlots {
  propositions: PropositionGroup[],   // 1 for Pointed readout, ≥2 otherwise
  relation: RelationSlot | null,      // null for Pointed readout and Cultivating
  order: OrderSlot | null,            // required for Composing, else null
  shape: 'pointed' | 'cultivating' | 'making' | 'composing',
  cell: { op, site, stance },         // the resolved cube cell, from cellAt
  trace: TraceRef[],                  // §7 — exactly one per rendered token
}
```

```js
RelationSlot {
  kind: 'agree' | 'oppose' | 'causal' | 'temporal' | 'measure',
  memberIds: string[],                // propositionGroup ids this relation joins
  groundedBy: EdgeRef,                // §5 — the join's own attestation, never inferred
}

OrderSlot {
  memberIds: string[],                // ordered
  basis: 'dated' | 'sequenced-by-source' | 'supersession',
  groundedBy: EdgeRef,
}
```

`kind` and `basis` are closed enums — no free string. A relation the
extractor cannot classify into one of the five `kind` values does not enter a
`RelationSlot`; the propositions stay unjoined and the row falls back to
however many Pointed readouts that leaves (§5's join-or-nothing rule). This
mirrors the Question Result spec's own closed-filter discipline (§9.2's fixed
`proposition kind` enum) one level up: propositions are already closed-typed
by kind; this adds the same discipline to how they relate.

## 5. Joins as grounded claims, not model-written connective tissue ○

A `RelationSlot` or `OrderSlot` is itself a claim, and it must be **grounded
the same way a proposition is grounded** — it is not connective tissue a
renderer is allowed to invent to make two propositions read smoothly
together. `groundedBy` is an `EdgeRef` into the same evidence layer
`docs/terrain-typed-templates.md` §"The edge grammar" already types:

- **agree/oppose** joins are **G · Evidence** in that typing — the two
  propositions' own witness rosters overlapping or explicitly contradicting
  (`core/verdicts.js` `CORROBORATED`/`CONTRADICTED`), never a semantic-
  similarity score alone. A similarity score may narrow the *candidate* join
  set (`discoverPropositionEquivalence`, Question Result spec §27.1) but
  never supplies the join's grounding by itself.
- **causal** joins are **S · Structural** — they require an explicit causal
  connective attested in a source sentence ("because", "as a result of",
  "which led to") anchored to a span, the same anchor discipline
  `anchorFor`/`resolveAnchor` already give a proposition. A causal reading
  the extractor infers from bare temporal adjacency (X happened, then Y
  happened) is not a causal join — it is at most a `temporal` `OrderSlot`,
  never promoted to `causal` without its own connective evidence. This is
  the same refusal `docs/EOReader_Question_Result_Update_Spec.md` §31.3
  already states for numeric revision ("chronology alone is not permission to
  infer revision"), generalized to any causal claim.
- **temporal** joins are **S · Structural**, grounded in each proposition's
  own dated span or explicit source-order — never wall-clock ingestion order,
  which reflects when the pipeline read a document, not when the event
  happened.
- **measure** joins are **S · Structural**, reusing `extractQuantities` /
  `crossSourceConflicts` (Question Result spec §31.1) — compatible subject,
  compatible unit, comparable scope.

If no groundable join exists between two propositions that a naive reading
would expect to relate, they **do not join**. The row-stance chooser then
sees `n === 1` for each and renders two separate Pointed readouts rather than
one row with an invented relation. Silence between two propositions is not
evidence of a relation any more than `docs/EOReader_Question_Result_Update_Spec.md`
§15.2 already says silence is not evidence of disagreement.

## 6. Verdict-sensitive prose texture ○

The fixed interface vocabulary is not one lexicon — it shifts with the row's
`verdict` (`core/verdicts.js` `VERDICTS`) crossed with its `shape` (§2), and
every combination is a closed lookup table, not a model choice:

| Shape | `corroborated` | `contradicted` | `indeterminate` / `silent` |
|---|---|---|---|
| Pointed readout | `is` (`phraseMechanical`'s existing `claim` template) | `is not` (existing `polarity === '−'` branch) | not rendered — a `silent` singleton is a Cultivating-eligible void, not a Pointed row |
| Cultivating survey | n/a — a survey has no single corroborated reading | `The sources disagree` (heading fixed, both sides shown, Question Result spec §6.2) | `Not established by these sources` (Question Result spec §6.4) |
| Making argument | `X, because Y` — the connective is the join's own attested connective span (§5), quoted or lightly cased, never authored | n/a — a contradicted join does not clear Making's threshold (§3 step 7 requires a cleared component; a live contradiction keeps the field flat) | n/a |
| Composing essay | `First A, then B, then C` — fixed ordinal connectives (`First`/`then`/`then`) keyed to `OrderSlot.basis`, never a generated transition | n/a | n/a |

The texture change is lexical, not structural: `is`/`is not`/`disagree`/`not
established`/`because`/`then` are the entire vocabulary a row may draw its
non-slot words from, matching the closed-vocabulary discipline
`docs/EOReader_Question_Result_Update_Spec.md` §28.2 already states for
`displayText` ("labels taken from entity/source records... fixed interface
vocabulary... sentences produced by `phraseMechanical`"). No shape/verdict
cell in this table is filled by asking a model what to say; an unhandled
cell (marked n/a above) means that shape cannot carry that verdict and the
row must fall back one shape, ending at Cultivating survey or no-commit if
every fallback is also illegal.

## 7. Bidirectional entailment and fabrication vetoes ○

Two vetoes join the battery `enactor/ground/veto.js` already runs, following
its exact pattern (`{ id, test, refuses, message }`, flag by default, refuse
only on the load-bearing case):

```js
{
  id: 'row-entailment-mismatch',
  test: ({ row }) => !bidirectionallyEntails(row.renderedText, row.propositions),
  refuses: true,
  message: 'The rendered row states more, or less, than its grounded propositions establish.',
}
```

`bidirectionallyEntails(text, propositions)` checks **both** directions, not
one:

- **forward** — every proposition in the row's `propositions` slot is
  entailed by the rendered text (nothing was dropped that changes the
  claim — e.g. dropping a `contested` counter-reading and rendering only the
  winning side, which would silently promote a Cultivating survey's honest
  split into a false Making argument);
- **backward** — the rendered text entails nothing beyond what the
  propositions establish (nothing was added — a causal connective with no
  `groundedBy` span, a confidence word like "clearly" or "likely" the
  propositions do not carry, an ordinal claim ("first") not backed by an
  `OrderSlot`).

A one-directional check (only "is the text supported by the propositions")
would pass a row that under-states a contested split; the existing
`unbound`/`low-coverage` vetoes in `veto.js` already check the forward
direction for free-form answers, but a template-rendered row needs the
backward direction too, precisely because a template's job is to compress —
compression is where a Cultivating survey quietly turns into a Making
argument if unchecked.

```js
{
  id: 'row-fabrication',
  test: ({ row }) => row.trace.length !== tokenCount(row.renderedText),
  refuses: true,
  message: 'A token in the rendered row has no trace pointer.',
}
```

This is the fabrication veto proper — the enforcement mechanism for §7's
sibling requirement, trace coverage of exactly 1 (§8). It is a distinct
veto from `row-entailment-mismatch` because a row can entail its
propositions correctly in aggregate while still containing one fabricated
connective token (e.g. a `because` inserted without a `groundedBy` causal
span) — entailment is a claim-level check, fabrication is token-level.

## 8. Required token-level trace coverage of exactly 1 ○

Every token in a rendered row's `renderedText` maps to **exactly one**
`TraceRef` — not zero (that is fabrication, §7), and not more than one
(a token double-counted against two trace pointers is a sign the renderer
concatenated two templates without resolving which one owns the token, the
row-level analogue of `docs/fold-trace-spec.md`'s "one row per unit, unchanged
in count and order" discipline).

```js
TraceRef {
  tokenStart: number,   // index into renderedText's token array
  tokenEnd: number,
  source: 'proposition' | 'connective' | 'ordinal',
  refId: string,        // propositionGroup id, or the fixed connective/ordinal
                         //   template id from §6's lexicon table
}
```

- `source: 'proposition'` tokens trace to the exact `PropositionGroup` the
  words came from (its own `displayText`, unmodified or minimally cased).
- `source: 'connective'`/`'ordinal'` tokens trace to a **fixed lexicon
  entry**, not a proposition — `because`, `then`, `is`, `disagree`, and their
  siblings from §6's table each carry a stable id. This is what makes
  coverage exactly 1 rather than "≥1 or connectives are exempt": every word
  in the row is accounted for by something, even the words that are not
  quoted from a source.

Coverage is checked with a walk over `renderedText`'s tokens against
`row.trace`, asserting a bijection: `tokenCount(renderedText) ===
row.trace.length` and every `[tokenStart, tokenEnd)` span is contiguous and
non-overlapping. This is the `row-fabrication` veto's exact test — restated
here as the invariant it enforces, because it is also a release invariant
(§15), not only a runtime flag.

## 9. Deterministic rendering with an optional one-slot prosifier ○

`renderRow(row)` is pure and total over the four shapes — no network call, no
model call, in the default path. This matches `docs/EOReader_Question_Result_Update_Spec.md`
§28.2's rule for `displayText` exactly, extended from one proposition to a
whole row.

An **optional** prosifier may run afterward, strictly bounded:

```text
prosify(renderedText, { slot, options }) -> renderedText'
```

- it may substitute **exactly one** closed slot — the connective or ordinal
  token identified by `source: 'connective' | 'ordinal'` in the trace — for
  a different member of the *same* fixed lexicon entry's synonym set (e.g.
  swap `because` for `since` when both are pre-registered synonyms of the
  same connective-template id in §6's table);
- it may not touch any `source: 'proposition'` token;
- it may not add or remove a token — the swap is one-for-one, so trace
  coverage (§8) is recomputed trivially (the swapped token keeps its
  `refId`, only its surface form changes) rather than re-derived;
- it runs, if at all, **after** `row-entailment-mismatch` and
  `row-fabrication` pass on the deterministic render, and the swapped output
  is re-checked against both vetoes before it may ship — a synonym swap that
  happens to change meaning (there should be none, if the synonym set is
  curated correctly, but the check is cheap and the alternative is trusting
  a hand-curated list forever) is caught the same way a fabricated token
  would be.

This is deliberately much narrower than the model-assisted rewrite pass
`weave/topline/phrase.js` already runs for a single object (`phraseObject`,
gated by `contain.js`'s containment veto): that pass may rewrite a whole
sentence and is vetoed after the fact; this one may only swap a single
pre-approved word and is vetoed the same way. `Question Result must never
call the optional model path in `phraseObject`` (Question Result spec §28.2)
continues to hold for every row shape — the prosifier described here is not
that path reused, it is a strictly smaller mechanism with its own, tighter
bound.

## 10. Worked examples

### 10.1 Settled → Pointed readout

Propositions: one — `Axon acquired Fusus in 2024`, 4 independent origins,
`corroborated`.

```text
Axon acquired Fusus in 2024.                          SUPPORTED
4 support · 0 contest · 2 sources silent
[Show evidence]
```

`n === 1` (§3 step 2) — no ρ is built, no join is attempted. `trace` is one
`TraceRef` per token, all `source: 'proposition'`, `refId` the single
`PropositionGroup` id.

### 10.2 Contested → Cultivating survey

Propositions: two — `MOU value was $15M` (2 origins) and `MOU value was
$18M` (1 origin), opposed, no supersession evidence (§10.4 covers the
supersession case).

```text
THE SOURCES DISAGREE

$15 million                              $18 million
Executed exhibit · finance memo          Press release · vendor deck
2 independent origins                    1 independent origin

[Compare evidence]
```

`n === 2`, ρ is built over both propositions' significance activations,
`spectrum` has two comparably weighted components (an opposed pair, by
construction, does not let one component dominate) so `cleared.length === 0`
against the derived null — step 9, Cultivating survey. `relation.kind =
'oppose'`, grounded by the two propositions' own contradictory `verdict`
fields (`core/verdicts.js` `CONTRADICTED`), not by a similarity score.

### 10.3 Causal → Making argument

Propositions: two — `financing closed on 12 March` and `the board approved
the deal on 14 March`, joined by an explicit source sentence: "the board
approved the deal because financing had closed."

```text
The board approved the deal, because financing had closed.     SUPPORTED
2 passages · 1 independent origin
[Show evidence]
```

`n === 2`, both propositions point the same direction (the causal sentence is
itself evidence for both, so their significance activations correlate
strongly), `cleared.length === 1` — Making argument. `relation.kind =
'causal'`, `groundedBy` the anchored span containing "because financing had
closed" — not inferred from the two dates alone (§5's explicit refusal).
`because` traces to the fixed connective lexicon entry (§6), not to either
proposition.

### 10.4 Temporal → Composing essay

Propositions: three — `$15M, draft MOU, 2 March`, `$18M, executed MOU, 19
March`, `payment schedule set, 20 March` — three dated, ordered
propositions with explicit dates on each span.

```text
$15M — draft MOU, 2 March.
Then $18M — executed MOU, 19 March.
Then the payment schedule was set, 20 March.

3 passages · 2 independent origins
[Show evidence]
```

`n === 3`, `cleared.length === 2` (two components jointly clear the null — a
genuine three-point ordered regularity, not one dominant reading) — Composing
essay. `order.basis = 'dated'`, grounded in each proposition's own dated
span. This is the case §31.3 of the Question Result spec calls out
separately ("if the evidence establishes that $18M superseded $15M, render a
grounded timeline instead of CONTESTED") — a Composing essay is exactly that
grounded-timeline render, generalized past the two-value case.

### 10.5 Void → Cultivating survey (fallback, not desert)

Question: "Who authorized the Partnership to negotiate for Metro?" Every
active source is silent on the authorization relation specifically (Question
Result spec §32); the nearest related material is a Field-terrain absence —
an unstated authorization rule.

`n === 0` groundable propositions for the requested relation. There is
nothing to survey, argue, or compose — the row cannot even reach step 3 of
§3's algorithm, because there are no propositions to build ρ over. This is
**not** the `Cultivating survey` shape (that shape requires ≥2 propositions
that fail to clear the null together) — it is the scoped-void template
(Question Result spec §6.4) directly:

```text
NOT ESTABLISHED BY THESE SOURCES

None of the 8 active sources addresses the authorization.

Related material on record
Metro ownership · executed MOU · financing

[Search for more sources]
```

If, instead, the corpus *does* carry ≥2 propositions bearing on an unstated
Field-terrain rule (e.g. two sources both note the contract "does not specify
a penalty clause," which is itself a grounded absence-proposition, not
silence), §3.1's re-homing applies: the row renders as a genuine Cultivating
survey at `REC(Atmosphere, Cultivating)`, never at the forbidden
`SYN(Field, Cultivating)`.

## 11. Product behavior for Question Result ○

The claim ledger (Question Result spec §9) gains a `shape` column implicitly
— rows render their resolved shape, not a uniform layout:

- **Direct answer slot** (§6 of the Question Result spec): a Supported card
  is a Pointed readout; a Contested card is a Cultivating survey; a causal
  or dated direct answer (§29–31's worked examples) may now render as a
  Making argument or Composing essay respectively, when the underlying
  propositions clear those thresholds — this is a strict addition to the
  card vocabulary, not a replacement of Supported/Contested/Void/No-commit,
  which remain the verdict labels crossed with shape per §6's table.
- **Ledger rows**: each `PropositionGroup` row picks its own shape
  independently — a 14-claim ledger can show 9 Pointed readouts, 2
  Cultivating surveys, 2 Making arguments, and 1 Composing essay
  simultaneously, each computed from its own join.
- **Source toggle recomputation** (Question Result spec §33): toggling a
  source does not just change a verdict word, it can change a row's
  **shape** — removing the one source that let two propositions' causal
  connective clear its threshold drops a Making argument back to two Pointed
  readouts, or removing a dated proposition from a three-point Composing
  essay may drop it to a two-point Making argument or a Cultivating survey.
  `Recomputed from 7 active sources` (§33's existing announcement) is the
  correct place to also surface a shape change, using the same "explain the
  consequence" pattern §11 of the Question Result spec already requires for
  verdict transitions: `Excluding the finance memo changes "board approval"
  from an argument to two separate claims.`
- **Meaning projection**: a Composing essay's `OrderSlot` is a natural edge
  set for the Timeline projection (§10 of the Question Result spec); a
  Cultivating survey's opposed pair is the Positions projection's natural
  input. Row-stance and projection selection read the same underlying
  `RelationSlot`/`OrderSlot` data — this spec does not duplicate that
  grounding, it supplies it.

## 12. Proposed modules and APIs ○

```text
src/rooms/reader/row-stance.js
  chooseRowStance(propositions, options) -> { shape, cell, relation, order }
  legalCellFor(shape, domainHint) -> { op, site, stance } | null   // §3.1's
                                                                     re-homing,
                                                                     never
                                                                     returns
                                                                     DESERT_CELL

src/rooms/reader/row-join.js
  proposeJoin(propositions) -> RelationSlot | OrderSlot | null   // §5 — returns
                                                                    null rather
                                                                    than invent
                                                                    a relation
  groundJoin(join, record) -> EdgeRef | null                    // the join's
                                                                    own
                                                                    attestation

src/rooms/reader/row-render.js
  renderRow(row) -> { renderedText, trace }        // §9, pure, total
  prosify(renderedText, trace, options) -> { renderedText, trace }  // §9's
                                                                       bounded
                                                                       optional
                                                                       pass

src/enactor/ground/row-veto.js
  bidirectionallyEntails(text, propositions) -> boolean   // §7
  tokenCount(text) -> number                              // §8
  ROW_VETOES: [ row-entailment-mismatch, row-fabrication ]   // appended to
                                                                enactor/ground/
                                                                veto.js's own
                                                                VETOES battery,
                                                                same pattern

tests/row-stance-templates.test.js
```

`chooseRowStance` reuses `core/spectral.js` (`buildDensity`, `eigenLenses`),
`core/voidnull.js` (`deriveNull`), and `core/faces.js` (`cellAt`) directly —
no new spectral math. `renderRow` reuses `weave/topline/phrase.js`
(`phraseMechanical`) for any Pointed-readout proposition's own sentence and
adds only the §6 connective/ordinal lexicon on top.

## 13. Acceptance tests (35) ○

### Legality (§3, §3.1)

1. `chooseRowStance` on a single proposition returns `pointed` without
   constructing a density matrix.
2. `chooseRowStance` on two opposed propositions with comparable weight
   returns `cultivating`.
3. `chooseRowStance` on two propositions where one component clears the
   derived null returns `making`.
4. `chooseRowStance` on three propositions where two components clear the
   derived null returns `composing`.
5. Every shape's resolved cell is on the Object diagonal (`isDiagonal`
   returns `true` for all four).
6. `legalCellFor('cultivating', 'Field')` never returns
   `{ op: 'SYN', site: 'Field', stance: 'Cultivating' }`.
7. `legalCellFor('cultivating', 'Field')` returns `REC(Atmosphere,
   Cultivating)` when re-homing succeeds.
8. `legalCellFor('cultivating', 'Field')` returns `null` (forcing a
   no-commit render, §10.5) when re-homing cannot assemble ≥2 grounded
   joined propositions.
9. No test fixture, however constructed, produces a shipped
   `SYN(Field, Cultivating)` row — a regression guard mirroring
   `tests/fold-trace.test.js`'s own desert-cell assertion.
10. A boundary spectrum (`cleared.length` exactly at 0/1/2) is deterministic
    across repeated calls with identical input.

### Slots (§4)

11. A `RelationSlot` with an unrecognized `kind` string is rejected at
    construction, not silently accepted.
12. A `Making` row's `RowSlots.relation` is non-null; a `Cultivating` row's
    is non-null; a `Pointed` row's is `null`.
13. A `Composing` row without an `OrderSlot` fails validation rather than
    rendering with propositions in arbitrary order.
14. `RowSlots.cell` always matches the `{op, site, stance}` `chooseRowStance`
    resolved — no renderer is allowed to substitute a different cell.

### Joins (§5)

15. Two propositions with only a similarity score above threshold and no
    witness-roster overlap do not form an `agree` `RelationSlot`.
16. Two propositions with an explicit contradictory verdict do form an
    `oppose` `RelationSlot`, grounded by the verdict pair, not a score.
17. Two temporally adjacent propositions with no causal connective span do
    not form a `causal` `RelationSlot` — at most a `temporal` `OrderSlot`.
18. A causal connective span anchored to a source sentence produces a
    `causal` `RelationSlot` whose `groundedBy` resolves to that exact span.
19. A `temporal` `OrderSlot`'s `basis` is `'dated'` only when every member
    proposition carries its own dated span — mixed dated/undated members
    fall back to `'sequenced-by-source'` or refuse the join.
20. Two propositions with no groundable relation render as two independent
    Pointed readouts, never one row with a fabricated relation.

### Prose texture and vetoes (§6, §7)

21. Every `(shape, verdict)` cell marked `n/a` in §6's table is unreachable
    from `chooseRowStance` plus `verdictForGroup` in combination — asserted
    by exhaustive enumeration, not by trusting the table's prose.
22. A Making argument's connective token always traces to the join's own
    `groundedBy` span, never to a fixed string with no evidentiary anchor.
23. A Composing essay's ordinal tokens (`First`/`then`) come only from the
    fixed lexicon, never from source text.
24. `row-entailment-mismatch` fires when a Cultivating survey's rendered
    text omits one side of a genuine two-way split.
25. `row-entailment-mismatch` fires when a rendered row adds a hedge word
    (`likely`, `clearly`) the propositions do not carry.
26. `row-entailment-mismatch` does not fire on a correctly rendered row of
    each of the four shapes (no false positive across the worked examples
    of §10).
27. `row-fabrication` fires when a connective token has no `TraceRef`.

### Trace coverage (§8)

28. `tokenCount(renderedText) === row.trace.length` holds for every rendered
    row across all four shapes.
29. `row.trace` spans are contiguous and non-overlapping — no token is
    covered by zero or two `TraceRef`s.
30. Swapping a connective via `prosify` preserves trace-span count and
    contiguity (the swap changes surface form, not span structure).

### Rendering and product behavior (§9, §11)

31. `renderRow` is pure: called twice on identical input, it returns
    identical `renderedText` and `trace`.
32. `prosify` never modifies a `source: 'proposition'` token.
33. `prosify`'s output is re-checked against both row vetoes before
    shipping; a rejected swap falls back to the pre-prosify render.
34. Toggling a source that removes the causal connective's grounding span
    drops a Making argument row to two Pointed readouts, and the ledger
    surfaces the shape-change explanation (§11).
35. A three-point Composing essay that loses one dated proposition to a
    source toggle recomputes to either a two-point Making argument or a
    Cultivating survey, per §3's rule re-applied to the remaining set —
    never silently keeps the three-point essay shape with a gap.

## 14. Build order ○

1. `core`-adjacent measurement: `chooseRowStance` (§3) against fixture
   proposition sets, including the boundary and desert-cell tests (§13
   items 1–10). No rendering yet.
2. `row-join.js` (§5): join proposal and grounding, tested against fixture
   proposition pairs/triples for each `RelationSlot`/`OrderSlot` kind
   (§13 items 11–20), still no rendering.
3. `row-render.js` deterministic path (§9, first half) plus the §6 lexicon
   table, wired to `phraseMechanical` for Pointed readouts. Trace-coverage
   tests (§13 items 28–29) land here, before the prosifier exists, so
   coverage is proven on the mandatory path first.
4. `row-veto.js` (§7): both vetoes, appended to the existing battery,
   tested against the worked examples of §10 for true negatives (§13 item
   26) before testing true positives.
5. `prosify` (§9, second half): the bounded synonym swap, gated by the
   vetoes from step 4 (§13 items 30, 32–33).
6. Wire into the Question Result ledger and direct-answer slot (§11):
   `PropositionGroup` rendering calls `chooseRowStance` → `renderRow`;
   source-toggle recomputation re-runs the whole chain (§13 items 34–35).
7. Meaning-projection wiring: feed `RelationSlot`/`OrderSlot` to the
   Positions and Timeline projections (§11's last bullet) — read-only reuse
   of step 2's data, no new grounding logic.

Each step ships with its own tests before the next step depends on it — the
same discipline `docs/EOReader_Question_Result_Update_Spec.md` §18's phased
plan follows.

## 15. Release invariants ○

These must hold at every release, not just at first ship — regression guards,
not one-time acceptance checks:

- No row ever ships at `SYN(Field, Cultivating)`. (§3.1, §13.9)
- Every rendered row's trace coverage is exactly 1 token-to-`TraceRef`,
  never 0 (fabrication) or >1 (double-counted). (§8, §13.28–29)
- No row's `renderedText` contains a token that is not either quoted from a
  `PropositionGroup`'s own `displayText` or drawn from the closed §6
  lexicon — enforced by `row-fabrication`, never by code review alone.
- `chooseRowStance` never consults a model, an embedding score above the
  join-*candidate* stage (§5), or any signal outside the propositions'
  own significance activations and verdicts.
- `prosify` never changes token count, span structure, or touches a
  `source: 'proposition'` token — a diff of `renderedText` before/after
  `prosify` differs only inside connective/ordinal spans.
- A shape change caused by a source toggle is always announced
  (§11, §13.34–35) — never a silent re-render that changes what the user
  is told without saying so.

## 16. Files (proposed)

```
src/rooms/reader/row-stance.js     chooseRowStance, legalCellFor
src/rooms/reader/row-join.js       proposeJoin, groundJoin
src/rooms/reader/row-render.js     renderRow, prosify
src/enactor/ground/row-veto.js     bidirectionallyEntails, tokenCount, ROW_VETOES
tests/row-stance-templates.test.js the regression guard for all of the above
```
