import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimKey, sameClaim, turnClaims, readingClaims, summaryClaims, murmurClaims, recordClaims } from '../src/rooms/reader/claims.js';

// The findings projection (docs/search-and-pins.md): claims from every mint, with the two turn
// joins fixed. These tests pin the joins the old derivation got wrong, the standing→status
// banding, and the dedup discipline (a contradiction is never hidden by dedup).

const asstMsg = (over = {}) => ({ id: 'm2', role: 'assistant', text: '', bound: [], verdicts: [], cites: [], ...over });

test('claimKey — content-addressed, stable, place-sensitive', () => {
  const a = claimKey('The bell rang.', 'doc-1', 4);
  assert.equal(a, claimKey('The bell   rang.', 'doc-1', 4), 'canon-folded: whitespace does not change identity');
  assert.notEqual(a, claimKey('The bell rang.', 'doc-1', 5), 'a different unit is a different claim');
  assert.notEqual(a, claimKey('The bell rang.', 'doc-2', 4), 'a different source is a different claim');
  assert.match(a, /^clm-/);
});

test('turnClaims — the citation join is exact on the cite index, not a substring', () => {
  // The old join used String(citation).includes(String(idx)) — so citation 's12' matched cite 1.
  const m = asstMsg({
    bound: [{ claim: 'The engine ran on steam.', citation: 's12', cited: null }],
    cites: [
      { idx: 1, unit: 1, docId: 'dA', sn: 'S1', reg: 'S-0001', title: 'A', text: 'WRONG passage.' },
      { idx: 12, unit: 3, docId: 'dB', sn: 'S2', reg: 'S-0002', title: 'B', text: 'The engine ran on steam all winter.' },
    ],
  });
  const { rows } = turnClaims([m]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sn, 'S2', 'joined to cite 12, not cite 1');
  assert.equal(rows[0].unit, 3, 'carries the SOURCE-LOCAL unit off the cite');
  assert.equal(rows[0].status, 'Supported');
  assert.equal(rows[0].origin, 'turn');
});

test('turnClaims — Contested joins by canon containment within the message, not exact equality', () => {
  // The verdict sentence and the bound claim are two splits of the same answer — they may differ
  // by a clause. The old exact-equality join (against an entity-id reconstruction) never fired.
  const m = asstMsg({
    bound: [{ claim: 'Ada married Babbage in 1840.', citation: 's2', cited: null }],
    verdicts: [{ verdict: 'contradicted', claim: 'ada married babbage in 1840' }],
    cites: [{ idx: 2, unit: 2, docId: 'dA', sn: 'S1', reg: 'S-0001', title: 'A', text: 'They never married.' }],
  });
  const { rows, contradictions } = turnClaims([m]);
  assert.equal(contradictions, 1);
  assert.equal(rows[0].status, 'Contested');
  assert.equal(rows[0].band, 'contested');
});

test('turnClaims — an uncited claim stays Uncited; a verdict with no matching claim still counts', () => {
  const m = asstMsg({
    bound: [{ claim: 'Something unsourced.', citation: null, cited: null }],
    verdicts: [{ verdict: 'contradicted', claim: 'an entirely different relation' }],
  });
  const { rows, contradictions } = turnClaims([m]);
  assert.equal(rows[0].status, 'Uncited');
  assert.equal(contradictions, 1, 'the contradiction is counted even unmatched');
});

const invObjects = [
  { key: 'claim:0', type: 'claim', relational: false, standing: 'witnessed', cite: [4],
    fields: { subject: 'Gregor', value: 'a travelling salesman', polarity: '+' } },
  { key: 'rel:1000', type: 'claim', relational: true, standing: 'stated', cite: [7],
    fields: { subject: 'Grete', via: 'sister', object: 'Gregor', polarity: '+', kinship: true } },
  { key: 'fact:0', type: 'fact', standing: 'computed', cite: [], fields: { kind: 'count', verb: 'names', n: 8, noun: 'entities' } },
];

test('readingClaims — topline claim objects become Witnessed/Stated rows; facts never masquerade as claims', () => {
  const src = { sn: 'S1', reg: 'S-0001', docId: 'dA', title: 'Metamorphosis', summary: { objects: invObjects } };
  const doc = { sentences: ['s0', 's1', 's2', 's3', 'Gregor was a travelling salesman.', 's5', 's6', 'Grete, his sister, wept.'] };
  const rows = readingClaims(src, doc);
  assert.equal(rows.length, 2, 'the fact object is not a claim');
  assert.equal(rows[0].status, 'Witnessed');
  assert.equal(rows[0].origin, 'reading');
  assert.equal(rows[0].text, 'Gregor is a travelling salesman.');
  assert.equal(rows[0].unit, 4);
  assert.equal(rows[0].quote, 'Gregor was a travelling salesman.');
  assert.equal(rows[1].status, 'Stated');
  assert.equal(rows[1].text, "Grete is Gregor's sister.");
});

test('summaryClaims — entity toplines attribute to their lead source', () => {
  const sums = [{ summary: { label: 'Gregor', objects: [invObjects[0]] }, sn: 'S1', reg: 'S-0001', docId: 'dA' }];
  const rows = summaryClaims(sums, () => ({ sentences: { 4: 'Gregor was a travelling salesman.' } }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].origin, 'summary');
  assert.equal(rows[0].subject, 'Gregor');
  assert.equal(rows[0].sn, 'S1');
});

test('murmurClaims — only promoted connections mint; the document is the witness', () => {
  const src = { sn: 'S1', reg: 'S-0001', docId: 'dA' };
  const doc = {
    sentences: ['a', 'b', 'The ice closed around the ship.'],
    admission: { labelOf: (id) => ({ e1: 'Walton', e2: 'the ice' }[id] || id) },
    log: { events: [
      { op: 'CON', src: 'e1', tgt: 'e2', via: 'trapped by', sentIdx: 2, connection: true, nominatedBy: 'murmur', echoes: { sharedLabel: 'the ice' } },
      { op: 'CON', src: 'e1', tgt: 'e2', via: 'sailed', sentIdx: 1 },                    // ordinary edge — not a promotion
      { op: 'DEF', node: 'e1', key: 'predicate', value: 'captain' },
    ] },
  };
  const rows = murmurClaims(src, doc);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'Promoted');
  assert.equal(rows[0].origin, 'murmur');
  assert.equal(rows[0].text, 'Walton trapped by the ice.');
  assert.equal(rows[0].quote, 'The ice closed around the ship.');
});

test('recordClaims — merged, deduped by key; a Contested duplicate upgrades the kept row', () => {
  const src = { sn: 'S1', reg: 'S-0001', docId: 'dA', title: 'T',
    summary: { objects: [{ key: 'claim:0', type: 'claim', relational: false, standing: 'witnessed', cite: [0],
      fields: { subject: 'Ada', value: 'married to Babbage in 1840', polarity: '+' } }] } };
  const doc = { sentences: ['Ada was married to Babbage in 1840.'], log: { events: [] } };
  // A turn asserts the same claim (same words, same place) and the fact-check contests it.
  const m = asstMsg({
    bound: [{ claim: 'Ada is married to Babbage in 1840.', citation: 's0', cited: null }],
    verdicts: [{ verdict: 'contradicted', claim: 'Ada is married to Babbage in 1840.' }],
    cites: [{ idx: 0, unit: 0, docId: 'dA', sn: 'S1', reg: 'S-0001', title: 'T', text: 'Ada was married to Babbage in 1840.' }],
  });
  const { claims, contradictions } = recordClaims({ messages: [m], sources: [src], docFor: () => doc, entitySummaries: [] });
  const dupes = claims.filter((c) => /married to babbage/i.test(c.text));
  assert.equal(dupes.length, 1, 'one row for one claim, whichever mint said it first');
  assert.equal(dupes[0].origin, 'reading', 'first mint wins the row');
  assert.equal(dupes[0].status, 'Contested', 'the contradiction is never hidden by dedup');
  assert.ok(contradictions >= 1);
});

test('sameClaim — canon equality and containment, both ways', () => {
  assert.ok(sameClaim('The “ice” closed.', 'the "ice" closed.'));
  assert.ok(sameClaim('The ice closed around the ship.', 'ice closed around the ship'));
  assert.ok(!sameClaim('The ice closed.', 'The crew mutinied.'));
});
