# The significance loop — the enacted DEF · EVA · REC

> Reader-level DEF, EVA, REC across layers, ordered by the arrow of time. The
> thing eoreader3 had in feel and eoreader4 lost. This is the `enact` holon.

There are two DEF–EVA–REC loops, and the whole design turns on keeping them
apart.

| | Depicted loop | Enacted loop |
|---|---|---|
| What | the transformation **classified in the text** | the reading's **own act** of establishing terms, testing them, restructuring its frame |
| Grain | a phasepost perception of what a clause reports | the reading thinking |
| Time | timeless, recomputable at any cursor | temporal, ordered, cross-layer |
| Where | `classify/` — tagged `kind:'phasepost'` | `enact/` — tagged `register:'enacted'` |
| Order | does not depend on read order | **generation order is constitutive** |

A clause can report a REC in the story while the reading undergoes none; the
reading's frame can break on a clause that reports nothing of the kind. The log
**must not conflate them** (§2, §10). `classify/` builds the depicted loop; this
holon builds the enacted one.

## The loop

A **frame** is a set of terms the reading has established at a layer, at a point
in read time. It carries a running **strain accumulator** (Σ surprise from EVAs
against it) and the **REC threshold** it has not yet crossed.

- **DEF establishes a frame.** At a cursor the reading fixes terms at a layer.
  Written with its layer, its cursor, and the EVAs or REC that produced it.
- **EVA tests a particular against a frame.** A new particular arrives; the
  reading judges it against the established terms. Records which frame it tested,
  that frame's layer, the cursor of the test, the verdict — **confirm** or
  **strain** — and the **surprise** magnitude.
- **REC restructures a frame.** When strain accumulates past what the frame can
  hold, REC fires — *never on a single anomaly*. It references the EVAs that
  forced it, records the strain sum at firing, and installs the new frame.

**Surprise is the throttle.** A confirming EVA (low surprise) holds the frame and
adds nothing — Piaget's assimilation. A straining EVA accumulates — toward
accommodation. The running sum against a frame is the REC trigger; the REC rate
over read time is the reading's effort (a quiet stable reading, or a turbulent
hard one). This is the same surprise that warms the activation field: divergence
where the prediction failed.

The throttle now reads **Bayesian** surprise — `D_KL(posterior ‖ prior)` over the
figure field — not surprisal, so a frame breaks on a genuine restructuring of the
reading rather than on an inert improbability (bayesian-surprise.md). That scalar
clusters far below the surprisal-era band, so the cheap reader's confirm band and
layer thresholds are **calibrated to the text** (`calibrateReader`): the band is
the median step, each threshold a count of typical straining lines (3 vs 8, so the
document holds harder). Without the calibration the frame would never accumulate
past the old `1.5 / 4.0` and would go numb. The skeleton's static defaults below
are the fallback; the live reader fits the scale.

## Cross-layer influence

An EVA does not have to test a particular against the frame at its own layer. The
evaluation can cross registers, and the crossing is the influence.

- **Upward.** Lower particulars accumulate as EVAs against a higher frame until
  the higher frame breaks. The proposition layer keeps producing *slammed,
  refused, declined, walked away*, each an EVA against the document frame, the
  strain accumulating, until a **document-layer REC** fires and the piece is
  reread as being about something the first DEF did not name.
- **Downward.** A higher frame conditions a lower particular: a proposition that
  fits the document frame **confirms** it and holds it. In the skeleton both
  directions ride one cross-layer EVA — its verdict carries which way it went: a
  *confirm* is the high holding the low, a *strain* is the low bearing on the
  high.

The discipline (§7): the cross-layer EVA **tests** a frame, it does not **author**
one. A layer feeds EVAs upward and receives a frame downward; neither writes the
other's frame by hand. The owning layer decides, by RECing its own frame when the
strain it accumulated breaks it — witness deposits, the fold decides, applied to
frames.

## The arrow of time

Cross-layer influence in both directions, freely and instantaneously, would be
circular — the document frame conditions the proposition reading conditions the
document frame, with no ground and no termination. The arrow of time prevents it,
and it is constitutive, not decoration.

> Every EVA tests against the frame **as it stood at the cursor** — the
> already-established frame, never a frame from the future. Cross-layer influence
> is legal precisely because it is cross-layer **and backward in time**.

This is why the same text yields a different reading at a different cursor. The
**fold** (`replayFrames`) replays the enacted events to the cursor and no further;
the reading there is whatever the cross-layer loop had arrived at by then. Fold to
an earlier cursor and the frame is younger, has survived fewer tests. The baker
and the unreliable narrator are the same referent under a document frame at two
ages of the loop. The guard the whole non-circularity rests on lives in
`loop.js#eva`: a frame whose cursor is *after* the particular it conditions throws.

## The API

```js
import { createEnactedLoop, replayFrames, loopStats, enactedReadingTo } from '../enact/index.js';

// Pure core — driven by an injected cheap-surprise provider.
const loop = createEnactedLoop({
  layers: ['proposition', 'document'],          // index 0 = the base (particulars originate here)
  thresholds: { proposition: 1.5, document: 4.0 },
  read: (cursor) => ({ surprise, terms }),      // the γ-mass signal at the cursor
});
loop.runTo(lastCursor);                          // run the arrow forward
const { frames, recs } = replayFrames(loop.events, cursor);   // the fold to a cursor
const stats = loopStats(loop.events);            // REC rate, convergence, thrash

// Wired to the real cheap surprise (read/readingAt) and memoised per doc:
const reading = enactedReadingTo(doc, cursor);   // { frames, recs, stats, events, reader:'cheap' }

// The DEEP read — the SAME loop, driven by the meaning reader (§11). Async; the
// surprise is prediction error in the centroids' space, so frames restructure on
// sense-turns the γ-mass reader is blind to. Falls back to the cheap reader under
// the hash organ (the firewall), so a caller can always await it:
const deep = await enactedReadingMeaning(doc, cursor, { embedder });  // reader:'meaning' | 'cheap'
```

Event shapes (`enact/loop.js`):

| Event | Carries |
|---|---|
| enacted **DEF** | the frame, its layer, the cursor it was set at, what produced it (`'initial'` or `{rec}`) |
| enacted **EVA** | the particular, the frame it tested + that frame's layer + its cursor, `cross`, the verdict, the surprise, the strain delta |
| enacted **REC** | the frame it restructured (`from`), the layer, the EVAs that forced it (`forcedBy`), the strain sum at firing, and — via the DEF it emits — the new frame. `target`/`action` mirror eoreader3's `RULES_LEDGER` (§9) |

## Honest seams

- **MiniLM governs the depth — and the deep read is now built.** The rich surprise
  that distinguishes a frame *breaking* from a word merely being *unusual* needs
  meaning-distance. The skeleton (`enactedReadingTo`) runs on the mechanical γ-mass
  surprise — real but thin, blind to a sense-turn that introduces no new figure.
  The **meaning reader** (`meaning.js` / `enactedReadingMeaning`) is the richer
  `read` the design promised: with the geometric organ live, the surprise is the
  prediction error in the centroids' space — how far each clause sits from the
  γ-decayed semantic prior — so frames restructure on the turns the γ-mass reader
  misses. The loop, frames, strain, cross-layer testing, and arrow of time are
  **unchanged**; only `read` got deeper. Under the hash organ it falls back to the
  skeleton (the firewall). **Calibration — one discipline, CAUSAL, for both readers.**
  The meaning surprise (1 − cos) lives far above the γ-mass band — on real all-MiniLM
  embeddings of Austen the median is ≈ 0.59, where the skeleton's 0.25 would make every
  line strain — and clusters *tightly* there, far below 1. So the band, the layer
  thresholds, **and the impulse** are fit to the text's own scale. They are fit
  **causally**: from the surprises seen *so far*, never the whole reading, so the future
  cannot set the band that judged an early line (the arrow, inside the calibrator). The
  meaning path used to fit its band from the **global median** of every surprise — an
  acausal seam that peeked at the future; that survives now only as an explicitly
  requested numb-reader demonstration (`calibrate:{mode:'global'}`), out of the live
  answer path. The earlier measurement, on 1296 real sentences under the global-median
  band: the γ-mass skeleton read turbulently (a proposition REC every ~7 lines,
  non-converging) while the calibrated meaning reader read calmly and **converged** —
  the turbulence was the thin signal, and meaning-distance settles it. Two parity fixes
  bring the meaning path level with the cheap one. **Directional strain:** the meaning
  magnitude says *how far* the sense moved; the same reading's `bayesBy` (the `contrib`)
  says along *which* figures belief moved, so a REC restructures toward the **cause** of
  the break, not whatever figures were merely in view. **The impulse on its own scale:**
  a fixed 0.95 shock gate is an off switch on the compressed 1 − cos scale — it never
  fires on real text — so the impulse is now a high quantile of past surprise (a shock
  is "far above what *this* reader sees"), restoring the Newton fast path the meaning
  reader had been running without. Both still overridable per `read`. Downward influence
  is still thin: the cross-layer EVA records the high being held or strained by the low,
  but the high does not yet *re-weight* the low's surprise — the next deepening,
  meaning-distance against the frame's own terms.
- **The REC threshold is tuning** — the assimilation/accommodation balance, the
  size of Lakatos's protective belt. Too low and the frame thrashes (RECs on every
  anomaly); too high and the frame never breaks. Set against goldens, measured per
  layer, not a constant. Higher layers hold harder — a document frame should be
  harder to break than a proposition frame.
- **Convergence is the success condition.** The spiral should converge, RECs
  growing rarer as a frame stabilises (the eigenform). A text the reading cannot
  settle is a real finding, not a failure to suppress. `loopStats` surfaces the
  REC rate, the distinct-frame count, and the alternation count over read time so a
  stable reading and a turbulent one are distinguishable. A **thrash** is genuine
  oscillation — the frame flipping back repeatedly while exploring only a handful of
  distinct frames (≥2 alternations *and* low diversity) — the threshold-too-low
  error. It is **not** a rich reading that revisits a recurring cast once over a
  long arc: measured on a whole novel, the reading is turbulent (hundreds of RECs)
  but with almost-all-distinct frames, which is honest work under a thin prior, not
  a thrash. The single-A→B→A test mislabelled that turbulence; the detector now
  requires repeated oscillation at low diversity.

## Where it surfaces

Reading mode (the graph view's cursor) shows the enacted loop as a fourth strip
beneath existence / structure / (depicted) significance: per layer, the terms the
frame stands on, a strain bar filling toward the layer's REC threshold, and the
restructuring count — the protective belt filling, and giving way, as you step the
arrow through the document. The strip shows the γ-mass fold instantly; when the
geometric reader is live (and the document is short enough to embed responsively)
it **deepens to the meaning reader** asynchronously, relabelled *semantic surprise*
— the same strip, driven by meaning-distance instead of figure-mass.
