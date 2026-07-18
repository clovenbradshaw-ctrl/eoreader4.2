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
// This is the "structural" layer. Other layers (an entropy heatmap, and a
// significance layer keyed to the reading the perceiver already maintains) are declared
// in LAYERS below but not yet painted — the surface reads that registry so a new layer
// slots in without touching the render.

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

// The layer registry — the surface's "which meaning are we colouring by" axis. Only the
// structural layer paints today; the rest are declared so the UI can name what's coming
// and a future contributor adds one `color`/`available` here, nowhere else.
export const LAYERS = Object.freeze({
  structure: Object.freeze({
    id: 'structure', label: 'Structure', available: true,
    blurb: "Aldo Cortesi's binvis byte-class colouring — the file's raw shape.",
    color: byteColor,
  }),
  entropy: Object.freeze({
    id: 'entropy', label: 'Entropy', available: false,
    blurb: 'Local Shannon entropy — compressed/encrypted regions light up. Coming.',
    color: null,
  }),
  significance: Object.freeze({
    id: 'significance', label: 'Significance', available: false,
    blurb: 'Keyed to the reading the perceiver maintains — where the meaning is. Coming.',
    color: null,
  }),
});

export const DEFAULT_LAYER = 'structure';
