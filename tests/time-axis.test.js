import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  foldTime, suggestGrain, stepGrain, TIME_GRAINS, GRAIN_IDS, DEFAULT_GRAIN,
} from '../src/surfer/fold/time-axis.js';

const U = (...a) => Date.UTC(...a);   // build UTC epoch-ms
const keys = (r) => r.bands.map((b) => b.key);
const labels = (r) => r.bands.map((b) => b.label);
const counts = (r) => r.bands.map((b) => b.items.length);

test('the grain ladder is well-formed', () => {
  assert.ok(GRAIN_IDS.includes(DEFAULT_GRAIN));
  assert.deepEqual(GRAIN_IDS, TIME_GRAINS.map((g) => g.id));
  for (const g of TIME_GRAINS) { assert.ok(g.id && g.label && g.short); }
});

test('all — folds every dated item into one band', () => {
  const items = [{ t: U(2020, 0, 1) }, { t: U(2023, 5, 1) }, { t: U(2021, 2, 9) }];
  const r = foldTime(items, 'all');
  assert.equal(r.bands.length, 1);
  assert.equal(r.bands[0].items.length, 3);
  assert.equal(r.grain, 'all');
  assert.equal(r.span.min, U(2020, 0, 1));
  assert.equal(r.span.max, U(2023, 5, 1));
});

test('year — buckets by calendar year, oldest → newest', () => {
  const items = [
    { id: 'a', t: U(2023, 5, 1) },
    { id: 'b', t: U(2020, 0, 1) },
    { id: 'c', t: U(2020, 11, 31) },
    { id: 'd', t: U(2021, 2, 9) },
  ];
  const r = foldTime(items, 'year');
  assert.deepEqual(labels(r), ['2020', '2021', '2023']);
  assert.deepEqual(counts(r), [2, 1, 1]);
  assert.deepEqual(r.bands.map((b) => b.index), [0, 1, 2]);
});

test('month / day / hour bucket and label correctly', () => {
  const items = [{ t: U(2024, 0, 5, 9, 30) }, { t: U(2024, 0, 5, 9, 55) }, { t: U(2024, 0, 5, 11, 0) }];
  assert.deepEqual(labels(foldTime(items, 'month')), ['Jan 2024']);
  assert.deepEqual(labels(foldTime(items, 'day')), ['Jan 5, 2024']);
  const h = foldTime(items, 'hour');
  assert.deepEqual(labels(h), ['Jan 5 09:00', 'Jan 5 11:00']);
  assert.deepEqual(counts(h), [2, 1]);
});

test('week — folds to the Monday-start ISO week', () => {
  // 2024-01-03 is a Wednesday; its week starts Mon 2024-01-01.
  const r = foldTime([{ t: U(2024, 0, 3) }, { t: U(2024, 0, 1) }, { t: U(2024, 0, 8) }], 'week');
  assert.equal(r.bands.length, 2);   // Jan1 week + Jan8 week
  assert.equal(r.bands[0].items.length, 2);
  assert.equal(r.bands[0].t0, U(2024, 0, 1));
  assert.match(r.bands[0].label, /^wk /);
});

test('sequence — one band per item in chronological order', () => {
  const items = [{ id: 'late', t: U(2022, 0, 1) }, { id: 'early', t: U(2020, 0, 1) }];
  const r = foldTime(items, 'sequence');
  assert.equal(r.bands.length, 2);
  assert.deepEqual(r.bands.map((b) => b.items[0].id), ['early', 'late']);
});

test('undated items trail in their own band, never interleaved', () => {
  const items = [
    { id: 'x', t: U(2021, 0, 1) },
    { id: 'none' },                 // no t
    { id: 'zero', t: 0 },           // the openEvent sentinel
    { id: 'bad', t: 'not a date' },
    { id: 'y', t: U(2020, 0, 1) },
  ];
  const r = foldTime(items, 'year');
  assert.equal(r.dated, 2);
  assert.equal(r.undated, 3);
  const last = r.bands[r.bands.length - 1];
  assert.equal(last.key, 'undated');
  assert.equal(last.items.length, 3);
  // dated bands are all before the undated one and are ordered
  assert.deepEqual(labels(r), ['2020', '2021', 'undated']);
});

test('ISO-string times parse the same as epoch-ms', () => {
  const r = foldTime([{ t: '2020-06-15T12:00:00Z' }, { t: '2020-06-16T00:00:00Z' }], 'month');
  assert.equal(r.bands.length, 1);
  assert.equal(r.bands[0].label, 'Jun 2020');
});

test('empty / all-undated inputs return a single sane band', () => {
  const empty = foldTime([], 'auto');
  assert.equal(empty.bands.length, 1);
  assert.equal(empty.bands[0].items.length, 0);
  const allUndated = foldTime([{ id: 'a' }, { id: 'b' }], 'year');
  assert.equal(allUndated.bands.length, 1);
  assert.equal(allUndated.bands[0].key, 'undated');
  assert.equal(allUndated.bands[0].items.length, 2);
});

test('auto resolves the grain from the span', () => {
  const DAY = 86400000;
  assert.equal(suggestGrain(0), 'all');
  assert.equal(suggestGrain(3 * DAY), 'day');
  assert.equal(suggestGrain(20 * DAY), 'week');
  assert.equal(suggestGrain(60 * DAY), 'month');
  assert.equal(suggestGrain(300 * DAY), 'quarter');
  assert.equal(suggestGrain(1000 * DAY), 'year');
  assert.equal(suggestGrain(5000 * DAY), 'decade');
  // foldTime with auto reports the resolved grain and the original request
  const items = [{ t: U(2020, 0, 1) }, { t: U(2020, 0, 3) }];   // ~2 days → day
  const r = foldTime(items, 'auto');
  assert.equal(r.requested, 'auto');
  assert.equal(r.grain, 'day');
});

test('stepGrain walks the fold: +1 finer, -1 coarser', () => {
  assert.equal(stepGrain('month', +1), 'week');    // finer
  assert.equal(stepGrain('month', -1), 'quarter');  // coarser
  assert.equal(stepGrain('all', -1), 'all');        // clamped at the coarse end
  assert.equal(stepGrain('sequence', +1), 'sequence'); // clamped at the fine end
  // auto is resolved against the span before stepping
  const DAY = 86400000;
  assert.equal(stepGrain('auto', +1, 60 * DAY), 'week');  // auto→month, +1 (finer) → week
});

test('bands never mutate the caller\'s item objects', () => {
  const a = { id: 'a', t: U(2020, 0, 1) };
  const r = foldTime([a], 'year');
  assert.equal(r.bands[0].items[0], a);   // same reference, untouched
  assert.deepEqual(Object.keys(a), ['id', 't']);
});
