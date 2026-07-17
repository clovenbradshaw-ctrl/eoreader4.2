import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateReading, ROLES } from '../src/perceiver/contract.js';

// THE PERCEIVER CONTRACT — the seam a Reading must clear before it can reach the
// invariant core. A minimal valid fixture, then one corruption per check so each
// failure mode is legible on its own (tests/individuation.test.js's style).

const metric = (a, b) => Math.abs(a[0] - b[0]);

const baseReading = () => ({
  units: [
    { id: 'u0', ordinal: 0, span: { at: 0 }, field: [0] },
    { id: 'u1', ordinal: 1, span: { at: 1 }, field: [1] },
    { id: 'u2', ordinal: 2, span: { at: 2 }, field: [0] },
  ],
  metric,
  segments: [{ start: 0, end: 3, label: 'only frame', level: 'coarse' }],
  referents: [{ key: 'a', display_name: 'A' }],
  sightings: [{ referent: 'a', ordinal: 0, role: ROLES.FOREGROUND }],
  vocab: { FOREGROUND: 'narrating', PRESENT: 'present', LATENT: 'orbited' },
  resolve: (span) => ({ locator: span }),
  meta: { modality: 'toy', perceiverVersion: '1.0.0' },
});

test('validateReading: accepts a well-formed Reading', () => {
  const { ok, errors } = validateReading(baseReading());
  assert.equal(ok, true, `expected no errors, got ${JSON.stringify(errors)}`);
});

test('validateReading: rejects non-contiguous ordinals', () => {
  const r = baseReading();
  r.units[1].ordinal = 5;
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'ordinal-not-contiguous'), 'flags the broken ordinal');
});

test('validateReading: rejects mismatched field lengths', () => {
  const r = baseReading();
  r.units[1].field = [1, 2];
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'field-length-mismatch'));
});

test('validateReading: rejects a metric that is not ~0 at self', () => {
  const r = baseReading();
  r.metric = () => 5;
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'metric-not-zero-at-self'));
});

test('validateReading: rejects an asymmetric metric', () => {
  const r = baseReading();
  r.metric = (a, b) => (a[0] === b[0] ? 0 : a[0] - b[0]); // not symmetric when a≠b
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'metric-not-symmetric'));
});

test('validateReading: rejects a segment out of ordinal range', () => {
  const r = baseReading();
  r.segments = [{ start: 1, end: 99, label: 'oob', level: 'coarse' }];
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'segment-out-of-range'));
});

test('validateReading: rejects a segment with an invalid level', () => {
  const r = baseReading();
  r.segments = [{ start: 0, end: 1, label: 'x', level: 'medium' }];
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'segment-level-invalid'));
});

test('validateReading: rejects a sighting ordinal out of range', () => {
  const r = baseReading();
  r.sightings = [{ referent: 'a', ordinal: 40, role: ROLES.PRESENT }];
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'sighting-ordinal-out-of-range'));
});

test('validateReading: rejects a sighting whose referent does not resolve', () => {
  const r = baseReading();
  r.sightings = [{ referent: 'ghost', ordinal: 0, role: ROLES.PRESENT }];
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'sighting-referent-unresolved'));
});

test('validateReading: rejects an invalid sighting role (no fourth role permitted)', () => {
  const r = baseReading();
  r.sightings = [{ referent: 'a', ordinal: 0, role: 'BACKGROUND' }];
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'sighting-role-invalid'));
});

test('validateReading: rejects a resolve() that throws', () => {
  const r = baseReading();
  r.resolve = () => { throw new Error('boom'); };
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'resolve-threw'));
});

test('validateReading: rejects a resolve() that returns nothing', () => {
  const r = baseReading();
  r.resolve = () => null;
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'resolve-returned-nothing'));
});

test('validateReading: rejects an incomplete vocab (no fourth role, no missing display word either)', () => {
  const r = baseReading();
  r.vocab = { FOREGROUND: 'narrating', PRESENT: 'present' };
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'vocab-incomplete'));
});

test('validateReading: rejects a missing units array outright', () => {
  const r = baseReading();
  delete r.units;
  const { ok, errors } = validateReading(r);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.code === 'units-missing'));
});
