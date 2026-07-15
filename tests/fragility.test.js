import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rankFragility } from '../src/perceiver/fragility.js';

// FRAGILITY — which contested claims are load-bearing. Two disputes; one is about a subject the
// rest of the record leans on heavily, the other about a subject barely touched. The load-bearing
// one ranks first, and carries the dependents that would fall with it.

const claims = [
  { subject: 'Fusus', object: 'the city', text: 'Fusus watches the city', source: 's1' },
  { subject: 'Fusus', text: 'Fusus is a surveillance tool', source: 's1' },
  { subject: 'Fusus', object: 'the council', text: 'Fusus reports to the council', source: 's2' },
  { subject: 'Fusus', text: 'Fusus cost 2 million', source: 's2' },
  { subject: 'Kiosk', text: 'Kiosk is new', source: 's3' },   // Kiosk barely appears
];

const contested = [
  { subject: 'Fusus', kind: 'magnitude', description: 'cost: $2M (Ledger) vs $9M (Audit)' },
  { subject: 'Kiosk', kind: 'contradiction', description: 'the text affirms and denies Kiosk is new' },
];

test('the contested claim on a heavily-attached subject ranks most fragile', () => {
  const { items, metric } = rankFragility(claims, contested);
  assert.equal(items[0].subject, 'Fusus');            // everything leans on Fusus
  assert.ok(items[0].load >= 4, 'Fusus carries a large footprint');
  assert.ok(items[0].sources >= 2, 'across multiple sources');
  assert.equal(items[1].subject, 'Kiosk');            // Kiosk is cheap to be wrong about
  assert.equal(items[1].load, 1);
  assert.equal(metric.contested, 2);
  assert.equal(metric.loadBearing, 2);
});

test('the dependents — what would fall if the contested claim is wrong — are listed', () => {
  const { items } = rankFragility(claims, contested);
  const fusus = items[0];
  assert.ok(fusus.dependents.some((t) => /watches the city/.test(t)));
  assert.ok(fusus.dependents.some((t) => /surveillance tool/.test(t)));
  assert.ok(fusus.dependents.some((t) => /reports to the council/.test(t)));
});

test('object incidence counts — a subject named only as an object still bears load', () => {
  const cs = [
    { subject: 'Vendor', object: 'Fusus', text: 'Vendor sold Fusus', source: 's1' },
    { subject: 'City', object: 'Fusus', text: 'City bought Fusus', source: 's2' },
  ];
  const { items } = rankFragility(cs, [{ subject: 'Fusus', kind: 'magnitude', description: 'disputed' }]);
  assert.equal(items[0].load, 2, 'Fusus is load-bearing as the object of both claims');
});

test('a contested subject the record never mentions has zero load, ranks last', () => {
  const { items, metric } = rankFragility(claims, [
    { subject: 'Fusus', kind: 'magnitude', description: 'cost dispute' },
    { subject: 'Ghost', kind: 'contradiction', description: 'a subject nothing attaches to' },
  ]);
  assert.equal(items[0].subject, 'Fusus');
  assert.equal(items[items.length - 1].subject, 'Ghost');
  assert.equal(items[items.length - 1].load, 0);
  assert.equal(metric.loadBearing, 1);
});
