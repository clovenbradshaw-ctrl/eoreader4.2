# What the page should teach the eye first — visual hierarchy for the answer dashboard (pre-code)

**Status:** design, not implementation. Extends `docs/search-answer-descent.md`, which specifies *what* the assembler returns (`AnswerObject` — `glance`/`pieces`/`sources`, `Card`, `Trace`, `answerable`). That spec is not yet built: `search-surface.js`'s `routeSurface` (below) still returns the old single-template shape it was written to replace. This doc designs *how the result renders and what a reader does with it* once the assembler exists — the layout, the navigation grammar, and the one piece of prior art already shipped that the descent spec never mentions (`solar-system.js`'s pivot). No code changes in this doc; it is a rendering/interaction spec to build against once `search-answer-descent.md`'s assembler lands.

---

## 0. The one idea

A reader arriving at this page did not come to read; they came to find, and they will decide whether to stay in something close to a glance (Pirolli & Card's information-foraging account — moment-to-moment patch/leave decisions driven by *information scent*, the cues that predict whether a path is worth the click; eye-tracking work on results pages finds attention concentrates hard in an F-shape at the top and left, which is a report on how badly most pages waste the top of the fold, not a design goal to imitate). Whatever earns trust and orientation fastest belongs in the first two hundred pixels. For a page whose whole differentiator is *epistemic honesty* — this shows you what's settled, contested, and genuinely unknown, rather than a fluent guess — that first glance is the entire pitch. Bury it under a results list that looks like everyone else's and the reader never sees the thing that makes staying worthwhile.

The other governing idea is Bates's berry-picking: real search rarely resolves in one query — a person's sense of what they're after shifts with each thing they see, so each new piece of evidence sends them in a slightly adjusted direction. This argues against "answer the question, then get out of the way." When the honest picture is genuinely contested, the page's job is to let the reader pick a direction from the disagreement, not resolve it for them.

## 1. Prior art, and where it maps onto this codebase specifically

Shneiderman's mantra — **overview first, zoom and filter, details on demand** — is the load-bearing structure. It maps almost exactly onto what's already spec'd and partly built:

- **Overview first** is not a summary; it's the shape of the whole result space, rendered before any single piece of it. Most search engines can't show this honestly (a ranked list has no shape, only an order). This system can, because the fold already tracks corroboration, contradiction, and void as first-class counts (`fold/significance.js`'s CONTRADICTS/CONNECTS/CORROBORATES, `claims.js`'s `status`). Settled/contested/void *is* the overview.
- **Zoom and filter** is Hearst's faceted-navigation finding: browsing works because it follows whatever path is natural to the reader rather than forcing one drill-down order, and it beats picking every filter up front (which produces empty results with no explanation) *only if every facet shows its count before the click*. This is the piece least built today (§4).
- **Details on demand** means not-shown-at-full-weight-until-asked, not hidden-until-asked. A claim carries a quiet marker (corroboration count, source favicon) at rest, and expands to full document context on interaction — already the intent of `search-answer-descent.md §7`'s "standing is always visible," this doc just designs the actual typographic weight (§3.3).

One more piece of navigation research matters here because the underlying data is a graph, not a tree: faceted drill-down and breadcrumbs assume a roughly hierarchical space where narrowing is a nested decision. A field of entities linked by claims and corroboration isn't that shape. The honest navigation grammar for a graph is **re-centering**, not drilling down — and this is already built (§5), just not wired to the search page.

## 2. Current state vs. the three bands this doc proposes

Grounding before designing further. What exists today, file:line:

- **`search-surface.js`'s `routeSurface`** (line 68) still picks **one** template and returns it — `template: 'concordance'` at line 81, overridden by `routeIntent` at line 122, falling back to concordance at line 124 if the routed template is empty. This is exactly the "pick one, don't stack" behavior `search-answer-descent.md §0` says to retire. No `glance`/`pieces`/`sources`, no `Card`, no `Trace`, no `answerable` anywhere in the file.
- **`out.elements`** (lines 103-108) — four static count tiles: Sources (`signalCount`/`rail.length`), Occurrences (`total`), Cast (`out.cast.length`), Claims (`out.contrast.length`). Rendered as `sfElements` in `index.html:1547` (a `sc-for` over four tiles, each opening a template on click — `index.html:8190`). This is the closest existing thing to a coverage count, but it's a static end-state tally, not a progressive fill, and it isn't ordered or weighted as the page's primary signal — it sits below the search input, source rail, and above the tab switcher (`index.html`'s actual top-to-bottom order: search input → web-fallthrough CTA → source rail chips → `sfElements` tiles → `sfConcepts` chip row → `sfTabs` → the single active template body).
- **`claims.js`'s `STANDING_STATUS`** (lines 51-53): `{ witnessed/asserted: 'Witnessed', stated: 'Stated', contested: 'Contested' }`. **There is no `'Corroborated'` status.** `recordClaims` (line 193-195) computes a real `contested` count via `claims.filter(c => c.status === 'Contested').length`, which is the one honest countable "disagreement" fact in the system today — but "how much agrees" has no symmetric count to put next to it. This is a concrete gap, not just a rendering one: §3.2's convergence band needs a corroborated tally that doesn't exist yet, distinct from the mere absence of contestation.
- **No faceted filter UI with pre-click counts anywhere.** `sfElements` and `sfConcepts` (`index.html:8191`, `search-surface.js:110-118`) are result-summary tiles and a flat concept-chip row, not cross-filter chips that narrow by intersection (entity × source × claim-type). Grep for "facet" across the reader room returns nothing.
- **Graph re-centering is already built, and unused here.** `solar-system.js`'s `clickBody` (lines 327-330): `if (onPivot && n.kind === 'entity' && n.ref && n.id !== sun.id) onPivot(n); else select(n);` — clicking a non-sun entity re-centers the whole view on it immediately, no drill-down button, no modal. The comment at 324-326 states the philosophy this doc is arguing for verbatim: *"A click IS the pivot... an entity other than the sun becomes the new centre right away."* This is the correct navigational grammar for §5 below — it just isn't wired to the answer page's entity strip at all today; `solar-system.js` and `search-surface.js` are entirely separate call paths.
- **`solar-system.js` already has its own three-level descent** (`state.level` 0/1/2 over a `LEVELS` array, `setLevel` at 315-321, with a "zoom to descend" hint at line 311) — an independent, already-shipped instance of the significance→structure→existence pattern `search-answer-descent.md` names for the answer object. Worth citing as prior art for the pattern, not conflating: that descent is the graph view's own camera, not the search page's.

## 3. The three bands (the overview, made concrete)

Once the `AnswerObject` assembler exists, the top of the page — above the current `sfTabs`/single-template body — carries three bands, in this order, replacing the static `sfElements` tile row as the page's primary visual weight rather than a secondary summary beneath the fold:

### 3.1 Coverage — how much ground was covered

A real count, not a spinner: sources read, entities surfaced, claims extracted — the same numbers `sfElements` already computes (`signalCount`/`rail.length`, `total`, `out.cast.length`, `out.contrast.length`), reordered to the top and given a progressive-fill render as sources resolve, rather than shown only once as a final tally. Sources already resolve asynchronously in `record-search.js`'s `searchTheSurface`; the design change is rendering each source's contribution landing live rather than waiting for the batch to finish. This is a genuine trust mechanic, not decoration: an answer that visibly accumulates evidence, source by source, cannot be faked by a system with no mechanism for fabrication — watching it fill is worth more than a disclaimer.

### 3.2 Convergence — how much the evidence agrees

The single most visually prominent element on the page, above any individual result. Reads directly off `claims.js`'s per-record claim set: contested count already exists (`recordClaims` line 194); **a corroborated count needs to be added** — a claim asserted from two or more independent mints (`readingClaims`/`summaryClaims`/`murmurClaims` per §`claims.js` lines 88-130) should carry a `'Corroborated'` status distinct from a single-source `'Stated'` one, mirroring how a `'Contested'` upgrade already happens on dedup (line 191). With that in hand, convergence renders as three legible states — mostly settled (calm), actively contested (a visible split, not a warning color — disagreement isn't an error), or void (`answerable.void`, per `search-answer-descent.md §4`, stated plainly, never papered over). Concretely this pulls from `answerObject.glance` cards' `status` field once §10 of the descent spec is wired, filtered to counts rather than individual cards.

### 3.3 Synthesis — the grounded prose, with texture that changes with epistemic state

Once the `glance` layer exists (`search-answer-descent.md §5`), its cards render as prose whose typography visibly changes with `standing`/`status` rather than reading as one uniform voice. A settled clause sits in normal text. A contested clause is interrupted inline — both readings shown side by side at the point of disagreement, not demoted to a footnote — so a reader can't finish the sentence without seeing the split. A gap is a labeled gap. This is an addendum to `search-answer-descent.md §7`'s "standing is always visible" rule: that section says the fact must be shown; this section designs the actual inline rendering (dual-clause, not footnote) as the specific mechanism, because a footnote is exactly the "resolve it for them and hope they don't notice" failure mode §0 above warns against.

Only after these three bands does the page earn a conventional list — today's `sfTabs`/single-template body (`index.html:1562-1712`) becomes the zoom-and-filter layer (§4), not the primary view.

## 4. Zoom and filter — facets need counts before the click

`sfElements`'s four tiles (Sources/Occurrences/Cast/Claims) and `sfConcepts`'s chip row already carry counts, but they're result totals, not facet previews — clicking one switches the whole template (`_sfSetTemplate`, `index.html:8190`) rather than narrowing the current view by intersection. Hearst's finding, made concrete for this page: a facet chip ("contested only," "this entity only," "this source only") must show what clicking it would leave — "narrowing to this shows 4 corroborated claims and 1 live dispute" — computed from the current `AnswerObject`'s layers before the click, not after. Building this is straightforward once `pieces` exists (§`search-answer-descent.md §3`): a facet's count is just a filter predicate run against `pieces`/`sources` ahead of render, memoized per keystroke the same way `sfElements`' counts are already recomputed per `routeSurface` call.

## 5. Navigation: re-centering, not drilling down

`solar-system.js`'s `clickBody`/`onPivot` (§2 above) is the correct grammar and it's already shipped — the work here is wiring, not invention. The answer page's entity strip (whatever renders `pieces`' cast cards) should call the same `onPivot` contract `solar-system.js` exposes rather than navigating to a new page or opening a modal: clicking an entity re-centers the graph view on it, and the answer dashboard re-derives around the new center (the same re-scope `search-answer-descent.md §7`'s "the source rail stays live" already describes for source toggles, extended to entity pivots). A lightweight pivot history (`["Darcy", "Bingley", "Jane"]`, append-only, click any prior entry to re-pivot back) is the breadcrumb-equivalent — a memory aid, never the primary way of moving, matching `solar-system.js`'s own trail hint at line 310-311 (`"— zoom to descend"`) which already renders a trail string today for its own camera.

## 6. Wiring (exact), once `search-answer-descent.md`'s assembler exists

1. **`search-surface.js`** — once `routeSurface` returns `glance`/`pieces`/`sources` per the descent spec, reorder `out.elements`'s three constituent counts (sources/entities/claims) into a `coverage` band computed the same way, plus a new `convergence` band derived from `pieces`' claim `status` tallies (settled/contested/void counts) — additive fields on the `AnswerObject`, not a replacement for `elements`.
2. **`claims.js`** — add `'Corroborated'` to `STANDING_STATUS`, keyed off a claim appearing across ≥2 distinct mints/sources (`readingClaims`/`summaryClaims`/`murmurClaims`) via `sameClaim`, mirroring the existing contested-upgrade-on-dedup logic at line 191.
3. **`index.html`'s reader room** — render `coverage`/`convergence`/`synthesis` as the hero, above the current `sfElements`/`sfTabs` block; demote that block to the zoom/filter layer under it, with facet chips computed from `pieces` per §4.
4. **`index.html` + `solar-system.js`** — thread an `onPivot` handler from the answer page's entity cards into the same contract `solar-system.js` already accepts (line 328), plus a small `pivotHistory` array kept by the reader room, not by `solar-system.js` itself (that file's own trail is a separate camera-local concept, §2).

No engine internals move; this is entirely a rendering/wiring layer on top of `search-answer-descent.md`'s assembler and existing `claims.js`/`solar-system.js` primitives.

## 7. Tests & falsifiers

- `coverage-progressive.test.js` — coverage counts strictly increase (never decrease, never jump straight to final) as sources resolve within one `searchTheSurface` call.
- `corroborated-status.test.js` — a claim asserted identically by two distinct mints (reading + summary, or reading + murmur) receives `status: 'Corroborated'`, and is never simultaneously counted in a `'Contested'` tally.
- `convergence-void.test.js` — when `answerable.void` is true, the convergence band renders the void state, never a padded settled/contested split with fabricated counts.
- `facet-count-precedes-click.test.js` — every rendered facet chip's count matches what filtering `pieces`/`sources` by that facet actually yields, computed before any click event fires.
- `pivot-recenter.test.js` — clicking an entity card in the answer dashboard invokes the same `onPivot` contract `solar-system.js` consumes, and does not navigate to a new route/modal.
- `F-convergence-salience` — does making the convergence band the single most visually prominent element (vs. equal-weight with other tiles) measurably change whether readers notice a contested claim before scrolling past it? Only a passing falsifier licenses the layout as default over an equal-weight tile row.

## 8. Guardrails

- No new judgment is minted for the sake of rendering. Corroborated/contested/void are read off claim status already computed by the fold; this doc adds one missing status value (`'Corroborated'`) to an existing enum, not a new inference.
- The convergence band is a read of `pieces`, never a separate scoring pass — it must not diverge from what the synthesis prose itself shows, or the page's central claim (texture matches truth) breaks.
- Re-centering reuses `solar-system.js`'s existing `onPivot` contract verbatim; this doc does not propose a second, answer-page-local pivot mechanism, to avoid two graphs disagreeing about where "here" is.
- Facet counts must reflect the current `AnswerObject`, not a stale cache — the same "counts stay honest even for the surface not currently shown" discipline `search-surface.js:90-92`'s comment already states for template tabs extends here.
