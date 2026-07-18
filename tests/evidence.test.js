import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  confidenceBand, kindLabel, explanationFor, correspondingEvidenceFor,
  propositionsFor, citationFor, buildMark,
} from '../src/rooms/reader/evidence.js';

test('confidenceBand: the same 0.55 / 0.28 split the waveform bars colour by', () => {
  assert.equal(confidenceBand(0.9), 'High confidence');
  assert.equal(confidenceBand(0.56), 'High confidence');
  assert.equal(confidenceBand(0.4), 'Medium confidence');
  assert.equal(confidenceBand(0.29), 'Medium confidence');
  assert.equal(confidenceBand(0.1), 'Low confidence');
  assert.equal(confidenceBand(0), 'Low confidence');
  assert.equal(confidenceBand(undefined), 'Low confidence');
});

test('kindLabel: names the channel that fired, not an interpretation', () => {
  assert.equal(kindLabel({ hasBridge: false }), 'Local departure');
  assert.equal(kindLabel({ hasBridge: true }), 'Referents drawn together');
});

test('explanationFor: measured language only — never invents interior state', () => {
  const plain = explanationFor({ hasBridge: false });
  assert.match(plain, /departs from the surrounding/);
  const bridged = explanationFor({ hasBridge: true, bridgeAxis: ['Victor', 'the creature'] });
  assert.match(bridged, /Victor and the creature/);
  const bridgedNoAxis = explanationFor({ hasBridge: true, bridgeAxis: [] });
  assert.match(bridgedNoAxis, /drawing two referents/);
});

test('correspondingEvidenceFor: matches this source\'s cell to the row it belongs to', () => {
  const matrix = {
    rows: [
      {
        measure: 'budget', measureLabel: 'Budget', reading: 'Sources disagree', conflict: true,
        cells: [
          { source: 'S-0001', sourceLabel: 'S-0001', value: 120e6, raw: '$120M', sentIdx: 14, text: 'Budget was estimated at $120M' },
          { source: 'S-0002', sourceLabel: 'S-0002', value: 145e6, raw: '$145M', sentIdx: 81, text: 'Total: $145M' },
        ],
      },
    ],
  };
  const mine = correspondingEvidenceFor(matrix, 'S-0001', 14);
  assert.ok(mine);
  assert.equal(mine.measure, 'budget');
  assert.equal(mine.entries.length, 1);
  assert.equal(mine.entries[0].source, 'S-0002');
});

test('correspondingEvidenceFor: null when this passage never fed the matrix', () => {
  const matrix = { rows: [{ measure: 'budget', cells: [{ source: 'S-0001', sentIdx: 14 }] }] };
  assert.equal(correspondingEvidenceFor(matrix, 'S-0001', 99), null);
  assert.equal(correspondingEvidenceFor(null, 'S-0001', 14), null);
});

test('correspondingEvidenceFor: null when this source is the only one on the row', () => {
  const matrix = { rows: [{ measure: 'budget', cells: [{ source: 'S-0001', sentIdx: 14 }] }] };
  assert.equal(correspondingEvidenceFor(matrix, 'S-0001', 14), null);
});

test('propositionsFor: matches claims by (docId, unit), same pair a citation click resolves', () => {
  const claims = [
    { docId: 'd1', unit: 14, key: 'k1', text: 'claim A' },
    { docId: 'd1', unit: 20, key: 'k2', text: 'claim B' },
    { docId: 'd2', unit: 14, key: 'k3', text: 'claim C' },
  ];
  const out = propositionsFor(claims, 'd1', 14);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'k1');
});

test('citationFor: source + line + the quoted sentence', () => {
  const cite = citationFor({ sourceLabel: 'S-0003', sourceTitle: 'Federal review', line: 'line 218', sentence: 'The MTA was not allowed to begin.' });
  assert.equal(cite, 'S-0003 · Federal review (line 218) — "The MTA was not allowed to begin."');
});

test('buildMark: assembles the full technical contract, sourceLocator as {sentIdx,charStart,charEnd}', () => {
  const m = buildMark({ sourceId: 'S-0003', idx: 218, total: 385, sentence: 'The MTA was not allowed to begin.', frac: 0.8 });
  assert.equal(m.sourceId, 'S-0003');
  assert.equal(m.unitStart, 218);
  assert.equal(m.unitEnd, 218);
  assert.deepEqual(m.sourceLocator, { sentIdx: 218, charStart: 0, charEnd: 33 });
  assert.equal(m.signalType, 'turn');
  assert.equal(m.confidence, 0.8);
  assert.equal(m.confidenceLabel, 'High confidence');
  assert.equal(m.kindLabel, 'Local departure');
  assert.ok(m.explanation);
  assert.deepEqual(m.propositions, []);
  assert.equal(m.correspondingEvidence, null);
  assert.equal(m.locatorLabel, 'TEXT · PASSAGE 219 OF 385');
});

test('buildMark: confidence is clamped to [0,1] even on a bad input', () => {
  assert.equal(buildMark({ frac: 5 }).confidence, 1);
  assert.equal(buildMark({ frac: -3 }).confidence, 0);
  assert.equal(buildMark({ frac: NaN }).confidence, 0);
});
