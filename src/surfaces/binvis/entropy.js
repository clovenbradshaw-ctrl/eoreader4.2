// EO: SIG(Lens → Lens, Tending) — the entropy layer (the other binvis view, unchanged)
// binvis.io's second colour scheme: colour each byte by the *local* Shannon entropy of a
// window around it, so compressed / encrypted / packed regions — where every byte value is
// about equally likely — glow, and low-variety regions (text, padding, tables) stay dark.
// We reproduce the idea; we do not invent it.
//
// windowedEntropy walks a fixed-width window down the file and reports, for every byte, the
// entropy of the window anchored at it, normalised to [0, 1] (bits / 8). It is O(n): the
// window's symbol histogram and the running Σ k·log2(k) are maintained incrementally, so no
// step recomputes the sum from scratch.

// bytes → Float32Array of per-byte local entropy in [0, 1]. `window` is the number of bytes
// each reading sees (clamped to the file length).
export const windowedEntropy = (bytes, { window = 256 } = {}) => {
  const n = bytes.length;
  const out = new Float32Array(n);
  if (!n) return out;
  const W = Math.max(1, Math.min(window, n));
  const L = new Float64Array(W + 1);              // L[k] = k·log2(k), the entropy term for a count of k
  for (let k = 1; k <= W; k++) L[k] = k * Math.log2(k);
  const count = new Uint32Array(256);
  let S = 0, N = 0;                               // S = Σ L[count[b]] over the window; N = bytes in it
  const bump = (b, d) => { S -= L[count[b]]; count[b] += d; S += L[count[b]]; N += d; };
  for (let j = 0; j < W; j++) bump(bytes[j], 1);  // prime the window [0, W)
  const ent = () => (N > 0 ? (Math.log2(N) - S / N) / 8 : 0);   // H = log2 N − (1/N)Σ k·log2 k, in [0,8] → /8
  out[0] = ent();
  for (let i = 1; i < n; i++) {                   // window at i is [i, i+W): drop the left byte, add the new right one
    bump(bytes[i - 1], -1);
    const ri = i - 1 + W;
    if (ri < n) bump(bytes[ri], 1);
    out[i] = ent();
  }
  return out;
};

// The entropy heat ramp — dark/cool at low entropy, bright/warm at high, so packed regions
// read as glowing blocks. Ordered stops interpolated linearly; exported for the legend scale.
export const ENTROPY_STOPS = Object.freeze([
  Object.freeze({ at: 0.00, color: Object.freeze([15, 16, 38]) }),
  Object.freeze({ at: 0.40, color: Object.freeze([72, 32, 120]) }),
  Object.freeze({ at: 0.70, color: Object.freeze([202, 70, 62]) }),
  Object.freeze({ at: 0.90, color: Object.freeze([240, 180, 52]) }),
  Object.freeze({ at: 1.00, color: Object.freeze([250, 250, 212]) }),
]);

// entropy e ∈ [0,1] → an RGB triple on the ramp.
export const entropyColor = (e) => {
  const t = e <= 0 ? 0 : e >= 1 ? 1 : e;
  let lo = ENTROPY_STOPS[0], hi = ENTROPY_STOPS[ENTROPY_STOPS.length - 1];
  for (let i = 1; i < ENTROPY_STOPS.length; i++) {
    if (t <= ENTROPY_STOPS[i].at) { lo = ENTROPY_STOPS[i - 1]; hi = ENTROPY_STOPS[i]; break; }
  }
  const span = hi.at - lo.at || 1;
  const f = (t - lo.at) / span;
  return [
    Math.round(lo.color[0] + (hi.color[0] - lo.color[0]) * f),
    Math.round(lo.color[1] + (hi.color[1] - lo.color[1]) * f),
    Math.round(lo.color[2] + (hi.color[2] - lo.color[2]) * f),
  ];
};
