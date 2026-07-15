import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readDates, buildChronology } from '../src/perceiver/chronology.js';

// CHRONOLOGY — the order events are TOLD vs. the order they HAPPENED. The engine reads the dates a
// text states, orders events by story-time, and surfaces where the telling jumps back (a
// flashback), staying honest about what it cannot date.

test('readDates reads the date forms a document uses, most-specific first', () => {
  assert.equal(readDates('signed on March 14, 2021 at noon')[0].label, 'March 14, 2021');
  assert.equal(readDates('filed 2019-06-30')[0].precision, 'day');
  assert.equal(readDates('back in 1998 it began')[0].label, '1998');
  assert.equal(readDates('as of January 2020')[0].precision, 'month');
  assert.equal(readDates('no date here at all').length, 0);
  // a bare four-digit id that isn't a plausible year is not mined as one
  assert.equal(readDates('exhibit 4021').length, 0);
});

test('buildChronology places events in story-time and flags a flashback', () => {
  // told out of order: the 2020 outcome first, then a 2015 origin (a flashback), then 2021
  const items = [
    { order: 0, text: 'The board dissolved the venture in 2020.' },
    { order: 1, text: 'The venture had been founded back in 2015.' },
    { order: 2, text: 'The final audit closed in 2021.' },
  ];
  const c = buildChronology(items);
  assert.equal(c.metric.dated, 3);
  assert.equal(c.metric.undated, 0);
  // the reconstructed timeline is in story-time order regardless of telling
  assert.deepEqual(c.timeline.map((e) => e.when), ['2015', '2020', '2021']);
  assert.equal(c.span.first, '2015');
  assert.equal(c.span.last, '2021');
  // the telling ran backward from 2020 to 2015 — a flashback at the second sentence
  assert.equal(c.reorderings.length, 1);
  assert.equal(c.reorderings[0].kind, 'flashback');
  assert.equal(c.reorderings[0].from, '2020');
  assert.equal(c.reorderings[0].to, '2015');
  assert.equal(c.metric.ordered, false);
});

test('a document told in order has no reorderings', () => {
  const items = [
    { order: 0, text: 'It began in 2015.' },
    { order: 1, text: 'It grew through 2018.' },
    { order: 2, text: 'It ended in 2021.' },
  ];
  const c = buildChronology(items);
  assert.equal(c.reorderings.length, 0);
  assert.equal(c.metric.ordered, true);
});

test('undated events are counted, never interleaved into the timeline', () => {
  const items = [
    { order: 0, text: 'The parties met in 2017.' },
    { order: 1, text: 'They disagreed about everything.' },  // no date
    { order: 2, text: 'A deal was signed in 2019.' },
  ];
  const c = buildChronology(items);
  assert.equal(c.metric.dated, 2);
  assert.equal(c.metric.undated, 1);
  assert.equal(c.timeline.length, 2);
  assert.ok(c.timeline.every((e) => e.when));
});

test('topic-scale: events keep their source as they merge into one corpus timeline', () => {
  const items = [
    { order: 0, text: 'Filing A: the loan closed in 2016.', source: 'S1' },
    { order: 100, text: 'Filing B: the default occurred in 2014.', source: 'S2' },   // earlier, told later
  ];
  const c = buildChronology(items);
  assert.deepEqual(c.timeline.map((e) => e.when), ['2014', '2016']);
  assert.equal(c.timeline[0].source, 'S2');
  assert.equal(c.reorderings.length, 1);   // the corpus tells 2016 before 2014
});
