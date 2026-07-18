# Byte-structure surface (binvis) — implementation notes

> Status: built (structure + entropy + significance layers), wired into the source viewer as a **Structure** tab
> Location: `src/surfaces/binvis/` (the pure holon) + `src/rooms/reader/binvis-surface.js` (the mount/launcher) + `src/rooms/reader/binvis-data.js` (the source→bytes/signal seam)
> Prior art: Aldo Cortesi, *Visualizing binaries with space-filling curves* (binvis.io)

## 0. The one idea

For **any** document the reader has loaded, show its raw bytes as a picture. We do
not invent a visualization — we reproduce the prior art. Cortesi's binvis lays a
file's bytes down a **Hilbert curve** (so adjacency in the file stays adjacency on
the plane) and colours each byte by a coarse **class** (text vs. padding vs.
packed/binary). The file's *shape* reads at a glance without decoding a value.

Three layers ship now — **structure** (byte class), **entropy** (local Shannon
entropy, binvis's second view), and **significance** (`significance.js`), keyed to the
reading the perceiver maintains: bright where the reading turned, dark where it ran flat.

### The layer contract

A layer is `build(bytes, opts) → (i) → rgb`: given the whole byte array (and optional
`opts`) it returns a per-index colourer, plus a `legendKind` (`classes` or `gradient`).
This one shape covers a **pointwise** layer (structure colours byte *i* by its class), a
**windowed** one (entropy colours byte *i* by the local entropy around it, computed once
in `entropy.js` — an O(n) sliding window), and a **signal-keyed** one (significance
colours byte *i* by `opts.signal[i]`, a per-byte weight in [0,1] the caller supplies).
`buildScene` calls `build(bytes, { signal })` once and averages the colourer over each
pixel's byte bucket. Adding a layer is one entry in `LAYERS`, nowhere else.

The signal is an **opaque numeric overlay**, never a Reading — so the render stays
modality-blind. Deriving it (reading → per-byte weight) is the reader room's job
(`binvis-data.js#readingSignificance`), the one storey allowed to know a Reading: it keys
the signal to the reading's own turning points (belief bits, matching the Overview
waveform), and — because those turns are positions in the *admitted text* — paints over
the **text bytes** (the reading's units, in order), so the unit→byte span is exact. A
source with no reading yet, or a raw container with no admitted text, simply offers no
signal, and the layer says so rather than painting a false map.

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
- `significance.js` — the significance layer's colour ramp: `significanceColor(s)` over
  `SIGNIFICANCE_STOPS` (the reader's indigo → violet → magenta glow — distinct from
  entropy's warm heat). Owns only the colour; the per-byte signal is built one storey up.
- `render.strict.js` — `buildScene(bytes, opts)` (pure: bytes → the RGBA pixel
  buffer laid on the plane + histogram/legend; `opts.signal` feeds the significance
  layer) and `renderToContainer(bytes, el, opts)` (the canvas adapter; hover/click
  wired through injected callbacks only).

## 2. Aggregation for large files

Below the cap (`maxSide = 512` → 262 144 cells) each pixel is one byte. Past it,
each pixel aggregates a **bucket** of `ceil(n / cells)` bytes and paints their
average class colour — exactly as binvis samples down a file too large to give one
pixel per byte. The launcher reads at most 6 MB and says so when it sampled the head.

## 3. Where it is wired

`window.EO.binvis` exposes the pure holon plus `mount`. It is reached two ways:

- **Source-viewer tab.** The source viewer carries a **Structure** tab beside
  Native / Overview / Reader / Facing / EoT. It mounts the surface scoped to the active
  source (`mount(el, { app, sn, pickSource: false })` — no picker, since the tab already
  IS one source) and re-scopes in place via `show(sn)` when the active source changes.
  `setStructureEl` (index.html) owns the ref-mount lifecycle, destroying the prior handle
  before any fresh mount so binvis's app subscription never leaks, and on leaving the tab.
- **Floating launcher.** A bottom-left corner button ("Structure") mounted in `boot.js`
  beside the audit console opens the same surface as a right-docked panel *with* the
  source picker, over whatever is loaded.

Both show the layer switch (structure · entropy · significance), the mosaic, a legend
(class percentages, or the gradient scale for the entropy/significance ramps), and a live
byte readout — which, on the significance layer, also names the reading's weight under the
pointer.

## 4. Discipline

Same rule as the waveform: nothing under `src/surfaces/binvis/` may branch on
modality, and the render asserts nothing (`SIG(Lens → Lens, Tending)`). A new layer
is a `build` function + an `available` flag + a `legendKind` in `classify.js`, nowhere
else. The significance layer keeps that discipline: the *surface* still sees only bytes
and an opaque numeric `signal`; the one place that touches a Reading is `binvis-data.js`
in the reader room. Crossing the Void/Entity boundary any other way (letting the surface
read a Reading, or letting the raw-byte layers key to meaning) is exactly the grain-mixing
the coil-surfaces spec's §6 forbids at this seam.
