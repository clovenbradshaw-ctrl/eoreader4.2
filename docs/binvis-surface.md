# Byte-structure surface (binvis) — implementation notes

> Status: built (structure + entropy layers)
> Location: `src/surfaces/binvis/` (the pure holon) + `src/rooms/reader/binvis-surface.js` (the launcher)
> Prior art: Aldo Cortesi, *Visualizing binaries with space-filling curves* (binvis.io)

## 0. The one idea

For **any** document the reader has loaded, show its raw bytes as a picture. We do
not invent a visualization — we reproduce the prior art. Cortesi's binvis lays a
file's bytes down a **Hilbert curve** (so adjacency in the file stays adjacency on
the plane) and colours each byte by a coarse **class** (text vs. padding vs.
packed/binary). The file's *shape* reads at a glance without decoding a value.

Two layers ship now — **structure** (byte class) and **entropy** (local Shannon
entropy, binvis's second view). A reading-keyed **significance** layer is declared in
the layer registry (`classify.js`, `LAYERS`) and will paint later without touching the
render.

### The layer contract

A layer is `build(bytes) → (i) → rgb`: given the whole byte array it returns a
per-index colourer, plus a `legendKind` (`classes` or `gradient`). This one shape
covers both a **pointwise** layer (structure colours byte *i* by its class) and a
**windowed** one (entropy colours byte *i* by the local entropy around it, computed
once in `entropy.js` — an O(n) sliding window). `buildScene` calls `build(bytes)` once
and averages the colourer over each pixel's byte bucket. Adding a layer is one entry in
`LAYERS`, nowhere else — the significance layer will be a third `build`.

## 1. Layered architecture

```
 source ──▶ [launcher] bytes ──▶ buildScene(bytes) ──▶ Scene (RGBA + legend) ──▶ <canvas>
            rooms/reader          surfaces/binvis        surfaces/binvis         surfaces/binvis
```

The surface holon (`src/surfaces/binvis/`) is **modality-blind**: it consumes only
bytes, exactly like the waveform render consumes only a `WaveformModel`. The reader
room owns the one impure step — getting the bytes of a loaded source
(`app.sourceOriginalExport`: a PDF/audio/video's true bytes, or a text source's own
text as UTF-8).

- `curve.js` — the Hilbert space-filling curve. `d2xy`/`xy2d` (exact inverses, so a
  hover names the byte offset under the pointer) and `sideFor`. The prior art,
  unchanged.
- `classify.js` — the five-class binvis taxonomy, its palette, and the `LAYERS`
  registry. `null` (0x00) → black, `low` (0x01–0x1F, 0x7F) → green, `printable`
  (0x20–0x7E) → blue, `high` (0x80–0xFE) → red, `ones` (0xFF) → white.
- `entropy.js` — the entropy layer: `windowedEntropy(bytes)` (O(n) sliding-window
  Shannon entropy, normalised to [0,1]) and the heat ramp `entropyColor` — dark/cool
  for ordered regions, bright/warm for packed/encrypted ones.
- `render.strict.js` — `buildScene(bytes, opts)` (pure: bytes → the RGBA pixel
  buffer laid on the plane + histogram/legend) and `renderToContainer(bytes, el,
  opts)` (the canvas adapter; hover/click wired through injected callbacks only).

## 2. Aggregation for large files

Below the cap (`maxSide = 512` → 262 144 cells) each pixel is one byte. Past it,
each pixel aggregates a **bucket** of `ceil(n / cells)` bytes and paints their
average class colour — exactly as binvis samples down a file too large to give one
pixel per byte. The launcher reads at most 6 MB and says so when it sampled the head.

## 3. Where it is wired

`window.EO.binvis` exposes the pure holon plus `mount`, so the dc surface can host
it as a tab later. Today it is visible via a floating **launcher** (bottom-left
corner button, "Structure") mounted in `boot.js` beside the audit console — it opens
a right-docked panel with a source picker, the layer switch, the mosaic, a legend
with class percentages, and a live byte readout. No dc-surface edit was needed.

## 4. Discipline

Same rule as the waveform: nothing under `src/surfaces/binvis/` may branch on
modality, and the render asserts nothing (`SIG(Lens → Lens, Tending)`). A new layer
is a `build` function + an `available` flag + a `legendKind` in `classify.js`, nowhere
else.
