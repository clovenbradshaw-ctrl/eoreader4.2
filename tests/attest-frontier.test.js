import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESERVATION_TIERS,
  unitDraw, classify,
  mkFrontier, frontierFromDecision, recollapse,
  ablate, publishFrontier,
  mkEnvelope, withinEnvelope, nullResultReading,
  frontierNulSig, frontierEvaSig,
} from '../src/attest/frontier.js';

// Selective preservation (docs/attestation-spec.md §8) — we preserve the salient and LOG the
// decision. Build-order steps 5 (frontier record) and 9 (publication + ablation). The gate is
// seeded and deterministic; the ablation lets a critic re-run it. No Math.random, no clock.

// ── the seeded gate (§8.6) ─────────────────────────────────────────────────────

test('the draw is deterministic in (seed, address) — the bias defense', () => {
  const a = unitDraw('crawl-0417:0x8f2c', 'https://ex.gov/p#14');
  assert.equal(a, unitDraw('crawl-0417:0x8f2c', 'https://ex.gov/p#14'), 'same seed + address → same draw, forever');
  assert.notEqual(a, unitDraw('crawl-0417:0x8f2c', 'https://ex.gov/p#15'), 'a different address draws differently');
  assert.ok(a >= 0 && a < 1);
});

test('classify sorts a span into collapsed / near-miss / encountered', () => {
  // A very high amplitude collapses under almost any seed; a very low one does not.
  const hi = classify({ amplitude: 0.99, seed: 's', address: 'a' });
  assert.equal(hi.collapsed, true);
  assert.equal(hi.tier, 'collapsed');
  const lo = classify({ amplitude: 0.02, seed: 's', address: 'a' });
  assert.equal(lo.collapsed, false);
  assert.equal(lo.tier, 'encountered', 'low amplitude, no collapse → encountered (NUL only)');
  assert.deepEqual(Object.keys(PRESERVATION_TIERS).sort(), ['collapsed', 'encountered', 'near-miss', 'never-reached']);
});

test('a high-amplitude span the seed happens not to draw is a near-miss (the tail)', () => {
  // Find an address whose draw exceeds a high amplitude so the gate misses it, then confirm the
  // tier is near-miss (fire SPN without custody) rather than encountered.
  let found = null;
  for (let i = 0; i < 200 && !found; i++) {
    const address = `https://ex.gov/p#${i}`;
    const d = classify({ amplitude: 0.6, seed: 'crawl-0417', address, nearMissThreshold: 0.25 });
    if (!d.collapsed) found = d;
  }
  assert.ok(found, 'some address misses the draw at amplitude 0.6');
  assert.equal(found.tier, 'near-miss', 'a high-amplitude miss is the tail the sampler did not draw (§8.2)');
});

test('temperature funds the anomaly — raising it lifts low-amplitude collapse probability (§8.7)', () => {
  const cold = classify({ amplitude: 0.1, seed: 's', address: 'a', temperature: 1 });
  const hot = classify({ amplitude: 0.1, seed: 's', address: 'a', temperature: 4 });
  assert.ok(hot.p > cold.p, 'higher temperature raises p for a low-amplitude span');
});

// ── the frontier record (§8.3) ───────────────────────────────────────────────────

test('mkFrontier records the address and the decision, not the bytes', () => {
  const f = mkFrontier({ id: '8814', uri: 'https://ex.gov/board-packet.pdf#p14', amplitude: 0.31, phase: 'neutral', seed: 'crawl-0417:0x8f2c', reason: 'below-draw' });
  assert.equal(f.id, 'h-8814');
  assert.equal(f.schema, 'frontier/1');
  assert.equal(f.tier, 'encountered');
  assert.equal(f.witness, null);
  assert.equal(f.amplitude, 0.31);
  assert.ok(!('bytes' in f) && !('body' in f), 'no bytes are kept on the frontier');
  const nm = mkFrontier({ id: 'h-9001', uri: 'https://x', witness: 'spn2-abc' });
  assert.equal(nm.tier, 'near-miss', 'a witness attached → near-miss tier');
});

test('frontierFromDecision maps a gate decision to a record with the right reason', () => {
  const enc = frontierFromDecision({ tier: 'encountered' }, { id: 'h-1', uri: 'https://x', seed: 's' });
  assert.equal(enc.tier, 'encountered');
  assert.equal(enc.reason, 'below-draw');
  const nm = frontierFromDecision({ tier: 'near-miss' }, { id: 'h-2', uri: 'https://y', seed: 's', witness: 'spn2-z' });
  assert.equal(nm.tier, 'near-miss');
  assert.equal(nm.witness, 'spn2-z');
});

test('a NUL\'d address is re-collapsible — the tape shows both the pass and the revision (§8.3)', () => {
  const f = mkFrontier({ id: '8814', uri: 'https://ex.gov/x', amplitude: 0.31, seed: 's' });
  const rc = recollapse(f, { at: '2026-07-01T00:00:00Z', amplitude: 0.88 });
  assert.equal(rc.from, 'h-8814');
  assert.equal(rc.was.amplitude, 0.31);
  assert.equal(rc.now.tier, 'collapsed');
  assert.equal(rc.now.amplitude, 0.88);
  assert.equal(rc.at, '2026-07-01T00:00:00Z');
});

// ── ablation + publication (§8.5) ────────────────────────────────────────────────

test('ablate re-runs the gate: same seed → the delta is the PARAMETER, not luck', () => {
  const records = Array.from({ length: 20 }, (_, i) => ({ id: `h-${i}`, uri: `https://ex.gov/p#${i}`, amplitude: 0.2, seed: 'crawl-0417' }));
  const cold = ablate({ records, collapsedIds: [], temperature: 1 });
  const hot = ablate({ records, collapsedIds: cold.wouldCollapse, temperature: 6 });
  assert.ok(hot.wouldCollapse.length >= cold.wouldCollapse.length, 'raising the temperature collapses at least as many');
  assert.deepEqual(hot.dropped, [], 'nothing the cold gate kept is dropped by the hotter gate');
  // determinism: the same ablation twice is identical
  assert.deepEqual(ablate({ records, temperature: 6 }).wouldCollapse, hot.wouldCollapse);
});

test('publishFrontier projects to addresses + scores, never bytes (§8.5)', () => {
  const recs = [mkFrontier({ id: 'h-1', uri: 'https://x', amplitude: 0.3, phase: 'neutral', seed: 's', reason: 'below-draw' })];
  const pub = publishFrontier(recs);
  assert.deepEqual(pub, [{ id: 'h-1', uri: 'https://x', amplitude: 0.3, phase: 'neutral', seed: 's', reason: 'below-draw', tier: 'encountered' }]);
});

// ── the envelope (§8.7) ──────────────────────────────────────────────────────────

test('the crawl envelope bounds a null result — outside the boundary, absence says nothing', () => {
  const env = mkEnvelope({ seeds: ['https://ex.gov'], domains: ['ex.gov', 'courts.ex.gov'], depth: 3, date_range: '2025-01..2026-07' });
  assert.equal(withinEnvelope('https://sub.ex.gov/page', env), true, 'a subdomain of a declared domain is inside');
  assert.equal(withinEnvelope('https://elsewhere.com/x', env), false);
  assert.equal(nullResultReading('https://ex.gov/never-found', env), 'within-boundary-not-found');
  assert.equal(nullResultReading('https://elsewhere.com/x', env), 'outside-boundary', 'a null here means outside my boundary, never does-not-exist (§8.7)');
});

// ── EOT signals (§8.3) ───────────────────────────────────────────────────────────

test('the frontier signals match §8.3', () => {
  assert.equal(frontierNulSig('h-8814'), '!NUL frontier.h-8814');
  assert.equal(frontierEvaSig('h-8814'), '!EVA frontier.h-8814');
});
