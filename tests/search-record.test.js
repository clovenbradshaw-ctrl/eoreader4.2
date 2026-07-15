import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseQuery, hasQuery, entityTypeOf, searchRecord } from '../src/rooms/reader/search-record.js';

// Search over the record (docs/search-and-pins.md): grouped kinds, operator facets riding fields
// the record already carries, honest empty groups. Pure — the fixtures below are the providers.

test('parseQuery — operators lift out, quoted values, bare flags, unknown prefixes stay text', () => {
  const p = parseQuery('entity:"Mont Blanc" ice contradicts: type:place');
  assert.equal(p.ops.entity, 'Mont Blanc');
  assert.equal(p.ops.contradicts, true);
  assert.equal(p.ops.type, 'place');
  assert.equal(p.text, 'ice');
  assert.deepEqual(p.terms, ['ice']);
  const u = parseQuery('read https://example.com/page');
  assert.equal(u.ops.entity, null, 'https: is not an operator');
  assert.ok(u.text.includes('https://example.com/page'));
  assert.ok(!hasQuery(parseQuery('')), 'empty query is empty');
  assert.ok(hasQuery(parseQuery('contradicts:')), 'a bare flag is a query');
});

test('entityTypeOf — typed relations vote; the label shape is the floor', () => {
  assert.equal(entityTypeOf({ label: 'Grete', viasAsSrc: ['sister'] }), 'person');
  assert.equal(entityTypeOf({ label: 'Geneva', viasAsTgt: ['in'] }), entityTypeOf({ label: 'Geneva', viasAsTgt: ['in'] }), 'deterministic');
  assert.equal(entityTypeOf({ label: 'Mont Blanc' }), 'proper', 'proper-noun label with no typed bonds');
  assert.equal(entityTypeOf({ label: 'grief' }), 'theme', 'abstract vocabulary is the honest floor');
});

const SRC = [
  { sn: 'S1', reg: 'S-0001', docId: 'dA', title: 'Frankenstein', domain: 'gutenberg.org', kind: 'web',
    text: 'The ice closed around the ship. Walton wrote to his sister. The creature spoke of Geneva.' },
  { sn: 'S2', reg: 'S-0002', docId: 'dB', title: 'Arctic Report', domain: 'npr.org', kind: 'web',
    text: 'The ice is retreating faster each year. Scientists disagree about the rate.' },
];
const DOCS = {
  dA: { sentences: ['The ice closed around the ship.', 'Walton wrote to his sister.', 'The creature spoke of Geneva.'] },
  dB: { sentences: ['The ice is retreating faster each year.', 'Scientists disagree about the rate.'] },
};
const ENTS = [
  { key: 'walton', entId: 'e1', docId: 'dA', sn: 'S1', label: 'Walton', mentions: 6, sourceCount: 1 },
  { key: 'geneva', entId: 'e2', docId: 'dA', sn: 'S1', label: 'Geneva', mentions: 3, sourceCount: 2 },
  { key: 'grief', entId: 'e3', docId: 'dA', sn: 'S1', label: 'grief', mentions: 2, sourceCount: 1 },
];
const CLAIMS = [
  { key: 'k1', text: 'The ice closed around the ship.', status: 'Witnessed', band: 'witnessed', origin: 'reading', sn: 'S1', reg: 'S-0001', docId: 'dA', unit: 0, quote: 'The ice closed around the ship.' },
  { key: 'k2', text: 'The ice is retreating faster each year.', status: 'Contested', band: 'contested', origin: 'turn', sn: 'S2', reg: 'S-0002', docId: 'dB', unit: 0, quote: 'The ice is retreating faster each year.' },
  { key: 'k3', text: 'Walton wrote to his sister.', status: 'Stated', band: 'stated', origin: 'reading', sn: 'S1', reg: 'S-0001', docId: 'dA', unit: 1, quote: 'Walton wrote to his sister.' },
];
const CTX = { sources: SRC, entities: ENTS, claims: CLAIMS, docFor: (s) => DOCS[s.docId] };

test('searchRecord — grouped kinds, all terms must hit, verbatim passages carry their unit', () => {
  const r = searchRecord('ice', CTX);
  assert.equal(r.entities.length, 0, 'no entity is named ice');
  assert.equal(r.claims.length, 2);
  assert.equal(r.claims[0].status, 'Contested', 'a contested claim announces itself first');
  assert.ok(r.passages.length >= 2);
  assert.ok(r.passages.every((p) => /ice/i.test(p.text) && Number.isInteger(p.unit)));
  assert.equal(r.sources.length, 2);
});

test('searchRecord — entity: facet narrows claims and passages to the figure', () => {
  const r = searchRecord('entity:Walton', CTX);
  assert.equal(r.entities.length, 1);
  assert.equal(r.entities[0].label, 'Walton');
  assert.ok(r.claims.every((c) => /walton/i.test(`${c.text} ${c.quote}`)));
  assert.ok(r.passages.every((p) => /walton/i.test(p.text)));
});

test('searchRecord — contradicts: and unique: facets', () => {
  const c = searchRecord('contradicts:', CTX);
  assert.equal(c.claims.length, 1);
  assert.equal(c.claims[0].status, 'Contested');
  const u = searchRecord('unique: walton', CTX);
  assert.ok(u.entities.every((e) => e.sourceCount === 1));
  assert.ok(u.claims.every((cl) => cl.band === 'stated' || cl.status === 'Uncited'));
});

test('searchRecord — source: narrows every group; type: filters entities', () => {
  const r = searchRecord('source:npr ice', CTX);
  assert.ok(r.claims.every((c) => c.sn === 'S2'));
  assert.ok(r.passages.every((p) => p.sn === 'S2'));
  assert.ok(r.sources.every((s) => s.sn === 'S2'));
  const t = searchRecord('type:theme grief', { ...CTX, relationsOf: () => ({}) });
  assert.equal(t.entities.length, 1);
  assert.equal(t.entities[0].label, 'grief');
  const tp = searchRecord('type:person walton', { ...CTX, relationsOf: (row) => (row.label === 'Walton' ? { viasAsSrc: ['brother'] } : {}) });
  assert.equal(tp.entities.length, 1);
  assert.equal(tp.entities[0].type, 'person');
});

test('searchRecord — empty query yields empty groups; a thin record is honestly thin', () => {
  const e = searchRecord('', CTX);
  assert.equal(e.entities.length + e.claims.length + e.passages.length + e.sources.length, 0);
  const none = searchRecord('zeppelin', CTX);
  assert.equal(none.claims.length + none.passages.length + none.sources.length + none.entities.length, 0, 'nothing padded');
});
