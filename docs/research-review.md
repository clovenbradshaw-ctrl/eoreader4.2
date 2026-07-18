# Research Review — a search result becomes a provisional, inspectable corpus

> It does not merely return links. It shows what each source contributes, how the sources
> connect, where they differ, and what corpus the reader would create by selecting them.

Before this, a web search had two motions, both immediate admission: the omnibox pulled the top
salient hits straight into a new topic (`searchTopic`), and the search-results popup recorded a
hit the moment you clicked it (`recordHit`). Neither left room to look before admitting — a
mirror of the same press release and the release itself joined the record as two equally-weighted
sources, with nothing to say they were the same voice. Research Review is the screen that goes
between discovery and admission: search results become a provisional corpus the reader inspects,
shapes, and selects from, and only the selection is admitted.

## The three source states

```
Search question → Discover candidates → Provisionally read candidates → Map evidence and
connections → Reader shapes source scope → Admit selected corpus → Topic overview
```

- **Discovered** — a dressed search hit: title, domain, snippet. `client.search()` (unchanged).
- **Reviewed** — fetched, admitted to the S-registry (hashed, citable, a real parsed document) and
  joined to a dedicated `kind: 'review'` topic — but **not yet** joined to any other topic.
- **Admitted** — its `sn` copied into a real topic's `sourceSns` by an explicit act.

Sources are already a flat, workspace-global registry with topics referencing them by `sn`
(`docs/library-search.md`, `src/rooms/reader/app/registry.js`) — a source may belong to many
topics. That existing design is what makes "reviewed but not admitted" cheap: a reviewed source is
simply a source whose only membership is the review topic.

## Where it lives

| piece | file |
|---|---|
| evidence areas, duplicate/derivative clusters, connections, the reading | `src/rooms/reader/research-review.js` |
| corpus stats, corpus recipes, the one entrance (`researchReview`) | `src/rooms/reader/research-review-corpus.js` |
| the discover/review/admit lifecycle (`reviewStart`, `reviewMore`, `reviewToggleExclude`, `reviewApplyRecipe`, `reviewAdmit`, `reviewCompute`) | `src/rooms/reader/app/research-review.js` |
| the mounted surface (binvis-style: vanilla DOM, own CSS, no framework) | `src/rooms/reader/research-review-surface.js`, `research-review-cards.js` |
| the modal container + omnibox wiring | `index.html` (`rrOpen`/`rrTopicId` state, `openResearchReview`/`closeResearchReview`, `ingestSearch`) |
| tests | `tests/research-review.test.js` (pure engine), `tests/research-review-app.test.js` (the lifecycle, with a faked fetch client) |

Every computation is pure and model-free — "no frontier LLM used" is not a slogan on the header,
it is literally true: the reading, the evidence areas, the clusters, and the recipes are all
templated over numbers the engine already computes.

## What is reused, not reinvented

The mapping that made this tractable: nearly every primitive already existed, aimed at a
neighboring problem.

- **Duplicate / derivative clusters** — `enactor/ground/corroboration.js`'s `sameWitness` /
  `witnessDescriptor` (built for multi-source corroboration): two sources are the same voice only
  when an **identity fact** says so (same id, same content hash, same registrable host, same
  byline) — never a content-similarity guess, because two independent reports of one event
  necessarily share the fact. `clusterDuplicates` unions this into groups; the earliest-retrieved
  member is the apparent origin, the rest are flagged derivative.
- **Agreements and disagreements** — `enactor/factcheck/comparison.js`'s `comparisonMatrix` (built
  for the topic-wide cross-source pass): one row per measured thing (cost, schedule, capacity,
  homes, …), one column per source, a deterministic reading of the spread (`Consistent` /
  `Revised upward` / `Sources disagree`) with every cell opening to its sentence. Research Review
  reads this scoped to the review topic instead of the whole record.
- **Connections** — `sharedReferentLinks` generalizes the Results-landing precedent
  (`docs/search-and-pins.md`'s grouped search, index.html's `sfrLinks`): two candidates link when
  they name the same referent, grouped by referent core since raw cross-source coref does not run
  here.
- **Evidence areas** — the one genuinely new piece: a greedy clustering of candidates by shared
  salient terms (Jaccard over each candidate's top term-frequency vocabulary — the same reduction
  `turn/research.js`'s `profileOf` uses for curiosity). The label **is** the shared vocabulary, so
  it stays inspectable rather than an invented editorial taxonomy ("Traffic effects"); the overlap
  floor is derived from the observed pairwise overlaps in the candidate set itself (mean + half a
  standard deviation), not a hand-picked constant.
- **Structural relevance** (`candidateRole`, `isPrimary`) — never a bare percentage. A card
  explains itself with what it contributes (which evidence areas), which measures it carries,
  whether it is the apparent origin or a derivative of a cluster, and whether it is independent —
  all facts the engine already computed, not a fabricated score.

## Corpus recipes

Five selection strategies over the computed features, each returning the sns to keep and one
sentence of why (`research-review-corpus.js corpusRecipes`):

- **Balanced** — one independent origin per evidence area, plus a second distinct interpretation
  where the area has more than one.
- **Primary evidence** — every source that reads as primary (an official/dataset domain, a PDF, or
  the apparent origin of a derivative cluster).
- **Smallest sufficient** — the fewest sources that still touch every evidence area.
- **Perspectives** — one source per independent origin (duplicate clusters already collapse
  mirrors/reprints/syndication), maximizing how many distinct voices the corpus carries.
- **Contradiction-seeking** — every source behind a measured disagreement, plus one per area as a
  floor.

Applying a recipe sets the working exclusion list (`topic.review.excludedSns`); toggling an
individual source's checkbox does the same and marks the recipe `'custom'`. Nothing here mutates
the record — only which reviewed sources are currently selected for admission.

## Admission and provenance

`reviewAdmit(topicId, { targetTopicId | newTitle, selectedSns })` copies the selected (non-excluded)
sns into a real topic's `sourceSns` — an existing topic, or a new one. The review topic itself is
**never deleted on admission** — it keeps every reviewed candidate, the query, the exclusion list,
and the recipe used, stamped with `admittedAt` / `targetTopicId` / `admittedSns`. The review
becomes its own auditable record, the way a source's `metadataLog` already audits edits.

## What is next

- **The interactive connection graph.** The default view is the readable narrative
  (`connectionNarrative`) plus a link list — deliberately "readable, not graph-first"
  (the spec's own priority order). The force-directed graph view it can additionally offer is not
  built.
- **Per-candidate waveform preview.** A reviewed candidate is a real, parsed S-registry source, so
  its existing Overview page already carries the waveform-of-surprise; "Open source ↗" reaches it.
  A dedicated inline preview embedded in the card, and click-to-jump marks tied to specific
  evidence spans, are not built.
- **Qualitative (non-numeric) agreement/disagreement.** `comparisonMatrix` only ever measures
  quantities (cost, schedule, capacity, …). A textual claim disagreement — two sources asserting
  incompatible non-numeric propositions — would want `perceiver/proposition-equivalence.js`'s
  derived-null-over-embedding same/opposed/open verdict, not built into this screen yet.
- **The search-refinement drawer.** Source-type/date/language/geography filters and the
  intent-selection (explain/compare/verify/…) from the fuller spec are not built; `routeKind`'s
  existing auto-routing and the "Refine search" re-run are what ships today.
- **Mobile-specific layout.** The modal is responsive (it scrolls, it does not overflow), but the
  dedicated mobile ordering and sticky-footer treatment described in the fuller spec are not
  built.
