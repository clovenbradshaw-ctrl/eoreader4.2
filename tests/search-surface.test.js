import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/rooms/reader/search-record.js';
import { routeIntent, subjectTerms, routeSurface } from '../src/rooms/reader/search-surface.js';
import { highlight, scanAll, sourceRail } from '../src/rooms/reader/search-surface-scan.js';

// A tiny two-source record: a document that names Walton and a stub that does not.
const SOURCES = [
  { sn: 1, reg: 's1', title: 'Letter IV', kind: 'doc', bytes: 5000, text: 'Walton writes to Margaret about the stranger he found on the ice.' },
  { sn: 2, reg: 's2', title: 'Stub', kind: 'web', bytes: 200, text: 'An unrelated note mentioning nothing in particular.' },
];
const DOCS = {
  1: { sentences: ['Walton writes to Margaret about the stranger.', 'The stranger was found upon the ice.', 'Margaret is Walton\'s sister.'] },
  2: { sentences: ['An unrelated note mentioning nothing in particular.'] },
};
const docFor = (s) => DOCS[s.sn] || null;
const RECORD = {
  entities: [
    { label: 'Walton', docId: 'd1', entId: 'e1', sn: 1, type: 'person', mentions: 3, sourceCount: 1 },
    { label: 'Margaret', docId: 'd1', entId: 'e2', sn: 1, type: 'person', mentions: 2, sourceCount: 1 },
  ],
  claims: [
    { text: 'The stranger is noble.', status: 'Contested', subject: 'stranger', quote: 'a noble creature', sn: 1, reg: 's1' },
    { text: 'Walton sailed north.', status: 'Stated', subject: 'Walton', quote: 'toward the pole', sn: 1, reg: 's1' },
  ],
};
const providers = (over = {}) => ({ sources: SOURCES, record: RECORD, entities: RECORD.entities, docFor, scopeSignal: (sn) => sn === 1, ...over });

test('highlight marks every term hit and merges overlaps', () => {
  const segs = highlight('the stranger on the ice', ['stranger', 'ice']);
  assert.equal(segs.filter((s) => s.hit).map((s) => s.s).join('|'), 'stranger|ice');
  assert.equal(segs.map((s) => s.s).join(''), 'the stranger on the ice');
});

test('scanAll finds verbatim occurrences and counts them per source', () => {
  const { hits, total, counts } = scanAll(SOURCES, ['stranger'], docFor);
  assert.equal(total, 2);
  assert.equal(counts.get(1), 2);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].sn, 1);
});

test('routeIntent — who → cast, disagree → contrast, plain → concordance', () => {
  assert.equal(routeIntent(parseQuery('who is on the ship')), 'cast');
  assert.equal(routeIntent(parseQuery('where do the sources disagree')), 'contrast');
  assert.equal(routeIntent(parseQuery('contradicts:')), 'contrast');
  assert.equal(routeIntent(parseQuery('ice')), 'concordance');
});

test('subjectTerms strips intent + meta words, keeps the real subject', () => {
  assert.deepEqual(subjectTerms(parseQuery('where do the sources disagree about walton')), ['walton']);
  assert.deepEqual(subjectTerms(parseQuery('who fights the stranger')), ['fights', 'stranger']);
});

test('entity: operand folds into the subject terms', () => {
  assert.deepEqual(subjectTerms(parseQuery('entity:Walton')), ['walton']);
  const surf = routeSurface(parseQuery('entity:Walton'), providers({ record: { entities: [], claims: [] } }));
  // no entities in this record → falls to concordance, and Walton is highlighted
  assert.equal(surf.template, 'concordance');
  assert.ok(surf.total >= 1);
});

test('concordance is the default surface, occurrences lit', () => {
  const surf = routeSurface('stranger', providers());
  assert.equal(surf.template, 'concordance');
  assert.equal(surf.concordance.length, 1);
  assert.equal(surf.total, 2);
});

test('cast surface carries the figures on record (intent word never narrows the cast)', () => {
  // "who is here" reduces to no real subject → the WHOLE cast, not a filter on "who".
  const surf = routeSurface('who is here', providers());
  assert.equal(surf.template, 'cast');
  assert.equal(surf.cast.length, 2);
  assert.equal(surf.cast[0].label, 'Walton');
});

test('cast filters to the subject when one is named, else shows everyone', () => {
  const named = routeSurface('who is Margaret', providers());
  assert.equal(named.template, 'cast');
  assert.deepEqual(named.cast.map((c) => c.label), ['Margaret']);
  const none = routeSurface('who is Zelda', providers());   // names no one on record
  assert.equal(none.cast.length, 2);                        // → the whole cast, not empty
});

test('contrast surface prefers contested claims', () => {
  const surf = routeSurface('where do the sources disagree', providers());
  assert.equal(surf.template, 'contrast');
  assert.equal(surf.contrastKind, 'contested');
  assert.equal(surf.contrast.length, 1);
  assert.equal(surf.contrast[0].status, 'Contested');
});

test('source rail: signal is query-specific when anything matches', () => {
  const surf = routeSurface('stranger', providers());
  const s1 = surf.rail.find((r) => r.sn === 1);
  const s2 = surf.rail.find((r) => r.sn === 2);
  assert.equal(s1.signal, true);   // carries the term
  assert.equal(s2.signal, false);  // does not — even though it is a source
  assert.equal(s1.count, 2);
});

test('source rail: falls back to the wheat floor when nothing matches', () => {
  const surf = routeSurface('zzznotfound', providers());
  assert.equal(surf.total, 0);
  const s1 = surf.rail.find((r) => r.sn === 1);
  const s2 = surf.rail.find((r) => r.sn === 2);
  assert.equal(s1.signal, true);   // scopeSignal(1) = true
  assert.equal(s2.signal, false);  // scopeSignal(2) = false
});

test('disabling a source drops it from the rail and the scan', () => {
  const surf = routeSurface('stranger', providers({ sources: [SOURCES[1]] }));
  assert.equal(surf.rail.length, 1);
  assert.equal(surf.total, 0);     // only the stub is enabled, it lacks the term
});

test('an empty query yields an empty, un-asked surface', () => {
  const surf = routeSurface('', providers());
  assert.equal(surf.empty, true);
  assert.equal(surf.asked, false);
});
