// EO: SEG(Network,Kind → Field, Dissecting) — reconcile demand and supply
// RECONCILE → the section plan (SEG, §5.3).
//
// Demand (scopeClass) and supply (clusters) meet here. The coverage policy
// selects HOW MUCH of the total mass the plan must cover; demand then OVERRIDES
// supply only to cap it — `point` always collapses to one section, never pads.
// The result is an ordered list of sections, each with its own span set and its
// own floor/ceiling read off its evidence.

import { COVERAGE_CUT, FLOOR_TOKENS, MAX_SECTIONS, ceilingFor } from './constants.js';

// The coverage cut over clusters ordered strongest-first.
//   terse      — the single strongest cluster
//   standard   — clusters until cumulative mass ≥ COVERAGE_CUT · total
//   exhaustive — every cluster (all are already above BIND_THRESHOLD)
const coverageCut = (byMass, totalMass, coverage) => {
  if (coverage === 'terse') return byMass.slice(0, 1);
  if (coverage === 'exhaustive') return byMass.slice();
  // standard
  const out = [];
  let cum = 0;
  for (const c of byMass) {
    out.push(c);
    cum += c.mass;
    if (totalMass > 0 && cum >= COVERAGE_CUT * totalMass) break;
  }
  return out;
};

// reconcile — demand caps supply, it does not pad it (§5.3).
//   point                    → 1
//   list / survey / compare  → the coverage-selected count, bounded by supply
// The returned count is always ≤ the number of clusters above threshold
// (invariant 3: bounded by supply) and ≤ MAX_SECTIONS (the runaway guard).
export const reconcile = (scopeClass, selectedCount, clusterCount, { maxSections = MAX_SECTIONS } = {}) => {
  if (scopeClass === 'point') return Math.min(1, clusterCount);
  return Math.min(selectedCount, clusterCount, maxSections);
};

// survey reads in document order (its sections are a tour of the whole text);
// every other scope reads strongest-first (the best answer leads). §11.2 left
// this in the plan rather than as a global rule — this is where it lives.
const orderFor = (scopeClass) => (scopeClass === 'survey' ? 'position' : 'mass');

export const planSections = ({ scopeClass, clusters, totalMass, coverage = 'standard', maxSections = MAX_SECTIONS }) => {
  const byMass = [...clusters].sort((a, b) => b.mass - a.mass);
  const selected = coverageCut(byMass, totalMass, coverage);
  const count = reconcile(scopeClass, selected.length, clusters.length, { maxSections });

  // `point` always takes the single strongest cluster; otherwise the coverage
  // selection, truncated to the reconciled count.
  let chosen = (scopeClass === 'point' ? byMass : selected).slice(0, count);

  const order = orderFor(scopeClass);
  if (order === 'position') chosen = [...chosen].sort((a, b) => a.anchorIdx - b.anchorIdx);

  const sections = chosen.map(c => ({
    subClaim: c.centroidHint,           // a retrieval-derived topic hint, not a generated claim
    spanSet:  c.spanSet,
    spans:    c.spans,
    mass:     c.mass,
    floor:    FLOOR_TOKENS,
    ceiling:  ceilingFor(c),
  }));

  return { sections, order, coverageSelected: selected.length, clusterCount: clusters.length };
};
