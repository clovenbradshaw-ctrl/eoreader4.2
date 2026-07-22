import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/rooms/reader/search-record.js';
import { routeIntent, subjectTerms, routeSurface } from '../src/rooms/reader/search-surface.js';
import { highlight, scanAll, sourceRail } from '../src/rooms/reader/search-surface-scan.js';
import { parseText } from '../src/perceiver/parse/index.js';

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

test('scanAll carries line labels for each occurrence when source text is available', () => {
  const source = { sn: 9, reg: 'S-0009', title: 'Lines', text: 'Alpha starts here.\nVictor enters here.\nThen Victor returns.' };
  const doc = { sentences: ['Alpha starts here.', 'Victor enters here.', 'Then Victor returns.'] };
  const { hits } = scanAll([source], ['victor'], () => doc);
  assert.deepEqual(hits[0].occurrences.map((o) => o.line), [2, 3]);
  assert.deepEqual(hits[0].occurrences.map((o) => o.label), ['L2', 'L3']);
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

// ── the cast excludes what grain (perceiver/parse/grain.js) confidently reads as NOT a figure ──
// "who is here" used to answer with every admitted referent — a place named as often as a
// character was as much "cast" as Walton. A referent graded 'setting' or 'kind' is excluded; one
// the grain reader HELD (no `grain` field at all, same as every pre-grain entity) stays in, so an
// ordinary record with no grain signal answers exactly as it always did.
test('cast excludes a referent graded setting or kind, keeps one the grain reader held', () => {
  const entities = [
    { label: 'Walton', docId: 'd1', entId: 'e1', sn: 1, mentions: 3, sourceCount: 1, grain: 'figure' },
    { label: 'Geneva', docId: 'd1', entId: 'e2', sn: 1, mentions: 30, sourceCount: 1, grain: 'setting' },
    { label: 'the crew', docId: 'd1', entId: 'e3', sn: 1, mentions: 8, sourceCount: 1, grain: 'kind' },
    { label: 'Margaret', docId: 'd1', entId: 'e4', sn: 1, mentions: 2, sourceCount: 1 },   // grain undefined: held
  ];
  const surf = routeSurface('who is here', providers({ record: { entities: [], claims: [] }, entities }), { template: 'cast' });
  assert.equal(surf.template, 'cast');
  assert.deepEqual(surf.cast.map((c) => c.label).sort(), ['Margaret', 'Walton'],
    'Geneva (setting) and "the crew" (kind) are excluded; Margaret (held) stays');
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

test('every search fills the structured fold slots up front', () => {
  const surf = routeSurface('who Walton', providers());
  assert.equal(surf.elements.length, 4);
  assert.deepEqual(surf.elements.map((e) => e.key), ['sources', 'occurrences', 'cast', 'claims']);
  assert.ok(surf.elements.find((e) => e.key === 'occurrences').count >= 1);
  assert.ok(surf.cast.length > 0, 'cast slot is filled even for a question');
  assert.ok(surf.concepts.some((c) => c.label === 'Walton'), 'graph concepts include relevant figures');
});

// ── a real cross-source conflict reaches this page (it used to reach only the Findings tab) ──

test('routeSurface surfaces a real cross-source numeric conflict in Contrast', () => {
  const conflictSources = [
    { sn: 1, reg: 'S-0001', title: 'Plan', text: 'The seawall will cost $120M.' },
    { sn: 2, reg: 'S-0002', title: 'Audit', text: 'The seawall will cost $300M according to auditors.' },
  ];
  const docs = {
    1: parseText('The seawall will cost $120M.', { docId: 'd1' }),
    2: parseText('The seawall will cost $300M according to auditors.', { docId: 'd2' }),
  };
  const surf = routeSurface('seawall cost', {
    sources: conflictSources, record: { entities: [], claims: [] },
    docFor: (s) => docs[s.sn], scopeSignal: () => true,
  });
  const row = surf.contrast.find((c) => c.origin === 'measure');
  assert.ok(row, 'a measure conflict row is present');
  assert.equal(row.status, 'Contested');
  assert.match(row.text, /\$120M/);
  assert.match(row.text, /\$300M/);
  assert.equal(surf.contrastKind, 'contested');
});

test('routeSurface: no cross-source conflict, no measure row', () => {
  const agreeingSources = [
    { sn: 1, reg: 'S-0001', title: 'Plan', text: 'The seawall will cost $120M.' },
    { sn: 2, reg: 'S-0002', title: 'Audit', text: 'The seawall has an approved budget of $120M.' },
  ];
  const docs = {
    1: parseText('The seawall will cost $120M.', { docId: 'd1' }),
    2: parseText('The seawall has an approved budget of $120M.', { docId: 'd2' }),
  };
  const surf = routeSurface('seawall cost', {
    sources: agreeingSources, record: { entities: [], claims: [] },
    docFor: (s) => docs[s.sn], scopeSignal: () => true,
  });
  assert.ok(!surf.contrast.some((c) => c.origin === 'measure'));
});

// ── void: the corpus can now say plainly it does not address a question ──

test('routeSurface: void when no enabled source addresses the named referent at all', () => {
  const source = { sn: 1, reg: 'S-0001', title: 'A', text: 'The seawall project began in 2020.' };
  const doc = parseText('The seawall project began in 2020.', { docId: 'd1' });
  const surf = routeSurface('What does Godzilla think of the seawall?', {
    sources: [source], record: { entities: [], claims: [] },
    docFor: () => doc, scopeSignal: () => true,
  });
  assert.equal(surf.answerable.void, true);
  assert.equal(surf.answerable.kind, 'elsewhere');
  assert.equal(surf.answerable.term, 'Godzilla');
});

test('routeSurface: not void when a source actually names the referent asked about', () => {
  const source = { sn: 1, reg: 'S-0001', title: 'A', text: "Margaret is Walton's sister." };
  const doc = parseText("Margaret is Walton's sister.", { docId: 'd1', genderCoref: true });
  const surf = routeSurface('Who is Margaret?', {
    sources: [source], record: { entities: [], claims: [] },
    docFor: () => doc, scopeSignal: () => true,
  });
  assert.equal(surf.answerable.void, false);
});
