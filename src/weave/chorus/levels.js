// EO: SEG·SIG(Field,Network → Network, Unraveling,Tracing) — level governor, sketch
// Levels as rotated bases — the level governor (docs/chorus.md, "Levels as
// rotated bases").
//
// Holonic ascent is a change of basis, because the domain rotates: what a reading
// measures as Significance at one level it measures as Existence one level up.
// REC is the basis transform. THIS IS A PROJECTION SKETCH, not a measured result:
// it follows from the axis structure and the edge argument, and a projection loses
// a dimension, so it is marked as a sketch wherever it drives code.
//
// The consequence is the level governor. Do not enumerate levels. Ascend while
// REC-strain is high — while the rotation keeps redistributing mass across cells.
// Stop when a further rotation leaves the distribution roughly fixed, because the
// level above is then telling you nothing the level below did not. This is the
// same shape as the coverage budget on the cell axis (governor.js): instantiate
// only what the material lights up, on both axes.
//
// OPEN RISK (docs/chorus.md, "What this does not achieve"): the level governor
// reuses the existing strain signal but has NOT been shown to terminate cleanly on
// real corpora. Callers must bound the ascent (maxLevels) so a non-converging
// rotation cannot loop forever.

// REC-strain between two successive level distributions — how much the rotation
// redistributes mass across cells. Total-variation distance over the shared cell
// keys: 0 when the level above leaves the distribution fixed (nothing new), up to
// 1 when it moves all the mass. This reuses the distributional-distance shape the
// surprise gradient already computes; it is the strain the governor thresholds.
//
// SKETCH: this measures redistribution, which the rotation causes, but does not
// itself perform the REC basis transform — that is the dimension the projection
// loses. Read the number as "the level moved the mass this much", not as a proof
// the rotation is REC.
export const recStrain = (distA, distB) => {
  const asMap = (cells) => {
    const m = {};
    for (const c of (cells || [])) m[c.key] = (m[c.key] || 0) + (c.weight || 0);
    return m;
  };
  const a = asMap(distA), b = asMap(distB);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  let tv = 0;
  for (const k of keys) tv += Math.abs((a[k] || 0) - (b[k] || 0));
  return tv / 2;
};

// The level governor: ascend while REC-strain stays above the floor, stop when a
// further rotation leaves the distribution roughly fixed. `levels` is an ordered
// array of cube distributions, lowest first (the caller produces them — this
// module does not know how to rotate a basis; that is the surfer's job). Returns
// the prefix of levels that earned their place, plus the strain at each step.
//
// `strainFloor` is the readable knob (like coverage on the cell axis). `maxLevels`
// is the hard bound the open risk demands — the governor never ascends past it,
// even if the strain never settles.
export const ascendWhile = (levels, { strainFloor = 0.05, maxLevels = 8 } = {}) => {
  const kept = [];
  const strains = [];
  const seq = (levels || []).slice(0, maxLevels);
  for (let i = 0; i < seq.length; i++) {
    if (i === 0) { kept.push(seq[i]); continue; }
    const strain = recStrain(seq[i - 1], seq[i]);
    strains.push(strain);
    if (strain < strainFloor) break;   // the rotation told us nothing new → stop
    kept.push(seq[i]);
  }
  return Object.freeze({
    levels: Object.freeze(kept),
    depth: kept.length,
    strains: Object.freeze(strains),
    strainFloor,
    // Whether the ascent stopped on its own (strain settled) or hit the bound —
    // the open risk made visible, never hidden.
    terminatedByStrain: kept.length < seq.length,
    hitMaxLevels: kept.length >= maxLevels && seq.length >= maxLevels,
    sketch: true,
  });
};
