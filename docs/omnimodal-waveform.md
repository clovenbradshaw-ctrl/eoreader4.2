# Omnimodal deviation waveform — implementation spec

> Status: draft for build
> Suggested location: `docs/omnimodal-waveform.md`
> Supersedes the modality assumptions in: `docs/deviation-waveform.md`
> Depends on: `docs/individuation-gate.md`, `docs/model-as-contracted-part.md`,
> `core/voidnull.js` (`deriveNull`), `src/core/project.js` (`projectGraph`),
> `coref.js` (descriptor channel)

## 0. The one idea

A novel, a WAV file, and a METAR feed are all the same object to this feature: an
ordered sequence of typed units carrying a field, plus sightings of recurring
referents. Every signal the waveform shows — local strain, frames, turns, echoes,
cast presence — is computed on that common substrate and never touches raw
modality. Modality lives in exactly one place, the perceiver, and is gone before
the core sees anything.

The build discipline, stated as a hard rule so it can be enforced in review:

> Perceivers get modality-specific structure. The core gets none. Skins get a
> little — for display only, never for detection.

If any function under `src/weave/waveform/` or the individuation gate branches on
modality, the abstraction has leaked and the review rejects it.

## 1. Layered architecture

```
 source bytes ──▶ PERCEIVER ──▶ Reading ──▶ INVARIANT CORE ──▶ WaveformModel ──▶ RENDER
 (wav/txt/csv)   (modal)        (common     (modal-blind)      (modal-blind)     (strict | skin)
                                 substrate)
```

- `src/perceiver/<modality>/` — the only modality-aware code. Emits a `Reading`.
- `src/weave/waveform/` — consumes a `Reading`, emits a `WaveformModel`. Never
  imports a perceiver.
- `src/surfaces/waveform/` — consumes a `WaveformModel`, renders.
  `render.strict.js` is modality-blind; `skins/<modality>.js` may restyle but
  receives only the `WaveformModel`, never the `Reading` or the source.

## 2. The perceiver contract

This is the load-bearing interface. A perceiver is any module that turns a source
into a `Reading`. The `Reading` is the entire vocabulary the rest of the system
has.

```
Reading {
  units:      Unit[]           // ordered, ordinal-indexed
  metric:     (a:Field, b:Field) => number   // deviation between two fields; default cosine
  segments:   Segment[]        // the perceiver's proposed labeled structure
  referents:  Referent[]       // the cast — recurring identities the perceiver found
  sightings:  Sighting[]       // per-unit presence of referents
  vocab:      RoleVocab        // display words for the three invariant roles
  resolve:    (span:Span) => SourceLocator   // provenance back to bytes/samples/rows
  meta:       { modality:string, perceiverVersion:string }
}

Unit {
  id:      string
  ordinal: int                 // 0..n-1, contiguous
  span:    Span                // provenance in source-native coords
  field:   Field                // vector — the perceiver's local descriptor of this unit
  weight?: number               // salience/energy; defaults to 1
}

Field = number[]               // fixed-length within a Reading; meaning is perceiver-private

Segment {
  start: int                   // unit ordinal, inclusive
  end:   int                   // unit ordinal, exclusive
  label: string                // e.g. "Victor", "Development", "Frontal passage"
  level: "coarse" | "fine"     // coarse → frame candidates; fine → the ruler
}

Referent { key:string, display_name:string }

Sighting {
  referent: string             // Referent.key
  ordinal:  int                 // Unit.ordinal
  role:     Role                // one of the three invariant roles below
  evidence?: number             // strength 0..1; defaults to 1
}

Role = "FOREGROUND" | "PRESENT" | "LATENT"

RoleVocab {                    // perceiver supplies the words; core owns the structure
  FOREGROUND: string           // text:"narrating"  audio:"stated"        weather:"driving the regime"
  PRESENT:    string           // text:"present"    audio:"in the texture" weather:"measurable"
  LATENT:     string           // text:"orbited"    audio:"implied"        weather:"building offscreen"
}
```

### 2.1 What each role means, invariantly

The three roles are the whole reason the cast lanes port across modalities. They
are structural, not semantic:

- `FOREGROUND` — the referent is the identity the unit is of. Contributes full
  mass.
- `PRESENT` — the referent is in the unit but not in the foreground. Contributes
  partial mass.
- `LATENT` — the referent is oriented-toward but not sounding: referred to,
  awaited, harmonically implied, forecast. Contributes coupling but not mass —
  this is the mechanism that produces protogons (see §5).

A perceiver MUST map its native detections onto these three and supply the
display words in `vocab`. It MUST NOT invent a fourth role. If a modality
genuinely needs a distinction the three don't capture, that is a spec change,
reviewed here — not a per-perceiver escape hatch.

### 2.2 What the contract deliberately excludes

The perceiver does not emit: strain, surprise, frames, turns, echoes, referent
types (emanon/protogon/holon), or confidence. All of those are core-derived from
`units` + `metric` + `sightings`. A perceiver that tries to pre-compute them is
rejected — that work is where modality would leak back in.

### 2.3 Validation

`src/perceiver/contract.js` exports `validateReading(reading)`:

- `units` ordinals are `0..n-1`, contiguous, sorted.
- all `field` vectors share one length.
- every `Sighting.ordinal` and `Segment` bound is in range.
- every `Sighting.referent` and referent in graph resolves to a `Referent.key`.
- `metric(f,f) === 0` (approx) and `metric` is symmetric on a sample.
- `resolve` returns a locator for a probe span.

A Reading that fails validation never reaches the core. This is the seam where
"garbage modality-specific output" is caught before it can masquerade as signal.

## 3. Invariant core — the WaveformModel

`src/weave/waveform/build.js` :: `buildWaveform(reading) => WaveformModel`. Pure
function of a validated `Reading`. Modality-blind by construction — it only ever
reads `units[i].field`, `metric`, `segments`, `sightings`.

```
WaveformModel {
  baseline:   number[]         // per-unit surprise vs. background field
  strain:     number[]         // per-unit deviation vs. rolling local baseline
  confidence: number[]         // per-unit, sample-size derived
  frames:     Frame[]          // confirmed coarse regions with labels
  turns:      Turn[]           // confirmed boundaries, hot flag
  ruler:      Segment[]        // the fine segments, passed through for display
  echoes:     Echo[]           // non-adjacent recurrences
  cast:       CastLane[]       // per-referent presence over time + gate type
  vocab:      RoleVocab        // carried through from the Reading
  discard:    DiscardLedger    // every unit evaluated-and-not-flagged, queryable
  provenance: (ordinal) => SourceLocator
}
```

### 3.1 Baseline surprise and local strain

```
background = robustMean(units.map(u => u.field))        // whole-Reading center
baseline[i] = metric(units[i].field, background)

localBaseline[i] = ewma over field of the units in the CURRENT FRAME up to i
strain[i]        = metric(units[i].field, localBaseline[i])
```

Two separations that must survive to the model, never merged into one number:

- `baseline` answers "unusual in general"; `strain` answers "unusual for here".
  Keeping them apart is what let the contract flatline correctly on boilerplate
  and light up on the negotiated clause.
- the rolling estimate resets at frame boundaries (§3.2), not on raw ordinal
  windows — otherwise an expected structural change (new narrator, new
  movement, new airmass) reads as a false anomaly.

There is a bootstrap: frame detection needs strain, strain needs frames. Resolve
by a two-pass fixpoint — pass 1 computes strain against a global rolling
estimate, pass 2 recomputes against detected frames. In practice it converges in
two passes; cap at three and log if it doesn't.

### 3.2 Confidence and cold start

```
confidence[i] = 1 - deriveNull(sampleSizeInFrameUpTo(i), ...)   // voidnull.js
```

Any unit whose in-frame sample is below the Born-null threshold is flagged
low-confidence and the render must de-emphasize it, never omit it. Threshold is
a `deriveNull` call, not a constant — same discipline as the individuation gate.

### 3.3 Frames and turns

Candidate boundaries come from two sources, unioned: the perceiver's `segments`
where `level==="coarse"`, and core-detected change-points where the rolling
baseline shifts by more than a Born null. A candidate is confirmed as a `Turn`
iff its `strain_delta` clears `deriveNull(strainDeltas, ...)`. Confirmed turns
partition the Reading into `Frame`s. Labels are adopted from the perceiver's
overlapping coarse `Segment`; an unlabeled core-detected frame gets `label: null`
and renders unnamed.

```
Turn  { ordinal:int, strain_delta:number, hot:boolean, from:string?, to:string? }
Frame { start:int, end:int, label:string?, baselineVector:Field }
```

`hot` = strain_delta in the top Born-null tail. Note the deliberate consequence
proven by the music mock: a boundary can be a `Turn` (structural) while sitting
in a strain valley (low surprise) — the recapitulation case. Turn-ness and
strain are orthogonal and the model keeps them so.

### 3.4 Echo

```
for non-adjacent unit-windows (a,b) with |a-b| > minGap:
  sim = 1 - metric(windowField(a), windowField(b))
  if sim > deriveNull(chanceSimilarities, ...)              // beats chance recurrence
     and competenceGain(a,b) > deriveNull(...)              // folding b in improves prediction of the rest
     push Echo{ a, b, sim }
```

`competenceGain` is the same learning-progress criterion used by
salience-gated ingestion — not raw similarity — so the arc doesn't fire on every
repeated common phrase / stock cadence / diurnal wiggle. Echo operates purely on
`field` vectors; it is the most trivially omnimodal signal in the system and
needs no per-modality code. Music is its easiest case (form is literal
recurrence); weather's diurnal cycle and text's motif rhyme are the same
computation.

### 3.5 Cast presence and the individuation gate

This is where the mocks' lanes come from. Two products per referent:

1. **Gate type** — unchanged from `docs/individuation-gate.md`: a two-axis
   read-off over MASS × COUPLING plus agency, typing each referent
   `emanon | protogon | holon | field`, thresholds via `deriveNull`. The only
   new wiring is how the axes are fed:
   - `mass(r)` = Σ over sightings of r of `roleWeight(role) * evidence`, where
     `roleWeight = { FOREGROUND:1, PRESENT:0.5, LATENT:0 }`.
   - `coupling(r)` = incident edge weight from `projectGraph`
     (`src/core/project.js`), where LATENT sightings do contribute edges (a
     referent that is talked-about/awaited couples without being present).
   - The `LATENT`-contributes-coupling-not-mass rule is exactly what makes the
     creature, Kurtz, the incoming airmass, and the never-stated cyclic theme
     all land as protogons — low mass, high coupling — with zero
     modality-specific code.
2. **Presence lane** — per referent, a run-length encoding of `role` over
   ordinals, built directly from `sightings`. This is the lane the render
   draws.

```
CastLane {
  referent:   string
  display:    string
  gateType:   "emanon" | "protogon" | "holon" | "field"
  presence:   { start:int, end:int, role:Role }[]   // RLE over ordinals
}
```

### 3.6 Accountable loss

- `discard: DiscardLedger` records every unit that was evaluated and not
  surfaced, with its `strain`, its `localBaseline`, and the null it was
  measured against. The render exposes this on hover of any unflagged span —
  "why wasn't this flagged" is answerable from the surface, not just the
  backend.
- `provenance(ordinal)` resolves through `Reading.resolve` back to
  source-native coordinates, so every mark is a jump target with an exact
  locator.
- Replay: `buildWaveform` is pure; given `(source, perceiverVersion, nullSeed)`
  the entire model is reproducible. Perceivers must be versioned in
  `meta.perceiverVersion` and null draws seeded.

## 4. Reference perceivers

Each is a few hundred lines; each does only §2's job. Sketches, not full
listings.

### 4.1 Text — `src/perceiver/text/`

- units = sentences (existing read). `field` = the existing `s.field`
  descriptor, reused directly.
- segments coarse = terrain/register narration frames (existing); fine =
  chapter/section marks.
- referents/sightings = existing `entities.js` (`createEntityAdmission`) +
  `coref.js` descriptor channel. Role mapping: subject-position agent →
  FOREGROUND; other on-page mention → PRESENT; descriptor-channel reference to
  an un-INS'd or absent referent → LATENT.
- vocab = `{ FOREGROUND:"narrating", PRESENT:"present", LATENT:"orbited" }`.
- This perceiver is mostly a re-export of what the modelless read already
  computes — proof the contract fits the existing engine rather than replacing
  it.

### 4.2 Audio (WAV) — `src/perceiver/audio/`

- units = analysis frames (e.g. ~0.25–1s hops of spectral/chroma/MFCC
  features). `field` = the feature vector; `metric` = cosine on it.
- segments coarse = novelty-kernel boundaries over the self-similarity matrix
  (movement/section detection); fine = beat/phrase grid.
- referents = recurring thematic material found by clustering recurrent field
  motifs; sightings by matching each frame window to a cluster. Role mapping:
  motif in the salient foreground band → FOREGROUND; motif present in an
  inner/accompanying band → PRESENT; motif only harmonically implied /
  anticipated → LATENT.
- vocab = `{ FOREGROUND:"stated", PRESENT:"in the texture", LATENT:"implied" }`.
- Honesty flag: the LATENT/"implied" detection (a theme prepared but not
  sounding) is the single hardest call in any perceiver and may exceed what a
  modelless spectral read can claim. This is the one place a small captioning
  model is provisionally allowed — for the label on an already-detected latent
  span, never to decide latency. Contract it per
  `docs/model-as-contracted-part.md`; ship v1 without it and mark those lanes
  lower-confidence.

### 4.3 Tabular / meteorological — `src/perceiver/tabular/`

- units = rows (readings), ordered by timestamp. `field` = the numeric channels
  (pressure, temp, wind, visibility, dewpoint), z-scored per channel so
  `metric` is comparable.
- segments coarse = airmass/regime change-points; fine = the native time ruler
  (hourly).
- referents = tracked systems/regimes (a persistent high, an incoming front)
  identified by sustained multichannel signatures; sightings by which system
  dominates each row. Role mapping: system driving the current reading →
  FOREGROUND; measurable but secondary → PRESENT; system detectable upstream /
  forecast but not yet arrived → LATENT.
- vocab = `{ FOREGROUND:"driving the regime", PRESENT:"measurable",
  LATENT:"building offscreen" }`.
- The cold-start zone matters most here: a short record has no trend yet, so
  early confidence is genuinely low and must render that way.

## 5. Rendering contract

`src/surfaces/waveform/render.strict.js` consumes only the `WaveformModel` and
draws the three-layer surface (waveform / ruler / cast lanes) with the
reading-intent ladder (Read / Skim / Study). It is modality-blind and is the
correctness baseline: if the strict render looks wrong for a modality, fix the
perceiver, not the render.

`skins/<modality>.js` may restyle — spectral bars behind the strain for audio, a
raw-channel trace behind the strain for weather — but:

- receives only the `WaveformModel` (never the `Reading` or source);
- may not add, remove, reorder, or re-threshold any mark;
- may not compute anything that feeds detection. A skin is a pure
  `WaveformModel => visual` restyle. Enforced by giving skins no import path to
  the perceiver or the core's detection functions.

Rendering invariants carried from `docs/deviation-waveform.md`: no numeric
readouts; analogue gauge that mutes itself when baseline variance is too high
for an expected floor (the literary case); two continuous traces maximum;
discrete signals get glyphs (turn ticks, echo arcs), never a third line;
low-confidence zones visibly de-emphasized; every mark is a provenance-linked
jump target; hover any span (flagged or not) surfaces the discard readout.

Lane ordering is an open call (§7). Presence roles render with three fixed
encodings (solid foreground / filled present / dashed latent); the words come
from `model.vocab`, never hardcoded in the render.

## 6. Build phases

1. `contract.js` + `validateReading` + `WaveformModel` types. No perceiver yet
   — validate against hand-built fixture Readings.
2. `buildWaveform`: baseline, strain (two-pass), confidence, frames, turns.
   Golden-test on the fixture where the flagged span is known.
3. Echo + cast presence + gate-axis wiring. Confirm protogon falls out of a
   fixture with a high-coupling/low-mass referent.
4. Text perceiver (re-export of existing read). End-to-end on Frankenstein;
   check the creature types as protogon and its LATENT stripe appears under
   Victor's frames.
5. `render.strict.js` + reading-intent ladder + discard hover.
6. Audio perceiver (WAV) → strict render. Then weather perceiver → strict
   render. Skins last.

Each phase ships behind the strict render before any skin exists — the strict
render is the omnimodality test harness, not a fallback.

## 7. Open questions

- Frame/ruler when the perceiver's coarse segments and the core's change-points
  disagree materially — adopt, average, or surface both.
- Lane vertical ordering: first-appearance vs. total mass vs. pinned. Pinned
  aids muscle memory; mass aids salience. Undecided.
- Whether `LATENT` needs an evidence floor to enter `projectGraph` coupling, so
  a single stray reference doesn't manufacture a protogon.
- The audio LATENT/"implied" perceiver problem (§4.2) — the realistic ceiling
  of a modelless spectral read, and exactly where the contracted captioning
  model may enter.
- Corpus-relative baseline (from `docs/deviation-waveform.md`) as an alternate
  `background` in §3.1 — same code path, reference distribution from a
  document/recording set instead of the single work.

## 8. Validation

Per modality, run against an item where the answer is already known and check
the peak/turn/protogon lands there before tuning anything:

- text: a redlined clause; the creature-as-protogon.
- audio: a movement boundary; a cyclic theme stated only at the coda.
- weather: a known frontal passage; an incoming airmass as protogon.

If the strict render surfaces the right span with no modality-specific
detection code, the abstraction is real. If it needs a modality branch to work,
the contract in §2 is wrong and gets revised here — not patched in a perceiver.
