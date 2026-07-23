// surfer/holons.js — detectHolons/holarchy, now routed through core/segment.js
// (docs/segment-by-significance.md, F-holon-null). Two former reinventions removed:
// a caller-hardcoded lens count (now DEF-derived via segmentGroups) and an
// unconditional lens-switch-is-a-boundary rule with only a fixed minLen absorb (now
// null-gated via segmentSwitches, minRun demoted to the cold-start fallback).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { detectHolons, holarchy } from '../src/surfer/holons.js';

// Two clean casts (5 named figures each, so there is enough dimension for DEF's own
// gap-null to clear MIN_SAMPLES) with one ambiguous, mixed-cast unit at the seam —
// a genuine flicker (a mention of both casts together), not a clean switch.
const buildDoc = () => {
  const log = createLog({ docId: 'toy' });
  const castA = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const castB = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const labels = new Map();
  for (const id of [...castA, ...castB]) labels.set(id, id.toUpperCase());

  // Scene A: units 0-14, cast A on stage every unit — a clean, confident direction.
  for (let u = 0; u < 15; u++) for (const id of castA) log.append({ op: 'INS', id, label: labels.get(id), sentIdx: u });
  // The seam: unit 15 mentions BOTH casts together — an ambiguous, mixed direction,
  // not a clean switch to scene B.
  for (const id of [castA[0], castB[0]]) log.append({ op: 'INS', id, label: labels.get(id), sentIdx: 15 });
  // Scene B: units 16-30, cast B on stage every unit — a clean, confident direction.
  for (let u = 16; u < 31; u++) for (const id of castB) log.append({ op: 'INS', id, label: labels.get(id), sentIdx: u });

  const admission = { labelOf: (id) => labels.get(id) || null, signals: () => null };
  return { log, admission, units: new Array(31).fill(0), sentences: new Array(31).fill(0) };
};

test('detectHolons: k is derived from the spectrum, not a caller-supplied constant', () => {
  const doc = buildDoc();
  const r = detectHolons(doc, { maxK: 8 });
  assert.equal(r.abstain, false, 'two clean, well-separated casts should not abstain to one reading');
  assert.ok(r.k >= 2, `expected a real multi-reading split, got k=${r.k}`);
  assert.ok(r.k <= 8, 'k never exceeds the caller-supplied cap');
});

test('detectHolons: the real cast turnover is a boundary', () => {
  const doc = buildDoc();
  const r = detectHolons(doc, { maxK: 8 });
  // The two scenes are cleanly separated casts; SOME boundary should land at or near
  // the seam (15/16), not scattered arbitrarily across the clean interiors.
  const nearSeam = r.boundaries.some((b) => b >= 14 && b <= 17);
  assert.ok(nearSeam, `expected a boundary near the scene seam, got ${JSON.stringify(r.boundaries)}`);
});

test('detectHolons: the mixed-cast seam unit is not asserted as its own one-unit holon', () => {
  const doc = buildDoc();
  const r = detectHolons(doc, { maxK: 8 });
  // A genuinely ambiguous single unit should be absorbed into a neighboring holon
  // (carried), not stand alone as a scene of one — the null-gated switch replaces the
  // old fixed minLen rule, but the same "a flicker is not a scene" property should
  // still hold for one ambiguous unit.
  const oneUnitHolons = r.holons.filter((h) => h.units === 1);
  assert.equal(oneUnitHolons.length, 0, `expected no singleton holons, got ${JSON.stringify(oneUnitHolons)}`);
});

test('detectHolons: every unit in range is covered by exactly one holon', () => {
  const doc = buildDoc();
  const r = detectHolons(doc, { maxK: 8 });
  const covered = r.holons.reduce((n, h) => n + h.units, 0);
  assert.equal(covered, 31, 'the holons partition the full range, including the leading/seam units');
});

test('detectHolons: a single flat cast (one reading) abstains to k=1, one holon', () => {
  const log = createLog({ docId: 'flat' });
  const cast = ['x1', 'x2', 'x3'];
  for (let u = 0; u < 20; u++) for (const id of cast) log.append({ op: 'INS', id, label: id, sentIdx: u });
  const doc = { log, admission: { labelOf: (id) => id, signals: () => null }, units: new Array(20).fill(0) };
  const r = detectHolons(doc, { maxK: 8 });
  assert.equal(r.k, 1);
  assert.equal(r.abstain, true);
  assert.equal(r.holons.length, 1, 'a flat spectrum yields one holon spanning the whole range, not an invented split');
});

test('holarchy: coarse/fine both derive their own k, not two hardcoded counts', () => {
  const doc = buildDoc();
  const h = holarchy(doc, { coarseMaxK: 8, fineMaxK: 6 });
  assert.ok(h.coarse.k >= 1);
  assert.equal(h.levels.length, h.coarse.holons.length);
  for (const level of h.levels) assert.ok(Array.isArray(level.children));
});

test('detectHolons: holon prototypes carry Ground-column prior, not only Figure cast', () => {
  const doc = buildDoc();
  doc.log.append({ op: 'CON', src: 'a1', tgt: 'a2', via: 'holds-with', sentIdx: 1 });
  const r = detectHolons(doc, { maxK: 8 });
  const later = r.holons.find((h) => h.lo > 0) || r.holons.at(-1);
  assert.ok(later.prototype, 'a holon carries a Site-face prototype');
  assert.ok(later.prototype.grains.Figure > 0, 'the original Figure-grain cast shadow remains');
  assert.ok(later.prototype.groundPrior.Void > 0, 'the Void/NOVELTY prior channel is wired in');
  assert.ok(later.prototype.groundPrior.Field > 0, 'the Field/bond prior channel is wired in');
  assert.ok(later.prototype.groundPrior.Atmosphere > 0, 'the Atmosphere/proposition prior channel is wired in');
});
