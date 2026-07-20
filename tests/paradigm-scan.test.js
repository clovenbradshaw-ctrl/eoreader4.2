// structuralParadigmScan — WHERE within a document a paradigm shift happens (docs/referents-
// recursed-up-the-domain-axis.md D4). The frame-scatter probe's M3 measured incommensurability
// firing cross-document but never within one document at a fixed thirds split; this is the
// finer-grained, localized version, verified here on synthetic data and against real texts in
// probes/frame-scatter-genres.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { structuralParadigmScan, OPS } from '../src/surfer/structure-basis.js';

const spike = (i) => { const v = new Array(9).fill(0); v[i] = 3; return v; };

test('empty/too-short input returns the empty shape, never throws', () => {
  assert.deepEqual(structuralParadigmScan([], OPS), { windows: 0, series: [], shifts: [], baseline: 0, bar: 0 });
  const tiny = Array(5).fill(0).map(() => spike(0));
  assert.equal(structuralParadigmScan(tiny, OPS, { window: 60 }).windows, 0);
});

test('a document with ONE register throughout finds no shift (low baseline, nothing clears it)', () => {
  const profiles = Array(400).fill(0).map(() => spike(4));   // CON-only throughout
  const scan = structuralParadigmScan(profiles, OPS, { window: 60, stride: 30 });
  assert.equal(scan.shifts.length, 0, 'a uniform register has nothing to shift between');
});

// A deterministic per-row perturbation (no Math.random — a committed test must be repeatable)
// so the density matrix has full rank and a well-defined top eigenbasis instead of the
// degenerate arbitrary-null-space eigenvectors a literal repeated-row rank-1 input produces.
const jitter = (base, i) => base.map((v, k) => v + 0.25 * Math.sin(i * 0.9 + k * 1.3));

test('a document that turns from one register to a genuinely different one is found, located, and named', () => {
  // First half is dominated by NUL(+SEG); second half by SEG(+DEF) — sharing SEG so the two
  // directions are non-orthogonal (two projectors onto ORTHOGONAL subspaces always commute,
  // which a naive disjoint-axis test would miss entirely — see lens-naming.test.js).
  const before = Array(300).fill(0).map((_, i) => jitter([3, 1, 0, 0, 0, 0, 0, 0, 0], i));
  const after = Array(300).fill(0).map((_, i) => jitter([0, 1, 3, 0, 0, 0, 0, 0, 0], i));
  const profiles = [...before, ...after];
  const scan = structuralParadigmScan(profiles, OPS, { window: 120, stride: 60, lag: 1, hyst: 1.3 });
  assert.ok(scan.shifts.length > 0, 'a genuine register change clears the baseline somewhere');
  // the located shift(s) should straddle the true turn at index 300
  const straddles = scan.shifts.some((s) => s.at < 300 && s.to > 300);
  assert.ok(straddles, `no detected shift straddles the true turn at 300: ${JSON.stringify(scan.shifts.map(s => [s.at, s.to]))}`);
  const withLabel = scan.shifts.find((s) => s.label);
  assert.ok(withLabel, 'at least one detected shift names what changed');
});

test('every series entry (not just shifts) carries a position and a measured scalar, so the caller can see near-misses too', () => {
  const before = Array(200).fill(0).map((_, i) => jitter([3, 1, 0, 0, 0, 0, 0, 0, 0], i));
  const after = Array(200).fill(0).map((_, i) => jitter([0, 1, 3, 0, 0, 0, 0, 0, 0], i));
  const scan = structuralParadigmScan([...before, ...after], OPS, { window: 100, stride: 50 });
  assert.ok(scan.series.length > 0);
  for (const s of scan.series) {
    assert.ok(Number.isFinite(s.at) && Number.isFinite(s.to));
    assert.ok(Number.isFinite(s.incommensurability));
    assert.equal(typeof s.real, 'boolean');
  }
});

test('lag controls how far apart the compared windows are', () => {
  const profiles = Array(400).fill(0).map((_, i) => spike(i % 9));
  const lag1 = structuralParadigmScan(profiles, OPS, { window: 60, stride: 30, lag: 1 });
  const lag3 = structuralParadigmScan(profiles, OPS, { window: 60, stride: 30, lag: 3 });
  assert.ok(lag1.series.length > lag3.series.length, 'a larger lag leaves fewer comparable pairs');
});
