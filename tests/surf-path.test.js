// buildSurfPath — the surf's route (bare cursor indices) projected into the human-auditable
// WALK the reader opens to "audit the surf": the ordered cursors it arrested on, each with the
// sentence read there and the Bayesian surprise that stopped it. Pins the ordering, the role
// flags (anchor · stop · peak), the sentence lookup, and the degenerate cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSurfPath } from '../src/turn/pipeline.js';

const doc = { units: ['Zero.', 'One.', 'Two.', 'Three.', 'Four.'] };
const surf = {
  anchor: 0, peak: 4, stops: [2, 4],
  field: [{ idx: 0, bayes: 0.10 }, { idx: 2, bayes: 0.42 }, { idx: 4, bayes: 0.91 }],
};

test('the reading walk — anchor, stops, peak — deduped, ordered, each with its sentence and surprise', () => {
  const path = buildSurfPath(surf, doc);
  assert.deepEqual(path.map((p) => p.idx), [0, 2, 4], 'deduped (peak is also a stop) and ordered by cursor');
  assert.equal(path[0].anchor, true);
  assert.equal(path[0].stop, false);
  assert.equal(path[0].text, 'Zero.', 'units[idx] is the sentence read at the cursor');
  assert.equal(path[1].stop, true);
  assert.equal(path[2].peak, true);
  assert.equal(path[2].bayes, 0.91, 'the surprise that arrested the cursor, off the field');
});

test('a cursor with no field entry still rides, at zero surprise (a checked-and-empty stop is a record)', () => {
  const path = buildSurfPath({ anchor: 0, peak: 1, stops: [1], field: [] }, doc);
  assert.deepEqual(path.map((p) => p.idx), [0, 1]);
  assert.equal(path[1].bayes, 0, 'missing field → 0, never NaN (the UI bar math depends on it)');
});

test('it is total — no surf, a count-only stops field, and out-of-range cursors all degrade cleanly', () => {
  assert.deepEqual(buildSurfPath(null, doc), []);
  assert.deepEqual(buildSurfPath(undefined, undefined), []);
  // stops as a bare count (the lighter projection) still yields the anchor + peak walk
  const counted = buildSurfPath({ anchor: 1, peak: 3, stops: 2, field: [] }, doc);
  assert.deepEqual(counted.map((p) => p.idx), [1, 3]);
  // a cursor past the end of the document carries an empty sentence, never throws
  const over = buildSurfPath({ anchor: 0, peak: 99, stops: [99], field: [] }, doc);
  assert.equal(over.find((p) => p.idx === 99).text, '');
});

test('the walk is capped so one surf cannot bloat the trail or the JSONL', () => {
  const many = { anchor: 0, peak: 40, stops: Array.from({ length: 40 }, (_, i) => i), field: [] };
  const bigDoc = { units: Array.from({ length: 50 }, (_, i) => `unit ${i}`) };
  assert.ok(buildSurfPath(many, bigDoc).length <= 12, 'the path is bounded');
});
