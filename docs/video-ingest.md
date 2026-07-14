# Video ingest — a clip read as two senses, and its things found by the Born rule

*What shipped when you drop a video in: the PICTURE read as motion + born-rule entity detection, and
the SOUND read as a transcript, both folded onto one source — no vision model, nothing bundled.*

Before this change, a video import was **the speech only**. `fromMedia` decoded the audio track, ran
whisper, and threw the frames away — the retina in `organs/in/motion.js` (activity, cuts, shots,
persistence, the born-rule tracker) and the deep tracker in `organs/in/video.js` were complete and
pinned by tests, but **nothing ever handed them an `.mp4`**. This change adds the missing front-end
and wires the visual reading in, so a clip like `ball_on_static.mp4` reads for what MOVED as well as
what was said.

## The two senses of one clip

A video carries two channels the engine already knows how to read, and it now reads both, on one
append-only record:

| sense | organ | what it produces |
|---|---|---|
| **sight** | `organs/in/motion.js` (`readVideo`) | the activity envelope, the cuts → nested **shots**, the surprise/**dwell** decomposition, and the **born-rule entities** — what moved, recovered by counting |
| **hearing** | `organs/in/audio.js` (whisper, unchanged) | the **transcript** — timed words, speakers, per-word acoustics |

They fold into one source through `createCompositeDoc` (`organs/in/composite.js`), so "what moved" and
"what was said" share one entity graph and one reading. `senseOfModality` already maps `video → sight`
and `audio → hearing` (`enactor/ground/reflect.js`), so when both senses assert the same thing the
witness fold reads it as **cross-modal** corroboration — two channels that never touched, not one fact
counted twice (`docs/multimodal-eot-foundation.md`). A **silent** clip (the common case for something
like a ball on static) simply lands the motion doc alone, modality `video`.

## EO entity detection by the Born rule

This is the heart of the request — *"computer vision, EO entity detection using the born rule"* — and
it is the same measure the ear uses on a waveform and the replay page uses on a transcript
(`weave/chorus/born.js`, `docs/chorus.md`, `replay.html`): **report the distribution, never the
decision.**

The deep retina (`organs/in/video.js`) follows every blob that persists frame to frame — from the one
thing that crossed the whole clip down to the flickers a field of static (and a codec) throws off.
Which of those are **entities** and which are **noise** is not a hard threshold. The amplitude ψ of a
track is its **γ-mass** — the pixels it was ever sighted at, `Σ (blob size)` over the frames it
survived. (Mass, not just a frame count: a coherent moving thing is a *big* blob, a codec speck is one
or two pixels, and mass is what tells them apart when both happen to persist.) `bornEntities`
(`organs/in/motion.js`) does the Born move:

```
ψ_i  =  Σ blobSize over the frames track i survived        (the γ-mass — pixels sighted)
p_i  =  ψ_i²  /  Σ ψ²                                       (square, sum, divide — bornWeights)
entity  ⇐  framesᵢ ≥ minFrames  AND  p_i ≥ 1/n             (persisted, and above the even-share floor)
```

The **squaring** is the signal-from-noise step: it suppresses the small, brief tracks *quadratically*,
which a linear ranking cannot. On the probe's ball-through-static, the ball takes **99.6%** of the
moving mass where rank-by-mass would give it 70%; the snow, each grain a single pixel, splits a
vanishing remainder below the floor and exactly ONE entity is recovered. The ball was never labelled —
it was **counted**.

Every kept thing lands on the spine as an `INS` entity carrying its born reading — a `DEF born` (its
probability) and an `EVA born-entity` (the verdict that kept it) — so *why* a moving thing is an entity
and not noise is on the record and **revertible**, exactly as the OCR quorum's election is
(`docs/ocr-quorum.md`). The full distribution rides `doc.entities`, so the collapse is re-runnable.

## What shipped

- **`rooms/reader/video-frames.js`** — the browser front-end (the only browser-bound piece): a
  `<video>` + `<canvas>` decode that samples a clip at a low fps into the luminance grids `motion.js`
  reads. It downsamples hard (a moving thing is a blob of tens of pixels, not millions) and caps the
  frame count (a long clip drops its fps rather than decode thousands). The pure reductions —
  `lumaGridFromImageData` (Rec.601 luma), `targetDims`, `sampleTimes` — are exported and unit-tested;
  the decode itself is untested here, exactly as whisper's is.
- **`organs/in/motion.js`** — `bornEntities` (the collapse), wired into `readVideo`; `ingestMotion`
  now emits the `DEF born` / `EVA born-entity` ledger per entity and carries the distribution on the
  doc, and the reading text names the measure that found the things.
- **`rooms/reader/import-file.js`** — `fromMedia` returns a deferred **`watch`** thunk for video
  (mirroring the deferred `transcribe`): it extracts frames and runs `readVideo`, returning the motion
  doc + drawable artefacts + a coverage receipt. The audio path is byte-unchanged.
- **`rooms/reader/app.js`** — after a media source lands, `runWatch` folds the picture in
  (`applyVisualReading`), and `recomposeVideoDoc` composes it with the transcript when speech lands.
  The picture reads first (model-free, fast); the words follow. A resumed import re-derives the picture.
  The source stays `kind:'audio'` with `_media.isVideo` (the Listen surface's contract), so playback
  and the interactive transcript are unchanged.

## Tests and the probe

- `tests/video-born-entities.test.js` — the born collapse (normalized, squared-not-linear, the noise
  floor, empties), the ball-on-static recovery through the retina, the auditable `DEF born`/`EVA`
  ledger, and the cross-modal composition of a motion doc with a transcript.
- `tests/video-frames.test.js` — the pure luminance reduction, the downsample framing, the sampling clock.
- `tests/video-structure.test.js` — the pre-existing retina reading (cuts, shots, persistence, dwells),
  still green.
- `probes/video-born-entities.mjs` — a runnable narrative: a ball crosses static, the retina follows
  every blob, the Born rule collapses persistence into a distribution the ball dominates, and it lands
  on the spine. `node probes/video-born-entities.mjs`.

## What is deliberately not built

- **Naming the things (a VLM pass).** The born rule finds *a moving thing* and locates it; it does not
  call it *a ball*. The scene organ (`organs/in/scene.js` + the Florence-2 eye in `rooms/reader/eo/
  vision.js`) already turns a keyframe into named, boxed regions for still images — waking it on a
  shot's keyframe to name the born entities is the next visible step, and it reuses the exact
  `getVision` → `composeScene` → `ingestImage` path `fromImage` already uses. It is left out here so
  the shipped core stays model-free and lands at once.
- **Persisting the motion graph across a reload.** The human-readable picture reading rides `src.text`
  (it survives), but the structured motion/entity graph is a session-only `_doc`; it re-derives on
  re-import (model-free and cheap), the same posture the acoustic pre-reading takes before its words.
- **The moving-camera plate.** `persistence`/`presenceTrack` read a fixed-camera background plate; the
  seam for compensated residuals is already in `motion.js` (`opts.motion`/`opts.presence`), unwired.
- **A motion strip on the surface.** The activity envelope, shots, and born entities all ride
  `src._motion`; drawing them beside the waveform on the Listen surface is addressable UI work.
