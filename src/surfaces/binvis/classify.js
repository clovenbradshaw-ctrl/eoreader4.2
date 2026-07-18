// EO: SIG(Lens → Lens, Tending) — the byte-class taxonomy + the binvis "class" palette
// The colour half of the prior art. Cortesi's binvis.io offers several colour schemes;
// the default, "class", buckets each byte into a coarse structural category and paints
// the category, so a file's *shape* — text vs. padding vs. packed/high-entropy regions
// — reads at a glance without decoding a single value. We reproduce that scheme; we do
// not invent a new one.
//
// The five classes (binvis "class" scheme):
//   null        0x00               a run of zeroes — padding, sparse structure   → black
//   low         0x01–0x1F, 0x7F    control bytes / whitespace                    → green
//   printable   0x20–0x7E          printable ASCII — text                        → blue
//   high        0x80–0xFE          extended / non-ASCII — packed or binary        → red
//   ones        0xFF               a run of 0xFF — the other padding value        → white
//
// This is the "structural" layer. The entropy layer (entropy.js) is the second binvis view; the
// significance layer (significance.js) is the third — keyed to the reading the perceiver
// maintains, it paints a per-byte SIGNAL the caller supplies (bright where the reading turned,
// dark where it ran flat) rather than anything read off the bytes. Its `build` takes an optional
// second argument — `build(bytes, { signal })` — so the modality-blind render never learns what
// the signal means; the reader room (binvis-surface.js) is the one storey allowed to derive it
// from a Reading. Adding a layer is still one entry here, nowhere else.

import { windowedEntropy, entropyColor, ENTROPY_STOPS } from './entropy.js';
import { significanceColor, SIGNIFICANCE_STOPS } from './significance.js';

export const CLASSES = Object.freeze(['null', 'low', 'printable', 'high', 'ones']);

// The binvis class palette, one RGB triple per class. Muted a touch from pure primaries
// so a dense mosaic stays legible rather than vibrating.
export const BINVIS_PALETTE = Object.freeze({
  null:      Object.freeze([0, 0, 0]),
  low:       Object.freeze([90, 190, 110]),
  printable: Object.freeze([70, 130, 220]),
  high:      Object.freeze([215, 75, 70]),
  ones:      Object.freeze([236, 236, 240]),
});

export const CLASS_LABEL = Object.freeze({
  null:      '0x00 · null / padding',
  low:       '0x01–0x1F · control / whitespace',
  printable: '0x20–0x7E · printable ASCII',
  high:      '0x80–0xFE · extended / binary',
  ones:      '0xFF · ones / padding',
});

// byte → class name. Pure, total over 0..255 (and defensive for anything else).
export const byteClass = (b) => {
  b &= 0xff;
  if (b === 0x00) return 'null';
  if (b === 0xff) return 'ones';
  if (b >= 0x20 && b <= 0x7e) return 'printable';
  if (b < 0x20 || b === 0x7f) return 'low';
  return 'high';
};

// byte → RGB triple, via its class. The atom the render aggregates.
export const byteColor = (b) => BINVIS_PALETTE[byteClass(b)];

// The layer registry — the surface's "which meaning are we colouring by" axis. A layer is a
// `build(bytes, opts) → (i) → rgb`: given the whole byte array (and optional opts) it returns a
// per-index colourer, so a pointwise layer (structure: colour byte i by its class), a windowed
// one (entropy: colour byte i by the local entropy around it), and a signal-keyed one
// (significance: colour byte i by opts.signal[i]) all share one contract. `legendKind` tells the
// surface which scale to draw; `needsSignal` flags a layer whose colourer is uniform unless the
// caller hands it a per-byte signal. A contributor adds one entry here, nowhere else.
export const LAYERS = Object.freeze({
  structure: Object.freeze({
    id: 'structure', label: 'Structure', available: true, legendKind: 'classes', gradient: null,
    blurb: "Aldo Cortesi's binvis byte-class colouring — the file's raw shape.",
    build: (bytes) => (i) => byteColor(bytes[i]),
  }),
  entropy: Object.freeze({
    id: 'entropy', label: 'Entropy', available: true, legendKind: 'gradient', gradient: ENTROPY_STOPS,
    blurb: 'Local Shannon entropy — compressed / encrypted / packed regions glow.',
    build: (bytes) => { const e = windowedEntropy(bytes); return (i) => entropyColor(e[i]); },
  }),
  significance: Object.freeze({
    id: 'significance', label: 'Significance', available: true, legendKind: 'gradient', gradient: SIGNIFICANCE_STOPS,
    needsSignal: true,
    blurb: 'Keyed to the reading the perceiver maintains — bright where the reading turned, dark where it ran flat.',
    // The one layer coloured by MEANING, not by the bytes: opts.signal is a per-byte weight in
    // [0,1] the reader room derives from the Reading. With no signal the colourer is uniform
    // (the ramp's flat end), so a direct buildScene({layer:'significance'}) never throws — it
    // just paints an even field until a signal arrives.
    build: (bytes, opts = {}) => {
      const sig = opts && opts.signal;
      if (!sig || !sig.length) { const flat = SIGNIFICANCE_STOPS[0].color; return () => flat; }
      return (i) => significanceColor(sig[i] || 0);
    },
  }),
});

export const DEFAULT_LAYER = 'structure';
