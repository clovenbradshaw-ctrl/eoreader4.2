// perceiver/parse/pipeline.js — the relation-recurrence coupling (Move 3). Replaced a
// binary recurrent?1:0.5 step (plus a compounding ×0.5 for a once-seen NP target) with
// a parameter-free sighting-confidence curve, n/(n+1): no "recurrent enough" count to
// pick, no discount magnitude to pick, and no sharp jump at a threshold either.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/pipeline.js';

const conEdges = (doc) => doc.log.snapshot().filter((e) => e.op === 'CON' && e.via);

test('relation coupling: a single sighting reads exactly n/(n+1) = 0.5, compounding with a once-seen NP target', () => {
  const doc = parseText('Gregor spoke to his sister once.', { docId: 't1' });
  const spoke = conEdges(doc).find((e) => e.via === 'spoke');
  assert.ok(spoke, 'the relation edge is on the log');
  // confidenceOf(via seen once) * confidenceOf(NP target seen once) = 0.5 * 0.5 = 0.25
  assert.equal(spoke.w, 0.25);
});

test('relation coupling: a verb recurring 3x this document climbs the curve — 3/(3+1) — not a hard 1.0', () => {
  const doc = parseText(
    'Gregor walked to the door. Gregor walked to the window. Gregor walked outside.',
    { docId: 't2' },
  );
  const walked = conEdges(doc).filter((e) => e.via === 'walked');
  assert.equal(walked.length, 3);
  // confidenceOf(3) * confidenceOf(1) — each target (door/window/outside) is its own
  // once-seen NP, so the per-edge coupling is 0.75 * 0.5 = 0.375, NOT 1.0. A same-
  // document recurrence must never self-exempt through the corpus-prior door (the
  // ledger's `learn('relation', ...)` runs AFTER this coupling is computed, precisely
  // so isRelation can only ever mean a PRIOR document taught it, not this one, just now).
  for (const e of walked) assert.equal(e.w, 0.375, `expected the continuous curve, not a hard 1.0, on ${JSON.stringify(e)}`);
});

test('relation coupling: a verb this document sees only once stays weak even when other verbs in the same document recur', () => {
  const doc = parseText(
    'Gregor walked to the door. Gregor walked to the window. Gregor spoke to his sister once.',
    { docId: 't3' },
  );
  const spoke = conEdges(doc).find((e) => e.via === 'spoke');
  assert.equal(spoke.w, 0.25, 'a one-off verb is unaffected by an unrelated verb recurring elsewhere in the document');
});
