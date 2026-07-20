# Generate-Row Answer Templates

## Stance-legal synthesis with no model-originated content

> **Status:** implementation specification. No production behavior is changed by this
> document.
>
> **Decision:** the answer's content, selection, order, grouping, and joins are fixed
> before prose realization. A language model may optionally render one closed slot into
> one sentence. It may not choose what the answer says. Every accepted surface token must
> trace to a proposition or a relation already present in the fold.

This specification closes the remaining gap between the proposition-led Question Result,
the arc's evidence-budgeted generation, the response schemas, and the EO Resolution face.
The templates are not writing styles. They are the three stances on the Generate row of
the cube, plus the pointed-answer case that does not need a Generate move at all.

The central claim is deliberately sharper than “no LLM prose”:

> **No model-originated content.** The model may alter surface form. It may never select,
> order, aggregate, join, infer, rank, omit, or introduce answer content.

The deterministic renderer is the baseline and remains sufficient. An optional local or
remote model is a contracted prosifier behind the same veto. Removing the model must
change fluency only, never the propositions, their order, their verdicts, their relations,
or their provenance.

---

## 1. Existing machinery this composes

This is a new contract over mechanisms already present in the repository, not a parallel
answer engine.

| Concern | Existing mechanism | Role here |
|---|---|---|
| Resolution stances | `src/core/cube.js` (`STANCES`, `coherence`) | Names Cultivating, Making, and Composing; rejects off-diagonal events. |
| The reading field | `src/core/spectral.js` (`buildDensity`, `eigenLenses`) | Supplies \(ρ\), its lenses, and their Born weights. |
| A derived significance line | `src/core/voidnull.js` (`deriveNull`, `DEF`) | Decides whether one lens or a pattern rises above the field's own null. |
| Proposition-first realization | `src/weave/write/brief.js` (`phraserBrief`, `talkThenVerify`) | Fixes grounded propositions before optional prosification. |
| Deterministic prose | `src/weave/write/brief.js` (`speakTriples`) and `src/weave/write/morph.js` | Provides the no-model renderer and the mandatory fallback. |
| Relation licensing | `src/weave/write/gravity.js` (`connectiveLeash`, `speakArc`) | Treats a connective as a claim and licenses it only from a recorded relation. |
| Grounding veto | `src/enactor/ground/` and `classifyProvenance` | Rejects a surfaced proposition that does not bind to admitted evidence. |
| Typed response slots | `src/organs/out/speech/schema.js` (`TASK_SCHEMA`, `everySlotWitnessed`) | Proves that an answer slot is witnessed or explicitly void. |
| Budgeted traversal | `src/weave/arc/` (`evaCoverageGate`, `groundSaturation`) | Stops when evidence is exhausted, not when a token target is reached. |
| Longform commitments | `docs/longform-generation.md` | Supplies the commitment graph, carry, and section-doorway discipline. |
| Prompt validation | `src/model/prompt-checkpoint.js` | Existing checkpoint pattern for declaring and rejecting illegal model work. |

The new work is to put a **stance-legality guard**, a closed **slot plan**, and a complete
**surface trace** between these pieces.

---

## 2. Normative objects

### 2.1 Proposition

A proposition is content below language. It is not a sentence.

```js
Proposition = {
  id: 'p17',
  operator: 'DEF' | 'EVA' | 'REC' | 'INS' | 'SEG' | 'CON' | 'SYN' | 'SIG' | 'NUL',
  subject: Ref,
  predicate: RelationType,
  object: Ref | Scalar | null,
  quantity: { value, unit } | null,
  time: TimeValue | null,
  polarity: 'positive' | 'negative',
  modality: 'asserted' | 'possible' | 'required' | 'permitted' | null,
  verdict: 'settled' | 'contested' | 'void' | 'stale' | 'unknown',
  witnesses: [SpanRef],
  anchors: [AnchorRef],
  lensId: 'l2',
  bornWeight: 0.31
}
```

`witnesses` carry raw support; `anchors` carry persistent identity. A proposition with no
admitted witness cannot enter a content slot. A measured `void` is itself an EVA/NUL
proposition and may enter a void slot.

### 2.2 Relation

A relation is also a proposition. It licenses a join between content propositions.

```js
AnswerRelation = {
  id: 'r4',
  from: 'p17',
  to: 'p18',
  type: 'precedes' | 'causes' | 'enables' | 'prevents' |
        'qualifies' | 'contrasts' | 'corroborates' | 'revises' |
        'part-of' | 'same-event',
  verdict: 'settled' | 'contested' | 'stale' | 'unknown',
  witnesses: [SpanRef],
  anchors: [AnchorRef]
}
```

Coreference alignment such as “same referent” is an internal identity operation, not an
answer relation and not user-facing prose. It may establish that two records address the
same subject; it does not license “therefore,” “however,” or any other discourse join.

### 2.3 Slot

A slot is the largest unit the prosifier is allowed to see.

```js
RenderSlot = {
  id: 'slot-3',
  role: 'answer' | 'lede' | 'lens' | 'support' | 'contest-side' |
        'relation' | 'void' | 'reframing',
  propositionIds: ['p17'],
  relationIds: [],
  verdict: 'settled',
  renderGrain: 'atomic' | 'cluster',
  sentenceLimit: 1,
  requiredFields: ['subject', 'predicate', 'object', 'time'],
  forbiddenLexemes: []
}
```

The planner, never the model, constructs slots. `renderGrain: 'cluster'` is legal only
when the planner has already grouped mutually compatible settled propositions and
included every relation required to join them. A model is not asked to discover that the
propositions belong together.

### 2.4 Template plan

```js
TemplatePlan = {
  id: 'plan-9',
  template: 'readout' | 'cultivating' | 'making' | 'composing',
  stance: null | 'Cultivating' | 'Making' | 'Composing',
  rhoReceipt: SpectrumReceipt,
  legality: LegalityReceipt,
  slotIds: ['slot-1', 'slot-2'],       // complete, fixed order
  edges: [{ from: 'slot-1', to: 'slot-2', relationId: 'r4' }],
  evidenceBudget: EvidenceBudget,
  fallback: 'cultivating' | 'readout-void'
}
```

The plan is frozen before the first sentence is rendered. Rendering cannot mutate it.

---

## 3. The four answer shapes

The cube's Generate row is:

| Grain | Stance | Answer shape | What the shape does |
|---|---|---|---|
| Ground | **Cultivating** | Survey / Wikipedia-style | Preserves the spectrum by giving each supported lens room at its Born weight. |
| Figure | **Making** | Best-supported argument | Collapses to the single lens that demonstrably dominates \(ρ\). |
| Pattern | **Composing** | Structured essay | Traverses a grounded relation pattern across slots and sections. |
| — | **No Generate move** | Pointed readout | Renders the dominant answer proposition or typed void once. |

“Wikipedia-style,” “best argument,” and “essay” are therefore not tones or arbitrary UX
formats. They are projections whose honesty depends on the measured shape of \(ρ\).

### Important: Cultivating does not legalize the desert cell

`SYN·Cultivating` remains forbidden. The survey does not ask a model to synthesize an
ambient whole. It **expresses** Cultivating by deterministic allocation: the scheduler
preserves the field's lens distribution, then each closed Figure- or Pattern-grain slot
is rendered separately. This follows the existing rule from `docs/prompt-as-site.md`:
you cannot instruct Cultivating; you cultivate by arranging conditions.

---

## 4. Reading the legal stance from \(ρ\)

Let:

- \(ρ\) be the reading's density operator;
- \((λ_i, L_i)\) be `eigenLenses(ρ)`, ordered by descending Born weight;
- \(τ_ρ\) be the leave-one-out null derived from the lower spectrum by `deriveNull`;
- \(B = \{L_i : λ_i > τ_ρ\}\) be the lenses that clear the field's own null;
- \(G=(P,R)\) be the admitted proposition-and-relation graph;
- \(C\) be the mass of materially contested propositions or relations in the candidate
  answer scope.

If the spectrum is too small to estimate a null, the legality result is `unknown`, not a
guess. A user preference never upgrades `unknown` to legal.

### 4.1 Pointed readout

Legal when all are true:

1. A direct-answer proposition or measured void exists.
2. No rival direct-answer proposition with a different value clears its contest floor.
3. No cross-proposition join is required to answer the question.

It is the default for a settled `who`, `what value`, `when`, `did`, or `where` query. If
the direct answer is contested, the surface expands to atomic sides under Cultivating; it
does not compress the contest into one smooth sentence.

### 4.2 Cultivating / survey

Epistemically legal for every non-empty reading because it does not collapse the
spectrum. Its obligations are:

1. Every lens in \(B\) receives at least one slot.
2. Remaining slots are allocated approximately in proportion to Born weight.
3. Contested propositions remain visibly contested.
4. Typed voids remain visible.
5. No lens may be suppressed merely to satisfy a requested short length.

If the requested budget is smaller than the number of significant lenses, legality wins:
the result grows to one atomic slot per lens. Cultivating is always legal as an epistemic
fallback, not always compatible with an arbitrary word limit.

### 4.3 Making / best-supported argument

Legal only when all are true:

1. Exactly one lens clears the leave-one-out Born null: `B.length === 1`.
2. Its core proposition is settled and witnessed.
3. No materially contested rival claim or relation lies in the answer scope: `C === 0`.
4. The selected lens covers the user's target rather than merely dominating the entire
   corpus on another subject.

If these conditions do not hold, a Making would manufacture a rank-1 spike that \(ρ\)
does not contain. The guard returns `illegal-making-contested`,
`illegal-making-no-dominant-lens`, or `illegal-making-off-target`, and falls back to
Cultivating.

“Best-supported” must be used in the interface. The system is reporting the reading with
the most Born mass, not asserting metaphysical truth and not choosing the most persuasive
rhetoric.

### 4.4 Composing / structured essay

Legal only when all are true:

1. The requested scope contains a Pattern-grain structure: at least two content slots and
   a grounded relation path between the slots it intends to join.
2. Every transition in the traversal names a relation ID in \(G\).
3. Every section has at least one witnessed commitment.
4. The arc's evidence budget has unspent novel mass for that section.
5. Contested nodes are rendered atomically even when the surrounding pattern is settled.

A disconnected graph may still be displayed as separate sections under Cultivating. It
may not be narrated as one composed argument. A Composing plan is illegal if its apparent
coherence would come only from model-written glue.

### 4.5 Deterministic selection policy

Template selection is not a model task.

1. If the user explicitly requests a shape, select it only when legal.
2. Otherwise, use pointed readout for a direct settled answer or typed void.
3. Use Cultivating for a contested direct answer or an overview request.
4. Use Composing for an explicit narrative/essay request when its relation graph is
   connected and licensed.
5. Use Making only for an explicit strongest-case request, or when a product surface
   explicitly declares that projection and its legality guard passes.
6. On an illegal request, show the reason and render the Cultivating fallback. Never
   silently produce a different stance.

---

## 5. Slot maps

### 5.1 Pointed readout

| Order | Role | Cardinality | Source |
|---|---|---:|---|
| 1 | `answer` | one | Highest-ranked direct proposition that passes target and verdict gates. |
| 2 | `verdict` | one | Its EVA verdict and witness/voice count. |
| 3 | `void` | zero or one | Measured answerability absence, when no answer proposition exists. |

The no-model surface may be as compact as:

> **Axon acquired Fusus in 2024 — settled across 6 independent voices.**

The dash is layout, not an inferred relationship. The verdict is an EVA proposition.

### 5.2 Cultivating survey

| Order | Role | Cardinality | Source |
|---|---|---:|---|
| 1 | `lede` | zero or one | A settled direct-answer proposition only; otherwise omit. |
| 2..N | `lens` | one per significant lens, then proportional | Ranked propositions inside each \(L_i\). |
| adjacent | `relation` | only when licensed | Link/Network proposition connecting the neighboring slots. |
| in place | `contest-side` | one per side | Each incompatible reading, separately witnessed. |
| final | `void` | zero or more | Material questions the admitted sources do not answer. |

Allocation uses a deterministic weighted round-robin over lenses: seed each significant
lens with one slot, then draw the next slot from the lens with the largest unmet
`bornWeight × budget - allocated` balance. This preserves the spectrum without asking a
model what is “important.” Within a lens, use the existing proposition relevance rank and
arc coverage gate.

### 5.3 Making argument

| Order | Role | Cardinality | Source |
|---|---|---:|---|
| 1 | `thesis` | one | Dominant lens's settled, target-compatible DEF/EVA proposition. |
| 2..N | `support` | many | Witnessed propositions in the same lens, ranked by novel evidence mass. |
| between | `relation` | required for every join | Grounded relation connecting support to thesis or prior support. |
| final | `boundary` | zero or one | A measured limitation/void already present in the fold. |

There is no “counterargument” slot because the template is illegal when a material rival
clears the field. A weak or below-null alternative can be available in provenance without
being promoted into the main argument.

### 5.4 Composing essay

The essay follows a graph traversal, not a paragraph generator.

| Order | Role | Cardinality | Source |
|---|---|---:|---|
| 1 | `orientation` | one | Existing frame/thesis commitment; never invented as a topic sentence. |
| 2..N | `section` | many | Deterministically ordered connected components or holons. |
| within section | `claim` | many | Witnessed commitments selected by arc coverage. |
| between claims | `relation` | one per verbal join | Link/Network proposition. |
| at disagreement | `contest-side` | one sentence per side | Incompatible propositions, no smoothing connective. |
| at revision | `reframing` | one | Recorded REC/supersession relation. |
| final | `closure` | zero or one | Existing concluding commitment. If none exists, the essay simply ends. |

Traversal order is derived from the relation graph:

1. choose the target-compatible root with highest witnessed mass;
2. topologically order directed relations;
3. break ties by source order, then stable proposition ID;
4. traverse each holon depth-first while its evidence budget remains novel;
5. separate disconnected components with a visible section boundary, never a prose join.

The model does not receive the tree and decide how to tell it. The planner walks the tree
and hands the model one already-positioned slot at a time.

---

## 6. Joins are claims

The dangerous content is not usually inside the proposition. It is between propositions.

The following surface forms require an admitted relation:

| Surface family | Required relation |
|---|---|
| therefore, thus, because, as a result | `causes`, `enables`, `prevents`, or an equivalently typed causal arc |
| however, although, despite, but | `contrasts` or a recorded REC turn |
| then, later, previously, subsequently | `precedes` or an anchored temporal order |
| also, moreover, in addition | a common parent, same section membership, or another explicit compositional relation |
| in other words, that is | semantic-equivalence relation, not coreference alone |
| while, whereas | a grounded temporal overlap or contrast, as actually intended |

If no relation exists, the safe join is **no lexical join**: a new sentence, list row,
card, or section divider. Punctuation is not permission to imply causality.

`connectiveLeash` already establishes the principle. This specification extends it from
post-hoc detection to planning: a transition slot can be created only from a relation.
The optional prosifier receives the relation's type and endpoints; it never chooses the
relation family.

---

## 7. Verdict controls prose texture

Readability is earned by the evidence state.

| Verdict | Permitted prose unit | Aggregation | Transition policy |
|---|---|---|---|
| `settled` | One proposition, or a planner-built proposition-plus-relations cluster | Allowed only for compatible subject, polarity, time, quantity, and explicit relations | Licensed joins may flow inside one sentence. |
| `contested` | One side per sentence/card | Forbidden across sides | No smoothing bridge. Display the contest as structure. |
| `void` | Fixed typed-absence readout | None | No model call. |
| `stale` | Atomic proposition with stale status | Forbidden | No downstream inference until re-evaluated. |
| `unknown` | Fixed uncertainty/analysis-failed readout | None | No model call and no inferred relation. |

This creates the intended texture:

- consensus can read fluently because its joins are already established;
- disagreement sounds staccato because each side remains an independent atom;
- absence is plain because there is nothing to prosify;
- stale and unknown material cannot become connective tissue.

Fluency is therefore a consequence of earned composability, not paint applied over an
unsettled field.

---

## 8. Realization contract

### 8.1 Model input

The optional prosifier receives exactly one `RenderSlot` plus the fully resolved payloads
named by that slot. It does not receive:

- the unslotted proposition pool;
- neighboring slots;
- lens rankings or alternative lenses;
- permission to change sentence count;
- instructions to summarize, select, argue, balance, or improve coverage;
- an open-ended request to make the answer flow.

Its task is:

> Render this closed semantic payload as one sentence. Preserve every required field.
> Add no entity, event, quantity, time, polarity, modality, proposition, or relation.

Temperature and backend are surface-quality choices. They cannot change the plan.

### 8.2 Bidirectional proposition veto

An accepted sentence must be semantically equivalent to its slot under a conservative,
mechanical check:

1. **Completeness, slot → surface.** Every required proposition field appears in the
   reverse-parsed sentence. Every proposition in a settled cluster is represented.
2. **Exclusivity, surface → slot.** Every proposition extracted from the sentence matches
   a proposition ID or relation ID in the slot.
3. **Identity preservation.** No new entity or referent appears.
4. **Scalar preservation.** Quantities, units, dates, ordinals, and ranges match exactly.
5. **Force preservation.** Negation, polarity, modality, attribution, and verdict are not
   strengthened, weakened, or reversed.
6. **Relation preservation.** Every connective is licensed by one of the slot's relation
   IDs and passes `connectiveLeash`.
7. **Witness preservation.** `classifyProvenance` finds no fabricated proposition, and
   every surfaced proposition retains at least one admitted witness.

This is the operational meaning of “entails exactly.” It is intentionally conservative;
it is not a claim that open-domain logical entailment has been solved. If the mechanical
checker cannot establish equivalence, the verdict is `unknown` and the candidate is
rejected. No second LLM acts as judge.

### 8.3 Rejection and fallback

1. Reject the candidate whole; do not edit an unsafe sentence in place.
2. Optionally retry once with the typed veto reasons and the identical closed slot.
3. If the retry fails, use the deterministic local realizer.
4. If the deterministic realizer cannot preserve the payload, render the proposition as
   a structured claim card rather than prose.

The content and order remain identical across all four outcomes.

---

## 9. Surface trace and leak metric

Every emitted answer token receives one provenance owner:

```js
SurfaceTrace = {
  surface: 'The exhibit capped the value at $15 million.',
  tokens: [
    { text: 'The', from: 'p17' },
    { text: 'exhibit', from: 'p17.subject' },
    { text: 'capped', from: 'p17.predicate' },
    { text: 'the', from: 'p17' },
    { text: 'value', from: 'p17.object' },
    { text: 'at', from: 'p17.predicate' },
    { text: '$15 million', from: 'p17.quantity' },
    { text: '.', from: 'p17' }
  ]
}
```

Inflection, articles, agreement markers, and punctuation inherit the proposition or
relation they realize. A discourse connective must map specifically to a relation ID.
Verdict labels map to the EVA/NUL verdict proposition. UI chrome outside the answer text
is not part of this metric.

Define:

\[
\text{trace coverage} =
\frac{\text{accepted surface tokens with a proposition or relation owner}}
     {\text{all accepted answer-surface tokens}}
\]

The release invariant is `traceCoverage === 1`. Any unowned token is a **content leak**,
not a minor grounding warning. The entire sentence is rejected.

The receipt also records:

```js
RenderReceipt = {
  planId,
  slotId,
  template,
  stance,
  candidateHash,
  renderer: 'rules' | 'local-model' | 'remote-model',
  propositionIds,
  relationIds,
  witnesses,
  completeness: 1,
  exclusivity: 1,
  traceCoverage: 1,
  connectiveVerdict: 'clean',
  accepted: true,
  vetoes: []
}
```

Receipts append to the audit log. The rendered answer is always reproducible from its
frozen plan even when a model backend disappears.

---

## 10. The arc, generalized

The existing arc already supplies budgeted multi-section generation and evidence
drawdown. Under this specification:

| Arc concept | Stance-template interpretation |
|---|---|
| Section plan | Frozen template slots and relation edges. |
| Evidence budget | Traversal budget over admitted propositions. |
| Section generation | One-slot surface realization. |
| Saturation | Stop when no novel proposition mass remains. |
| Bind/veto | Bidirectional slot-equivalence and relation veto. |
| Reconciliation | Verify the assembled trace; never rewrite across slots. |
| Self-fold strain | A veto raises strain and forces deterministic fallback or stop. |

The arc may no longer ask a model to propose section content. For this answer path,
`planSections` becomes a projection over the commitment/relation graph, and
`generateSection` becomes `realizeSlot`. Longform coherence is carried by stable relation
IDs and the commitment graph, not by putting the prior prose into the next prompt.

---

## 11. Worked examples

The following records are synthetic and illustrate behavior, not real-world claims.

### 11.1 Settled pointed answer

**Question:** “When did Northstar acquire Fusus?”

Fold:

```js
p1 = {
  subject: 'Northstar', predicate: 'acquired', object: 'Fusus',
  time: 2024, verdict: 'settled', witnesses: ['s1#p4', 's2#p9'],
  independentVoices: 2
}
```

Legal shape: `readout`. No Generate move is needed.

Accepted surface:

> Northstar acquired Fusus in 2024 — settled across two independent voices.

“Settled across two independent voices” renders the proposition's EVA/diversity receipt;
it is not model commentary.

### 11.2 A contested value

**Question:** “What was the agreement worth?”

Fold:

```js
p2 = { subject: 'agreement', predicate: 'has-value', quantity: '$15M',
       verdict: 'contested', witnesses: ['executed-exhibit#p12'] }
p3 = { subject: 'agreement', predicate: 'has-value', quantity: '$18M',
       verdict: 'contested', witnesses: ['press-release#p3'] }
r1 = { from: 'p2', to: 'p3', type: 'contrasts',
       witnesses: ['alignment:agreement/value'] }
```

The field has two material readings. `Making` is illegal. `Cultivating` is selected.

Accepted surface:

> The executed exhibit states a value of $15 million.
> The press release states a value of $18 million.
> **Contested — the admitted sources give different values.**

Rejected surface:

> Although the executed exhibit says $15 million, the deal was really worth $18 million.

Why rejected: “really” strengthens one side without a proposition; the sentence collapses
the contest; and its contrast join does not preserve the atomic-side rule.

### 11.3 A licensed settled cluster

Fold:

```js
p4 = { subject: 'customer', predicate: 'may-terminate', object: 'agreement',
       verdict: 'settled', witnesses: ['contract#§12.2'] }
p5 = { subject: 'termination', predicate: 'requires-notice', object: '30 days',
       verdict: 'settled', witnesses: ['contract#§12.2(a)'] }
r2 = { from: 'p5', to: 'p4', type: 'qualifies',
       verdict: 'settled', witnesses: ['contract#§12.2'] }
```

The planner may create one settled cluster containing `p4`, `p5`, and `r2`.

Accepted surface:

> The customer may terminate the agreement by giving 30 days’ notice.

Without `r2`, the propositions must render separately:

> The customer may terminate the agreement. The contract requires 30 days’ notice.

The model may not invent “by,” “provided that,” or “therefore” to connect them.

### 11.4 Unlicensed inference

Fold:

```js
p6 = { subject: 'vendor', predicate: 'retains', object: 'derived telemetry', ... }
p7 = { subject: 'customer', predicate: 'may-audit', object: 'security controls', ... }
// no relation between p6 and p7
```

Rejected:

> Therefore, the customer can prevent the vendor from retaining derived telemetry.

The sentence introduces both a causal relation and a new `prevent` proposition. A section
divider is the honest join.

### 11.5 Composing a grounded sequence

Fold:

```js
p8  = { subject: 'parties', predicate: 'signed', object: 'MOU', time: 'March', ... }
p9  = { subject: 'regulator', predicate: 'approved', object: 'transaction', time: 'June', ... }
p10 = { subject: 'transaction', predicate: 'closed', time: 'July', ... }
r3  = { from: 'p8', to: 'p9', type: 'precedes', ... }
r4  = { from: 'p9', to: 'p10', type: 'enables', ... }
```

`Composing` is legal because the relation path is witnessed.

Accepted:

> The parties signed the MOU in March. The regulator approved the transaction in June.
> That approval enabled the transaction to close in July.

“Enabled” is owned by `r4`. If `r4` were only `precedes`, the last sentence would instead
be rendered as sequence without causality.

### 11.6 Void

**Question:** “Who authorized the partnership to negotiate for Metro?”

Fold:

```js
v1 = { operator: 'NUL', subject: 'read-source-scope',
       predicate: 'does-not-address', object: 'authorization actor',
       verdict: 'void', witnesses: ['scope-receipt:t4'] }
```

Accepted fixed surface, with no model call:

> The read sources do not identify who gave that authorization.

The answer does not disappear, search for a plausible name, or fill the slot with generic
background.

---

## 12. Derived answer shapes — parameterizing the four templates, not new machinery

Section 3 names four base projections of the cube's Generate row. A product surface will
want more names than four — “Definition,” “Timeline,” “Compare X vs Y” — but a named
answer shape is not license to invent a fifth template. `stanceLegality` and
`planTemplate` (§13) already take a `target`; naming a shape is choosing that target and a
suppression mask over an existing base, not adding a code path. Eight shapes, catalogued
below, cover the common asks.

**Definition**
Base: pointed readout → Cultivating if senses split. Target: DEF propositions where
subject = anchor.

| Slot | Card. | Source |
|---|---:|---|
| `answer` | one | Dominant settled DEF proposition for the anchor |
| `verdict` | one | EVA verdict / witness count |
| `void` | 0–1 | No DEF proposition found |

*If two+ senses clear the null (jargon overloaded across domains), it's illegal as
readout — falls back to Cultivating: one `lens` per sense, `contest-side` only if the
senses actually conflict rather than just differing by domain.*

**Entity / cast profile**
Base: Cultivating survey. Target: propositions where subject or object = anchor, across
all predicates.

| Slot | Card. | Source |
|---|---:|---|
| `lede` | 0–1 | Settled core-identity proposition (“is a...”) |
| `lens` | one/significant aspect, then proportional | Role, actions, relations-to-others as separate lenses |
| `relation` | adjacent, licensed only | Links between aspects |
| `contest-side` | one/side | Contested identity or role claims |
| `void` | final | Unanswered material questions about the entity |

**Timeline**
Base: Composing, relation-filtered to `precedes`/`same-event`. Target: propositions in
scope connected by temporal relations.

| Slot | Card. | Source |
|---|---:|---|
| `orientation` | one | Earliest or defining event, as an existing frame |
| `section` | many | Connected temporal clusters/eras, deterministically ordered |
| `claim` | many/section | Witnessed events |
| `relation` | one/join | `precedes`/`same-event` only |
| `contest-side` | at disagreement | Conflicting dates or sequences |
| `reframing` | at revision | Recorded correction to a prior timeline claim |
| `closure` | 0–1 | Most recent/concluding event, if one exists |

**Relationship explainer (X ↔ Y)**
Base: Composing, root fixed to the two endpoints instead of highest-mass root. Target:
witnessed path between anchor X and anchor Y.

| Slot | Card. | Source |
|---|---:|---|
| `orientation` | one | Existing claim that a connection exists — never invented |
| `section`/`claim` | many | Steps on the path between X and Y |
| `relation` | one/join | The specific relation types composing the path |
| `contest-side` | at disagreement | If the path itself is disputed |
| `closure` | 0–1 | Final relation reaching Y |

*No witnessed path at all → illegal, plan's `fallback` resolves to `readout-void` (“no
established connection”), not Cultivating — there's no lens to allocate.*

**Comparison (X vs Y)**
Base: Cultivating/Composing hybrid, relation-filtered to `contrasts`/`qualifies`. Target:
propositions about X and Y joined by those relations, plus matched-attribute pairs.

| Slot | Card. | Source |
|---|---:|---|
| `lede` | 0–1 | Direct answer, if the comparison collapses to one settled distinction |
| `lens` | one/compared attribute | Cluster slot when subject/polarity/time compatible + relation exists; atomic otherwise (§7 rule) |
| `relation` | one/join | `contrasts`/`qualifies` between matched attributes |
| `contest-side` | one/side | Mismatched or incompatible values |
| `void` | as needed | Attribute present for one side, missing for the other |

**Dispute digest**
Base: Cultivating with `lede` and non-contested `lens` suppressed. Target: same scope,
verdict filter = contested only.

| Slot | Card. | Source |
|---|---:|---|
| `contest-side` | one/side, per contested proposition | The entire surface |
| `void` | as needed | Material questions the dispute leaves unresolved |

**Gap report**
Not a Generate-row shape — a filtered query over the fold, not a collapse of ρ. No
`stanceLegality` or `planTemplate` call needed.

| Slot | Card. | Source |
|---|---:|---|
| `void` | many | Every NUL/void proposition in the requested scope |

**Caption / margin note**
Below the template layer — one `realizeSlot` call, no `planTemplate`. Target: one
proposition (occasionally one relation) at the reading cursor.

| Slot | Card. | Source |
|---|---:|---|
| single ad hoc slot | one | `sentenceLimit: 1`, no `cluster` grain allowed — “tiny LLM only captions, never detects” |

The pattern across all eight: only three things ever vary — **target** (anchor /
path-between-two-anchors / relation-type filter / verdict filter), **which base template**
it borrows from, and **which slot roles get suppressed**. None of them need new machinery
in `src/weave/generate-row/`.

---

## 13. Product surface

This work belongs on the first-class Question Result page described in
`docs/EOReader_Question_Result_Update_Spec.md`, not in a modal.

### Default result

1. Show the pointed readout or contested atomic sides in the answer slot.
2. Show the claim ledger immediately below.
3. Show the active template and its legality receipt in plain language:
   - “Direct answer — one settled value.”
   - “Survey — sources support several readings.”
   - “Best-supported view — one reading dominates the evidence.”
   - “Structured account — every transition is present in the source graph.”
4. Keep witnesses and anchors one click away.

### Shape control

Expose `Answer`, `Survey`, `Best-supported view`, and `Structured account` as projections
of the same proposition set. Controls are enabled only when legal.

An illegal control remains visible but disabled with a reason:

- “Best-supported view unavailable: two readings carry material evidence.”
- “Structured account unavailable: the sources do not establish links between these
  claims.”
- “Answer unavailable: the sources give incompatible values; showing the split.”

The user may change the projection but may not force an epistemically illegal stance.

### Audit

“Why this shape?” opens:

- the \(ρ\) spectrum and Born-null receipt;
- significant lens count;
- contested mass;
- template legality verdict;
- slot order and owning proposition IDs;
- relation IDs for every transition;
- per-sentence veto and token-trace coverage.

Internal terms such as “same referent” stay in the audit layer. The primary surface uses
plain descriptions of agreement, disagreement, sequence, cause, qualification, and
absence.

---

## 14. Proposed implementation API

```js
// Pure. No model, DOM, network, or mutation.
export const stanceLegality = ({ rho, propositions, relations, target }) => ({
  readout:     { legal, reason, receipt },
  cultivating: { legal, reason, receipt },
  making:      { legal, reason, receipt },
  composing:   { legal, reason, receipt }
});

// Pure. Selects/order/groups content and returns a frozen plan.
export const planTemplate = ({
  requestedShape, legality, propositions, relations, target, evidenceBudget
}) => TemplatePlan;

// One closed slot in; one candidate sentence out.
export const realizeSlot = async (slot, payload, { model = null }) => CandidateSurface;

// Pure, conservative, no model judge.
export const vetoSurface = ({ slot, payload, candidate, doc, relationGraph }) => VetoReceipt;

// Executes frozen slots; falls back deterministically on veto.
export const renderTemplate = async (plan, corpus, { model = null }) => ({
  surface, blocks, traces, receipts, plan
});
```

Proposed holon:

```text
src/weave/generate-row/
  legality.js       read stance legality from ρ and verdict mass
  templates.js      four immutable template definitions
  allocate.js       Cultivating's spectrum-preserving allocator
  plan.js           proposition/relation graph → frozen slots
  realize.js        deterministic renderer + optional one-slot prosifier
  veto.js           bidirectional payload and connective checks
  trace.js          token ownership and trace-coverage receipt
  index.js          public face
  eo-contract.js    declared cube cells and widths
```

The module imports public faces only. The arc may call this holon; the holon must not
import arc internals. The reader UI consumes `TemplatePlan` and render receipts, never
recomputes legality.

---

## 15. Acceptance tests

### Legality

1. A flat or multi-peak spectrum rejects Making.
2. A unique above-null lens with a settled on-target core permits Making.
3. Material contested mass rejects Making even when one lens is numerically largest.
4. A disconnected proposition graph rejects Composing.
5. A connected graph with witnessed relations permits Composing.
6. Cultivating retains every above-null lens and every material contest.
7. `SYN·Cultivating` is never emitted; `coherence` and `permitsCell` stay green.
8. Insufficient spectral evidence returns `unknown`, never a guessed legal stance.

### Planning

9. The same fold and policy produce byte-identical plans.
10. Changing the model backend does not change slot membership or order.
11. Settled clustering requires compatible scalar, time, polarity, modality, and a
    relation for every join.
12. Contested sides always occupy separate atomic slots.
13. Disconnected components receive dividers, not transition slots.
14. Arc saturation stops traversal when novel evidence mass is spent.

### Veto

15. A new entity rejects the sentence.
16. A changed quantity, unit, date, polarity, attribution, or modality rejects it.
17. An omitted required field rejects it.
18. An added proposition rejects it even when that proposition is generally true.
19. “Therefore” without a causal relation rejects it.
20. “However” without contrast or REC rejects it.
21. A connective licensed by the exact relation ID passes.
22. An undecidable equivalence returns `unknown` and falls back; it never passes softly.

### Trace

23. Every accepted rule-rendered sentence has trace coverage 1.
24. Every accepted model-rendered sentence has trace coverage 1.
25. Any unowned token rejects the whole sentence.
26. Function words inherit their proposition; connectives map to relation IDs.
27. The assembled answer's proposition and relation roster equals the frozen plan's roster.

### Verdict texture

28. Settled related propositions may render as one sentence.
29. Contested propositions never share a sentence.
30. Void, stale, and unknown never call a model.
31. A failed optional prosifier produces the same content through deterministic fallback.

### Product

32. Question Result defaults to the legal shape without opening a modal.
33. Illegal projections are disabled with the precise legality reason.
34. “Why this shape?” exposes the spectrum, slots, relations, vetoes, and trace receipt.
35. Excluding a source recomputes \(ρ\), legality, the frozen plan, and the surface from the
    same source scope.

### Derived shapes

36. Every derived shape in §12 resolves to a `target` + base template + suppression mask
    over the API in §14 — none introduces a new template, slot role, or module.
37. A shape whose base is illegal for the given fold falls back exactly as its base would
    (e.g. a Relationship explainer with no witnessed path renders `readout-void`, never a
    silently invented connection).

---

## 16. Build order

1. **Legality reader.** Implement `stanceLegality` and pin it on synthetic spectra,
   contested mass, and target compatibility. No UI and no generation.
2. **Frozen plans.** Implement the four templates and deterministic slot allocation over
   existing commitments and relations.
3. **Rule-only rendering.** Render every template with `speakTriples`, morphology rules,
   fixed voids, and relation-owned joins. Ship this path first.
4. **Trace receipts.** Require `traceCoverage === 1` on the rule path and expose the audit
   structure.
5. **Optional prosifier.** Put one-slot model realization behind the full veto; default it
   off until its accepted output passes the same fixture battery as rules.
6. **Arc integration.** Replace model-led section planning with the frozen graph traversal
   for Question Result synthesis.
7. **Product controls.** Add the legal projection switcher and “Why this shape?” to the
   non-modal Question Result page.
8. **Evaluation.** Compare rule and prosified surfaces on fluency only. Content roster,
   order, verdict, provenance, and relations must be exactly equal by construction.
9. **Derived shapes.** Once step 3 ships, wire the §12 catalog as `target` + suppression
   presets over the existing templates — no new step-1-through-8 machinery required.

---

## 17. Release invariants

The feature is not complete until all of the following are mechanically true:

1. **No model-originated content.** Model off versus model on yields the same plan and
   semantic roster.
2. **No model-originated structure.** Template, slots, order, aggregation, and traversal
   are frozen before realization.
3. **No unlicensed joins.** Every lexical transition owns a grounded relation ID.
4. **No smoothed contest.** Materially incompatible claims remain atomic.
5. **No hidden absence.** Required unfillable slots render typed void.
6. **No illegal stance.** The selected Generate-row stance is falsifiable against \(ρ\)
   and recorded in the log.
7. **No surface leak.** Trace coverage is exactly 1 for every accepted answer.
8. **No model dependency.** Deterministic rendering is complete and always available.

That is the line: the fold decides what exists; the stance guard decides which projection
is honest; the template fixes the traversal; relations license the joins; and a renderer,
model-backed or not, is permitted only to say what the closed slot already means.
