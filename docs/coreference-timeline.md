# Coreference timeline — scrubbing a definition across the reading cursor and the corpus cursor

> Status: draft
> Suggested location: `docs/coreference-timeline.md`
> Consumes: `perceiver/referents/index.js`, `perceiver/parse/coref.js`, `enactor/factcheck/coref.js`,
>   `core/resolution-spectrum.js`, `core/def.js`, `rooms/reader/app/levels.js` (`entityProfile`),
>   `rooms/reader/app/wiki.js` (`topicTieredData`), `surfer/reason/cursor.js`, `surfer/fold/time-axis.js`
> Related: `docs/dag-corpus.md`, `docs/co-reading.md`, `docs/llm-prosification-security.md`,
>   `docs/multi-source-corroboration.md`, `docs/deviation-waveform.md`

## Summary

A referent's identity is not settled once. A city plan calls a program "the Barnes Fund"; a later
filing calls the same program "the housing trust"; a news story calls it "the affordable-housing
fund"; a resident calls it "that thing on Edgehill." Whether these are one referent or four is a
judgment the corpus makes gradually, unevenly, and — this is the part worth building for — **the
judgment itself has a history worth keeping.** This spec is for a surface that plays that history
back: pick a referent, and scrub two independent cursors to watch what the reading currently
believes it is called, what it currently believes it means, and which other mentions it is — and
is not — currently merged with.

Nothing here is a new resolution engine. `perceiver/referents/index.js` already folds an
append-only, retraction-capable log of `denotes` / `ref-merge` / `ref-split` events into a live
quotient (§ below); `rooms/reader/app/levels.js`'s `entityProfile` already carries a
sentence-indexed, witnessed, ranked history of a referent's properties via `core/def.js`'s
`revises` chain; `rooms/reader/tiered-graph.js` already exposes exactly two independent
scrubbable cursors on a graph (§ "The two cursors"). What is missing is the thing that turns those
three facts into one surface: a fold that answers "what did this referent look like as of
(reading position, corpus coverage)" and renders it as a graph that draws and un-draws itself as
you drag either handle.

## Motivating case

The concrete case this is built against is civic housing documentation, and it's worth being
specific about why that domain is the hard case rather than the easy one. A named-entity coref
system can align "Elvis Presley" and "Presley" because one is a literal substring of the other
(`perceiver/parse/name-variants.js`). Nothing that mechanical aligns "affordable housing,"
"workforce housing," "attainable housing," and "income-restricted units" — and critically, **it
shouldn't**, because in real housing policy these terms are not synonyms. They denote different
income bands, different eligibility rules, different programs. A system that folds them together
on lexical similarity produces a factually wrong picture of the city's housing stock; a system that
never folds anything together produces an unreadable pile of near-duplicate names. The entire
value of this feature is in the discipline of the middle: merge only what's warranted, show the
warrant, and make the boundary between "confirmed same," "proposed same," and "asserted distinct"
visible and scrubbable rather than silently collapsed to one string.

The same discipline pays for itself twice. First, as legibility: a reader can ask "what has this
city's housing strategy actually meant by 'affordable' across the documents I've read so far" and
get a sourced answer instead of a vibe. Second, as a finding generator: **the moment a referent's
canonical label changes while the underlying referent stays stable is itself informative** — a
program renamed, a euphemism adopted, a boundary quietly redrawn. A trajectory surface that can
replay "what was this called, when" turns that from something a reader might vaguely sense into
something the system can point at and date. See "The label-shift signal," below.

## Two anchors this generalizes, not one new mechanism

Two axes already exist in this codebase under different names, for different purposes, on
different objects. This feature is the same two axes, applied to referent identity instead of to
causal claims or graph construction order.

- **`docs/dag-corpus.md`** already names — and defends at length — a **two-cursor** discipline for
  a different object (causal claims): a *discourse* cursor (the order a document makes its
  argument in) and an *asserted* cursor (the causal graph a corpus is read as proposing, corpus-
  wide). The load-bearing sentence there is the one to keep: *"the arrow is in the narration, not
  always in the thing."* This spec's two cursors are that same discipline moved from causal edges
  to identity edges — a referent's *label and boundary* are equally something the narration
  arrives at, not something given in advance, and equally deserve to be read at two different
  cursor positions rather than collapsed into one.
- **`rooms/reader/tiered-graph.js`** already implements two independent scrubbable cursors on a
  live graph, just not applied to coreference: the **fold cursor** (`state.cursor`, scrubbed via
  `seqVisible`, documented at the top of the file as *"the graph as the reader stood in it at seq
  k, recomputed, not stored"* — this rides `surfer/reason/cursor.js`'s general `upto` parameter)
  and the **time axis** (`layoutTime()`, bucketing nodes by `node.t` — record time — through
  `surfer/fold/time-axis.js`'s `foldTime`/`TIME_GRAINS`, independent of construction order). The
  file's own comment is explicit that these are deliberately two different things: *"distinct from
  the time axis (record-time, a spatial reading); the cursor is process-time (construction
  order)."* This spec reuses that exact pairing, renamed for what a reader actually asks:

| this spec's name | what it scrubs | existing primitive |
|---|---|---|
| **reading cursor** | position *within one document's own telling order* — "as of sentence N, what did the reading believe this referent was called and merged with" | `surfer/reason/cursor.js` `readGraph(log, { upto })`; per-document, this is exactly `entityProfile(docId, entId).defs[].idx` / `.witnesses[].idx` (sentence-indexed) |
| **corpus cursor** | position *within the corpus's own ingestion order* — "as of having read documents 1..K, what does the merged referent look like" | generalization of `rooms/reader/app/wiki.js` `topicTieredData()`'s cross-source label merge, made incremental over an ordered source list instead of computed once over the full set; `node.t` there (*"the earliest recording"*) is the natural corpus-cursor timestamp already computed per merged node |

The two are genuinely independent, and the independence is the point, exactly as it is in
`dag-corpus.md`: scrubbing the reading cursor with the corpus cursor pinned at the end shows how
*one document's* account of a referent unfolds sentence by sentence (which pronoun resolved to
what, when a description first got a name). Scrubbing the corpus cursor with the reading cursor
pinned at "whole document" shows how the *city's* account of a referent accreted document by
document (when a second source corroborated a merge, when a fourth source introduced a
distinguishing detail that split what looked like one referent into two). Neither replaces the
other; `dag-corpus.md`'s two DAGs never merge, and these two cursors never collapse into one
slider either.

## Signal model

```
ReferentState {
  id                  the opaque ref-N id (perceiver/referents/index.js — never the label, §invariant 2)
  display             the current displayOf() string — a convenience label, not the identity
  labelHistory        [{ label, firstSeenAt: { reading, corpus }, warrant, tier }]   — see "label-shift signal"
  surfaces            surface mentions currently folded into this referent, each carrying its own
                       sentence index (reading-cursor position) and source id (corpus-cursor position)
  defs                ranked, witnessed properties — entityProfile().defs, unchanged shape
  status              'firm' | 'held'   (perceiver/referents/index.js referents())
}

SynonymEdge {
  a, b                two ReferentState ids, or a ReferentState id and a candidate surface not yet folded in
  kind                'denotes' | 'ref-merge' | 'ref-split' | 'same_as?'   (the log's own event kinds)
  tier                'resolved' | 'engine' | 'mixed' | 'model'   (core/resolution-spectrum.js SPECTRUM)
  warrant             the assertion's warrant string (e.g. 'legacy-label-quotient', 'coref-field',
                       'reader-assertion', 'proposed-coreference') — never invented, always the log's own field
  confidence          the event's own confidence, unmodified
  seq                 the log sequence number this edge entered at — the reading-cursor coordinate
  sourceId            which document this edge was read from — the corpus-cursor coordinate
  contested           true when a later EVA (functional-key-conflict, near-identity-contested, …)
                       stands against this edge without retracting it — render distinctly, never hide
}

Trajectory {
  refId
  at: { reading, corpus }        the two cursor positions this trajectory was folded at
  state: ReferentState            the fold as of exactly those two positions
  edges: [SynonymEdge]            every edge visible at those two positions, contested ones included
}
```

`Trajectory` is the one new fold this spec asks for. Everything inside it already exists as a
field on an existing object; the fold is the composition of two existing folds (`readGraph(log, {
upto })` for the reading cursor, an incremental version of `topicTieredData()`'s per-source loop
for the corpus cursor) that today are never run together.

## The crosswalk that learns

`perceiver/referents/index.js` already draws the exact distinction this section needs:
`proposeCoreference` (the mechanical/model proposer, checked against negative evidence, never
committing on conflict) versus `assertCoreference` (the reader/model channel, provenance-carrying,
authoritative). `enactor/factcheck/coref.js` already enforces that a *proposed* merge needs a
second, independent grounding reader (`geometricSecond`) before it commits — "coref-as-proposal,"
so the witness never grades its own testimony.

The corpus-cursor extension this spec proposes is small and falls directly out of that existing
split: once a merge has been **corroborated** (survived `enactor/factcheck/coref.js`'s second
reader, or been explicitly `assertCoreference`'d by a person), the *pair of labels* involved — not
just the two specific mentions — becomes a standing candidate rule the engine tier can check
first on the next document, the same way `name-variants.js`'s subsequence rule is checked before
anything reaches for a witness. This is exactly `core/resolution-spectrum.js`'s tier ladder in
motion over corpus time: a synonym pair starts life in the **model** tier (needs the witness
channel — nothing but meaning distinguishes "the housing trust" from "the Barnes Fund" the first
time both appear), and a confirmed, corroborated instance of it can be *promoted* to a candidate
the **engine** tier considers deterministically on the next document — never silently, always
logged as its own `REC`-shaped event with the corroborating instance as its warrant, and always
still defeasible (a later document can still `assertDistinct` and defeat the standing rule for that
specific pair, the same way a surname-collision defeats an eager tail-merge today). This is the
mechanism that would let "the city writes its own dictionary" over a growing corpus without ever
crossing into merging on lexical similarity — every promoted rule traces to a specific corroborated
merge, inspectable and revocable like every other assertion in the log.

## The label-shift signal

A `ReferentState.labelHistory` entry with more than one row, at a fixed reading cursor of
"whole document," scrubbed across the corpus cursor, is the whole feature: **the corpus cursor
positions where the dominant label changes while the referent id does not** are worth surfacing as
their own event type, distinct from an ordinary merge — call it a `label-shift`. It needs no new
resolution machinery, only a diff over what `topicTieredData()` already computes per merged node
(`m.label`, chosen by whichever source contributes the plurality of mentions) as the corpus cursor
advances through sources in ingestion order. Concretely: fold the corpus cursor up to source K,
note the dominant label; advance to K+1; if the id is unchanged but the dominant label is not,
emit a `label-shift` at that corpus-cursor position, carrying both labels and the source that
introduced the new one. Rendered on the scrubber as a marked tick (in the same spirit as
`deviation-waveform.md`'s `Turn` markers — a discrete event layered on a continuous trace, never
folded into it), this is the euphemism/renaming detector the motivating case asks for, and it costs
nothing beyond a diff over data this feature already needs to compute.

## Rendering

Reuse `tiered-graph.js`'s existing pattern rather than building a new surface class: the same SVG
graph, the same node/edge draw, the same two independent scrub controls it already has (fold-cursor
slider + play/pause/step; time-axis grain picker), retargeted from "graph construction order" and
"node record-time" to "reading cursor" and "corpus cursor" as defined above. What's additive:

- A `SynonymEdge`'s `tier` renders as edge style, not just color — `resolved`/`engine` edges solid,
  `mixed` dashed, `model` dotted, exactly the way `deviation-waveform.md` keeps `baseline_surprisal`
  and `local_strain` visually distinct rather than blended into one number. A reader should be able
  to tell "the engine is sure these are the same" from "a model-tier judgment merged these, unverified
  by a second reader" at a glance, never only on hover.
- A `contested` edge (§ signal model) renders visibly unresolved — not hidden, not silently
  defeated — matching `dag-corpus.md`'s "a floor, not a ceiling" discipline: the surface must never
  look more settled than the corpus actually is. An entity whose merge status is genuinely
  contested at the current cursor position should look contested.
- `label-shift` ticks on the corpus-cursor rail (§ above), each carrying the before/after label and
  a click-through to the source that introduced the new one.
- The `defs` panel (reuse `entityProfile`'s existing ranked/witnessed rendering wholesale) filtered
  to whatever is visible at the current `(reading, corpus)` pair — this is the "what does the
  reading currently believe this thing means" readout the scrubber is ultimately for.

No new layout algorithm, no new node/edge primitive, no new interaction model. The ask is
retargeting an existing dual-cursor surface at a different fold.

## Structured EOT before prosification

The `Trajectory` object above **is** the structured artifact. Prosifying it — "here's how the
city's definition of affordable housing shifted between the 2019 plan and the 2024 update" — is a
downstream, optional, strictly later step over a *frozen* trajectory slice, and belongs to the
existing write faculty (`weave/write/`), not to this feature. That faculty already formalizes the
pipeline this spec's "structured first" requirement is asking for: `weave/write/cursor.js`'s
membrane keeps raw identity out of anything that reaches a model, `weave/write/redact.js`'s
`redactEot`/`restore` round-trip (documented in `docs/llm-prosification-security.md`) is exactly
the "strip identity, generate prose, restore identity" discipline a redacted brief needs, and
`weave/write/refer.js`'s `writeReferring` already does inverse-coref for pronoun generation, which
is directly reusable for narrating a merge/split history in readable prose without re-deciding any
identity question the structured layer already settled. This spec deliberately stops before that
step: get the `Trajectory` fold right and inspectable first; prosification is a second, separable
PR that consumes it, the same two-PR shape `deviation-waveform.md` (spec) → the omnimodal waveform
implementation already used in this repo.

## Provenance and guardrails

This is not a stylistic add-on; it's why the feature is trustworthy to point at all. Every edge in
the graph traces to a specific log event with a warrant, a confidence, a seq (reading-cursor
coordinate), and a source (corpus-cursor coordinate) — nothing here should ever synthesize an edge
that isn't already recoverable from `perceiver/referents/index.js`'s log or
`enactor/factcheck/coref.js`'s corroboration record. A contested or model-tier edge must render as
uncertain, never quietly upgraded for a cleaner-looking graph. And scope matters: this feature is
about resolving *programs, places, and terms* across civic documents, not about building a general
person-to-person social graph — the moment a corpus cursor's merged referents are mostly people
rather than programs/places/terms, that's a signal the tool is being pointed at a different, more
sensitive problem than the one it was built for, and the surface should say so rather than quietly
comply. The same mechanism that makes a housing-policy crosswalk an accountability tool would make
a person-crosswalk a targeting tool; the two are not distinguished by the code, only by what it's
pointed at and by who can see the result. Nothing in this spec proposes an access-control model —
that's a real open question (below), not a detail to defer indefinitely.

## Non-goals

- Not a general concept-embedding search or a semantic-similarity merge. Every merge this feature
  renders must trace to an existing, warranted log event — proposed, corroborated, or asserted —
  never to a bare vector-distance threshold.
- Not a replacement for `enactor/factcheck/coref.js`'s corroboration discipline. This feature reads
  and plays back what that layer decides; it does not decide anything itself.
- Not real-time collaborative editing of the referent graph. Scrubbing is read-only exploration of
  an existing log; assertions (`assertCoreference`/`assertDistinct`) remain the existing reader
  actions, unchanged by this spec.
- Not a general person-tracking or social-graph tool (§ Provenance and guardrails).
- Not the prosification step (§ above) — that is explicitly out of scope for this spec.

## Open questions

- **Corpus-cursor grain.** Per-document is the natural default, but a large corpus (hundreds of
  filings) may need the same auto/decade/year/… grain-folding `surfer/fold/time-axis.js` already
  offers for record-time, applied to *ingestion count* rather than calendar time. Needs a real
  corpus to test against before deciding.
- **Promotion threshold for the crosswalk.** How many corroborated instances of a label pair
  justify treating it as an engine-tier candidate on the next document, versus still requiring a
  witness every time? `core/resolution-spectrum.js`'s existing tiers don't yet specify a promotion
  rule between them; this spec needs one, following the same non-tuned-coefficient discipline
  `docs/multi-source-corroboration.md` insists on ("two," not a tuned number) rather than inventing
  a threshold.
- **Access control**, named above and not resolved here.
- **Convergence surfacing** — the essay motivating this spec (a narrative claim and a data anchor
  landing on the same place/program/time joint) is a real, valuable extension, structurally close
  to `dag-corpus.md`'s `corpusDag`/`distinguishingEvidence` machinery. Deliberately out of scope for
  this first spec to keep the reviewable surface small; a natural second phase once the trajectory
  fold itself is validated.

## Validation

Build a small fixture corpus (4-6 short synthetic documents is enough) modeling the motivating
case directly: a housing plan that introduces "the Barnes Fund," a budget filing that calls the
same program "the housing trust," a news article that calls it "the affordable-housing fund," and
— critically — a fourth document that uses "workforce housing" for a genuinely *different* program
with an overlapping income band. Scrub the corpus cursor across all four and check three things
concretely: (1) the first three merge, each new merge carrying a warrant and a `label-shift` tick
at the point the label changed; (2) the fourth never merges with the first three, and the graph
renders it as a distinct, unmerged referent rather than silently ignoring the near-collision; (3)
scrubbing the reading cursor back within any one document correctly un-grows the graph to what that
document alone had established by that sentence, matching `entityProfile().defs`' own
sentence-indexed witnesses at the same position.
