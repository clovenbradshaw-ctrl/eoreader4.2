// EO: SIG(Lens → Lens, Tending) — the space-filling curve (the prior art, unchanged)
// This is Aldo Cortesi's binvis technique at its root: lay a file's bytes down a
// Hilbert curve so that adjacency in the file stays adjacency on the plane. We do NOT
// reinvent it — this is the standard Hilbert d2xy / xy2d pair (Wikipedia, "Hilbert
// curve"; Cortesi, "Visualizing binaries with space-filling curves", binvis.io).
//
// A Hilbert curve on a side×side grid (side a power of two) visits every cell exactly
// once. `d2xy` maps a distance-along-the-curve `d ∈ [0, side²)` to its (x, y); `xy2d`
// is the exact inverse, so a hover on a pixel can name the byte offset under it. Both
// are pure and allocation-free per call.

// Smallest power of two whose square covers `n` cells, clamped to [minSide, maxSide].
// The clamp is what makes the surface finite for huge files: past maxSide² cells each
// pixel aggregates a bucket of bytes (render.strict.js), exactly as binvis samples down
// a file too large to give one pixel per byte.
export const sideFor = (n, { minSide = 1, maxSide = 512 } = {}) => {
  let side = 1;
  while (side * side < Math.max(1, n) && side < maxSide) side *= 2;
  return Math.max(minSide, Math.min(maxSide, side));
};

// distance d → (x, y) on a Hilbert curve of the given side (side a power of two).
export const d2xy = (side, d) => {
  let rx, ry, t = d, x = 0, y = 0;
  for (let s = 1; s < side; s *= 2) {
    rx = 1 & (t >> 1);
    ry = 1 & (t ^ rx);
    if (ry === 0) {                        // rotate the quadrant into canonical orientation
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
};

// (x, y) → distance d on a Hilbert curve of the given side. Exact inverse of d2xy.
export const xy2d = (side, x, y) => {
  let rx, ry, d = 0;
  for (let s = side >> 1; s > 0; s >>= 1) {
    rx = (x & s) > 0 ? 1 : 0;
    ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    // rotate
    if (ry === 0) {
      if (rx === 1) { x = s - 1 - x; y = s - 1 - y; }
      const tmp = x; x = y; y = tmp;
    }
  }
  return d;
};
