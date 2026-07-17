// EO: SIG·SEG(Field → Network, Tending,Dissecting) — cluster-based referent
// detection, shared verbatim by the audio and tabular perceivers
// (docs/omnimodal-waveform.md §4.2/§4.3). A recurring/sustained field signature
// is a "referent" — a motif, a tracked weather regime — regardless of what the
// field's components mean. Nothing here is audio- or weather-specific: it is
// pure vector clustering over `field` + `metric`, exactly the same computation
// echo.js already makes for motif recurrence, one level up (a cluster instead
// of a pairwise match).

import { boundedNull } from '../../core/index.js';
import { ROLES } from '../contract.js';

const median = (xs) => {
  const s = xs.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

// The membership radius — derived from the document's OWN consecutive-unit
// distances (a Born line, never a hand-set constant): "how different are
// typically-adjacent units" sets how different two units must be before they
// no longer read as the same recurring pattern.
export const deriveClusterRadius = (units, metric, { alpha = 0.2 } = {}) => {
  const dists = [];
  for (let i = 1; i < units.length; i++) dists.push(metric(units[i - 1].field, units[i].field));
  const line = boundedNull(dists, { alpha, ceiling: Infinity, fallback: median(dists) });
  return Number.isFinite(line) ? line : median(dists);
};

// Single-pass nearest-centroid online clustering, in unit order — a new
// cluster spawns only when nothing existing is close enough (within
// `radius`); otherwise the unit folds into its nearest cluster and the
// centroid updates as a running mean. Clusters with fewer than `minMembers`
// are dropped before they ever reach the cast — a true one-off is not a
// recurring referent, the same discipline that keeps a passing common noun
// off the descriptor channel in text.
export const clusterUnits = (units, metric, radius, { minMembers = 2 } = {}) => {
  const clusters = [];
  units.forEach((u, i) => {
    let best = -1, bestDist = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      const d = metric(u.field, clusters[c].centroid);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    if (best >= 0 && bestDist <= radius) {
      const cl = clusters[best];
      const n = cl.count + 1;
      cl.centroid = cl.centroid.map((x, d) => (x * cl.count + u.field[d]) / n);
      cl.count = n;
      cl.members.push(i);
    } else {
      clusters.push({ centroid: u.field.slice(), count: 1, members: [i] });
    }
  });
  return clusters.filter((c) => c.members.length >= minMembers);
};

// referentsAndSightingsFromClusters — the omnimodal mapping onto the three
// roles. Each unit's OWN nearest surviving cluster is its FOREGROUND sighting
// (the identity this unit most IS); any OTHER cluster whose signature is still
// measurable in this unit, at looser multiples of the same radius, is PRESENT
// (moderate) or LATENT (weak but real — a system "building offscreen", a theme
// only harmonically implied). Bands are multiples of the document's own
// derived radius, never independent constants.
export const referentsAndSightingsFromClusters = (units, metric, clusters, radius, opts = {}) => {
  const {
    keyPrefix = 'cluster', displayPrefix = 'motif',
    presentBand = 1.5, latentBand = 2.5,
  } = opts;
  const referents = clusters.map((c, i) => ({ key: `${keyPrefix}-${i}`, display_name: `${displayPrefix} ${i + 1}` }));
  const sightings = [];
  units.forEach((u, i) => {
    if (!clusters.length) return;
    const dists = clusters.map((c) => metric(u.field, c.centroid));
    let nearest = 0;
    for (let c = 1; c < dists.length; c++) if (dists[c] < dists[nearest]) nearest = c;
    dists.forEach((d, ci) => {
      const key = referents[ci].key;
      if (ci === nearest && d <= radius * latentBand) {
        sightings.push({ referent: key, ordinal: i, role: ROLES.FOREGROUND, evidence: 1 });
      } else if (d <= radius * presentBand) {
        sightings.push({ referent: key, ordinal: i, role: ROLES.PRESENT, evidence: 0.6 });
      } else if (d <= radius * latentBand) {
        sightings.push({ referent: key, ordinal: i, role: ROLES.LATENT, evidence: 0.3 });
      }
    });
  });
  return { referents, sightings };
};
