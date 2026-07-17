import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildWaveform } from '../src/weave/waveform/build.js';
import { buildCast } from '../src/weave/waveform/cast.js';
import { cosineMetric } from '../src/weave/waveform/metric.js';
import { ROLES } from '../src/perceiver/contract.js';

// THE INVARIANT CORE — a synthetic 80-unit "document" with two clearly different
// register regimes (a structural break at ordinal 40) so frame/turn detection has
// a real boundary to find, plus a repeated 3-unit motif so echo detection has a
// real recurrence to find. Every field is 3-dimensional and deterministic (no
// Math.random) so the fixture — and any failure — is reproducible.

const VOCAB = { FOREGROUND: 'narrating', PRESENT: 'present', LATENT: 'orbited' };

const wobble = (base, i, amp = 0.05) => base.map((x, d) => x + amp * Math.sin(i * 0.7 + d));

const N = 80;
const motif = [0, 0, 1];

const makeUnits = () => {
  const units = [];
  for (let i = 0; i < N; i++) {
    let base = i < 40 ? [1, 0, 0] : [0, 1, 0];
    // Plant the same 3-unit motif at two well-separated, non-adjacent spots.
    if (i >= 6 && i < 9) base = motif;
    if (i >= 60 && i < 63) base = motif;
    units.push({ id: `u${i}`, ordinal: i, span: { at: i }, field: wobble(base, i) });
  }
  return units;
};

const makeReading = (opts = {}) => ({
  units: makeUnits(),
  metric: cosineMetric,
  segments: opts.segments || [],
  referents: opts.referents || [],
  sightings: opts.sightings || [],
  vocab: VOCAB,
  resolve: (span) => ({ at: span.at }),
  meta: { modality: 'toy', perceiverVersion: '1.0.0' },
});

test('buildWaveform: baseline and strain are decomposed, never merged into one number', () => {
  const model = buildWaveform(makeReading());
  assert.equal(model.baseline.length, N);
  assert.equal(model.strain.length, N);
  assert.ok(model.baseline.every(Number.isFinite), 'every unit gets a baseline reading');
  assert.ok(model.strain.every(Number.isFinite), 'every unit gets a strain reading');
});

test('buildWaveform: a real register break confirms as a Turn near where it actually happens', () => {
  const model = buildWaveform(makeReading());
  assert.ok(model.turns.length > 0, 'at least one boundary is confirmed');
  const nearBreak = model.turns.some((t) => Math.abs(t.ordinal - 40) <= 6);
  assert.ok(nearBreak, `expected a turn near ordinal 40, got ${JSON.stringify(model.turns.map((t) => t.ordinal))}`);
});

test('buildWaveform: frames partition the whole document with no gaps or overlaps', () => {
  const model = buildWaveform(makeReading());
  assert.equal(model.frames[0].start, 0);
  assert.equal(model.frames[model.frames.length - 1].end, N);
  for (let i = 1; i < model.frames.length; i++) {
    assert.equal(model.frames[i].start, model.frames[i - 1].end, 'frames are contiguous, no gap or overlap');
  }
});

test('buildWaveform: a perceiver-labeled coarse segment names the frame it overlaps', () => {
  const model = buildWaveform(makeReading({
    segments: [
      { start: 0, end: 40, label: 'Part One', level: 'coarse' },
      { start: 40, end: N, label: 'Part Two', level: 'coarse' },
    ],
  }));
  const labels = model.frames.map((f) => f.label).filter(Boolean);
  assert.ok(labels.includes('Part One') || labels.includes('Part Two'), 'a perceiver label survives onto a frame');
});

test('buildWaveform: confidence ramps up from cold start rather than starting confident', () => {
  const model = buildWaveform(makeReading());
  const firstFrame = model.frames[0];
  assert.ok(model.confidence[firstFrame.start] < 1, 'the very first unit of a frame is not yet confident');
  const laterInFrame = Math.min(firstFrame.end - 1, firstFrame.start + 10);
  assert.equal(model.confidence[laterInFrame], 1, 'confidence reaches 1 once the frame has enough sample');
});

test('buildWaveform: echo finds the planted motif recurrence, non-adjacent and beyond chance', () => {
  const model = buildWaveform(makeReading());
  const hit = model.echoes.some((e) =>
    (e.span_a >= 5 && e.span_a <= 10 && e.span_b >= 59 && e.span_b <= 64)
    || (e.span_b >= 5 && e.span_b <= 10 && e.span_a >= 59 && e.span_a <= 64));
  assert.ok(hit, `expected an echo linking the two motif spans, got ${JSON.stringify(model.echoes)}`);
});

test('buildWaveform: the discard ledger answers "why" for a span that was never flagged', () => {
  const model = buildWaveform(makeReading());
  const entry = model.discard.get(20);
  assert.ok(entry, 'an unflagged span is still queryable');
  assert.ok(Number.isFinite(entry.strain));
  assert.ok(Number.isFinite(entry.baseline));
  assert.equal(model.discard.get(-1), null);
  assert.equal(model.discard.get(N + 5), null);
});

test('buildWaveform: provenance resolves an ordinal back through the Reading\'s own resolve()', () => {
  const model = buildWaveform(makeReading());
  assert.deepEqual(model.provenance(0), { at: 0 });
  assert.equal(model.provenance(N + 5), null);
});

test('buildWaveform: refuses an invalid Reading rather than silently building a wrong model', () => {
  const bad = makeReading();
  bad.units[3].ordinal = 999;
  assert.throws(() => buildWaveform(bad), /refused an invalid Reading/);
});

test('buildWaveform: vocab passes through untouched, for the render to use instead of hardcoded words', () => {
  const model = buildWaveform(makeReading());
  assert.deepEqual(model.vocab, VOCAB);
});

// ── Cast / gate wiring — LATENT contributes coupling, never mass (§3.5) ──────

test('buildCast: a referent sighted only as LATENT, but co-sighted constantly, lands as a protogon', () => {
  const referents = [
    { key: 'hub', display_name: 'Hub', ins: true },
    { key: 'proto', display_name: 'the incoming front' }, // never ins — unnamed
    { key: 'field1', display_name: 'a passing setting' },
    { key: 'field2', display_name: 'another passing setting' },
    { key: 'field3', display_name: 'a third setting' },
  ];
  const sightings = [];
  for (let i = 0; i < 40; i++) {
    sightings.push({ referent: 'hub', ordinal: i, role: ROLES.FOREGROUND });
    // proto is co-sighted with hub at every ordinal, but ONLY ever as LATENT —
    // real coupling, zero mass.
    sightings.push({ referent: 'proto', ordinal: i, role: ROLES.LATENT });
    if (i % 4 === 0) sightings.push({ referent: 'field1', ordinal: i, role: ROLES.PRESENT });
    if (i % 5 === 0) sightings.push({ referent: 'field2', ordinal: i, role: ROLES.PRESENT });
    if (i % 6 === 0) sightings.push({ referent: 'field3', ordinal: i, role: ROLES.PRESENT });
  }
  const cast = buildCast(referents, sightings);
  const proto = cast.find((c) => c.referent === 'proto');
  assert.ok(proto, 'the never-named referent still reaches the cast');
  assert.equal(proto.gateType, 'protogon', `expected protogon, got ${proto.gateType}`);
  assert.equal(proto.onCast, true);
});

test('buildCast: presence lanes run-length-encode role over ordinals', () => {
  const referents = [{ key: 'a', display_name: 'A', ins: true }];
  const sightings = [
    { referent: 'a', ordinal: 0, role: ROLES.FOREGROUND },
    { referent: 'a', ordinal: 1, role: ROLES.FOREGROUND },
    { referent: 'a', ordinal: 2, role: ROLES.PRESENT },
    { referent: 'a', ordinal: 5, role: ROLES.LATENT },
  ];
  const cast = buildCast(referents, sightings);
  const a = cast.find((c) => c.referent === 'a');
  assert.deepEqual(a.presence, [
    { start: 0, end: 2, role: ROLES.FOREGROUND },
    { start: 2, end: 3, role: ROLES.PRESENT },
    { start: 5, end: 6, role: ROLES.LATENT },
  ]);
});
