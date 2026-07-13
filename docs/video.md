# Reading video — structure first, model last, every hit witnessed

Video is ingested, played back, optionally transcribed, and — the part this document is about —
**read for its latent structure and made searchable by description**, so a described moment resolves
to time: *"the moment the councilmember says the developer's name", "every vehicle parked here longer
than ten minutes", "the man in the blue jacket, everywhere he appears."* The literature calls the last
one **video moment retrieval / temporal grounding**; the difference here is that every hit carries its
**witness** and the reading **abstains** rather than guess — because the use is accountability work,
where a false *"found it"* is a liability and an honest *"here are six maybes"* is not.

EO does not out-recall a cloud video model on a random clip. It earns its place on a specific shape of
problem: **a lot of footage, a needle you can describe, and a hard requirement that the hit be
defensible** — hours of bodycam, council/hearing archives, surveillance obtained by records request.
There the model-in-a-datacenter approach fails on cost and on provenance, and this approach wins:
it indexes locally (FOIA'd video never leaves the machine), every hit points at the exact frames with a
contestable reason, and it says INDETERMINATE instead of returning a confident wrong span.

## The four tiers — almost nothing reaches the expensive one

The pipeline is built so the costly stage is starved by design. From cheapest to dearest:

| tier | what | cost | where |
|---|---|---|---|
| 0 | read the compression — I-frame positions, per-chunk byte sizes, key/delta flags | ~free (numbers the encoder already wrote) | WebCodecs chunk metadata (the browser does **not** expose the motion-vector field) |
| 1 | decode to pixels | cheap — hardware decode block | `<video>`+canvas / WebCodecs |
| 2 | classical CV — frame difference, background plate, dwell | ms/frame, model-free | `organs/in/motion.js` |
| 3 | neural CV — name the picture | ~1–2 s **per image** | `eo/vision.js` (Florence-2, Transformers.js) |

Tier 2 is the **gate**. Captioning every frame of an hour (~108k frames) at ~2 s each is ~60 hours —
impossible on a laptop, and exactly why "throw it at a video LLM" doesn't scale. Gating the model to
**one keyframe per shot** plus flagged events cuts the set 50–500× — a few hundred frames, **minutes**,
as a background job, with a content-addressed cache making a re-run free. Surprise-gating isn't an
optimization; it's what moves the job from impossible to routine.

**The thing that actually crashes a laptop is memory, not compute.** A decoded 1080p RGB frame is
~6 MB; holding an hour resident is ~650 GB — an instant OOM that has nothing to do with the chip. The
rule, baked into the extractor: **stream, never accumulate** — decode → reduce to a small luminance
grid → discard the pixels. Only the tiny grids and the KB-per-segment log survive, so a four-hour file
costs what a four-minute one does. This is the same keep-the-log-drop-the-frames discipline the
append-only design already enforces.

Runtime note: this runs **in a browser tab**, so "which laptop" collapses to **WebGPU-else-WASM** (the
codebase probes exactly this). Gating is calibrated for the WASM floor so it runs everywhere; a WebGPU
machine simply affords captioning more event-frames.

## The retina — `organs/in/motion.js` (the pre-transcription reading of the picture)

The twin of the pre-transcription cochlea (`organs/in/acoustic.js`). Pure, model-free, browserless-
testable. A frame is a grid `f[y][x]` of luminance in [0,1] — the same shape `video.js`'s tracker reads.

- **the activity envelope** — per-frame mean change from the frame before (the video's waveform);
- **the cuts** — a change so large it is a jump to a different shot, not motion within one — segmenting
  the clock into **shots** (the video's paragraphs) as nested holons;
- **the surprise / dwell decomposition** — the clip read as `[event, dwell, event, dwell, …]` before
  any model runs. **Surprise** is where the signal spikes (a bounded event); **dwell** is where it
  stays low while something keeps occupying its spot. CV is then spent only on the events and on
  confirming an ambiguous dwell — never per frame.

**Dwell is a typed, located, revisable verdict, not a threshold** — because *low motion has more than
one cause* (the witnessed-absence law, read for video):

- `present-still` — quiet **and** the picture deviates from the empty-scene plate: a thing is there,
  holding;
- `void` — quiet **and** the picture ≈ the plate: nothing there (the honest absence);
- `indeterminate` — presence in the ambiguous band, or the motion call sat on the floor.

Get this wrong and you cheerfully report a parked car that drove off two minutes ago. On a **fixed
camera** the empty-scene plate is the per-pixel median (a foreground that comes and goes resolves to
the scene behind it), so dwell is nearly free and accurate. A dwell is **revisable**: a brief occlusion
(someone crosses in front) doesn't end it — the interval *spans* the gap, marked indeterminate, when
the thing is present again. And duration falls out as a **searchable predicate** (`dwellsLongerThan`):
"persisted longer than N" is a filter, not a manual scrub.

The `meaningful` floors are the **authored kernel** — scene- and thing-dependent (a person shifting
weight vs. walking away). The motion/presence signals are a **pluggable seam** (`persistence({motion,
presence})`): the moving-camera case slots residual-after-global-motion-compensation in here without
changing the fold.

## Moment retrieval — `surfer/moment.js` (describe → witnessed spans, or INDETERMINATE)

Transcript (heard), retina + CV (seen), and dwells all lay **span-anchored annotations** on one
timeline. A query searches that one index and returns **time**. Three disciplines separate it from a
top-k of look-alike frames:

- **witnessed, not trusted** — every candidate carries the exact annotations (which words / concepts /
  OCR text, at which spans, from which witness) that made it, so a hit is contestable;
- **abstains** — a candidate is a MATCH only when evidence clears a bar (every salient term met, an
  exact tracked-entity hit, or corroboration across ≥2 kinds); weak evidence is INDETERMINATE, never a
  confident wrong span;
- **figure-level** — an entity query pulls **all** of a coref'd figure's appearances, including shots
  where the label differs or the figure is turned away (a per-frame match can't).

The query is **decomposed by a proposer that commits nothing** — an injected small model, or a lexical
fallback — into terms + a structured filter (kinds, a minimum duration). Coref folds a concept seen
across cuts into one tracked figure (`video-read.js` `corefByLabel` for the v1 label-level pass; an
appearance-embedding pass overwrites `entityId` without changing anything downstream).

## The reader's thread — `rooms/reader/video-read.js` + `video-panel.js`

`index.html` is at its size cap, so the video thread lives in dedicated modules; the surface holds a
pointer.

- **`video-read.js`** — extract (`<video>`+canvas, downsample-and-discard, streaming) → read
  (`motion.js`) → **gated CV on keyframes** (`eo/vision.js` → `scene.js`) → span annotations. The
  orchestration takes frames, keyframe grabber and vision organ as inputs, so gating/coref/assembly are
  pinned by a browserless test with fakes; only the decode shell touches the DOM.
- **`video-panel.js`** — pure view-models for the Listen surface: the activity strip, keyframe
  thumbnails, the dwell timeline, the picture-read status, the processing-option lenses, and the
  moment-search result rows.

The controller (`app.js`) mirrors the transcription path: a video landing auto-runs the **model-free
structure pre-read** (strip, shots, keyframes, dwells appear at once); **naming** what is on screen is
a separate, user-triggered pass (`nameVideoShots`, loads the ~200 MB model only on demand);
`searchVideo` resolves the query over the heard+seen index. Status is twinned (`_vis` live /
`videoAnalysis` durable); `videoMeta` + the seen annotations ride the snapshot, so the strip, keyframes
and search survive a reload.

## The corpus fork, and two honest limits

**Fixed vs. moving camera is the genuine fork.** On a fixed camera (CCTV, a council chamber) global vs.
local motion separates trivially and dwell is a freebie off the reading built here. On bodycam/handheld
the camera never stops, so "the thing barely moved" becomes residual-motion-after-global-compensation —
real work, and the seam (`persistence({motion})`) is where it plugs in. This is why "which footage
first" decides everything downstream.

1. **CV concept quality is the ceiling.** If the local model can't propose "handshake", no amount of
   good merging finds "when they shook hands." This system makes CV proposals accountable and searchable
   across time; it does not make a weak model see better. Spend the CV budget on the concepts the first
   corpus actually needs.
2. **Verbs are harder than nouns.** Static-object and on-screen-text queries are the easy case;
   action/motion descriptions ("turning left", "handing something over") need the motion signal or a
   real action concept, not per-frame tags. If the target queries are verbs, that changes what CV you
   reach for.

## Seams left open (for the next pass)

- moving-camera global-motion compensation → the compensated-residual signal into `persistence`;
- appearance-embedding coref (CLIP) → cross-cut figure identity beyond same-label;
- OCR on keyframes → on-screen text as `text` annotations (the hook exists in `analyzeFrames`);
- a model-backed query-decomposition proposer (the lexical fallback is wired; inject `propose`);
- compressed-domain Tier-0 surprise from WebCodecs chunk sizes, to gate extraction itself on long files.
