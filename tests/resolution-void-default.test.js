// The void-as-default contract (core/event.js). Truth-seeking begins and ends in the
// void: the inability to state something definitely is the DEFAULT posture, not the
// exceptional case, so the Resolution tier — the how-definitely of every event — names
// VOID unless FIRM is explicitly earned. This pins that contract so a future regression
// back to a free firm-default fails here first (there was NO test pinning the old firm
// default — which is exactly why nothing caught it while it inverted the principle).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BANDS, makeResolution, firm, voidRes, isFirm, isVoid, weaker, effectiveRes, makeEvent,
} from '../src/core/event.js';

test('void-default: a bare Resolution is VOID, not a free firm', () => {
  assert.equal(makeResolution().band, BANDS.VOID);        // nothing named → void
  assert.equal(isVoid(makeResolution()), true);
  // firm is still available — it just has to be asked for.
  assert.equal(makeResolution(BANDS.FIRM).band, BANDS.FIRM);
  assert.equal(firm().band, BANDS.FIRM);
  assert.equal(voidRes().band, BANDS.VOID);
});

test('void-default: an ABSENT resolution reads VOID, so void-domination holds on unset inputs', () => {
  assert.equal(isVoid(null), true);
  assert.equal(isVoid(undefined), true);
  assert.equal(isFirm(null), false);
  // weaker(firm, absent) must fall to the void — a missing commitment cannot launder firm.
  assert.equal(isVoid(weaker(firm(0.9), null)), true);
});

test('void-default: effectiveRes over NOTHING established is VOID; the firm(1) seed is only the fold identity', () => {
  assert.equal(isVoid(effectiveRes([])), true);           // no deps → void, not firm
  assert.equal(isVoid(effectiveRes(null)), true);
  // a single firm dependency stays firm — the empty-case void did not poison the fold.
  assert.equal(isFirm(effectiveRes([firm(0.9)])), true);
  // void dominates the moment any constituent is void (§3b).
  assert.equal(isVoid(effectiveRes([firm(0.9), voidRes()])), true);
  // the conservative p is carried forward, never firmed up past a void band.
  assert.ok(effectiveRes([firm(0.9), voidRes(0.2)]).p <= 0.2 + 1e-9);
});

test('void-default: an event whose how-definitely was never stated is born in the void', () => {
  assert.equal(makeEvent({ op: 'INS' }).res.band, BANDS.VOID);
  assert.equal(makeEvent({ op: 'INS', res: null }).res.band, BANDS.VOID);
  // an explicit firm is honored — definiteness, when earned, is kept.
  assert.equal(makeEvent({ op: 'INS', res: firm(0.8) }).res.band, BANDS.FIRM);
  assert.equal(makeEvent({ op: 'INS', res: 'firm' }).res.band, BANDS.FIRM);
});
