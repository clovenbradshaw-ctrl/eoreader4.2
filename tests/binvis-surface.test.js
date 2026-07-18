import { test } from 'node:test';
import assert from 'node:assert/strict';

import { d2xy, xy2d, sideFor } from '../src/surfaces/binvis/curve.js';
import { byteClass, byteColor, BINVIS_PALETTE, LAYERS, DEFAULT_LAYER } from '../src/surfaces/binvis/classify.js';
import { buildScene, locate, toBytes } from '../src/surfaces/binvis/render.strict.js';
import { windowedEntropy, entropyColor, ENTROPY_STOPS } from '../src/surfaces/binvis/entropy.js';
import { significanceColor, SIGNIFICANCE_STOPS } from '../src/surfaces/binvis/significance.js';

// THE BINVIS SURFACE — the prior art (Cortesi's binvis) as a pure, testable holon: a
// Hilbert layout, a byte-class palette, and the Scene the canvas adapter blits. The DOM
// adapter itself is browser-only; everything that decides the picture is exercised here.

// ---- the space-filling curve -------------------------------------------------

test('sideFor: smallest power-of-two square that covers n, clamped', () => {
  assert.equal(sideFor(0), 1);
  assert.equal(sideFor(1), 1);
  assert.equal(sideFor(2), 2);
  assert.equal(sideFor(4), 2);
  assert.equal(sideFor(5), 4);
  assert.equal(sideFor(16), 4);
  assert.equal(sideFor(17), 8);
  assert.equal(sideFor(10 ** 9, { maxSide: 512 }), 512);   // clamp bites for huge files
});

test('d2xy / xy2d are exact inverses over a whole curve, and the curve is a bijection', () => {
  for (const side of [1, 2, 4, 8, 16]) {
    const seen = new Set();
    for (let d = 0; d < side * side; d++) {
      const [x, y] = d2xy(side, d);
      assert.ok(x >= 0 && x < side && y >= 0 && y < side, `in-bounds side=${side} d=${d}`);
      const key = y * side + x;
      assert.ok(!seen.has(key), `no cell visited twice side=${side} d=${d}`);
      seen.add(key);
      assert.equal(xy2d(side, x, y), d, `inverse side=${side} d=${d}`);
    }
    assert.equal(seen.size, side * side, `covers every cell side=${side}`);
  }
});

test('d2xy: adjacent distances are neighbours (the whole point of a Hilbert curve)', () => {
  const side = 16;
  for (let d = 1; d < side * side; d++) {
    const [x0, y0] = d2xy(side, d - 1);
    const [x1, y1] = d2xy(side, d);
    assert.equal(Math.abs(x0 - x1) + Math.abs(y0 - y1), 1, `unit step at d=${d}`);
  }
});

// ---- the byte-class taxonomy + palette --------------------------------------

test('byteClass: the five binvis classes over the whole byte range', () => {
  assert.equal(byteClass(0x00), 'null');
  assert.equal(byteClass(0xff), 'ones');
  assert.equal(byteClass(0x41), 'printable');   // 'A'
  assert.equal(byteClass(0x20), 'printable');   // space
  assert.equal(byteClass(0x7e), 'printable');   // '~'
  assert.equal(byteClass(0x09), 'low');         // tab
  assert.equal(byteClass(0x1f), 'low');
  assert.equal(byteClass(0x7f), 'low');         // DEL
  assert.equal(byteClass(0x80), 'high');
  assert.equal(byteClass(0xfe), 'high');
  for (let b = 0; b <= 255; b++) assert.ok(BINVIS_PALETTE[byteClass(b)], `class of ${b} has a colour`);
});

test('byteColor: reads its class colour straight off the palette', () => {
  assert.deepEqual([...byteColor(0x00)], [...BINVIS_PALETTE.null]);
  assert.deepEqual([...byteColor(0x41)], [...BINVIS_PALETTE.printable]);
});

// ---- toBytes ----------------------------------------------------------------

test('toBytes: text becomes its UTF-8 bytes; buffers pass through', () => {
  assert.deepEqual([...toBytes('AB')], [0x41, 0x42]);
  assert.deepEqual([...toBytes([0, 255, 300])], [0, 255, 300 & 0xff]);
  assert.deepEqual([...toBytes(new Uint8Array([1, 2]))], [1, 2]);
  assert.equal(toBytes(null).length, 0);
});

// ---- buildScene -------------------------------------------------------------

test('buildScene: empty input is a valid, blank scene', () => {
  const s = buildScene(new Uint8Array(0));
  assert.equal(s.n, 0);
  assert.equal(s.side, 1);
  assert.equal(s.bucket, 1);
  assert.ok(s.pixels.every((v) => v === 0), 'nothing painted');
});

test('buildScene: one byte per pixel below the cap; the histogram is exact', () => {
  const bytes = new Uint8Array([0x00, 0x41, 0x42, 0xff]);   // null, print, print, ones
  const s = buildScene(bytes);
  assert.equal(s.side, 2);
  assert.equal(s.bucket, 1);
  assert.deepEqual(s.histogram, { null: 1, low: 0, printable: 2, high: 0, ones: 1 });
  // byte 0 (0x00) lands at d2xy(2,0) = (0,0) and is painted black, fully opaque
  const [x, y] = d2xy(2, 0);
  const i = (y * 2 + x) * 4;
  assert.deepEqual([s.pixels[i], s.pixels[i + 1], s.pixels[i + 2], s.pixels[i + 3]], [0, 0, 0, 255]);
});

test('buildScene: a big file aggregates into buckets, one averaged pixel each', () => {
  const n = 4096;
  const bytes = new Uint8Array(n).fill(0x41);   // all printable
  const s = buildScene(bytes, { maxSide: 16 });
  assert.equal(s.side, 16);
  assert.equal(s.cells, 256);
  assert.equal(s.bucket, Math.ceil(n / 256));   // 16 bytes per pixel
  // every covered pixel is the printable colour (all bytes identical → average is exact)
  const [pr, pg, pb] = BINVIS_PALETTE.printable;
  const [x, y] = d2xy(16, 0);
  const i = (y * 16 + x) * 4;
  assert.deepEqual([s.pixels[i], s.pixels[i + 1], s.pixels[i + 2]], [pr, pg, pb]);
});

test('buildScene: an unknown/unavailable layer falls back to the structural default', () => {
  const s = buildScene(new Uint8Array([0x41]), { layer: 'no-such-layer' });
  assert.equal(s.layer, DEFAULT_LAYER);
  assert.equal(s.layerAvailable, true);
});

test('locate: inverts the layout — a pixel names the byte range beneath it', () => {
  const s = buildScene(new Uint8Array(64).fill(1), { maxSide: 8 });   // side 8, bucket 1
  const [x, y] = d2xy(8, 20);
  const hit = locate(s, x, y);
  assert.equal(hit.offset, 20);
  assert.equal(hit.length, 1);
  assert.equal(locate(s, -1, 0), null);        // out of bounds
});

test('locate: past the file end returns null (the curve overshoots a non-square file)', () => {
  const s = buildScene(new Uint8Array(5), { maxSide: 512 });   // side 4 → 16 cells, only 5 covered
  let covered = 0, blank = 0;
  for (let d = 0; d < s.cells; d++) { const [x, y] = d2xy(s.side, d); (locate(s, x, y) ? covered++ : blank++); }
  assert.equal(covered, 5);
  assert.equal(blank, s.cells - 5);
});

// ---- the layer registry -----------------------------------------------------

// ---- the entropy layer ------------------------------------------------------

test('windowedEntropy: a constant region is ~0, a maximally-varied region is ~1', () => {
  const flat = windowedEntropy(new Uint8Array(1024).fill(0x41), { window: 256 });
  for (const e of flat) assert.ok(e < 1e-6, 'constant bytes carry no entropy');

  const varied = new Uint8Array(1024);
  for (let i = 0; i < varied.length; i++) varied[i] = i & 0xff;   // every value equally often
  const ent = windowedEntropy(varied, { window: 256 });
  assert.ok(ent[0] > 0.98, `256 distinct values in a 256 window ≈ full entropy, got ${ent[0]}`);
});

test('windowedEntropy: output is one value per byte, all within [0,1]', () => {
  const e = windowedEntropy(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), { window: 4 });
  assert.equal(e.length, 8);
  for (const v of e) assert.ok(v >= 0 && v <= 1);
  assert.equal(windowedEntropy(new Uint8Array(0)).length, 0);   // empty is empty, no throw
});

test('entropyColor: clamps its input and lands on the ramp endpoints', () => {
  assert.deepEqual(entropyColor(0), [...ENTROPY_STOPS[0].color]);
  assert.deepEqual(entropyColor(1), [...ENTROPY_STOPS[ENTROPY_STOPS.length - 1].color]);
  assert.deepEqual(entropyColor(-5), [...ENTROPY_STOPS[0].color]);   // clamps low
  assert.deepEqual(entropyColor(9), [...ENTROPY_STOPS[ENTROPY_STOPS.length - 1].color]);   // clamps high
  const mid = entropyColor(0.5);
  assert.ok(mid.every((c) => c >= 0 && c <= 255));
});

test('buildScene: the entropy layer is available and paints a gradient legend', () => {
  const bytes = new Uint8Array(1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 131 + 7) & 0xff;   // spread of values
  const s = buildScene(bytes, { layer: 'entropy' });
  assert.equal(s.layer, 'entropy');
  assert.equal(s.legendKind, 'gradient');
  assert.ok(Array.isArray(s.gradient) && s.gradient.length >= 2);
  // a high-variety file paints a non-black picture under the entropy ramp
  let opaque = 0; for (let i = 3; i < s.pixels.length; i += 4) if (s.pixels[i] === 255) opaque++;
  assert.ok(opaque > 0, 'entropy layer paints');
});

test('buildScene: structure stays the classes legend (no regression)', () => {
  const s = buildScene(new Uint8Array([0x41, 0x42]), { layer: 'structure' });
  assert.equal(s.legendKind, 'classes');
  assert.equal(s.gradient, null);
});

test('LAYERS: structure, entropy, and significance all paint', () => {
  assert.equal(LAYERS.structure.available, true);
  assert.equal(typeof LAYERS.structure.build, 'function');
  assert.equal(LAYERS.entropy.available, true);
  assert.equal(typeof LAYERS.entropy.build, 'function');
  assert.equal(LAYERS.significance.available, true);
  assert.equal(typeof LAYERS.significance.build, 'function');
  assert.equal(LAYERS.significance.needsSignal, true);
  assert.equal(LAYERS.significance.legendKind, 'gradient');
});

// ---- the significance layer -------------------------------------------------

test('significanceColor: clamps its input and lands on the ramp endpoints', () => {
  assert.deepEqual(significanceColor(0), [...SIGNIFICANCE_STOPS[0].color]);
  assert.deepEqual(significanceColor(1), [...SIGNIFICANCE_STOPS[SIGNIFICANCE_STOPS.length - 1].color]);
  assert.deepEqual(significanceColor(-3), [...SIGNIFICANCE_STOPS[0].color]);   // clamps low
  assert.deepEqual(significanceColor(7), [...SIGNIFICANCE_STOPS[SIGNIFICANCE_STOPS.length - 1].color]);   // clamps high
  const mid = significanceColor(0.5);
  assert.ok(mid.every((c) => c >= 0 && c <= 255));
});

test('buildScene: significance without a signal is available but paints a uniform flat field', () => {
  const s = buildScene(new Uint8Array([0x41, 0x42, 0x43, 0x44]), { layer: 'significance' });
  assert.equal(s.layer, 'significance');            // available now — no fallback to structure
  assert.equal(s.legendKind, 'gradient');
  assert.ok(Array.isArray(s.gradient) && s.gradient.length >= 2);
  // every covered pixel is the ramp's flat (zero) colour — a signal-less significance layer is honest, not blank
  const flat = SIGNIFICANCE_STOPS[0].color;
  for (let p = 0; p < s.cells; p++) {
    const i = p * 4;
    if (s.pixels[i + 3] !== 255) continue;          // uncovered tail
    assert.deepEqual([s.pixels[i], s.pixels[i + 1], s.pixels[i + 2]], [...flat]);
  }
});

test('buildScene: significance WITH a signal paints the ramp — a turned byte is brighter than a flat one', () => {
  const bytes = new Uint8Array([0x41, 0x42, 0x43, 0x44]);   // 4 bytes → side 2, one byte per pixel
  const signal = new Float32Array([0, 0, 1, 0]);            // byte 2 is the turn
  const s = buildScene(bytes, { layer: 'significance', signal });
  assert.equal(s.layer, 'significance');
  // byte 0 (signal 0) lands at d2xy(2,0); byte 2 (signal 1) at d2xy(2,2). The turn is the ramp's bright end.
  const px = (d) => { const [x, y] = d2xy(2, d); const i = (y * 2 + x) * 4; return [s.pixels[i], s.pixels[i + 1], s.pixels[i + 2]]; };
  assert.deepEqual(px(0), [...SIGNIFICANCE_STOPS[0].color]);
  assert.deepEqual(px(2), [...SIGNIFICANCE_STOPS[SIGNIFICANCE_STOPS.length - 1].color]);
  // brightness (sum of channels) strictly increases from the flat byte to the turned one
  const sum = (c) => c[0] + c[1] + c[2];
  assert.ok(sum(px(2)) > sum(px(0)), 'the turn is brighter than the flat run');
});
