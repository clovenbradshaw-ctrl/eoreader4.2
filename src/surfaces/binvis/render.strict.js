// EO: SIG(Lens → Lens, Tending) — the modality-blind binvis render (the prior art)
// Consumes ONLY bytes — never a Reading, never a source object. Aldo Cortesi's binvis,
// faithfully: a file's bytes walked down a Hilbert curve (curve.js) and coloured by the
// binvis "class" scheme (classify.js). Nothing here is novel; the novelty, when it
// comes, is a new *layer* in classify.js, not a new render.
//
// Split in two, exactly like the waveform surface:
//   buildScene(bytes, opts)          — pure. bytes → a plain-object Scene carrying the
//                                       finished RGBA pixel buffer + the legend/histogram.
//                                       This is what the tests exercise; no canvas.
//   renderToContainer(bytes, el, opts) — the DOM adapter. Blits the Scene's pixels onto a
//                                       <canvas> and wires hover/click through INJECTED
//                                       callbacks (opts.onHover(byteInfo),
//                                       opts.onNavigate({offset,length})), never app state.

import { sideFor, d2xy, xy2d } from './curve.js';
import { LAYERS, DEFAULT_LAYER, byteClass, BINVIS_PALETTE, CLASSES, CLASS_LABEL } from './classify.js';

const MAX_SIDE = 512;   // 512² = 262 144 pixels — past this each pixel aggregates a bucket

// Coerce whatever the caller hands us into a Uint8Array of bytes. A string is taken as
// its UTF-8 bytes (a text source IS its bytes); an ArrayBuffer / typed array / plain
// array is read directly. Anything else → empty.
export const toBytes = (input) => {
  if (input == null) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (Array.isArray(input)) return Uint8Array.from(input, (b) => b & 0xff);
  return new Uint8Array(0);
};

// buildScene — the whole rendering decision, pure. bytes → a Scene: the RGBA buffer laid
// out on the Hilbert plane, plus the class histogram and legend the surface paints beside
// it. `opts.layer` selects a classify.js layer (structure / entropy / significance); an
// unavailable layer falls back to structure so the picture is never blank. `opts.signal` is an
// optional per-byte weight the significance layer colours by — an opaque numeric overlay, never
// a Reading, so this render stays modality-blind. The layer's `build(bytes, opts)` returns a
// per-index colourer, so a pointwise, a windowed, and a signal-keyed layer share this loop.
export const buildScene = (input, { layer = DEFAULT_LAYER, maxSide = MAX_SIDE, signal = null } = {}) => {
  const bytes = toBytes(input);
  const n = bytes.length;
  const side = sideFor(n, { maxSide });
  const cells = side * side;
  const bucket = Math.max(1, Math.ceil(n / cells));

  const layerDef = (LAYERS[layer] && LAYERS[layer].available) ? LAYERS[layer] : LAYERS[DEFAULT_LAYER];
  const colorAt = (layerDef.build || LAYERS[DEFAULT_LAYER].build)(bytes, { signal });

  const pixels = new Uint8ClampedArray(cells * 4);   // alpha defaults to 0 → uncovered tail is transparent
  for (let p = 0; p < cells; p++) {
    const start = p * bucket;
    if (start >= n) break;                            // the curve runs past the file's end — leave it clear
    const end = Math.min(n, start + bucket);
    let r = 0, g = 0, b = 0;
    for (let i = start; i < end; i++) { const c = colorAt(i); r += c[0]; g += c[1]; b += c[2]; }
    const m = end - start;
    const [x, y] = d2xy(side, p);
    const idx = (y * side + x) * 4;
    pixels[idx] = r / m; pixels[idx + 1] = g / m; pixels[idx + 2] = b / m; pixels[idx + 3] = 255;
  }

  const histogram = Object.fromEntries(CLASSES.map((c) => [c, 0]));
  for (let i = 0; i < n; i++) histogram[byteClass(bytes[i])]++;
  const legend = CLASSES.map((c) => ({ class: c, label: CLASS_LABEL[c], color: BINVIS_PALETTE[c], count: histogram[c] }));

  return {
    n, side, cells, bucket,
    layer: layerDef.id, layerAvailable: layerDef.available !== false,
    legendKind: layerDef.legendKind, gradient: layerDef.gradient,
    pixels, histogram, legend, palette: BINVIS_PALETTE,
  };
};

// pixel (x, y) on the side×side grid → the byte range under it, or null if that cell is
// past the file's end. The exact inverse of the layout above — this is what makes a hover
// nameable ("bytes 4 096–4 128, mostly printable").
export const locate = (scene, x, y) => {
  if (x < 0 || y < 0 || x >= scene.side || y >= scene.side) return null;
  const d = xy2d(scene.side, x, y);
  const offset = d * scene.bucket;
  if (offset >= scene.n) return null;
  return { offset, length: Math.min(scene.bucket, scene.n - offset), x, y };
};

// ---- the DOM adapter --------------------------------------------------------

// renderToContainer — blits buildScene's pixels onto a <canvas> in `el` at native
// resolution (one canvas pixel per curve cell), CSS-scaled up with nearest-neighbour so
// the mosaic stays crisp. Hover and click are wired through injected callbacks only:
//   opts.onHover({ offset, length, x, y, class })  — as the pointer moves (null on leave)
//   opts.onNavigate({ offset, length })            — on click
// `opts.display` is the CSS pixel size of the square (default 320). Browser-only (needs a
// 2D canvas context); the pure buildScene above is what runs in tests.
export const renderToContainer = (input, el, opts = {}) => {
  const doc = opts.doc || (el && el.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('renderToContainer: no document available — pass opts.doc in a non-browser context');
  const scene = buildScene(input, opts);
  const display = opts.display ?? 320;

  while (el.firstChild) el.removeChild(el.firstChild);
  const canvas = doc.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
  canvas.width = scene.side; canvas.height = scene.side;
  canvas.setAttribute('class', 'binvis-canvas');
  canvas.style.width = `${display}px`; canvas.style.height = `${display}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  el.appendChild(canvas);

  const ctx = canvas.getContext && canvas.getContext('2d');
  if (ctx && scene.n > 0) {
    const img = new ImageData(scene.pixels, scene.side, scene.side);
    ctx.putImageData(img, 0, 0);
  }

  const cellOf = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((evt.clientX - rect.left) / rect.width) * scene.side);
    const y = Math.floor(((evt.clientY - rect.top) / rect.height) * scene.side);
    return locate(scene, x, y);
  };
  if (typeof opts.onHover === 'function') {
    canvas.addEventListener('mousemove', (e) => opts.onHover(cellOf(e)));
    canvas.addEventListener('mouseleave', () => opts.onHover(null));
  }
  if (typeof opts.onNavigate === 'function') {
    canvas.style.cursor = 'crosshair';
    canvas.addEventListener('click', (e) => { const c = cellOf(e); if (c) opts.onNavigate(c); });
  }

  return { canvas, scene, destroy: () => { while (el.firstChild) el.removeChild(el.firstChild); } };
};
