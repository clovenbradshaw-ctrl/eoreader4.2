import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slotGain, kindGain, deriveKindNull, formKind, detectSplit } from '../src/perceiver/shared/kind.js';

// KIND FORMATION VIA HOISTING — a Kind is a DEF whose subject is a set: fit every slot
// against the population's own marginal, hoist the ones a local header compresses better
// than the population baseline, and Born-gate the whole set against a permutation null of
// same-size random draws. See src/perceiver/shared/kind.js for the derivation.

// A deterministic LCG for test fixtures needing spread-out background values — no
// dependency on the module's own internal rng, and no Math.random in a test file.
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };

// A background pool: 40 unrelated invoice-like records spread widely on amount and vendor
// (15 vendors), plus a source-batch label that varies per record — the "everyone" baseline
// every gain measurement below is read against.
const rand = lcg(7);
const background = Array.from({ length: 40 }, (_, i) => ({
  id: `bg-${i}`,
  slots: {
    amount: 100 + Math.floor(rand() * 9000),
    vendor: `Vendor${i % 15}`,
    sourceFile: `batch-${i % 5}`,
  },
}));

// A real candidate group: six invoices all from Acme, all near $500, dropped in the SAME
// upload batch (batch-9 — a value no background record carries, exactly the "arrived
// together" provenance signal the module must not treat as constitutive).
const group = [498, 502, 500, 505, 495, 503].map((amount, i) => ({
  id: `g-${i}`,
  slots: { amount, vendor: 'Acme', sourceFile: 'batch-9' },
}));

const population = background.concat(group);

// ── Assembly 1 — slotGain: one slot's MDL model ─────────────────────────────

test('slotGain: a tight local cluster on a diffuse population slot scores positive gain', () => {
  const g = slotGain(group, population, 'amount');
  assert.ok(g.gain > 0, 'six invoices within $10 of each other compress under a local header');
  assert.ok(Math.abs(g.headerValue - 500) < 5, 'the header value is the local mean');
  assert.equal(g.type, 'numeric');
});

test('slotGain: a categorical slot the whole group shares scores positive gain, header is the shared value', () => {
  const g = slotGain(group, population, 'vendor');
  assert.ok(g.gain > 0, 'six invoices that all say Acme compress under a local header');
  assert.equal(g.headerValue, 'Acme');
  assert.equal(g.matchRate, 1);
});

test('slotGain: a slot whose local spread matches the population spread scores no better than the header cost', () => {
  // Same amounts as the background's own spread, read under the 'amount' key so the local
  // fit is forced to as wide a distribution as the population it is compared against.
  const wideGroup = [120, 4000, 8900, 300, 7000, 1500].map((amount, i) => ({
    id: `w-${i}`, slots: { amount, vendor: 'Acme' },
  }));
  const g = slotGain(wideGroup, population, 'amount');
  assert.ok(g.gain <= 0, 'no real narrowing over the population baseline, so hoisting does not pay for itself');
});

test('slotGain: fewer than two values on either side abstains (returns null), never a fabricated zero', () => {
  assert.equal(slotGain([{ id: 'a', slots: { x: 1 } }], population, 'x'), null, 'one local value cannot fit a local model');
  assert.equal(slotGain(group, [{ id: 'p', slots: { y: 1 } }], 'y'), null, 'one population value cannot fit a population model');
});

// ── Assembly 2 — kindGain: total compression across every slot ─────────────

test('kindGain: sums only the slots whose own gain is positive', () => {
  const noisyGroup = group.map((m, i) => ({
    id: m.id, slots: { ...m.slots, noise: [120, 4000, 8900, 300, 7000, 1500][i] },
  }));
  const { total, perSlot } = kindGain(noisyGroup, population.map((m) => ({ ...m, slots: { ...m.slots } })), ['amount', 'vendor', 'noise']);
  assert.ok(perSlot.amount.gain > 0 && perSlot.vendor.gain > 0, 'both real slots are modelled with positive gain');
  const positiveSum = perSlot.amount.gain + perSlot.vendor.gain;
  assert.ok(Math.abs(total - positiveSum) < 1e-9, 'total excludes the non-positive noise slot entirely');
});

// ── Assembly 3 — deriveKindNull: the set-level Born line ────────────────────

test('deriveKindNull: abstains (Infinity) when the population cannot supply a group of the requested size', () => {
  const threshold = deriveKindNull([{ id: 'a', slots: { x: 1 } }], 5, ['x']);
  assert.equal(threshold, Infinity);
});

test('deriveKindNull: a real coherent group clears the line a same-size random draw would score', () => {
  const keys = ['amount', 'vendor'];
  const threshold = deriveKindNull(population, group.length, keys, { trials: 150, rng: lcg(42) });
  assert.ok(Number.isFinite(threshold), 'a 46-record population easily supports the permutation background');
  const { total } = kindGain(group, population, keys);
  assert.ok(total > threshold, 'the real Acme/$500 cluster scores far above what a random 6-record draw scores by chance');
});

test('deriveKindNull: a random same-size draw from the population usually does NOT clear its own line', () => {
  const keys = ['amount', 'vendor'];
  const threshold = deriveKindNull(population, 6, keys, { trials: 150, rng: lcg(1) });
  const randomSample = background.slice(0, 6);   // six unrelated background records, no shared vendor/amount
  const { total } = kindGain(randomSample, population, keys);
  assert.ok(total <= threshold, 'six unrelated records score no better than chance');
});

// ── Assembly 4 — formKind: the whole verdict ────────────────────────────────

test('formKind: a real group holds, hoists vendor+amount into the header, and provenance stays incidental', () => {
  const kind = formKind(group, {
    population, provenanceSlots: ['sourceFile'], trials: 150, rng: lcg(3),
  });
  assert.equal(kind.holds, true, 'the Acme/$500 cluster clears the permutation line');
  assert.ok('vendor' in kind.header, 'vendor is constitutive');
  assert.ok('amount' in kind.header, 'amount is constitutive');
  assert.ok(!('sourceFile' in kind.header), 'the shared upload batch never enters the constitutive header');
  assert.ok('sourceFile' in kind.incidental, 'it is still reported — as incidental, not constitutive');
});

test('formKind: without the provenance flag, a shared batch label still hoists — into the header', () => {
  const kind = formKind(group, { population, trials: 150, rng: lcg(3) });
  assert.ok('sourceFile' in kind.header, 'unflagged, a genuinely constant slot hoists like any other');
});

test('formKind: a random, incoherent group does not hold', () => {
  const randomGroup = background.slice(10, 16);   // six unrelated background records
  const kind = formKind(randomGroup, { population, trials: 150, rng: lcg(9) });
  assert.equal(kind.holds, false, 'no shared structure beyond what a random draw would show');
});

test('formKind: varying slots carry a per-member residual', () => {
  const driftGroup = [498, 540, 500, 460, 495, 503].map((amount, i) => ({
    id: `d-${i}`, slots: { amount, vendor: i < 5 ? 'Acme' : 'Bolt', sourceFile: 'batch-9' },
  }));
  const kind = formKind(driftGroup, { population, provenanceSlots: ['sourceFile'], trials: 150, rng: lcg(5) });
  if (kind.varying.includes('vendor')) {
    assert.equal(kind.residual['d-5'].vendor, 'Bolt', 'the one deviant member carries its own value as residual');
  }
});

// ── Assembly 5 — detectSplit: is one Kind secretly two? ─────────────────────

test('detectSplit: a numeric slot with two well-separated clusters splits', () => {
  const twoClusters = [100, 105, 110, 95, 102, 9000, 9050, 8950, 9100, 9010].map((amount, i) => ({
    id: `s-${i}`, slots: { amount },
  }));
  const r = detectSplit(twoClusters, 'amount');
  assert.equal(r.split, true);
  assert.equal(r.groups.length, 2);
  assert.equal(r.groups[0].length + r.groups[1].length, 10);
});

test('detectSplit: a numeric slot with one tight cluster does not split', () => {
  const oneCluster = [100, 102, 98, 101, 99, 103].map((amount, i) => ({ id: `o-${i}`, slots: { amount } }));
  const r = detectSplit(oneCluster, 'amount');
  assert.equal(r.split, false);
});

test('detectSplit: too few values abstains', () => {
  const r = detectSplit([{ id: 'a', slots: { amount: 1 } }, { id: 'b', slots: { amount: 2 } }], 'amount');
  assert.equal(r.split, false);
});

test('detectSplit: a categorical slot with two rival modes over a noise tail splits', () => {
  const counts = { A: 15, B: 14, C: 10, D: 9, E: 7, F: 3, G: 2, H: 1 };
  const members = [];
  let n = 0;
  for (const [v, c] of Object.entries(counts)) for (let i = 0; i < c; i++) members.push({ id: `c-${n++}`, slots: { tag: v } });
  const r = detectSplit(members, 'tag');
  assert.equal(r.split, true);
  assert.ok(r.groups[0].length > 0 && r.groups[1].length > 0);
});

test('detectSplit: a categorical slot with one dominant mode and a thin noise tail does not split', () => {
  const counts = { A: 20, B: 1, C: 1, D: 1, E: 1, F: 1 };
  const members = [];
  let n = 0;
  for (const [v, c] of Object.entries(counts)) for (let i = 0; i < c; i++) members.push({ id: `d-${n++}`, slots: { tag: v } });
  const r = detectSplit(members, 'tag');
  assert.equal(r.split, false);
});
