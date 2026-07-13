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

test('enactor/ground: an answer with no checkable claims is NOT "Supported"', () => {
  // The vacuous-truth bug: when the reader extracts nothing checkable, the tally has
  // zero substantive spans (source === 0 && assertion === 0). Such an answer has
  // NOTHING to verify — a green "Supported" badge there is the opposite of what it
  // implies. It must read 'empty' and NOT supported, so the surface never stamps
  // "grounded / Supported" on an answer that drew nothing from its sources.
  const empty = supportVerdict(groundSummary([]));
  assert.equal(empty.supported, false, 'no claims ⇒ not supported');
  assert.equal(empty.kind, 'empty', 'no claims ⇒ the "nothing to verify" kind');
  assert.equal(empty.claims, 0);

  // Same verdict when the summary is missing entirely (defensive: never green by default).
  assert.equal(supportVerdict(undefined).supported, false);
  assert.equal(supportVerdict(null).supported, false);

  // A genuinely grounded short answer still passes — the fix demotes only the vacuous case.
  const grounded = supportVerdict({ source: 2, assertion: 0 });
  assert.equal(grounded.supported, true);
  assert.equal(grounded.kind, 'sourced');

  // A pure-void answer (substantive claims, none traced to a source) still demotes as 'void'.
  const voided = supportVerdict({ source: 0, assertion: 3 });
  assert.equal(voided.supported, false);
  assert.equal(voided.kind, 'void');
});

test('surfer/dag: discourseDag reads a graph off a parsed doc', () => {
  const doc = createParser().parse(TEXT);
  const dag = discourseDag(doc);
  assert.ok(dag, 'a discourse cursor is produced');
});
