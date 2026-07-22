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
| typed source network, identity candidates, cluster overrides (§7.2–§7.4) | `src/rooms/reader/research-review-network.js` |
| the evidence matrix — measure rows + evidence-area coverage rows (§7.1) | `src/rooms/reader/research-review-matrix.js` |
| the per-candidate waveform preview + the shared evidence-modal mark payload (§6) | `src/rooms/reader/research-review-waveform.js` |
| corpus stats, corpus recipes (incl. Historical), gap-directed search query templates, the one entrance (`researchReview`) | `src/rooms/reader/research-review-corpus.js` |
| the discover/review/admit lifecycle (`reviewStart`, `reviewMore`, `reviewToggleExclude`, `reviewApplyRecipe`, `reviewAdmit`, `reviewCompute`) | `src/rooms/reader/app/research-review.js` |
| cluster overrides, identity decisions, gap-directed search, mark payload (`reviewToggleIndependent`, `reviewClusterAction`, `reviewSetIdentity`, `reviewExpand`, `reviewOpenMark`) | `src/rooms/reader/app/research-review-actions.js` |
| the mounted surface (binvis-style: vanilla DOM, own CSS, no framework) | `src/rooms/reader/research-review-surface.js`, `research-review-surface2.js`, `research-review-cards.js`, `research-review-cards2.js`, `research-review-style.js` |
| the modal container + omnibox wiring | `index.html` (`rrOpen`/`rrTopicId` state, `openResearchReview`/`closeResearchReview`, `ingestSearch`, `onOpenMark` → the existing `openSurprise` evidence modal) |
| tests | `tests/research-review.test.js` (pure engine), `tests/research-review-app.test.js` (the lifecycle, with a faked fetch client), `tests/research-review-surface.test.js` (the mounted surface, over a hand-rolled DOM stub — direct unit tests of every §7/§9 section renderer plus an end-to-end mount smoke test) |

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
- **The per-candidate waveform** (`research-review-waveform.js`) — not a second detector: it reads
  the SAME `eot.turns` (surprisal/belief, bridge) the Overview page's own waveform already computes
  for a source, and opens through the SAME shared evidence-modal contract (`evidence.js`'s
  `buildMark`) Overview's marks resolve through — a mark clicked on a candidate card and a mark
  clicked on Overview land in one modal, one shape.
- **Typed source-network edges** (`research-review-network.js`) — `mirrors` vs `derives from` reads
  WHICH identity fact `sameWitness` actually matched (hash → mirror, host/author → derives from);
  `shares a measure` / `contests` read `comparisonMatrix`'s own rows; `corroborates independently`
  is just "shares a referent, different cluster" — every edge type is a fact already computed
  elsewhere, never a generic "related" line.

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

## What is built beyond the first pass, and what is still honestly missing

A second pass closed most of the gaps the first release left open:

- **Per-candidate waveform preview** — built. Every candidate card carries a compact bar track
  (`research-review-waveform.js`'s `candidateWaveform`) read off the same `eot.turns` Overview's
  own waveform reads; clicking a marked bar opens the SAME evidence modal (`evidence.js`'s
  `buildMark`, wired through `reviewOpenMark` → `index.html`'s existing `openSurprise`). Honest
  about scope: of the spec's seven default marks, three are implemented from data the app already
  computes per-source — significant turns, referent presence (a turn's bridge flag), and
  comparable measures (correspondence against the review's own `comparisonMatrix`). Structural
  frames, echo detection, and cross-candidate-match marks are NOT implemented — they would need the
  fuller omnimodal build (`docs/omnimodal-waveform.md`) run per-candidate, which this screen does
  not do.
- **Typed source network** — built (`research-review-network.js`'s `sourceNetwork`): `mirrors`,
  `derives from`, `shares a referent`, `shares a measure`, `contests`, `corroborates
  independently`, `covers the same event`. Rendered as a capped, always-visible, keyboard-operable
  LIST — the structured-list alternative §15 requires for every graph is the primary (and only)
  view here. A force-directed VISUAL layout is still not built; `cites` (an outbound-link graph) is
  not detected — this app does not retain a candidate's link structure past ingestion.
- **Identity review (§7.3)** — built. `identityCandidates` lists every referent core ≥2 candidates
  share, always starting `candidate`; `reviewSetIdentity` persists a confirm (`aligned`) / reject
  (`separate`) / reset decision on the review record. The grouping itself stays a shared-vocabulary
  heuristic (`refCore`), never real cross-source coreference — which is exactly why the engine
  never asserts `aligned` on its own.
- **Derivative-cluster actions (§7.4)** — built: "Keep origin only" and "Keep reporting
  perspectives" batch-toggle a cluster's exclusion; "Mark as independent"
  (`reviewToggleIndependent`) pulls one source out of a computed cluster without disputing the
  underlying identity fact; "Review differences" expands each member's title and a short excerpt
  inline — a real side-by-side read, not a fabricated semantic diff.
- **Gap-directed research (§9)** — built, but scoped honestly: `evidenceGaps` tiers the
  ALREADY-DETECTED areas by independent-origin count (Strong ≥3 / Partial =2 / Missing ≤1). It
  never claims a topic the corpus hasn't touched at all — the engine has no taxonomy of what a
  topic *should* cover, so "missing" here always means "thin", never "known to be absent". Five
  deterministic query templates (`gapSearchQueries`) — dataset / opposing / government / academic /
  by-measure — run through `reviewExpand`, landing new candidates in the SAME review topic.
- **The evidence matrix (§7.1)** — built (`research-review-matrix.js`), unifying MEASURE rows
  (from `comparisonMatrix`, mapped to `supports`/`contests`/`revises`/`silent`) and PROPOSITION rows
  (evidence-area membership, mapped to `supports`/`candidate correspondence`/`silent`). Per the
  spec's own language ("columns represent selected candidates"), this table — and the
  selected-corpus footer stats — are scoped to the CURRENT proposed-corpus selection and recompute
  on every checkbox toggle; the evidence map, connections, and gap tiers deliberately stay a
  stable read of everything reviewed, so the screen does not fully reshuffle on every click. Two
  spec cell states (`states a different value`, `unavailable`) and eight of its ten row families
  (state/classification/relation/event/definition/evaluation/absence/change) would need real
  proposition-level parsing this app does not run — left out rather than faked.
- **The Historical recipe (§8)** — built: the earliest and latest member of every evidence area,
  every source behind a stated revision, every primary record.
- **Accessibility (§15)** — a live region announces selection/recipe/search changes; waveform bars
  and every new button are native, tab-ordered elements; `focus-visible` outlines and a dark-mode
  stylesheet were added. NOT verified against an actual screen reader, and "the evidence modal
  restores focus to its triggering mark" is not wired — the modal is the pre-existing, globally
  shared `surpriseModal` component, not something this surface owns the close/focus lifecycle of.
- **Mobile (§14)** — a narrow-viewport media query reflows the toolbar/recipes/footer and shrinks
  the matrix table; the sticky footer already existed. The spec's exact component REORDERING
  (header → corpus summary → reading → coverage → cards → connections/gaps) is not built — the DOM
  order is unchanged, only the layout responds.
- **Qualitative (non-numeric) agreement/disagreement** — partially covered by the evidence
  matrix's PROPOSITION rows (term-overlap evidence-area membership), not by real same/opposed
  claim detection. `perceiver/proposition-equivalence.js`'s derived-null-over-embedding verdict
  needs a live meaning-measuring embedder (its own "firewall" holds every pair at `no-commit`
  under the deterministic hash embedder this app runs without a warmed model) — wiring it in is a
  deliberate follow-up, not attempted here so as not to claim a semantic judgment the corpus can't
  yet back up.
- **The search-refinement drawer** is still not built (source-type/date/language/geography filters,
  the explain/compare/verify intent-selection). Gap-directed search adds narrowly-scoped QUERY
  TEMPLATES instead — a different, additive mechanism, not a substitute for the drawer.
- **"What this source changes" admission preview** (Phase 5) is not built as its own view; the
  selected-corpus footer (now genuinely scoped to the current selection) is the nearest existing
  approximation.
