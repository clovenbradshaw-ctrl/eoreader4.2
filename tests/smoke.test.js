// The migration smoke test — proves the nested holon tree is wired: the reading
// spine (parse → reading → ground) and the generation seam load and run through
// their new faculty paths. The exhaustive behavior suite lives in eoreader4.1
// (see MIGRATION-POINTER.md); this is the checkpoint that the 4.2 tree resolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createParser } from '../src/perceiver/parse/index.js';
import { readingAt } from '../src/perceiver/reading.js';
import { groundSpans, supportVerdict, groundSummary } from '../src/enactor/ground/spans.js';
import { discourseDag } from '../src/surfer/dag/index.js';

const TEXT = 'The dolphin swam near the boat. The dolphin is intelligent. '
  + 'It recognizes itself in a mirror.';

test('perceiver: parse yields sentences and an append-only log', () => {
  const doc = createParser().parse(TEXT);
  assert.equal(doc.sentences.length, 3);
  assert.ok(doc.log, 'doc carries an event log');
});

test('perceiver: readingAt returns a reading with surprise at a cursor', () => {
  const doc = createParser().parse(TEXT);
  const r = readingAt(doc, 1);
  assert.ok(r, 'a reading is produced');
});

test('enactor/ground: groundSpans + supportVerdict grade an answer against spans', () => {
  const spans = [{ idx: 0, text: 'The dolphin is intelligent.' }];
  const passages = [{ text: 'The dolphin is intelligent.', source: 'S1' }];
  const verdicts = groundSpans(spans, { passages });
  const verdict = supportVerdict(groundSummary(verdicts));
  assert.ok(typeof verdict.supported === 'boolean');
});

test('surfer/dag: discourseDag reads a graph off a parsed doc', () => {
  const doc = createParser().parse(TEXT);
  const dag = discourseDag(doc);
  assert.ok(dag, 'a discourse cursor is produced');
});
