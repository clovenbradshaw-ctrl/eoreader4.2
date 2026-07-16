import test from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/perceiver/parse/index.js';
import { exportSourceJsonl, exportSourceAtCursor, cursorFromTextPoint, cursorFromLogTime } from '../src/rooms/reader/source-export.js';

test('exports a source with full append-only history as jsonl', () => {
  const doc = parseText('Alpha begins. Beta follows.', { docId: 'doc-export' });
  const source = { sn: 'S1', title: 'Export me', text: doc.text, sha: 'abc' };
  const lines = exportSourceJsonl({ source, doc }).trim().split('\n').map(JSON.parse);
  assert.equal(lines[0].type, 'source');
  assert.equal(lines[1].type, 'document');
  const eventLines = lines.filter(l => l.type === 'event');
  assert.equal(eventLines.length, doc.log.length);
  assert.deepEqual(eventLines.map(l => l.seq), doc.log.snapshot().map(e => e.seq));
});

test('exports one json projection at a text cursor', () => {
  const doc = parseText('Alpha begins. Beta follows. Gamma ends.', { docId: 'doc-cursor' });
  const cursor = cursorFromTextPoint(doc, { quote: 'Beta' });
  assert.equal(cursor.unitIdx, 1);
  const out = JSON.parse(exportSourceAtCursor({ source: { sn: 'S1', title: 'T', text: doc.text }, doc, cursor: { quote: 'Beta' } }));
  assert.equal(out.cursor.kind, 'text');
  assert.match(out.projection.text, /Alpha begins/);
  assert.match(out.projection.text, /Beta follows/);
  assert.doesNotMatch(out.projection.text, /Gamma ends/);
  assert.ok(out.log.events.every(e => !Number.isInteger(e.sentIdx) || e.sentIdx <= 1));
});

test('exports one json projection at an append-only log timestamp', () => {
  const doc = parseText('Alpha begins. Beta follows.', { docId: 'doc-time' });
  const events = doc.log.snapshot();
  const cursor = cursorFromLogTime(doc, events[1].t);
  const out = JSON.parse(exportSourceAtCursor({ source: { sn: 'S1', title: 'T', text: doc.text }, doc, cursor: { mode: 'log-time', at: events[1].t } }));
  assert.equal(out.cursor.kind, 'log-time');
  assert.equal(out.cursor.seq, cursor.seq);
  assert.ok(out.log.events.every(e => e.seq <= cursor.seq));
});
