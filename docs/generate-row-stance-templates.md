
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
articles, one face over. This spec gives the ledger row four shapes (§2), a
falsifiable rule for picking among them by measuring the field around the
row's own evidence (§3), a closed slot vocabulary shared by all four (§4), and
eight named **composed plans** (§11) — Definition, Entity/cast profile,
Timeline, Relationship explainer, Comparison, Dispute digest, Gap report,
Caption — that are product-facing queries built entirely out of the same four
shapes and the same slot vocabulary, never new machinery. Nothing is generated
in the LLM sense — every row is *computed*, in the same sense
`docs/EOReader_Question_Result_Update_Spec.md` §28 uses the word for
`assembleQuestionResult`.

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
  verdict badge with nothing under it;
- a whole product surface — an entity page, a timeline view, a "how are X and
  Y connected" panel — none of which is one row at all, but all of which are
  built from the same four shapes repeated and composed (§11).

Each of these needs a different **shape**, not a different color of the same
badge. The shape is not a display preference — it is a claim about how much
the evidence supports committing to a single figure, which is exactly what
`surfer/stance.js` already measures for an answer cursor. This spec reuses
that measurement for a ledger row, and then reuses the row for a whole page.

## 2. The four shapes ○

| Shape | Short name | Cell (`op(site, stance)`) | Domain / grain | What it renders |
|---|---|---|---|---|
| **Pointed readout** | readout | `CON(Link, Binding)` | Structure / Figure | One proposition, one evidence roster. The telegram. |
| **Cultivating survey** | survey | `REC(Atmosphere, Cultivating)` | Significance / Ground | A spread of readings, no winner named. The honest reserve. |
| **Making argument** | argument | `REC(Lens, Making)` | Significance / Figure | One committed claim, built from ≥2 joined propositions that agree. |
| **Composing essay** | essay | `REC(Paradigm, Composing)` | Significance / Pattern | A regularity across ≥3 joined, ordered propositions (a chronology, a causal chain). |

The short names (readout / survey / argument / essay) are used from §11 on,
where plans cite a base shape by name repeatedly; the full names remain
canonical everywhere else in this document and in code identifiers.

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

The row-stance chooser is `stanceLegality(propositions, options)` — a direct
sibling of `surfer/stance.js` `updateStance`, reading the same kind of
measurement over a differently-scoped ρ.

```text
stanceLegality(propositions, { alpha = 0.05 } = {})
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
     Cultivating, §3.1 — the SAME degrade path a target with no groundable
     order takes, e.g. §11's Definition plan when overloaded senses clear
     the null with nothing to sequence them by)
  9. if cleared.length === 0:                   → Cultivating survey
     (the field is flat around every candidate reading — no direction to
     commit to; the honest reserve, never a coin flip)
```

Every branch is a numeric predicate over `spectrum`, so the rule is
**falsifiable**: given the same `propositions` array, `stanceLegality` always
returns the same shape, and a test can assert the boundary (`cleared.length`
crossing 0/1/2) directly rather than trusting a description. This is the same
discipline `surfer/stance.js` documents for its own three-way split — "manner
has a measured-correct answer read off the field, never authored" — extended
one branch further.

`stanceLegality` decides the **shape**. It does not by itself decide which
proposition occupies which slot inside that shape — that is §4's job, applied
either by default (highest-mass component wins a `lede`/`orientation` slot)
or overridden by a plan's own target query (§11's Relationship explainer
fixes `orientation` to its two named anchors rather than letting mass pick
it). A slot-occupancy override never changes which cell `stanceLegality`
returned; it only changes which proposition fills an already-legal slot.

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
  still cannot produce two or more grounded joined claims to survey, the row
  degrades one step further to the fixed void template (§10.5), never to the
  desert cell.

This is the crucial distinction this spec preserves end to end: **Cultivating
is the universal honest fallback** — every Generating-row shape that cannot
clear a Making or Composing threshold lands there, by construction, in every
domain — but the one specific domain pairing named `DESERT_CELL` is carved
out and permanently forbidden as a *shipped address*, exactly as
`docs/fold-trace-spec.md` §3 already enforces for FoldTrace rows ("every
desert-cell fold is rejected; `SYN·Cultivating` never ships as an accepted
address anywhere in this tree"). A row-stance test suite that only checks "is
this cell on the diagonal" would pass a desert-cell row; §14's legality tests
check the stronger property.

## 4. Closed proposition and relation slots ○

A row's data is a fixed, enumerable set of **slot roles** — no open text
field except the pre-approved template strings of §6. Every shape (§2) and
every plan (§11) is assembled entirely out of the same closed vocabulary; a
plan never invents a slot role a shape does not already license.

```js
RowSlots {
  propositions: PropositionGroup[],   // 1 for Pointed readout, ≥2 otherwise
  relation: RelationSlot | null,      // null for Pointed readout
  order: OrderSlot | null,            // required for Composing, else null
  shape: 'readout' | 'cultivating' | 'making' | 'composing',
  cell: { op, site, stance },         // the resolved cube cell, from stanceLegality
  trace: TraceRef[],                  // §8 — exactly one per rendered token
}
```

```js
RelationSlot {
  kind: 'agree' | 'oppose' | 'causal' | 'temporal' | 'measure' | 'contrasts' | 'qualifies',
  memberIds: string[],                // propositionGroup ids this relation joins
  groundedBy: EdgeRef,                // §5 — the join's own attestation, never inferred
}

OrderSlot {
  memberIds: string[],                // ordered
  basis: 'dated' | 'sequenced-by-source' | 'supersession',
  groundedBy: EdgeRef,
}
```

`kind` and `basis` are closed enums — no free string. `contrasts` and
`qualifies` are added here for the Comparison plan (§11.5); they are
Structure-domain joins like `causal`/`temporal`/`measure`, grounded the same
way (§5), not a new join family. A relation the extractor cannot classify
into one of these values does not enter a `RelationSlot`; the propositions
stay unjoined and the row falls back to however many Pointed readouts that
leaves (§5's join-or-nothing rule).

### 4.1 The named slot roles

Beyond `propositions`/`relation`/`order`, a rendered row is built from a
fixed roster of **named slot roles**. Each role has a closed source (what may
fill it) and a default cardinality per shape; §11's plans only ever narrow or
suppress these, never add a new role:

| Role | Fills from | Meaning |
|---|---|---|
| `answer` | one dominant Pointed-readout proposition | The single settled fact, Structure-domain (Binding). |
| `lede` | one dominant proposition inside a survey/essay | The Significance-domain analogue of `answer` — a settled core claim sitting inside a larger shape rather than standing alone. |
| `verdict` | `core/verdicts.js` `VERDICTS` + witness roster | The EVA judgment and witness count attached to `answer`/`lede`. |
| `void` | a `VERDICTS.SILENT`/typed-absence proposition, or none found at all | Typed absence — never one undifferentiated blank (`docs/terrain-typed-templates.md` §"Typed absence"). |
| `lens` | a sub-scope of propositions about one aspect/facet | A bounded recursive slot — see §4.2. |
| `relation` | a `RelationSlot` | The join between two occupied slots. |
| `contest-side` | one reading of a genuine opposed pair | One half of a Cultivating survey's split; requires an `oppose`/`contrasts` `RelationSlot`, never rendered from silence (§5). |
| `orientation` | the highest-mass proposition by default, or fixed by a plan's target query (§3, last paragraph) | The frame a Composing essay's order is read against. |
| `section` | a cluster of `claim`s grouped by an `OrderSlot`-compatible basis | The Composing essay's mid grain — an era, a topic cluster. |
| `claim` | one witnessed proposition | The Composing essay's leaf grain, one per `section`. |
| `reframing` | a REC event superseding an earlier `claim`/`section` | The ninth-spine "occasions on which the frame itself changed" (`docs/terrain-typed-templates.md` §"The invariant spine", REC ⊢ Reframings), reused here rather than re-invented. |
| `closure` | the last `claim`/`section` in an `OrderSlot` | The terminal element of an ordered or path structure. |

### 4.2 Bounded recursion: a `lens` may not contain a `lens`

A `lens` slot's own content is resolved by **recursively applying
`stanceLegality`/`realizeSlot`** (§9) to that aspect's own proposition
subset — a `lens` is a full sub-row, itself shaped as a readout or an
argument (never a survey: see below). This is what lets Entity/cast profile
(§11.2) give "role," "actions," and "relations to others" each their own
internally-resolved shape rather than one flat sentence per aspect.

Recursion is capped at **one level**. A `lens` may resolve to `readout` or
`argument` (Structure/Figure or Significance/Figure — both Figure-grain,
single-committed shapes), never to `cultivating` or `composing`: a
survey-inside-a-survey or an essay-inside-a-survey has no terminal grain to
stop at, and the closed-slot discipline this section exists to enforce
depends on every recursion terminating. If a `lens`'s own propositions would
otherwise resolve to `cultivating` or `composing`, the plan that requested
that `lens` must instead split it into multiple sibling `lens` slots (one
per sub-reading) at the parent's own grain — the parent survey absorbs the
complexity as more lenses, not as a nested survey.

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
  never supplies the join's grounding by itself. Two readings that merely
  occupy different domains (§11.1's overloaded-sense case) and never
  actually contradict each other do not form an `oppose` join — they are
  parallel `lens`/`contest-side`-free entries in a survey.
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
- **contrasts/qualifies** joins (Comparison, §11.5) are **S · Structural**,
  grounded in the Question Result spec's own §15.2 alignment criteria
  (compatible subject, polarity, and time frame across the two compared
  attributes) — the same criteria this spec's §11.5 cites for when a
  compared pair may cluster into one `lens` versus stay atomic.

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
row must fall back one shape, ending at Cultivating survey or the fixed void
template if every fallback is also illegal.

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

This is the fabrication veto proper — the enforcement mechanism for §8,
trace coverage of exactly 1. It is a distinct veto from
`row-entailment-mismatch` because a row can entail its propositions correctly
in aggregate while still containing one fabricated connective token (e.g. a
`because` inserted without a `groundedBy` causal span) — entailment is a
claim-level check, fabrication is token-level.

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
(§16), not only a runtime flag.

## 9. Deterministic rendering with an optional one-slot prosifier ○

`realizeSlot(slot)` is pure and total over every role in §4.1 — no network
call, no model call, in the default path. This matches
`docs/EOReader_Question_Result_Update_Spec.md` §28.2's rule for `displayText`
exactly, generalized from one proposition to one slot of any role. A full row
or a whole plan (§11) is assembled by calling `realizeSlot` once per occupied
slot and concatenating according to the shape's fixed layout — never by one
call that renders an entire multi-slot structure in one pass, so that trace
coverage (§8) stays provable slot-by-slot.

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
continues to hold for every row shape and every plan — the prosifier
described here is not that path reused, it is a strictly smaller mechanism
with its own, tighter bound. §11.8's caption slot additionally forbids even
this: "tiny LLM only captions, never detects" is this document's own
constraint that a model may at most produce the single ad hoc caption
sentence within its `sentenceLimit: 1`, never expand a `cluster`-grain slot
on its own initiative.

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
grounded-timeline render, generalized past the two-value case, and §11.3's
Timeline plan is the product-facing name for this shape applied broadly.

### 10.5 Void → fixed void template (not a shape)

Question: "Who authorized the Partnership to negotiate for Metro?" Every
active source is silent on the authorization relation specifically (Question
Result spec §32); the nearest related material is a Field-terrain absence —
an unstated authorization rule.

`n === 0` groundable propositions for the requested relation. There is
nothing to survey, argue, or compose — the row cannot even reach step 3 of
§3's algorithm, because there are no propositions to build ρ over. This is
**not** the `Cultivating survey` shape (that shape requires ≥2 propositions
that fail to clear the null together) — it is the scoped-void template
(Question Result spec §6.4) directly, the same fixed template §3.1 and §11.4
both fall back to when a shape's own minimum-population requirement cannot be
met:

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

## 11. Composed row plans ○

The eight product-facing queries below are not new machinery. Each is an
instance of one small schema — a **base** shape (or, once, two), a **target**
query that selects the scope's propositions, and a **slots** override that
narrows or suppresses that base shape's default palette (§4.1). Two of the
eight (§11.7, §11.8) are explicitly *not* instances of this schema, and say
so.

```js
Plan {
  name,
  base: Shape | [Shape, Shape],      // one of §2's four shapes ('readout' |
                                      //   'cultivating' | 'making' | 'composing'),
                                      //   or two only when explicitly hybrid (§11.5)
  target: TargetQuery,               // how propositions/relations enter scope
  slots: { [role]: Cardinality | 'suppressed' },  // overrides on §4.1's roles;
                                      //   never introduces a role the base
                                      //   shape's palette does not define
  fallback: 'cultivating' | 'readout-void' | null,
}
```

Only three things ever vary across the eight plans below: the **target**
(anchor / anchor-pair / relation-kind filter / verdict filter / typed-void
scope / cursor), **which base shape(s)** it draws its slot palette from, and
**which slot roles get suppressed or recardinalized**. None of them need new
machinery in `src/weave/generate-row/` beyond the `plan.js` registry and
orchestration function described in §13.

### 11.1 Definition

Base: readout → Cultivating if senses split. Target: `DEF` propositions where
`subject = anchor`.

| Slot | Card. | Source |
|---|---:|---|
| `answer` | one | Dominant settled `DEF` proposition for the anchor |
| `verdict` | one | EVA verdict / witness count |
| `void` | 0–1 | No `DEF` proposition found |

If two or more senses clear the null (a term overloaded across domains), the
readout shape is illegal by §3 step 8's own degrade rule — Definition falls
back to Cultivating: one `lens` per sense, with a `contest-side` only when
the senses actually conflict (§5's agree/oppose grounding), never merely
because they occupy different domains.

### 11.2 Entity / cast profile

Base: Cultivating survey. Target: propositions where `subject = anchor` or
`object = anchor`, across all predicates.

| Slot | Card. | Source |
|---|---:|---|
| `lede` | 0–1 | Settled core-identity proposition ("is a...") |
| `lens` | one per significant aspect, then proportional | Role, actions, relations-to-others as separate lenses (§4.2 — each `lens` resolves its own shape, capped at one recursion level) |
| `relation` | adjacent, licensed only | Links between aspects (§5's grounding, never invented) |
| `contest-side` | one per side | Contested identity or role claims |
| `void` | final | Unanswered material questions about the entity |

### 11.3 Timeline

Base: Composing essay, relation-filtered to `precedes`/`same-event`. Target:
propositions in scope connected by temporal relations.

| Slot | Card. | Source |
|---|---:|---|
| `orientation` | one | Earliest or defining event, as an existing frame |
| `section` | many | Connected temporal clusters/eras, deterministically ordered |
| `claim` | many per section | Witnessed events |
| `relation` | one per join | `precedes`/`same-event` only |
| `contest-side` | at disagreement | Conflicting dates or sequences |
| `reframing` | at revision | Recorded correction to a prior timeline claim (§4.1's ninth-spine reuse) |
| `closure` | 0–1 | Most recent/concluding event, if one exists |

### 11.4 Relationship explainer (X ↔ Y)

Base: Composing essay, with `orientation` fixed to the two named anchors
instead of chosen by mass (§3's closing paragraph — a documented,
query-driven override of an otherwise mass-derived slot). Target: a
witnessed path between anchor X and anchor Y.

| Slot | Card. | Source |
|---|---:|---|
| `orientation` | one, fixed | Existing claim that a connection exists — never invented |
| `section` / `claim` | many | Steps on the path between X and Y |
| `relation` | one per join | The specific relation types composing the path |
| `contest-side` | at disagreement | If the path itself is disputed |
| `closure` | 0–1 | Final relation reaching Y |

If no witnessed path exists at all, Composing is illegal — there is nothing
to order — and this plan's `fallback` resolves to `readout-void` (the fixed
void template of §10.5: "no established connection"), **not** Cultivating.
Cultivating requires ≥2 groundable items to survey; here there are zero, so
there is no `lens` to allocate and the plan does not degrade one shape, it
exits the shape system entirely.

### 11.5 Comparison (X vs Y)

Base: `['cultivating', 'composing']` hybrid — a survey's slot palette
(`lede`, `contest-side`, `void`) carrying Composing-typed joins
(`relation.kind ∈ {'contrasts', 'qualifies'}`, §4). Target: propositions
about X and Y joined by those relations, plus matched-attribute pairs.

| Slot | Card. | Source |
|---|---:|---|
| `lede` | 0–1 | Direct answer, if the comparison collapses to one settled distinction |
| `lens` | one per compared attribute | Clusters into one slot when subject/polarity/time are compatible **and** a groundable `contrasts`/`qualifies` relation exists (§5's alignment criteria); stays atomic otherwise |
| `relation` | one per join | `contrasts`/`qualifies` between matched attributes |
| `contest-side` | one per side | Mismatched or incompatible values |
| `void` | as needed | Attribute present for one side, missing for the other |

### 11.6 Dispute digest

Base: Cultivating survey, with `lede` and any non-contested `lens`
suppressed (`slots: { lede: 'suppressed', lens: 'suppressed-unless-contested' }`).
Target: same scope as the parent surface, verdict filter restricted to
contested propositions only.

| Slot | Card. | Source |
|---|---:|---|
| `contest-side` | one per side, per contested proposition | The entire surface |
| `void` | as needed | Material questions the dispute leaves unresolved |

### 11.7 Gap report — not a Plan instance

Not a Generate-row shape at all: a filtered query over the fold's own typed
absences, not a collapse of ρ. No `stanceLegality` or `planTemplate` call is
made — there is no REC event to measure a stance for, only `NUL` propositions
already typed at ingest (`docs/terrain-typed-templates.md` §"Typed absence").

| Slot | Card. | Source |
|---|---:|---|
| `void` | many | Every `NUL`/void proposition in the requested scope |

### 11.8 Caption / margin note — below the template layer

Also not a Plan instance: one `realizeSlot` call, no `planTemplate`
orchestration above it. Target: one proposition (occasionally one relation)
at the reading cursor.

| Slot | Card. | Source |
|---|---:|---|
| single ad hoc slot | one | `sentenceLimit: 1`, no `cluster`-grain allocation permitted |

`realizeSlot` enforces `sentenceLimit: 1` and the no-`cluster` rule itself
(§16), not only at the plan layer — "tiny LLM only captions, never detects"
is this plan's own constraint: an optional model pass may phrase the one
sentence more fluently (the same `phraseObject`/containment-veto discipline
as §9), but it may never expand the caption into a `lens` or `section`, and
it never gets to decide that a cluster exists in the first place — that
judgment belongs to `stanceLegality`, which a caption call never invokes.

## 12. Product behavior for Question Result ○

The claim ledger (Question Result spec §9) gains a `shape` column implicitly
— rows render their resolved shape, not a uniform layout — and several of
§11's named plans map directly onto existing Question Result surfaces rather
than requiring new ones:

- **Direct answer slot** (§6 of the Question Result spec): a Supported card
  is a Definition plan (§11.1) resolving to a Pointed readout; a Contested
  card is a Definition plan falling back to Cultivating; the causal and
  dated worked examples of Question Result spec §29–31 are, retroactively,
  Making-argument and Timeline-plan renders.
- **Ledger rows**: each `PropositionGroup` row picks its own shape
  independently — a 14-claim ledger can show 9 Pointed readouts, 2
  Cultivating surveys, 2 Making arguments, and 1 Composing essay
  simultaneously, each computed from its own join.
- **Entity page / Topic Overview identity section** (Question Result spec
  §22): the Entity/cast profile plan (§11.2).
- **Timeline projection** (Question Result spec §10): the Timeline plan
  (§11.3) directly — this spec supplies the projection's grounding, not a
  duplicate of it.
- **Meaning projection edge click** ("let an edge click reveal the exact
  relation proposition and its witness count inline," Question Result spec
  §10): the Relationship explainer plan (§11.4).
- **Comparison** (§11.5) has no existing Question Result surface — it is not
  in the MVP projection strip (Question Result spec §10) and is flagged here
  as a future addition to that strip, not retrofitted onto an existing one.
- **Claim ledger's Contested filter** (Question Result spec §9.2): the
  Dispute digest plan (§11.6).
- **Void's "related material on record"** (Question Result spec §6.4, §32):
  the Gap report (§11.7), scoped to the current question rather than the
  whole topic.
- **Meaning-map node/edge hover labels** (Question Result spec §10's orbit
  semantics): the Caption plan (§11.8).
- **Source toggle recomputation** (Question Result spec §33): toggling a
  source does not just change a verdict word, it can change a row's
  **shape**, and for a composed plan it can change which slots are even
  populated — removing the one source that let two propositions' causal
  connective clear its threshold drops a Making argument back to two Pointed
  readouts, or removing a dated proposition from a three-point Timeline
  plan may drop it to a two-point Making argument or a Cultivating survey.
  `Recomputed from 7 active sources` (§33's existing announcement) is the
  correct place to also surface a shape change, using the same "explain the
  consequence" pattern §11 of the Question Result spec already requires for
  verdict transitions: `Excluding the finance memo changes "board approval"
  from an argument to two separate claims.`

## 13. Proposed modules and APIs ○

```text
src/weave/generate-row/stance.js
  stanceLegality(propositions, options) -> { shape, cell, relation, order }
  legalCellFor(shape, domainHint) -> { op, site, stance } | null   // §3.1's
                                                                     re-homing,
                                                                     never
                                                                     returns
                                                                     DESERT_CELL

src/weave/generate-row/join.js
  proposeJoin(propositions) -> RelationSlot | OrderSlot | null   // §5 — returns
                                                                    null rather
                                                                    than invent
                                                                    a relation
  groundJoin(join, record) -> EdgeRef | null                    // the join's
                                                                    own
                                                                    attestation

src/weave/generate-row/slots.js
  SLOT_PALETTES: { readout, cultivating, making, composing } -> role/cardinality map  // §4.1
  legalSlots(shape) -> role[]                                   // closes the
                                                                    "no plan
                                                                    invents a
                                                                    role" rule

src/weave/generate-row/plan.js
  PLANS: { definition, castProfile, timeline, relationshipExplainer,
           comparison, disputeDigest }                            // §11.1–11.6;
                                                                      gapReport
                                                                      and caption
                                                                      are NOT here
  planTemplate(plan, scope) -> RowSlots[]                        // orchestrates
                                                                    stanceLegality
                                                                    + proposeJoin
                                                                    per §11's
                                                                    schema

src/weave/generate-row/render.js
  realizeSlot(slot) -> { renderedText, trace }     // §9, pure, total, per-slot
  prosify(renderedText, trace, options) -> { renderedText, trace }  // §9's
                                                                       bounded
                                                                       optional
                                                                       pass

src/weave/generate-row/index.js
  the holon barrel — re-exports the above, matching the sibling `weave/*`
  holons' own `index.js` convention (`weave/essay`, `weave/topline`, …)

src/enactor/ground/row-veto.js
  bidirectionallyEntails(text, propositions) -> boolean   // §7
  tokenCount(text) -> number                              // §8
  ROW_VETOES: [ row-entailment-mismatch, row-fabrication ]   // appended to
                                                                enactor/ground/
                                                                veto.js's own
                                                                VETOES battery,
                                                                same pattern

tests/row-stance-templates.test.js
tests/row-plans.test.js
```

`stanceLegality` reuses `core/spectral.js` (`buildDensity`, `eigenLenses`),
`core/voidnull.js` (`deriveNull`), and `core/faces.js` (`cellAt`) directly —
no new spectral math. `realizeSlot` reuses `weave/topline/phrase.js`
(`phraseMechanical`) for any Pointed-readout or `lens`/`answer` proposition's
own sentence and adds only the §6 connective/ordinal lexicon on top.
`planTemplate` is the only genuinely new orchestration function this spec
introduces — everything it calls already exists in this module or is
described elsewhere in this document.

## 14. Acceptance tests (47) ○

### Legality (§3, §3.1)

1. `stanceLegality` on a single proposition returns `readout` without
   constructing a density matrix.
2. `stanceLegality` on two opposed propositions with comparable weight
   returns `cultivating`.
3. `stanceLegality` on two propositions where one component clears the
   derived null returns `making`.
4. `stanceLegality` on three propositions where two components clear the
   derived null returns `composing`.
5. Every shape's resolved cell is on the Object diagonal (`isDiagonal`
   returns `true` for all four).
6. `legalCellFor('cultivating', 'Field')` never returns
   `{ op: 'SYN', site: 'Field', stance: 'Cultivating' }`.
7. `legalCellFor('cultivating', 'Field')` returns `REC(Atmosphere,
   Cultivating)` when re-homing succeeds.
8. `legalCellFor('cultivating', 'Field')` returns `null` (forcing the fixed
   void template, §10.5) when re-homing cannot assemble ≥2 grounded joined
   propositions.
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
14. `RowSlots.cell` always matches the `{op, site, stance}` `stanceLegality`
    resolved — no renderer is allowed to substitute a different cell.
15. A `lens` slot that would itself resolve to `cultivating` or `composing`
    is rejected — recursion is capped at one level (§4.2).
16. `legalSlots(shape)` for each of the four shapes matches exactly §4.1's
    documented palette — no role appears for a shape it is not listed under.

### Joins (§5)

17. Two propositions with only a similarity score above threshold and no
    witness-roster overlap do not form an `agree` `RelationSlot`.
18. Two propositions with an explicit contradictory verdict do form an
    `oppose` `RelationSlot`, grounded by the verdict pair, not a score.
19. Two temporally adjacent propositions with no causal connective span do
    not form a `causal` `RelationSlot` — at most a `temporal` `OrderSlot`.
20. A causal connective span anchored to a source sentence produces a
    `causal` `RelationSlot` whose `groundedBy` resolves to that exact span.
21. A `temporal` `OrderSlot`'s `basis` is `'dated'` only when every member
    proposition carries its own dated span — mixed dated/undated members
    fall back to `'sequenced-by-source'` or refuse the join.
22. Two propositions with no groundable relation render as two independent
    Pointed readouts, never one row with a fabricated relation.
23. Two propositions occupying different domains but never contradicting
    each other do not form an `oppose` `RelationSlot` merely by domain
    mismatch.

### Prose texture and vetoes (§6, §7)

24. Every `(shape, verdict)` cell marked `n/a` in §6's table is unreachable
    from `stanceLegality` plus `verdictForGroup` in combination — asserted
    by exhaustive enumeration, not by trusting the table's prose.
25. A Making argument's connective token always traces to the join's own
    `groundedBy` span, never to a fixed string with no evidentiary anchor.
26. A Composing essay's ordinal tokens (`First`/`then`) come only from the
    fixed lexicon, never from source text.
27. `row-entailment-mismatch` fires when a Cultivating survey's rendered
    text omits one side of a genuine two-way split.
28. `row-entailment-mismatch` fires when a rendered row adds a hedge word
    (`likely`, `clearly`) the propositions do not carry.
29. `row-entailment-mismatch` does not fire on a correctly rendered row of
    each of the four shapes (no false positive across the worked examples
    of §10).
30. `row-fabrication` fires when a connective token has no `TraceRef`.

### Trace coverage (§8)

31. `tokenCount(renderedText) === row.trace.length` holds for every rendered
    row across all four shapes.
32. `row.trace` spans are contiguous and non-overlapping — no token is
    covered by zero or two `TraceRef`s.
33. Swapping a connective via `prosify` preserves trace-span count and
    contiguity (the swap changes surface form, not span structure).

### Rendering and product behavior (§9, §12)

34. `realizeSlot` is pure: called twice on identical input, it returns
    identical `renderedText` and `trace`.
35. `prosify` never modifies a `source: 'proposition'` token.
36. `prosify`'s output is re-checked against both row vetoes before
    shipping; a rejected swap falls back to the pre-prosify render.
37. Toggling a source that removes the causal connective's grounding span
    drops a Making argument row to two Pointed readouts, and the ledger
    surfaces the shape-change explanation (§12).
38. A three-point Timeline plan that loses one dated proposition to a
    source toggle recomputes to either a two-point Making argument or a
    Cultivating survey, per §3's rule re-applied to the remaining set —
    never silently keeps the three-point essay shape with a gap.

### Composed plans (§11)

39. `planTemplate('definition', scope)` with two senses clearing the null
    and no groundable order between them falls back to `cultivating`, one
    `lens` per sense, per §3 step 8's degrade rule.
40. `planTemplate('definition', scope)` does not attach a `contest-side` to
    two non-contradicting senses.
41. `planTemplate('relationshipExplainer', {from, to})` with zero witnessed
    path propositions returns the fixed void template
    (`fallback: 'readout-void'`), not a Cultivating survey with an empty
    `lens`.
42. `planTemplate('relationshipExplainer', {from, to})` fixes `orientation`
    to the two named anchors regardless of which proposition carries the
    most mass.
43. `planTemplate('comparison', {x, y})` clusters two matched attributes
    into one `lens` only when subject/polarity/time are compatible and a
    `contrasts`/`qualifies` relation is grounded; otherwise renders them as
    atomic `lens` entries.
44. `planTemplate('disputeDigest', scope)` never populates `lede` — the
    slot is suppressed unconditionally, not merely empty by chance.
45. `planTemplate('castProfile', anchor)` allocates at most one `lens` per
    significant aspect and does not recurse a `lens` into a nested survey
    (§4.2, §14.15's guard applied at the plan layer).
46. A Gap-report scope never invokes `stanceLegality` or `planTemplate` —
    it reads typed-absence propositions directly.
47. A Caption call never allocates a `cluster`-grain slot and truncates to
    `sentenceLimit: 1` even when the underlying scope contains multiple
    groundable propositions.

## 15. Build order ○

1. `core`-adjacent measurement: `stanceLegality` (§3) against fixture
   proposition sets, including the boundary and desert-cell tests (§14
   items 1–10). No rendering yet.
2. `row-join.js` → `join.js` (§5): join proposal and grounding, tested
   against fixture proposition pairs/triples for each `RelationSlot`/
   `OrderSlot` kind (§14 items 17–23), still no rendering.
3. `slots.js` (§4): the `SLOT_PALETTES` table and `legalSlots` closure,
   tested against §14 items 11–16, including the one-level recursion cap.
4. `render.js` deterministic path (§9, first half) plus the §6 lexicon
   table, wired to `phraseMechanical` for Pointed readouts and `lens`/
   `answer` slots. Trace-coverage tests (§14 items 31–32) land here, before
   the prosifier exists, so coverage is proven on the mandatory path first.
5. `row-veto.js` (§7): both vetoes, appended to the existing battery,
   tested against the worked examples of §10 for true negatives (§14 item
   29) before testing true positives.
6. `prosify` (§9, second half): the bounded synonym swap, gated by the
   vetoes from step 5 (§14 items 33, 35–36).
7. Wire into the Question Result ledger and direct-answer slot (§12):
   `PropositionGroup` rendering calls `stanceLegality` → `realizeSlot`;
   source-toggle recomputation re-runs the whole chain (§14 items 37–38).
8. `plan.js`: the `PLANS` registry and `planTemplate` orchestration, tested
   against fixture scopes for Definition, Entity/cast profile, Timeline,
   Relationship explainer, Comparison, and Dispute digest (§14 items
   39–45), reusing steps 1–6's stance/join/render machinery unchanged. Gap
   report and Caption (§14 items 46–47) are tested here too, specifically
   *for* bypassing this machinery.
9. Meaning-projection wiring: feed `RelationSlot`/`OrderSlot` and the
   Relationship-explainer/Caption plans to the Positions, Timeline, and
   Meaning-map hover surfaces (§12's projection bullets) — read-only reuse
   of step 2's and step 8's data, no new grounding logic.

Each step ships with its own tests before the next step depends on it — the
same discipline `docs/EOReader_Question_Result_Update_Spec.md` §18's phased
plan follows.

## 16. Release invariants ○

These must hold at every release, not just at first ship — regression guards,
not one-time acceptance checks:

- No row ever ships at `SYN(Field, Cultivating)`. (§3.1, §14.9)
- Every rendered row's trace coverage is exactly 1 token-to-`TraceRef`,
  never 0 (fabrication) or >1 (double-counted). (§8, §14.31–32)
- No row's `renderedText` contains a token that is not either quoted from a
  `PropositionGroup`'s own `displayText` or drawn from the closed §6
  lexicon — enforced by `row-fabrication`, never by code review alone.
- `stanceLegality` never consults a model, an embedding score above the
  join-*candidate* stage (§5), or any signal outside the propositions'
  own significance activations and verdicts.
- `prosify` never changes token count, span structure, or touches a
  `source: 'proposition'` token — a diff of `renderedText` before/after
  `prosify` differs only inside connective/ordinal spans.
- A shape change caused by a source toggle is always announced
  (§12, §14.37–38) — never a silent re-render that changes what the user
  is told without saying so.
- No `lens` slot resolves to `cultivating` or `composing` — recursion stops
  at one level; a plan that needs more structure adds sibling `lens` slots
  at its own grain instead. (§4.2, §14.15, §14.45)
- No plan's `slots` override introduces a role outside §4.1's fixed roster —
  a plan may only narrow cardinality or suppress, never invent. (§11,
  §14.16)
- A Gap report never triggers a `REC` event and never calls `stanceLegality`
  or `planTemplate` — it is a `NUL`-only projection, full stop. (§11.7,
  §14.46)
- A Caption never exceeds `sentenceLimit: 1` and never allocates a
  `cluster`-grain slot, regardless of how much groundable material the
  underlying scope contains. (§11.8, §14.47)

## 17. Files (proposed)

```
src/weave/generate-row/stance.js       stanceLegality, legalCellFor
src/weave/generate-row/join.js         proposeJoin, groundJoin
src/weave/generate-row/slots.js        SLOT_PALETTES, legalSlots
src/weave/generate-row/plan.js         PLANS, planTemplate
src/weave/generate-row/render.js       realizeSlot, prosify
src/weave/generate-row/index.js        the holon barrel
src/enactor/ground/row-veto.js         bidirectionallyEntails, tokenCount, ROW_VETOES
tests/row-stance-templates.test.js     the regression guard for stance/join/slots/render/veto
tests/row-plans.test.js                the regression guard for the eight composed plans (§11)
```
