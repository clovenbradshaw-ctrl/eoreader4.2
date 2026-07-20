# EO Reader Question Result Update

**Status:** Build specification  
**Replaces:** The modal Research Review as the primary web-search result  
**Product rule:** Do not serialize the answer into generated prose. Render the most relevant aligned propositions as scoped verdict objects, followed by the evidence ledger that produced them.

## 1. Problem

The current web-search journey has three structural problems:

1. **The result opens in a modal.** The modal obscures the topic, has limited navigation, cannot function as a durable research location, and encourages the result to behave like a temporary review step even though it is the main product outcome.
2. **The result contains too many weakly useful instruments.** Evidence-area token clusters, corpus recipes, source-network views, identity review, “same referent,” candidate waveforms, repeated gap-search actions, and measure summaries compete with the question the user asked.
3. **The direct answer is missing.** The app fetches sources and produces findings, entities, graphs, and counts, but does not first show the one to three propositions that most directly answer the question with their evidentiary state.

The update replaces the modal with a first-class Question Result page and removes any element that does not help the user answer one of these questions:

- What do the active sources establish?
- Where do they disagree?
- What is not established?
- What source evidence supports each result?
- Which sources should be included or excluded?

## 2. Non-goals

The Question Result page is not:

- a generated paragraph;
- a topic dashboard;
- a source graph;
- an entity-resolution workbench;
- an architecture map of the corpus;
- a waveform browser;
- a generic Findings page;
- a chat transcript;
- a place to display every analysis the engine can produce.

The engine may continue computing identity candidates, source networks, phaseposts, waveforms, origin clusters, and other structures. Those do not receive permanent space on this page unless they directly change the answer verdict.

## 3. Core journey

```text
Question
  → Question Result page opens immediately
  → Candidate sources are discovered and provisionally read
  → Direct verdicts and claim ledger update as evidence arrives
  → User includes or excludes candidates
  → User explicitly admits selected sources to the topic
  → The Question Result remains the durable result for that question
```

### 3.1 No modal

The result must occupy the main application canvas. It must have its own route, browser history entry, and restorable state.

Recommended route:

```text
#/topic/{topicId}/question/{questionId}
```

Before a permanent topic exists:

```text
#/research/{questionId}
```

Admission may associate the question session with a topic without changing the conceptual page.

### 3.2 No automatic source admission

Web search creates provisional candidates. Candidates do not appear as admitted topic sources, affect topic Findings, or mint permanent topic-graph objects until the user selects **Add selected sources**.

States:

```text
discovered → provisionally_read → selected → admitted
```

An unavailable or rejected candidate never enters the topic record.

## 4. Page structure

The page contains five sections, in this order:

1. Question header
2. Direct answer slot
3. Compact Meaning projection
4. Claim ledger
5. Sources

The compact Meaning projection is optional only when there is not enough grounded structure to draw one. When present, it follows the direct answer and precedes the ledger; it is not decorative content at the bottom of the page. No other section is part of the MVP.

## 5. Question header

```text
QUESTION
Who authorized the Partnership to negotiate for Metro?

Based on 4 selected sources · 3 independent origins
[Change sources] [Search for more]
```

The question remains editable. Editing and submitting creates a new pivot in the same question session rather than a generated chat turn.

The header may show processing progress:

```text
Reading 3 of 7 candidate sources…
```

Do not lead with bytes, tokens, entity totals, EoT operations, or full-corpus metrics.

## 6. Direct answer slot

The direct answer contains one to three `VerdictObject` cards. If no proposition clears the relevance and evidence gates, the answer slot renders a scoped void or insufficient-evidence result.

### 6.1 Supported

```text
SUPPORTED BY 4 INDEPENDENT ORIGINS

Axon acquired Fusus in 2024.

4 support · 0 contest · 2 sources silent
[Show evidence]
```

Use **Supported** or **Corroborated**, not **Settled**, as the default label. The system knows what the active sources support; it does not establish universal truth.

### 6.2 Contested

```text
CONTESTED

MOU value

$15M                              $18M
Executed exhibit                  Press release
Finance memo                      Vendor deck

2 independent origins             1 independent origin
[Compare evidence]
```

The page does not collapse the split into a prose summary. The disagreement is the answer.

### 6.3 Single-source / insufficient evidence

```text
ONE SOURCE STATES THIS

The agreement was signed on March 4.

1 source · no independent confirmation or contest
[Show evidence]
```

Do not render a single-source assertion as corroborated merely because it appears multiple times within the same document or origin.

### 6.4 Void

```text
NOT ESTABLISHED BY THESE SOURCES

Who authorized the Partnership to negotiate for Metro?

None of the 8 active sources addresses the authorization.

Related material on record
Metro ownership · executed MOU · financing

[Search for more sources]
```

Void is always scoped. Never state that an answer does not exist—only that the active record does not establish it.

### 6.5 No-commit

```text
COULD NOT DETERMINE

Two passages may address the question, but the subject binding is ambiguous.

[Review passages]
```

No-commit is preferable to a malformed proposition or false alignment.

## 7. Verdict semantics

Every answer object has two independent classifications:

### Standing

- `witnessed`: explicitly supported by source material;
- `derived`: mechanically read from multiple witnessed objects;
- `candidate`: correspondence or interpretation has not cleared its gate.

### Verdict

- `supported`;
- `contested`;
- `single_source`;
- `void`;
- `no_commit`.

Do not merge standing and verdict into one status badge.

Witness counts use independent origins, not passage count, mention count, or page count.

## 8. Evidence interaction

### 8.1 No result modal

Neither the Question Result nor its evidence opens as a centered overlay that hides the result page.

### 8.2 Inline evidence expansion

Selecting **Show evidence** expands the verdict card in place:

```text
SUPPORTING EVIDENCE

S-0002 · Executed exhibit · page 14
“The purchase price payable at closing is $15,000,000…”
[Open page 14]

S-0004 · Finance memo · paragraph 8
“The executed consideration totaled $15 million…”
[Open passage]
```

The expansion preserves the question, verdict, source scope, and scroll position.

### 8.3 Dedicated evidence route

For deeper comparison, use a routable detail page or split pane:

```text
#/topic/{topicId}/question/{questionId}/claim/{propositionGroupId}
```

Browser Back returns to the exact expanded verdict or ledger row.

### 8.4 Native jumps

Evidence actions use source-specific labels:

- Open PDF page
- Open passage
- Open table rows
- Play excerpt
- Open feed item
- View image region
- Open code lines

The source Overview remains the home of the omnimodal waveform. The Question Result does not duplicate source waveforms.

## 9. Claim ledger

Below the direct answer, show every proposition group relevant enough to help inspect or refine the answer.

```text
CLAIMS IN THIS RESULT · 14

[All 14] [Supported 4] [Contested 2] [One source 7] [Unknown 1]

Claim                                  Verdict       Origins
Axon acquired Fusus                    Supported     4
Transaction closed in 2024             Supported     3
MOU value was $15M or $18M             Contested     3
Metro authorization                    Not found     0
```

### 9.1 Row expansion

Each row expands inline to show:

- supporting source roster;
- contesting source roster;
- silent active sources;
- best passage from each position;
- alignment grounds;
- exact source jumps.

### 9.2 Filters

Only the following filters ship in MVP:

- verdict;
- source;
- entity named in the proposition;
- proposition kind: state, event, relation, definition, evaluation, measure, absence.

Every filter shows its resulting count before selection.

### 9.3 Ranking

Ledger ranking is query-conditioned. It must prioritize propositions that match the question’s subject, requested relation, requested value/type, polarity, and time frame.

General prominence within a source must not outrank question relevance.

## 10. Projections

Projections are optional alternative arrangements of the same proposition ledger. They are not separate analyses and do not mint new claims. On the Answer page, the projection strip appears immediately after the direct answer and before the full claim ledger so the EOGraph is discoverable without displacing the answer.

MVP projection strip:

```text
[Claims] [Meaning] [Positions] [Timeline] [Measures]
```

Only show a projection when the current result contains useful data for it.

### Claims

Default ledger view.

### Meaning

The Meaning projection is the query-conditioned EOGraph: the live orbital system of meaning already present in EOReader. It is a first-class reading of the answer, not a generic network visualization and not an implementation detail.

For a person or topic question, it may be the default exploratory projection after the direct verdict. The direct answer always remains visible above it.

The compact Answer-page view must:

- center the question subject or selected proposition;
- show only entities, concepts, and relations supported by propositions in the current result;
- encode directness or evidence strength without implying certainty from node size alone;
- update immediately when a source is included or excluded;
- let a node click re-center the orbit and filter the claim ledger to the propositions involving that node;
- let an edge click reveal the exact relation proposition and its witness count inline;
- keep the current question, source scope, and answer cards visible;
- offer **Open full meaning map**, which navigates to the topic's Meaning route rather than opening a modal.

The graph is not allowed to create a free-floating semantic association merely because two terms co-occur. Every visible edge must resolve to at least one proposition group or an explicitly labeled low-standing candidate relation.

Recommended orbital semantics:

| Orbit | Meaning |
|---|---|
| Center | Current question subject or selected proposition |
| Inner | Directly answer-bearing entities and concepts |
| Middle | One grounded relation away |
| Outer | Contextual or lower-relevance concepts |
| Dashed | Candidate or single-source relation |
| Solid | Corroborated relation |
| Split/accented | Contested relation |

The visual label can remain **EOGraph** in advanced/audit surfaces, but the primary user-facing label is **Meaning** or **Meaning map**.

### Positions

Appears only when aligned propositions form a genuine contested split. Shows each reading and its source roster. Do not infer ideological camps from generic similarity.

### Timeline

Appears only when grounded event dates or a source chronology exists. It is a templated ordering of proposition objects, not generated narrative.

### Measures

Appears when relevant aligned propositions contain comparable numbers, dates, bounds, or revisions.

Do not ship Atmosphere in this MVP. Do not show an unscoped generic graph on the Question Result. The Meaning projection must always be scoped to the active question, proposition set, and source selection.

## 11. Sources section

Sources appear after the ledger, with a compact sticky scope control available near the question header.

```text
SOURCES · 4 of 7 selected

✓ Executed MOU
  4 relevant claims · primary document · independent origin

✓ Finance memo
  3 relevant claims · supports $15M

○ Vendor article
  1 relevant claim · derivative of press release

[Add 4 selected sources to topic]
```

Required controls:

- include/exclude;
- open source Overview;
- show relevant passages;
- explicit admission action.

Toggling a source immediately recomputes the answer slot and ledger. Display the consequence when it changes a verdict:

> Excluding the executed exhibit changes “MOU value” from contested to one-source.

## 12. Remove from the current Research Review

The following elements must be removed from the primary result page:

### Remove completely from this page

- “Same referent” controls or sections;
- identity-review workbench;
- source-network graph;
- candidate waveform cards;
- token-cluster evidence areas such as `black · african · canada`;
- corpus recipe buttons: Balanced, Primary evidence, Smallest sufficient, Perspectives, Contradiction-seeking, Historical;
- repeated gap-search button sets for every cluster;
- generic measure summaries unrelated to the question;
- entity census totals;
- raw EoT or operator terminology;
- full Findings provenance graph;
- JSON view;
- generated Research Reading prose.

### Retain internally or move elsewhere

| Capability | Destination |
|---|---|
| Referent alignment | Entity page or Audit; surface only when it blocks a verdict |
| Source network | Topic Connections |
| Waveform | Source Overview/Examine |
| Full provenance graph | Evidence Map/Audit |
| Origin clustering | Source cards as a concise derivative warning |
| Phaseposts | Audit or advanced claim detail |
| Corpus strategies | Later power-user source-selection menu, not the default page |

“Same referent” is an engine concern, not a question-result destination. The user should see its consequence—claims combined or held apart—not a permanent identity-analysis instrument.

## 13. Pivot history instead of chat transcript

A follow-up changes the view over the accumulated evidence rather than producing a response bubble.

Examples:

```text
MOU value
› Primary sources only
› $18M position
› Timeline
```

A pivot may change:

- query;
- source scope;
- entity center;
- verdict filter;
- projection;
- time interval.

Each crumb restores the complete previous state.

## 14. Data contracts

```js
QuestionSession {
  id,
  topicId?,
  question,
  questionPrior,
  candidateSources,
  selectedSourceIds,
  admittedSourceIds,
  result,
  pivots,
  createdAt,
  updatedAt
}
```

```js
QuestionResult {
  question,
  sourceScope,
  processing,
  answerability,
  direct: VerdictObject[],
  ledger: PropositionGroup[],
  facets: Facet[],
  availableProjections: string[],
  sourceContributions: SourceContribution[]
}
```

```js
VerdictObject {
  propositionGroupId?,
  displayText,
  standing,
  verdict,
  support: WitnessRoster,
  contest: WitnessRoster,
  silentSourceIds,
  unavailableSourceIds,
  trace,
  relevanceGrounds,
  alignmentGrounds
}
```

```js
PropositionGroup {
  id,
  normalizedFrame,
  memberPropositions,
  verdict,
  support,
  contest,
  trace,
  relevanceScore,
  alignmentConfidence,
  noCommitReason?
}
```

### Display-text constraint

`displayText` must be either:

- an extracted proposition already present in the record;
- a deterministic rendering of structured fields;
- a fixed void/no-commit UI template.

It may not be generated free-form prose.

## 15. Relevance and alignment gates

### 15.1 Relevance

A proposition may enter the answer slot only when it clears all applicable gates:

- subject/referent match;
- requested predicate or relation match;
- requested value/type match;
- polarity compatibility;
- temporal compatibility;
- query-proposition similarity margin.

Source prominence, entity frequency, and source length may break ties but cannot substitute for direct relevance.

### 15.2 Alignment

Two propositions may corroborate or contest only when they share a compatible frame:

- same or confirmed subject referent;
- compatible predicate/relation;
- compatible object or measure;
- compatible time and scope;
- polarity or value relation that can be compared.

Silence is not disagreement. Shared words are not alignment. Same publisher is not same origin.

### 15.3 Independent origins

Origin grouping requires evidence such as duplication, citation, explicit derivation, syndication, or common upstream material. Domain equality alone is insufficient.

## 16. Desktop layout

```text
┌────────────────────────────────────────────────────────────┐
│ Question + scope                              Sources 4/7   │
├────────────────────────────────────────────────────────────┤
│ DIRECT ANSWER                                              │
│ [supported / contested / void verdict cards]               │
├────────────────────────────────────────────────────────────┤
│ Claims | Meaning | Positions | Timeline | Measures         │
│ [query-conditioned EOGraph / selected projection]          │
├────────────────────────────────────────────────────────────┤
│ CLAIM LEDGER                                               │
│ filters · ranked rows · inline evidence                    │
├────────────────────────────────────────────────────────────┤
│ SOURCES                                                    │
│ contribution cards + explicit admission                    │
└────────────────────────────────────────────────────────────┘
```

Do not reserve a permanent right rail for entities. Entity details open inline, in a split pane, or on the Entity page. The compact Meaning projection occupies the main canvas; its full form opens as a route, never a modal.

## 17. Mobile layout

Mobile preserves the same order:

1. Question
2. Direct verdict
3. Projection selector
4. Compact Meaning projection or selected alternative
5. Compact claim filters
6. Claim ledger
7. Sources

Sticky footer while provisional sources exist:

```text
4 selected · 3 origins       [Add sources]
```

Evidence expands inline. A full source opens as a new route. No full-screen result modal or nested modal stack is allowed.

## 18. Implementation plan

### Phase 1: First-class route and removal

- Replace the Research Review modal mount with a routed page.
- Remove recipe controls, identity review, source network, candidate waveform, token-cluster evidence map, and repeated gap actions from the page.
- Preserve provisional candidate state across refresh.
- Stop automatic admission.

### Phase 2: QuestionResult assembler

- Replace `search-surface.js` single-template selection with `QuestionResult` assembly.
- Run answerability before direct-card selection.
- Produce query-ranked proposition groups.
- Enforce trace on every non-void verdict.

### Phase 3: Verdict cards and ledger

- Render supported, contested, single-source, void, and no-commit states.
- Add inline evidence expansion.
- Add verdict/source/entity/kind facets with pre-click counts.

### Phase 4: Source recomputation and admission

- Recompute result when provisional scope changes.
- Explain verdict transitions caused by toggles.
- Admit only selected sources through an explicit action.
- Preserve search and selection provenance.

### Phase 5: Useful projections

- Positions for genuine contested groups.
- Timeline for grounded dated propositions.
- Entity repivoting with crumb history.
- Measures for query-relevant comparable values.

## 19. Files likely affected

- `src/rooms/reader/search-surface.js`: replace concordance/cast/contrast template routing with QuestionResult assembly.
- `src/rooms/reader/app/record-search.js`: maintain QuestionSession, provisional candidates, source scope, and question prior.
- `src/rooms/reader/research-review-surface.js`: retire modal renderer or convert its useful source-card fragments to the routed Sources section.
- `src/rooms/reader/app/research-review.js`: remove automatic topic admission and separate provisional from admitted state.
- `src/rooms/reader/claims.js`: expose conservative proposition grouping and independent-origin witness rosters.
- `index.html` reader room: add question-result route, verdict renderer, ledger, inline evidence, and mobile layout.
- hash router: support question and claim-detail routes.

Do not extend the existing modal. Replace it.

## 20. Acceptance tests

### Routing

- Submitting a web question opens a routable main-canvas Question Result.
- No result modal appears.
- Refresh and browser Back restore question, scope, projection, and expanded row.

### Admission

- Search candidates do not appear as topic sources before explicit admission.
- Provisional candidates do not affect permanent Findings or the topic graph.
- Admission records query, scope, and processing versions.

### Direct answers

- A supported factual question produces one to three traced verdicts above the fold.
- A genuine disagreement shows both readings and rosters.
- A single-source proposition is not labeled corroborated.
- An unanswered question renders scoped void.
- Ambiguous subject binding renders no-commit rather than a malformed claim.

### Relevance

- “Who was the first Black president of Canada?” does not surface television episodes, comedy, acreage, or unrelated dates as direct answers.
- General source prominence cannot outrank a direct query-proposition match.
- Irrelevant numeric measures do not produce a Measures projection.

### Alignment

- Silence does not produce contestation.
- Shared vocabulary alone does not produce corroboration.
- Same domain alone does not collapse sources to one origin.
- Competing values align only when subject, measure, scope, and time are compatible.

### Simplification

- No “same referent” control appears.
- No source-network graph appears.
- No corpus-recipe row appears.
- No candidate waveform appears.
- No generated Research Reading paragraph appears.
- No repeated gap-action grid appears.

### Provenance

- Every non-void verdict and ledger row opens exact evidence.
- Source jumps land at page, passage, row, timestamp, region, or code range.
- Source waveform remains available from the Source page.

## 21. Success criterion

The update succeeds when a first-time user can ask a question and understand the result without knowing EO terminology or opening another page:

1. what the selected sources support;
2. where they disagree;
3. what they do not establish;
4. which propositions produced that verdict;
5. where every proposition came from;
6. which sources will enter the topic if admitted.

The page should feel smaller than the current Research Review because it is doing a more important job. Its defining behavior is:

> The question opens a durable evidence result—not a modal, not a paragraph, and not a collection of every analysis the engine knows how to perform.

## 22. Topic Overview is the canonical answer

When a topic is created from a question, the Topic Overview must be the durable result for that question. It must not treat the topic as merely a container of sources.

For a topic titled:

> Who is Gillian Anderson?

the first substantive content below the topic header must answer that question from the active source scope.

### 22.1 Required layout

```text
TOPIC
Who is Gillian Anderson?
8 active sources · 7 independent origins

[Refine question] [Ask a follow-up] [Add sources]

──────────────────────────────────────────────────

ANSWER

SUPPORTED
Gillian Anderson is an American actor best known for playing
Dana Scully in The X-Files.

Supported by 3 independent origins
[Show evidence]

SUPPORTED
She was born in Chicago in 1968 and spent parts of her
childhood in London and Michigan.

Supported by 2 independent origins
[Show evidence]

──────────────────────────────────────────────────

CLAIMS IN THIS ANSWER · 12
[Supported] [Contested] [One source] [Unknown]

──────────────────────────────────────────────────

SOURCES CONTRIBUTING TO THIS ANSWER
```

### 22.2 What moves below the answer

The following may remain on Topic Overview, but only after the answer and claim-ledger preview:

- source-scope controls;
- contributing sources;
- chronology when the question requires it;
- useful contested propositions;
- recent changes to the corpus.

### 22.3 What leaves Topic Overview

- Generic corpus-event chips must not precede the answer.
- Source cards must not be the page’s primary content.
- The full entity profile must not open automatically in a permanent right rail.
- Entity census totals must not substitute for an answer.
- A generic graph button must not compete with the direct answer.
- “Ask about this topic” must not be the primary action when the topic is already a question.

### 22.4 Remove the misleading answer count

The current `0 answers` appears to count generated response objects. In a non-serialized product, that is the wrong object to count.

Replace it with one of:

- `1 question result`;
- `12 relevant propositions`;
- `3 supported · 1 contested · 2 unresolved`.

Do not call the topic unanswered merely because no generated paragraph exists.

### 22.5 Non-question topics

If the topic title is not a question, Topic Overview may lead with a corpus reading organized around the topic phrase. It still uses verdict objects and a claim ledger rather than generated prose.

Example:

> **New York congestion pricing**

The direct slot may show the most load-bearing supported, contested, and missing proposition groups for that topic. The user can establish a canonical question through **Ask this corpus**.

## 23. Search is three different operations

The current `Search` label conflates three jobs. They must be separated in the information architecture.

### 23.1 Ask the active record

Purpose:

> Recompute the Question Result over the sources already active in this topic.

Location:

- editable question field on Topic Overview;
- **Ask a follow-up** action;
- question/pivot history.

Output:

- direct verdicts;
- claim ledger;
- useful projections;
- no web retrieval unless explicitly requested.

### 23.2 Find in the record

Purpose:

> Locate a literal string, entity, proposition, passage, or source already in the topic.

Location:

- `⌘K` / command search;
- optional compact **Find** action.

Output:

- grouped matches;
- occurrences;
- entities;
- propositions;
- sources.

This is not question answering and must not share the same result layout.

### 23.3 Research/add sources

Purpose:

> Search outside the active record because the current sources are void, thin, contested, or incomplete.

Location:

- **Search for more sources** from a void/thin verdict;
- **Add sources** in the topic header;
- global add/research omnibox.

Output:

- the routable provisional-candidate section of the Question Result;
- explicit source selection and admission;
- no modal.

### 23.4 Remove the Search tab

The topic-level `Search` tab should be removed. Its functions move to:

- Topic Overview question field: ask;
- `⌘K`: find;
- Add sources / Search for more: research.

This eliminates the current ambiguity where Enter may search the record, search the web, create a topic, admit sources, or open a different surface.

## 24. Revised topic navigation

Recommended primary topic navigation:

```text
Answer | Sources | Evidence | Meaning | Pins
```

### Answer

The Topic Overview and canonical Question Result.

### Sources

Admitted sources, contribution, inclusion scope, and processing status.

### Evidence

The full claim ledger, contested comparisons, chronology, measures, and provenance details. The current Findings and useful parts of Compare move here.

### Meaning

The full-canvas EOGraph for the active topic and question. It preserves the same source scope and proposition filters as Answer. It supports orbit recentering, relation inspection, and entity selection. Entity profiles open only after selection, and the entity index is available inside this route.

### Pins

Saved propositions, passages, entities, scopes, and question pivots.

The current generic Graph and Findings tabs should not remain as peer destinations. Findings becomes Evidence. Graph becomes the explicitly named Meaning route and is also previewed as a projection on Answer.

## 25. Question lifecycle

### 25.1 New research question

```text
Landing question
  → Question Result route
  → provisional candidates appear below a void/thin initial result
  → user selects and admits sources
  → Question Result becomes Topic Overview
```

### 25.2 Question over an existing topic

```text
Topic Overview
  → user refines or asks follow-up
  → result recomputes over active sources
  → pivot is added to history
  → user may make the pivot the canonical topic question
```

### 25.3 Search for more evidence

```text
Void/thin/contested verdict
  → Search for more sources
  → provisional candidates extend the same Question Result page
  → selected candidates are admitted
  → verdicts visibly recompute
```

The user must never lose the original question or result context while adding evidence.

## 26. Screenshot-specific acceptance test

Given a topic titled `who is gillian anderson?` with eight active sources and relevant cross-source findings:

- the first viewport contains at least one traced proposition directly answering who Gillian Anderson is;
- the compact Meaning projection begins in or immediately below the first viewport, after the direct answer and before the full ledger;
- `0 answers` does not appear merely because no generated paragraph exists;
- corpus events and source cards appear below the answer;
- the Gillian Anderson entity profile does not occupy the right rail until the user selects the entity;
- **Ask about this topic** is replaced by **Refine question** or **Ask a follow-up**;
- the source scope recomputes the answer;
- the compact Meaning map recomputes from the same source scope;
- clicking a Meaning node filters the visible claims and never opens a modal;
- **Open full meaning map** navigates to the Meaning route without losing the question;
- excluding the primary Gillian Anderson source visibly changes evidence strength;
- the Search tab does not appear;
- `⌘K` still finds passages and entities;
- **Search for more sources** extends the same question page without opening a modal.

## 27. Codebase grounding

This section pins the design to `origin/main` at commit [`56091753561c8eda37ca45c0c1ebd0e6613e3401`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/commit/56091753561c8eda37ca45c0c1ebd0e6613e3401). Every mechanism below is classified as one of:

- **Exists:** usable now, though it may need to be called from a new surface.
- **Adapt:** useful code exists but its current semantics are too weak or too broad for an answer verdict.
- **Add:** the codebase does not currently perform this step.

The implementation must not describe an **Adapt** or **Add** mechanism as already working. In particular, EOReader currently extracts and renders many of the required evidence objects, but it does not yet assemble them into a question-specific, cross-source answer.

### 27.1 What already exists

| Required capability | Status | Precise mechanism |
|---|---|---|
| Structured proposition | Exists | [`makeProposition`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/core/proposition.js#L26-L52) represents substrate, relation, differentia, and polarity. |
| Copular facts such as “X is fictional” | Exists | [`parseRelations`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/perceiver/parse/relations.js#L814-L891) emits `DEF` events for copular predicates and `CON`/`SIG` events for verbal relations. |
| Passive relations such as “X is portrayed by Y” | Exists | The same parser recovers the agent and patient for passive voice before emitting the relation at [lines 823–846](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/perceiver/parse/relations.js#L823-L846). |
| Negation and modality | Exists | [`headVerb`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/perceiver/parse/relations.js#L292-L345) records relation polarity and modality. |
| Verbatim evidence spans | Exists | Proposition arguments retain spans; [`anchorFor` and `resolveAnchor`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/anchor.js#L118-L165) turn them into durable source jumps. |
| Mechanical sentence phrasing | Exists | [`phraseMechanical`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/weave/topline/phrase.js#L28-L68) produces fixed relational and definition sentences without a model. |
| Mechanical “who” and graph-relation answers | Exists | [`answerWho`, `answerRelation`, and entity resolution](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/enactor/answer/mechanical.js#L124-L263) already read `DEF` and graph edges and fill deterministic templates. |
| Typed absence | Exists | [`fieldVerdict`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/surfer/answerable.js#L97-L140) decides whether an answer-bearing field exists; [`answerVoid`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/enactor/answer/void.js#L11-L31) renders the absence mechanically. |
| Numeric disagreement | Exists | [`extractQuantities` and `crossSourceConflicts`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/enactor/factcheck/crosscheck.js#L59-L95) extract measures; [the conflict pass](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/enactor/factcheck/crosscheck.js#L141-L203) compares compatible subjects across sources. |
| Witness diversity | Exists | [`diversityTier`, `makeDiversity`, and `diversityOf`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/core/witness.js#L28-L47) distinguish document, publisher, author, and other dimensions; the constructors are at [lines 81–147](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/core/witness.js#L81-L147). |
| Optional non-generative semantic alignment | Exists | [`discoverPropositionEquivalence`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/perceiver/proposition-equivalence.js#L153-L231) uses mutual-nearest semantic similarity and a derived noise boundary when a meaning-capable embedder is available. It does not generate text. |
| Source review before admission | Exists | [`reviewStart`, `reviewToggleExclude`, `reviewAdmit`, and `reviewCompute`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/app/research-review.js#L37-L182) provide the provisional-to-admitted lifecycle. |
| EOGraph/Meaning renderer | Exists | [`mountSolarSystem`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/solar-system.js#L67-L205) renders and recenters the orbital meaning system. [`tieredData` and `topicTieredData`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/app/wiki.js#L46-L174) already adapt source/entity material into its tiers. |

### 27.2 What must be adapted

1. [`parseQuery`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/search-record.js#L31-L52) parses field operators and free terms; it does not parse a question into subject, relation, expected answer type, or world frame.
2. [`routeIntent`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/search-surface.js#L44-L51) recognizes only a small set of record-search views. It has no `reality_status`, `identity`, `measure`, or `authorization` intent.
3. [`corroborateClaims`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/claims.js#L166-L199) uses exact/containment equality and distinct document IDs. That is a useful first pass, not sufficient proof of independent corroboration.
4. [`sameWitness`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/enactor/ground/corroboration.js#L78-L116) currently treats a shared registrable host as the same witness. For verdicts, a host is a publisher cluster, not conclusive evidence that two documents are the same voice. Hard collapse requires a duplicate/content hash, matching origin, confirmed syndication, or equivalent evidence. Shared host should lower independence confidence rather than erase the document.
5. [`scopeSources`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/scope-sources.js#L53-L80) is a lexical/substance filter. It can narrow the corpus, but cannot by itself rank propositions for a question.
6. `tieredData` is source/entity-centered. The Question Result needs a `questionMeaningData(result)` adapter so that the compact map contains only the active question's proposition groups, entities, and contributing sources.

### 27.3 What must be added

Add a question-result assembly layer. It is the missing product mechanism—not a generated-answer layer.

```text
question
  → parseQuestionFrame
  → select active/admitted sources
  → collect propositions + anchors
  → rank against question frame
  → align equivalent/opposed propositions
  → count independent voices
  → assign product verdict
  → select 1–3 direct cards
  → derive ledger + Meaning projection
```

Recommended module boundary:

```text
src/rooms/reader/question-result.js
  parseQuestionFrame(query)
  rankQuestionEvidence(frame, propositions)
  alignQuestionEvidence(ranked, options)
  verdictForGroup(group, options)
  assembleQuestionResult(input)
  questionMeaningData(result)
```

This layer may reuse and refactor entity resolution from `mechanical.js`, but it must run before the generic [`answerConfirm`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/enactor/answer/mechanical.js#L44-L121). That function uses broad token overlap and could incorrectly answer “yes” to a reality question merely because the entity and related words occur in the same unit.

## 28. Non-generative result assembly

The result is generated in the computer-science sense—computed from data—but it is not written by a generative language model. The system performs extraction, normalization, matching, counting, and deterministic rendering.

### 28.1 Runtime contract

```js
async function assembleQuestionResult({ query, record, activeSourceIds, embedder }) {
  const frame = parseQuestionFrame(query);
  const evidence = propositionsForSources(record, activeSourceIds);
  const ranked = rankQuestionEvidence(frame, evidence);
  const groups = await alignQuestionEvidence(ranked, { embedder });
  const judged = groups.map(group => verdictForGroup(group));
  const direct = chooseDirectCards(frame, judged, 3);

  return {
    query,
    frame,
    direct,
    ledger: judged,
    meaning: questionMeaningData({ frame, direct, groups: judged }),
    sourceScope: sourceContribution(judged, activeSourceIds),
  };
}
```

The pseudocode names the missing orchestration. Its internal evidence should be made entirely from existing propositions, witness records, anchors, and verdict signals.

### 28.2 Deterministic wording rules

Question cards may contain only:

- labels taken from entity/source records;
- values and relations taken from propositions;
- fixed interface vocabulary such as `SUPPORTED`, `CONTESTED`, `NOT ESTABLISHED`, `according to`, `in the story`, and witness counts;
- sentences produced by `phraseMechanical`;
- short type-specific templates specified below.

Question Result must never call the optional model path in `phraseObject`. If an embedding model is available, it may only score similarity. It may not write, paraphrase, summarize, or supply missing connective tissue.

### 28.3 Alignment and refusal

Alignment proceeds from strongest to weakest:

1. exact canonical proposition equality;
2. normalized subject/relation/object equality;
3. compatible measure identity and subject;
4. optional MiniLM-style proposition equivalence;
5. otherwise, keep propositions separate.

If no meaning-capable embedder is present, EOReader must not guess that paraphrases are the same claim. It returns more separate rows and, where necessary, `NO COMMIT`. This is an acceptable degradation: lower recall, not invented agreement.

## 29. Worked example: “Is Fox Mulder real?”

### 29.1 Question frame

`parseQuestionFrame` must produce an explicit world-sensitive frame:

```js
{
  intent: 'reality_status',
  subjectText: 'Fox Mulder',
  expected: 'boolean',
  requestedFrame: 'real_world',
  contrastFrame: 'story_world'
}
```

This is an **Add** mechanism. Current query parsing does not produce it.

### 29.2 Evidence the current parser can produce

From a sentence such as:

```text
Fox Mulder is a fictional character in The X-Files.
```

the copular branch in `parseRelations` can emit a `DEF` proposition equivalent to:

```text
Fox Mulder — predicate → fictional character
```

From:

```text
Fox Mulder is portrayed by David Duchovny.
```

the passive branch can emit:

```text
David Duchovny — portrayed → Fox Mulder
```

Both propositions retain their unit/span witnesses and can be made clickable with `anchorFor`.

### 29.3 Domain rule

The `reality_status` answerer uses a small, auditable lexicon and explicit negation—not open-ended inference:

```js
FICTIONAL = ['fictional character', 'fictional person', 'imaginary character'];
REAL_PERSON = ['person', 'actor', 'writer', 'politician', 'scientist'];
```

Rules:

- an explicit, positive fictional predicate supports `real_world = false`;
- an explicit, positive real-person predicate supports `real_world = true` only when the subject is not being described inside a work or hypothetical frame;
- `character` alone is insufficient and returns `NO COMMIT`;
- “portrayed by” corroborates the story/portrayal frame but is not, by itself, proof that the subject is fictional;
- opposed explicit predicates produce `CONTESTED`, never a majority-written sentence.

The lexicon must be visible in code and covered by tests. It is a classifier, not an LLM prompt.

### 29.4 Rendered result

```text
IS FOX MULDER REAL?

NO — IN THE REAL-WORLD FRAME                         SUPPORTED
Fox Mulder is identified as a fictional character.
3 passages · 2 independent origins
[Show evidence]

IN THE STORY                                         SUPPORTED
Fox Mulder is an FBI agent in The X-Files.
2 passages · 2 independent origins

PORTRAYED BY                                         SUPPORTED
David Duchovny portrays Fox Mulder.
2 passages · 1 independent origin

MEANING
David Duchovny —portrays→ Fox Mulder —character in→ The X-Files
```

Every variable phrase comes from a proposition or entity label. `NO`, `IN THE REAL-WORLD FRAME`, and the verdict labels are fixed interface text. The visible answer is therefore possible without a generative LLM.

### 29.5 Failure behavior

If the corpus only contains “Fox Mulder is an FBI agent,” the result is:

```text
NOT ESTABLISHED BY THESE SOURCES
The sources describe Fox Mulder in a story-world role but do not explicitly
establish whether the name refers to a real person.
```

The second sentence is a fixed `reality_status + story_role_only` template. It is not dynamically authored prose.

## 30. Worked example: “Who is Gillian Anderson?”

### 30.1 Existing mechanical path

This is the closest fit to current code. `answerWho` resolves an entity, reads clean `DEF` predicates, and fills an identity template. `phraseMechanical` already renders definitions as `Subject is value`.

For Question Result, extend that single-record behavior across active sources:

1. resolve `Gillian Anderson` using the entity/alias logic now private to `mechanical.js`;
2. collect `DEF` propositions whose substrate is that entity;
3. collect direct relations whose subject or object is that entity;
4. align exact propositions with `sameClaim`, then optionally align paraphrases with `discoverPropositionEquivalence`;
5. attach witness diversity and anchors;
6. rank identity/type before career, role, award, and incidental mentions;
7. select no more than three direct cards.

### 30.2 Rendered result

```text
WHO IS GILLIAN ANDERSON?

Gillian Anderson is an American actress.              SUPPORTED
6 passages · 3 independent origins
[Show evidence]

She portrayed Dana Scully in The X-Files.              SUPPORTED
4 passages · 2 independent origins
[Show evidence]

KNOWN FOR
Dana Scully · The X-Files · The Fall

MEANING
Gillian Anderson —portrays→ Dana Scully —appears in→ The X-Files
                 —appears in→ The Fall
```

The display may use `She` only as a fixed second-card substitution after the full entity name appears in the first card. The underlying proposition must still store `Gillian Anderson`; the UI must not invent or resolve a pronoun as evidence.

### 30.3 Why the current page fails

The current page can show `0 answers` even while the entity side panel contains a useful definition and the record contains hundreds of findings. That is a surface-assembly failure, not an evidence failure. The Question Result should move the mechanically phrased, cross-source identity proposition into the first viewport. The entity profile remains a secondary inspection surface reached from the answer or Meaning map.

### 30.4 One-origin honesty

Eight Wikipedia pages are eight documents, not necessarily eight independent origins. The verdict must show both counts when they differ:

```text
8 passages · 1 publisher cluster · 3 distinct article records
```

It must not say `supported by 8 independent sources` merely because eight source IDs exist.

## 31. Worked example: “What is the MOU value?”

### 31.1 Existing mechanical path

`extractQuantities` already emits normalized measures with nearby subject material. `crossSourceConflicts` groups compatible measures across distinct sources and reports incompatible values beyond tolerance.

The new work is question matching: the assembler must select the conflict whose subject and measure correspond to `MOU value`, rather than promoting every numeric conflict in the topic.

### 31.2 Rendered contested result

```text
WHAT IS THE MOU VALUE?

THE SOURCES DISAGREE                                 CONTESTED

$15 million                         $18 million
Executed exhibit · finance memo     Press release · vendor deck
2 independent origins               1 publisher cluster

[Compare passages]
```

The result is a comparison of extracted scalar values and source rosters. No model writes a compromise such as “the value appears to be approximately $16.5 million.”

### 31.3 Conflict versus revision

Before rendering `CONTESTED`, compare dates and document roles. If the evidence establishes that `$18M` superseded `$15M`, render a grounded timeline instead:

```text
REVISED
$15M — draft MOU, 2 March
$18M — executed MOU, 19 March
```

If supersession is not explicit, retain `CONTESTED`. Chronology alone is not permission to infer revision.

## 32. Worked example: scoped void

Question:

```text
Who authorized the Partnership to negotiate for Metro?
```

For each active source, retrieval finds candidate spans and `fieldVerdict` evaluates whether any span actually bears the requested authorization relation. The aggregate result is void only when every active source returns a compatible absence, as the current search surface already does for source-level void aggregation in [`routeSurface`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/rooms/reader/search-surface.js#L109-L125).

```text
WHO AUTHORIZED THE PARTNERSHIP TO NEGOTIATE FOR METRO?

NOT ESTABLISHED BY THESE SOURCES                     VOID
None of the 8 active sources addresses the authorization.

Related, but not an answer:
• the Partnership negotiated with Metro
• the board approved the final agreement

[Search for more sources] [Change source scope]
```

The related rows must be labeled as non-answers. They are top-ranked neighboring propositions, not evidence for the requested relation. `Search for more sources` starts `reviewStart` and displays provisional candidates inline on this page; `reviewAdmit` is the only step that adds selected candidates to the durable topic.

The void is scoped. If five of eight sources were not successfully parsed, the result must say:

```text
NO COMMIT
No answer was found in 3 read sources; 5 sources could not be evaluated.
```

It must not convert unanalyzed material into absence.

## 33. Source toggles and Meaning recomputation

The source selector is an input to the whole result, not a display filter applied after judgment.

```text
active source IDs
  → evidence collection
  → alignment
  → voice census
  → verdicts
  → direct cards
  → ledger
  → questionMeaningData
```

Worked behavior:

1. A Gillian Anderson identity card is supported by three publisher clusters.
2. The user turns off the strongest biographical source.
3. The assembler reruns over the remaining source IDs.
4. The card may change from `SUPPORTED` to `SINGLE SOURCE`, disappear from the top three, or become `NO COMMIT`.
5. The compact Meaning map removes nodes and edges that had no remaining proposition witness.
6. The result announces the change: `Recomputed from 7 active sources`.

No stale edge may remain in EOGraph merely because it existed before the toggle. `questionMeaningData` should construct its tiered input from the post-filter proposition groups, then pass that input to the existing `mountSolarSystem` renderer.

## 34. Product verdict adapter

Do not expose every internal relation or diagnostic label in the primary surface. The core verdict vocabulary in [`src/core/verdicts.js`](https://github.com/clovenbradshaw-ctrl/eoreader4.2/blob/56091753561c8eda37ca45c0c1ebd0e6613e3401/src/core/verdicts.js#L36-L46) is richer than the product needs. Add a view adapter rather than renaming or overloading the core enum.

| Evidence state | Primary product label | Primary behavior |
|---|---|---|
| positive proposition group with sufficient voice diversity | `SUPPORTED` | Collapse to one claim; show counts and roster on demand. |
| positive and negative/opposed groups | `CONTESTED` | Keep readings side by side. |
| one answer-bearing voice | `SINGLE SOURCE` | Show the claim with an explicit weak-evidence label. |
| all successfully evaluated sources lack the requested field | `VOID` | State scoped absence. |
| parsing/alignment/evaluation is incomplete | `NO COMMIT` | State what could not be evaluated. |

Labels such as `same referent`, `same predicate`, parser method, equivalence class, and operator code belong in Audit/Evidence details. They must not compete with the answer.

## 35. Implementation sequence grounded in the code

### Phase 1 — assemble only what is already explicit

1. Add `question-result.js` and `parseQuestionFrame` for `identity`, `reality_status`, `measure`, and generic relation questions.
2. Refactor/export entity resolution from `mechanical.js`.
3. Collect existing propositions and anchors by active source.
4. Use exact normalized alignment only.
5. Use `phraseMechanical` and fixed templates.
6. Render direct cards, ledger, source contribution, and scoped void inline.

This phase requires no embedding model and no generated text.

### Phase 2 — cross-source honesty

1. Replace distinct-document corroboration with the witness-diversity census.
2. Correct the same-host witness collapse.
3. Integrate numeric conflicts.
4. Separate `VOID` from failed analysis/`NO COMMIT`.
5. Recompute all result outputs from source scope.

### Phase 3 — Meaning and optional semantic recall

1. Add `questionMeaningData` and feed the existing EOGraph renderer.
2. Add optional non-generative MiniLM alignment behind a capability check.
3. Preserve exact-alignment fallback and visible refusal.
4. Add full routed Meaning view with the same question and source scope.

## 36. Code-grounded acceptance tests

Add focused tests before changing the surface:

- `Is Fox Mulder real?` plus an explicit `fictional character` `DEF` returns real-world `false`.
- The same question plus only `character` returns `NO COMMIT`.
- The generic `answerConfirm` path never handles a `reality_status` frame.
- A passive “portrayed by” sentence creates the expected agent-to-character relation and retains a resolvable anchor.
- `Who is Gillian Anderson?` ranks a clean identity `DEF` above incidental mentions.
- Two documents from one publisher do not automatically count as two independent origins.
- Two aligned claims from independently established voices become `SUPPORTED`.
- Opposed aligned claims become `CONTESTED` and both remain visible.
- `$15M` versus `$18M` for the same compatible measure produces the contested scalar card.
- A later date alone does not convert conflict into revision.
- Eight successfully evaluated voids produce `VOID`; three voids plus five parse failures produce `NO COMMIT`.
- Turning off a source recomputes the direct answer, evidence counts, product verdict, and EOGraph input.
- With no meaning-capable embedder, exact matches still work and paraphrase alignment refuses rather than guesses.
- Every direct proposition card resolves to a source anchor.
- No primary answer card displays `same referent`, parser/operator labels, or generated connective prose.

## 37. Feasibility conclusion

The proposed surface is possible without the normal use of an LLM. EOReader already contains most of the hard evidence machinery: structured relation extraction, mechanical phrasing, durable anchors, typed voids, measure comparison, witness diversity, optional embedding-based equivalence, controlled source admission, and the EOGraph renderer.

What is not yet present is equally precise: question-frame parsing, question-specific evidence ranking, product-verdict assembly, and a result-scoped EOGraph adapter. These are deterministic orchestration and classification tasks. Their quality will be lower than a frontier LLM on indirect, elliptical, or causally complex questions, but their behavior can be measured, audited, and improved without inventing an answer paragraph.
