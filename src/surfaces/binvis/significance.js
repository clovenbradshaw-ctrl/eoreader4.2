// EO: SIG(Lens → Lens, Tending) — the significance layer's colour ramp (the reading's own heat)
// binvis's third view — the one keyed to MEANING rather than to the raw bytes. Where the
// structure layer paints byte class and the entropy layer paints local Shannon entropy, the
// significance layer paints a caller-supplied per-byte SIGNAL in [0, 1]: how much the reading
// the perceiver maintains turned at that position. This module owns only the colour of that
// signal, exactly as entropy.js owns the entropy ramp — it stays modality-blind and reads no
// Reading. The signal itself is derived one storey up, in the reader room (binvis-surface.js),
// which is the one place allowed to know a Reading (the Void/Entity boundary the spec draws).
//
// The ramp is the app's own indigo → violet → magenta glow, chosen to read differently from
// entropy's warm red/gold heat: dark slate where the reading ran flat, brightening through the
// reader's signature accent to near-white at the sharpest turns.

// The significance heat ramp — ordered stops, interpolated linearly. Exported for the legend
// scale, like ENTROPY_STOPS.
export const SIGNIFICANCE_STOPS = Object.freeze([
  Object.freeze({ at: 0.00, color: Object.freeze([18, 20, 34]) }),     // slate — the reading ran flat here
  Object.freeze({ at: 0.35, color: Object.freeze([58, 48, 140]) }),    // deep indigo — a stirring
  Object.freeze({ at: 0.62, color: Object.freeze([123, 84, 230]) }),   // violet — the reader's own accent
  Object.freeze({ at: 0.82, color: Object.freeze([214, 90, 190]) }),   // magenta — a turn
  Object.freeze({ at: 1.00, color: Object.freeze([250, 240, 255]) }),  // near-white — the sharpest turn
]);

// significance s ∈ [0,1] → an RGB triple on the ramp. Clamps its input; lands exactly on the
// endpoints. Mirrors entropyColor so the two layers share one legend shape without sharing code.
export const significanceColor = (s) => {
  const t = s <= 0 ? 0 : s >= 1 ? 1 : s;
  let lo = SIGNIFICANCE_STOPS[0], hi = SIGNIFICANCE_STOPS[SIGNIFICANCE_STOPS.length - 1];
  for (let i = 1; i < SIGNIFICANCE_STOPS.length; i++) {
    if (t <= SIGNIFICANCE_STOPS[i].at) { lo = SIGNIFICANCE_STOPS[i - 1]; hi = SIGNIFICANCE_STOPS[i]; break; }
  }
  const span = hi.at - lo.at || 1;
  const f = (t - lo.at) / span;
  return [
    Math.round(lo.color[0] + (hi.color[0] - lo.color[0]) * f),
    Math.round(lo.color[1] + (hi.color[1] - lo.color[1]) * f),
    Math.round(lo.color[2] + (hi.color[2] - lo.color[2]) * f),
  ];
};
