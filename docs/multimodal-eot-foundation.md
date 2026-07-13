# Multimodal synthesis over EOT — the foundation

*What shipped, the probes that justified it, and what is deliberately left for later.*

EOT already transports every sense: seventeen organs lower their modality onto one
append-only log through nine operators, and `emitEot`/`parseEOT` read that log back out
as surface. What it did **not** transport is *where* an event was read, *which sense* it
came through, and *that two senses saw the same thing*. This change adds the first two and
the machinery the third needs. It is steps 1–3 of the proposal
(`Multimodal synthesis over EOT`, ideation) — the honesty fix and the visible product —
built backward-compatibly. Steps 4–7 (composite clock, co-locus binder, cross-modal seam)
are gated on probes that need a real multimodal corpus, and are left as follow-up.

## The probes, before and after

Cheap, read-only, falsifiable — run against the real spine. They gate the build.
Reproduce with `node probes/multimodal-eot.mjs`.

| Probe | Before (main) | After (this change) |
|---|---|---|
| **1 — is the locus lost?** An image lowers to `person -> dog : beside`; the box is on `doc.regions`, never on the event. | No `^locus`; no bbox recoverable from the surface. In a composite the unit axis re-bases, so `regions[sentIdx]` for `person` resolves to the **dog**'s box. | The box rides the surface: `person -> dog : beside ^"scene.jpg#xywh=210,88,64,64"`, and is recoverable from the re-parsed events — no in-process join. |
| **2a — overcount.** A recording and its own Whisper transcript are two documents. | `corroborated`, **2 origins** — the transcript counted as a second, independent witness. | `single-source`, **1 origin** — the transcript folds onto its recording root. |
| **2b — undercount.** A procurement PDF and an independent recording of the same act. | `corroborated` — the same rung as two copies on paper. | `cross-modal`, senses `[text, hearing]` — two channels that never touched, both holding the fact. |

Probes 3 (co-locus vs name binding) and 4 (how rare cross-modal corroboration is) need a
real meeting corpus (audio + transcript + minutes) that is not in this repo; they remain
unrun, and the moves they gate remain unbuilt.

## What shipped

### 1. The `^locus` trailer — *where*

A third trailer sigil beside `@agent` and `~ts`. The locus is a **W3C Media Fragment**,
treated as an **opaque string** the core never resolves — only the organ that minted it
can open it:

```
smith : Person                 @perceiver ^"minutes.pdf#page=4&l=12"
smith -> dfr-contract : signed  @perceiver ^"council-0512.wav#t=182.4,188.1"
region-3 : Person               ^"scene.jpg#xywh=210,88,64,64"
q3-total.value = 37800000       ^"ledger.xlsx#row=214&col=F"
```

**The one real subtlety.** A fragment contains `#`, which is EOT's comment sigil. The
comment stripper runs first and is quote-aware, so the locus rides **quoted** —
`^"…#…"` — and its `#` survives. A bare `^token` with no `#` is also accepted for
hand-writing. This is the single design decision the ideation glossed over, and it is why
emission always quotes.

- Ingester (`organs/ingest/eot.js`): `splitMeta` recovers the locus; `emit` puts it on
  the event; `eotDoc` stamps it onto every log event a tuple mints.
- Emitter (`organs/ingest/eot-emit.js`): `metaTrailer` writes it back out, quoted.
- Round-trips exactly; **byte-identical when absent**.

### 2. Organs mint loci

- `organs/in/image.js` — each region INS and each spatial link carries `#xywh=x,y,w,h`.
- `organs/in/document.js` (`assembleDocument`, the shared spine for PDF / OCR / Docling) —
  each block carries `#page=N&xywh=…&char=start,end`. The geometry that used to sit only on
  `doc.spans` now rides the event, so it survives serialization **and** compositing.

### 3. The sense axis + the derivation fold + the cross-modal rung

In `enactor/ground/reflect.js`:

- `senseOfModality` maps an organ's `modality` onto the doors of the world —
  `sight · hearing · tabular · structural · text`. (`sense`, not `modality`: the latter is
  already taken for realis/irrealis mood in `perceiver/surfaces.js`.)
- `derivedFrom` collapses derivations. A document read *from* another (a transcript from a
  recording, an OCR from a scan) declares its parent; the witness fold walks to the
  **root** before counting origins. The composite exposes a `derivedFrom` map and a
  `modalityByDoc` map for the fold to read.
- The status ladder gains a top rung:

  | status | condition |
  |---|---|
  | unwitnessed | nothing |
  | interpretation | enactor door only |
  | single-source | one root origin |
  | corroborated | ≥2 root origins, one sense |
  | **cross-modal** | ≥2 root origins, ≥2 senses |

- Witnesses now carry `{ docId, locus, sense, text }`. The `text` sentence still renders as
  before; where a `locus` is present (an image box, a PDF passage), the UI has the address
  to render the evidence *itself* — the crop, the highlighted cell — instead of the
  pseudo-sentence `"person"`. Wiring an `organ.render(locus)` method to those addresses is
  the next visible step.

## What is deliberately not built

- **`organ.render(locus)`** — turning a locus into a crop / audio clip / highlighted cell is
  UI + media work; this change provides the address the render will read.
- **Steps 4–7** — the composite clock (chronological reading order), the co-locus binder
  (`==` on coincidence, not names), and the cross-modal seam (a `DEF` that holds two senses'
  disagreement unresolved). Each is gated on probes 3–4, which need a corpus this repo does
  not carry.

## Tests

`tests/multimodal-eot.test.js` — locus round-trip, the `#`-vs-comment case, byte-identical
absence, image + OCR locus minting, box-survives-serialization, the sense map, the witness
carrying locus + sense, the derivation collapse, and the cross-modal rung.
