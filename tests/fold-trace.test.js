import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildFoldTrace } from '../src/core/fold-trace.js';
import { buildWaveform } from '../src/weave/waveform/build.js';
import { cosineMetric } from '../src/weave/waveform/metric.js';

// ── The assembly-1 checkpoint (docs/coil-surfaces.md §1, docs/fold-trace-spec.md):
// replay a document through the existing fold pipeline (buildWaveform) with FoldTrace
// as the extended logging layer, and verify: trace length == fold count, at least one
// rejected entry with a populated reject_reason, order_index strictly monotonic.

const wobble = (base, i, amp = 0.05) => base.map((x, d) => x + amp * Math.sin(i * 0.7 + d));

// A "known document" fixture — deterministic, no Math.random, mirroring
// tests/waveform-build.test.js's own register-break + motif fixture.
const makeReading = ({ n = 80, breakAt = 40, referents = [], sightings = [] } = {}) => {
  const units = [];
  const motif = [0, 0, 1];
  for (let i = 0; i < n; i++) {
    let base = i < breakAt ? [1, 0, 0] : [0, 1, 0];
    if (i >= 6 && i < 9) base = motif;
    if (i >= n - 20 && i < n - 17) base = motif;
    units.push({ id: `u${i}`, ordinal: i, span: { at: i }, field: wobble(base, i) });
  }
  return {
    units, metric: cosineMetric, segments: [], referents, sightings,
    vocab: { FOREGROUND: 'narrating', PRESENT: 'present', LATENT: 'orbited' },
    resolve: (span) => ({ at: span.at }),
    meta: { modality: 'toy', perceiverVersion: '1.0.0' },
  };
};

test('buildFoldTrace: trace length equals fold count on three known documents', () => {
  const docs = [
    makeReading({ n: 80, breakAt: 40 }),
    makeReading({ n: 50, breakAt: 20 }),
    makeReading({ n: 30, breakAt: 15 }),
  ];
  for (const reading of docs) {
    const model = buildWaveform(reading);
    const trace = buildFoldTrace(model, { readingId: 'doc' });
    assert.equal(trace.length, model.strain.length, 'one FoldTrace row per WaveformModel unit');
  }
});

test('buildFoldTrace: order_index is strictly monotonic', () => {
  const model = buildWaveform(makeReading());
  const trace = buildFoldTrace(model, { readingId: 'doc' });
  for (let i = 1; i < trace.length; i++) {
    assert.ok(trace[i].order_index > trace[i - 1].order_index, `order_index must strictly increase at ${i}`);
  }
  assert.deepEqual(trace.map((r) => r.order_index), trace.map((_, i) => i));
});

test('buildFoldTrace: an ordinary document yields at least one rejected entry with a reject_reason', () => {
  // No referents at all — plain background prose has nothing to mint, no frame
  // boundary at most ordinals, no echo membership at most ordinals: the desert
  // cell (SYN·Cultivating) is the honest address for "nothing distinguished here".
  const model = buildWaveform(makeReading());
  const trace = buildFoldTrace(model, { readingId: 'doc' });
  const rejected = trace.filter((r) => !r.accepted);
  assert.ok(rejected.length > 0, 'expected at least one rejected fold');
  assert.ok(rejected.every((r) => typeof r.reject_reason === 'string' && r.reject_reason.length > 0),
    'every rejected entry carries a populated reject_reason');
});

test('buildFoldTrace: every accepted row carries a well-formed operator(Site, Stance) address', () => {
  const model = buildWaveform(makeReading());
  const trace = buildFoldTrace(model, { readingId: 'doc' });
  for (const row of trace.filter((r) => r.accepted)) {
    assert.match(row.address, /^[A-Z]+\([A-Za-z]+, [A-Za-z]+\)$/, `malformed address: ${row.address}`);
  }
});

// ── Direct, synthetic WaveformModel-shaped fixtures — buildFoldTrace's own logic in
// isolation, no dependency on buildWaveform's frame/turn/echo/cast algorithms. Exercises
// each of the three reject_reason paths deterministically, per the checkpoint's own
// allowance: "force a grain-mixed case if the corpus doesn't produce one naturally".

test('buildFoldTrace: an undifferentiated stretch lands on the desert cell and is rejected', () => {
  const model = {
    strain: [0, 0, 0, 0, 0],
    confidence: [1, 1, 1, 1, 1],
    frames: [{ start: 0, end: 5, label: null }],
    turns: [], echoes: [], cast: [],
  };
  const trace = buildFoldTrace(model, { readingId: 'synthetic' });
  for (const row of trace) {
    assert.equal(row.accepted, false);
    assert.equal(row.reject_reason, 'desert-cell');
    assert.equal(row.address, 'SYN(Field, Cultivating)');
  }
});

test('buildFoldTrace: a minted referent reads INS and accepts at Entity/Making', () => {
  const model = {
    strain: [0.1, 0.2, 0.1],
    confidence: [1, 1, 1],
    frames: [{ start: 0, end: 3, label: null }],
    turns: [], echoes: [],
    cast: [{ referent: 'k', display: 'K', gateType: 'holon', onCast: true, salience: 1,
              presence: [{ start: 1, end: 2, role: 'FOREGROUND' }] }],
  };
  const trace = buildFoldTrace(model, { readingId: 'synthetic' });
  assert.ok(trace[1].ops_fired.split(',').includes('INS'));
  assert.equal(trace[1].accepted, true);
  assert.equal(trace[1].site, 'Entity');
  assert.equal(trace[1].stance, 'Making');
  assert.equal(trace[1].address, 'INS(Entity, Making)');
});

test('buildFoldTrace: a confirmed turn coinciding with a minted referent is a genuine grain-mixed reject', () => {
  // REC (Generate x Interpretation) and INS (Generate x Existence) both fire at the
  // same unit — a paradigm-level reframe and a fresh entity instantiation filed at
  // the same address. The coherence guard (core/cube.js), not a hand-written check,
  // is what calls this off-diagonal.
  const model = {
    strain: [0.5, 0.5],
    confidence: [1, 1],
    frames: [{ start: 0, end: 2, label: null }],
    turns: [{ ordinal: 1, strain_delta: 1, hot: true }],
    echoes: [],
    cast: [{ referent: 'k', display: 'K', gateType: 'holon', onCast: true, salience: 1,
              presence: [{ start: 1, end: 2, role: 'FOREGROUND' }] }],
  };
  const trace = buildFoldTrace(model, { readingId: 'synthetic' });
  const fold = trace[1];
  assert.equal(fold.rec_fired, true);
  assert.ok(fold.ops_fired.split(',').includes('INS'));
  assert.equal(fold.accepted, false);
  assert.equal(fold.reject_reason, 'grain-mixed');
});

test('buildFoldTrace: a motif fold depending on a rejected antecedent is itself rejected', () => {
  const model = {
    strain: [0.5, 0, 0.3],
    confidence: [1, 1, 1],
    frames: [{ start: 0, end: 3, label: null }],
    turns: [{ ordinal: 0, strain_delta: 1, hot: true }],   // forces ordinal 0 off-diagonal
    echoes: [{ span_a: 0, span_b: 2 }],
    cast: [{ referent: 'k', display: 'K', gateType: 'holon', onCast: true, salience: 1,
              presence: [{ start: 0, end: 1, role: 'FOREGROUND' }] }],
  };
  const trace = buildFoldTrace(model, { readingId: 'synthetic' });
  assert.equal(trace[0].accepted, false);
  assert.equal(trace[0].reject_reason, 'grain-mixed');
  assert.equal(trace[2].accepted, false, 'the later echo half inherits its antecedent\'s rejection');
  assert.equal(trace[2].reject_reason, 'dependency');
});

test('buildFoldTrace: reading_id, pos_start/pos_end, discard_refs carry through', () => {
  const model = {
    strain: [0], confidence: [1],
    frames: [{ start: 0, end: 1, label: null }],
    turns: [], echoes: [], cast: [],
  };
  const trace = buildFoldTrace(model, { readingId: 'my-doc' });
  assert.equal(trace[0].reading_id, 'my-doc');
  assert.equal(trace[0].pos_start, 0);
  assert.equal(trace[0].pos_end, 1);
  assert.equal(trace[0].discard_refs, 0, 'a rejected fold points into the discard ledger by ordinal');
});
