# The fold → summary pipeline

`src/surfer/fold/summary.js` · `summary-prompt.js` · `summary-cross.js` —
bench: `tools/fold-summary-bench.mjs` · corpus: `tools/corpus-fetch-summary.mjs` →
`data/corpus/summary/` · tests: `tests/fold-summary.test.js` · recorded run:
`docs/fold-summary-battery-2026-07.md`

## The gap this closes

The engine had two summary-shaped things that never met. The **topline**
(`weave/topline`) composes a summary from controller-side scraps — ranked
properties, tallies, front-matter — under the strictest containment gate in the
repo; it never reads the fold. The **fold** (`surfer/fold`) computes the richest
reading the engine has of any place in a document — the settled bonds, the
held-open tensions, the located turns, every line carrying its witness — and no
summary ever read it. Summaries were made from the record's *inventory*; the
*reading* stayed on the table.

This pipeline is the join: **surf to a place, fold there, and hand the fold —
not raw chunks — to whatever realizes the summary.**

## The packet

`summaryFold(doc, { surf, scope, … })` walks the injected surfer (the same
injection discipline as `deep-reading.js` — fold/ imports no surfer internals)
and packages ONE object per summary:

- `spans` — the verbatim sentences at the surf's stops (the prose a model may echo)
- `groups` — the membrane's three groups: settled · held open · turns
- `properties` — `rankProperties` over the packet's own centre
- `relations` — the strongest non-degenerate bonds, deduped
- `figures`, `focus`, `sources` — the audit channels (indices never enter text)

Four scopes, the four summaries a reader actually asks for:

| scope | the surf | the question it answers |
|---|---|---|
| `full` | adaptive reach over the whole doc — the noise null decides how much is structure | *what is this?* |
| `cursor` | the deep reader's local window at any sentence | *what is going on here?* |
| `entity` | thread-conditioned on the named referent's terms **and** coref-resolved ids; structure from `figureSurface` | *what does this say about X?* |
| `topic` | thread-conditioned on the theme's terms | *what does this say about Y-the-theme?* |

## Realization: floor, voice, gate

- **`telegramSummary(packet)`** — the model-free floor. Lead property (chosen by
  `pickLeadProperty`, which prefers an identification over a numeric fragment),
  strongest bonds as short sentences, held-open matter voiced as *"Left
  unsettled: …"*. Never fluent, never false, always available.
- **`realizeSummary(packet, { phrase })`** — the model voice. The ask carries the
  passages and the settled/held-open notes (the *turns* group is deliberately
  withheld — a small model echoes navigation-speak back as content), states the
  void band as an instruction ("report it as unsettled — never decide it"), and
  decodes greedily.
- **The referential gate** — `summaryAdditions(text, packetSurface(packet))`.
  The topline gate frees only connectives; a summary needs its own prose, so
  this gate relaxes exactly one axis and holds the one where summary fabrication
  lives: **prose words are free, referents are not.** Every proper name and
  every number in the output must already stand in the packet. A violation ships
  the telegram instead (`via: 'telegram-gated'`), with the rejected text and its
  additions kept for the audit. `cleanSummary` handles the rest of the small-model
  reality: scaffolding stripped, sentence count capped, notes-register echo and
  degenerate residue rejected outright.

On the bench (SmolLM2-360M, greedy, CPU): the raw model fabricates on a
measurable fraction of conditions; the gated pipeline ships **0 fabricated names
and 0 fabricated numbers by construction**, and the gate's catch log shows every
fabrication it converted into a telegram fallback.

## Cross-source, without collapsing the referent

The Armstrong problem (PR #196): Neil Armstrong and Louis Armstrong, each
discussed in several sources. Each source also names a same-surname family
member (Janet; Lucille), so the within-document surname merge is correctly
defeated and each source keeps a standalone bare-"Armstrong" node — and a
label-keyed cross-source fold then unions those nodes into one entity that walks
on the Moon and records West End Blues.

`crossSourceSummaryFold(entries, { name })` applies the entity-explorer's
referent discipline at the fold level, on the shared name-variant brain
(`clusterAnchors` / `distinctReferentCount`):

- full names cluster by subsequence containment with **sticky abstention**
  ("George Bush" folds into neither George H. nor George W.);
- a bare **contested** token (borne by ≥2 distinct full-name anchors) attaches
  only to the earliest-introduced full-name bearer *in its own source* — it can
  never cross sources on its own;
- every display label in the merged packet is rewritten **referent-safe**: no
  line reads a bare "Armstrong" while two Armstrongs are in play.

Two realization modes, and the difference is the coref discipline:

- **`sequential`** (default) — one decode per referent, each gated against *its
  own* packet surface. The model never holds two namesakes in one context, so it
  structurally cannot hand Louis the Moon landing: Apollo is not in Louis's
  packet, so the per-referent gate rejects it as a fabrication. The failure mode
  is removed by construction, not by instruction.
- **`joint`** — one decode over all referents, gated against the union of
  surfaces. Kept as the bench's hard condition, because the union gate cannot
  see cross-ATTRIBUTION (every name is licensed *somewhere*).

## Measuring coref, not trusting it

Two metrics ship with the fold so a bench can falsify the discipline:

- **`corefCollapseReport(referents)`** — packet level. A group is collapsed when
  its members' full names resolve to ≥2 distinct referents under the same
  variant brain that built the clusters. 0 by construction on a correct fold;
  the tests reconstruct the old label-keyed bug as a negative control and show
  the metric catches it.
- **`summaryAttributionErrors(text, referents)`** — surface level. For each
  sentence, the ACTIVE referent (with pronoun carry-over: *"Louis Armstrong was
  a trumpeter. **He** walked on the Moon."* charges the Moon to Louis) is
  checked against figures **exclusive** to the other referents (time words
  excluded), plus a flag for any bare contested surname used with no
  disambiguator in its sentence.

The pronoun carry-over is not hypothetical: in the joint condition the 360M
model produced exactly that sentence shape, and the metric caught `apollo`
attributed to Louis Daniel Armstrong. The sequential mode on the same inputs
produced zero attribution errors.

One honest limitation, surfaced by the chat register: a source that discusses
*both* Armstrongs routes its bare-"Armstrong" mentions wholesale to the
earliest-introduced bearer (the same policy as `entity-merge.js`). Per-mention
routing inside such a source is future work; the attribution metric exists
precisely to expose what that policy costs.

## The corpus

Four registers, fetched real by `tools/corpus-fetch-summary.mjs` into
`data/corpus/summary/` (gitignored like every regenerable corpus cache — run the
fetch once before benching; the tests need no corpus, their fixtures are inline):

- **academic** — Einstein's *Relativity*, Darwin's *Origin* (Gutenberg, PD);
  the two Armstrong lives (Wikipedia, CC BY-SA 4.0)
- **novels** — *Moby-Dick*, *Pride and Prejudice* (Gutenberg), the in-repo
  *Metamorphosis*
- **news** — Wikinews (CC BY 2.5): Neil Armstrong's death, the Moon-landing
  40th, Anita O'Day (Louis Armstrong's world), water on the Moon
- **chat** — real `#ubuntu` IRC archives, plus one synthetic two-Armstrongs
  chat written for this repo (marked synthetic in the manifest — no public chat
  corpus discusses both Armstrongs)

The `group: "armstrong"` docs are the cross-source coref probe: both referents,
several registers, same-surname spouses inside single sources.

## Running it

```
node tools/corpus-fetch-summary.mjs          # fetch the corpus (network; run first)
node tools/fold-summary-bench.mjs            # model-free floor (offline once fetched)
node tools/fold-summary-bench.mjs \
  --base http://localhost:8080/v1 \
  --json results.json --report report.md     # with any OpenAI-compatible CPU server
```

The bench seeds its random cursors (`--seed`, default 42), so a run is
reproducible; the recorded run lives in `docs/fold-summary-battery-2026-07.md`.
