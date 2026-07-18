# Motifs — self-discovered recurrence, surfaced on the source overview

> A motif is never declared. It is whatever the document's own field vectors
> recur on, at whatever grain you look — the same computation echo.js already
> runs for a musical phrase or a weather regime, pointed at prose.

This is a design spec, not yet built. It proposes wiring three modules that
already exist and are tested, but have never been connected to a real source:
sentence-grain recurrence detection (`echo.js`), cluster-based referent
detection (`cluster.js`), and the topline's containment-gated phrasing
discipline (`src/weave/topline/`). No new NLP theme-extractor is proposed —
the whole point is that this system already computes the primitive Wagner's
leitmotif is an instance of (a recurring signature that outruns chance and
does real predictive work), and it currently only reaches tabular and audio
data, not text.

## What already runs, and where it stops short

- `src/perceiver/text/waveform.js` (`buildTextReading`) already turns every
  sentence of an ingested source into a `field` vector (a deterministic hash
  embedding, no model, no warmup) — the same shape `echo.js` and `cluster.js`
  already consume for other modalities.
- `src/weave/waveform/build.js` (`buildWaveform`) already calls
  `findEchoes(units, metric)` on that field array and returns `.echoes` —
  pairs of non-adjacent passages whose recurrence beats **both** a
  chance-similarity null and a competence-gain null (the match has to
  *improve prediction of what follows*, not just look similar — this is what
  keeps a repeated stock phrase from registering as a motif).
- **Neither is ever called.** `rooms/reader/app.js` has no path from ingest
  to `buildTextReading`/`buildWaveform`, and `index.html` never renders
  `.echoes`. It's tested (`tests/waveform-text-perceiver.test.js`,
  `tests/waveform-build.test.js`) but dead as far as the reader goes.
- `src/perceiver/shared/cluster.js` — online nearest-centroid clustering
  where a sustained field signature *is* called a motif in its own comment
  (`displayPrefix: 'motif'` is the literal default) — is wired into the
  tabular and audio/binary perceivers but never into text. Text's own
  `buildReferentsAndSightings` only tracks named entities; it never clusters
  the field itself to find recurring *unnamed* signatures.
- `src/surfer/fold/weave.js` (`detectGrain`/`encodeLevels`) already folds
  sentence-grain reads into the document's own structural grain (chapter
  headings when present, size-adaptive windows otherwise) for a different
  purpose (question-answering surf). Its segments don't yet carry a `field`
  vector, so nothing has clustered *at that grain*.
- `src/weave/topline/` already has the safety discipline this needs: a
  closed set of machine-decided objects, phrased one-at-a-time
  (`phrase.js`), then joined by a model that is checked by **set
  containment** (`contain.js`) — it can reorder and rephrase, it cannot add
  a word the objects didn't carry. `digest.js` already shows the
  progressive-disclosure UX shape (a free deterministic spine, deeper
  reads pulled only on request) this should reuse rather than reinvent.

Everything below is composition of these five pieces, not new detection.

## The tessellation: one operator, run at every grain

`clusterUnits`/`deriveClusterRadius`/`referentsAndSightingsFromClusters`
only require `units: [{field}]` and a `metric` — they don't know or care
what a unit *is*. Run unmodified at:

- **scene grain** — `buildTextReading`'s sentence units directly. Catches a
  tight, local motif (an image repeated within one conversation).
- **chapter/work grain** — `encodeLevels`'s fold segments, each given a
  `field` by averaging its member sentences' fields (`windowMean`, already
  imported by `echo.js` — no new embedding call, just a mean over what's
  already computed). Catches the motif that recurs *across* the book: gloves
  in *Frankenstein*, the closet in *Monte Cristo*.
- **cross-source, later** — the same call over fold-grain fields pooled
  across every source in the room. Not in this spec's scope, but nothing
  about the primitive changes; it's the same function, wider `units`.

No level is hardcoded as "the" grain. This is the literal answer to
"infinite tessellation": the motif operator has no ceiling built into it,
only a `units` array — running it again one grain up or down is not new
engineering, it's the same call.

## What's new

### `src/weave/motifs/detect.js`
`detectMotifs(reading, encoding)` — given a text `Reading` (from
`buildTextReading`) and its fold `encoding` (from `encodeLevels`):
1. Cluster at sentence grain → scene-level referents/sightings
   (`clusterUnits` + `referentsAndSightingsFromClusters`, reused verbatim
   from `cluster.js`, `displayPrefix: 'motif'`).
2. Derive each fold segment's field as `windowMean` of its member sentence
   fields; cluster those → work-level motifs.
3. For each work-level motif, pull the `findEchoes` pairs (already computed
   by `buildWaveform`) whose spans fall inside two different member
   segments — this is the motif's *evidence*: not just "recurs," but "this
   recurrence predicted what came next," with a citable sentence pair.
4. Rank by span × gain, not raw count: `(last occurrence − first
   occurrence) / documentLength × Σ competenceGain over its echo pairs`. A
   phrase repeated three times in one paragraph ranks below one that recurs
   once early and once at the very end — distance is what makes a
   recurrence structural rather than a verbal tic, and `competenceGain` is
   already the document's own measure of that, not a new heuristic.

Returns `{ workMotifs, sceneMotifs, gap }` — `gap` set when nothing clears
the document's own Born-derived thresholds (`deriveClusterRadius`,
`boundedNull` in `findEchoes`), so a source with no structural recurrence
says so instead of a model inventing one. This is the same discipline as
the topline's `gap` object.

### `src/weave/motifs/adapt.js`
`motifInventory(detected)` — the closed set, in the topline's `{key, type,
standing, cite, fields}` shape but with its own object types (motifs aren't
claims, so this does not route through `buildInventory`, the same way
`digest.js` builds its own objects rather than forcing chapter bullets
through it):
- `motif` — `{grain, members, span: {first, last}, cite}`. No name field —
  naming is left to the join pass, exactly like a topline claim; the model
  may phrase a label but only from words that already appear in the cited
  sentences (`contain.js` gate, reused unmodified).
- `echo` — one citable recurring pair, for the "why this counts" evidence
  under a motif.
- `gap` — the absence object when nothing clears threshold.

### Reuse, not reimplementation
`src/weave/motifs/` imports `phraseAll`, `generateTopline`, `containedIn`
straight from `src/weave/topline/` — same two-pass generation, same
containment safety, same model-optional property (with no talker loaded,
the deterministic telegram — "recurs 4 times, first at ¶12, last at ¶340" —
*is* the surface). New `eo-contract.js` entries for `detect.js`/`adapt.js`
follow the same Act/Site/Stance shape as the topline's (Site: `Network`,
`Field` in; `Lens` out; ops `SEG, SYN, EVA`; stances `Dissecting,
Composing, Tracing`).

## Wiring

- `rooms/reader/app.js` — a new `sourceMotifs(docId)`, computed lazily
  alongside `sourceSummary` (same cache-on-the-source-record pattern), calling
  `buildTextReading` → `buildWaveform` (for echoes) and `encodeLevels` (for
  fold segments) → `detectMotifs` → `motifInventory` → `generateTopline`.
- `index.html` — a **Motifs** card on the source overview, spine-first like
  the entity digest: the ranked work-grain motif list is free and always
  present (no model needed), each row expands (progressive disclosure) into
  its echo citations and, one level deeper, its scene-grain sub-occurrences
  with ¶ jump links — reusing `digest.js`'s spine → important/surprising →
  passage-zoom pattern structurally, not its entity-specific code.
- Cross-source rollup (a motif surfacing across Hamlet *and* Frankenstein) is
  a later pass over pooled fold-grain fields; this spec only wires it
  per-source, but nothing in `detect.js` assumes a single source — the
  `units` it clusters could already be handed to it pooled.

## What this deliberately does not do

- No hand-authored list of "typical literary motifs" (gloves, mirrors,
  storms). If it isn't in the recurrence statistics, it isn't a motif.
- No LLM reads the source to name themes. It reads the same closed,
  machine-decided objects the topline reads, under the same containment
  gate.
- No fixed hierarchy of scale. Scene and work grain are the two wired here
  because they map onto the existing fold levels, not because motifs stop
  at two levels.

## Where it would live

| piece | file |
|---|---|
| multi-grain motif detection (cluster + echo, scene and fold grain) | `src/weave/motifs/detect.js` |
| detected motifs → closed inventory | `src/weave/motifs/adapt.js` |
| EO contracts | `src/weave/motifs/eo-contract.js` |
| controller wiring + persistence | `src/rooms/reader/app.js` (`sourceMotifs`) |
| surface card (spine + echo evidence + scene drill-down) | `index.html` |
| tests | `tests/motifs.test.js` |

Reused unmodified: `src/weave/waveform/echo.js`, `src/perceiver/shared/cluster.js`,
`src/perceiver/text/waveform.js`, `src/surfer/fold/weave.js`,
`src/weave/topline/{phrase,join,contain,topline}.js`.
