// The garden-path reanalysis loop, wired live (surfer/reanalyze.js → weave/write/traverse.js).
// P3-backward / retrodiction: reading commits under the arrow of time, so it can grab a predicate
// into an object slot ("Beauty ran past the barn FELL"). applyReanalysis re-judges the past —
// re-retrieves a subject for the orphaned verb and APPENDS a REC that supersedes the mis-bond with
// the corrected reduced-relative reading, on an append-only log (the mis-bond stays on the trail).
// The consumer (conceptToPlan) already honoured such a REC but was never fed one; conceptToPlan now
// runs the producer. These tests pin: (1) the loop is live end-to-end, (2) it is idempotent — the
// think loop's repeated conceptToPlan calls append the re-judgement at most once, (3) it is inert
// on a clean reading (no garden path → no REC, byte-identical plan).

import test from 'node:test';
import assert from 'node:assert/strict';

import { conceptToPlan } from '../src/weave/write/traverse.js';
import { applyReanalysis, reanalyze } from '../src/surfer/reanalyze.js';

// A minimal reading log — the append-only interface reanalyze/traverse read: snapshot() + append().
const fakeLog = (events) => {
  const evs = events.slice();
  return { snapshot: () => evs.slice(), append: (e) => { evs.push(e); return e; } };
};

// "Beauty ran past the barn fell": the bond (Beauty --ran--> "fell") grabbed the main verb "fell"
// into its object slot. "fell"/"ran" are relation verbs per the doc's own conventions.
const gardenPathDoc = () => ({
  log: fakeLog([
    { op: 'INS', id: 'e1', label: 'Beauty', sentIdx: 0 },
    { op: 'CON', src: 'e1', via: 'ran', tgt: 'fell', sentIdx: 0 },
  ]),
  conventions: { isRelation: (w) => ['ran', 'fell'].includes(String(w).toLowerCase()) },
});

const recsOf = (doc) => doc.log.snapshot().filter((e) => e.op === 'REC' && e.kind === 'reanalysis');

test('reanalysis wired: conceptToPlan re-judges a garden path into the reduced-relative reading', () => {
  const doc = gardenPathDoc();
  const plan = conceptToPlan(doc);
  assert.equal(plan.length, 1);
  // the orphaned verb is now the MAIN predicate; the original verb is demoted to a modifier —
  // "Beauty, who ran, fell." — not the mis-bond "Beauty ran fell".
  assert.equal(plan[0].verb, 'fell');
  assert.equal(plan[0].relative?.verb, 'ran');
  assert.equal(plan[0].subj.name, 'Beauty');
  assert.ok(plan[0].obj == null, 'the mis-bond {verb:ran, obj:fell} must not survive');
  // and the re-judgement is ON THE RECORD (append-only), not just computed and dropped.
  assert.equal(recsOf(doc).length, 1);
});

test('reanalysis wired: applyReanalysis is idempotent — the past is re-judged once, never duplicated', () => {
  const doc = gardenPathDoc();
  assert.equal(applyReanalysis(doc), 1);   // first pass fires
  assert.equal(applyReanalysis(doc), 0);   // second pass sees the REC already on the log → no-op
  assert.equal(recsOf(doc).length, 1);
  // reanalyze itself no longer re-proposes an already-superseded bond.
  assert.equal(reanalyze(doc).count, 0);
});

test('reanalysis wired: repeated conceptToPlan (the think loop) appends the REC at most once', () => {
  const doc = gardenPathDoc();
  conceptToPlan(doc);
  conceptToPlan(doc);
  conceptToPlan(doc);
  assert.equal(recsOf(doc).length, 1);
});

test('reanalysis wired: inert on a clean reading — no garden path, no REC, plan unchanged', () => {
  const doc = {
    log: fakeLog([
      { op: 'INS', id: 'e1', label: 'Grete', sentIdx: 0 },
      { op: 'INS', id: 'e2', label: 'Gregor', sentIdx: 0 },
      { op: 'CON', src: 'e1', via: 'fed', tgt: 'e2', sentIdx: 0 },   // object is a real entity — fine
    ]),
    conventions: { isRelation: (w) => ['fed'].includes(String(w).toLowerCase()) },
  };
  const plan = conceptToPlan(doc);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].verb, 'fed');
  assert.equal(plan[0].obj?.name, 'Gregor');
  assert.equal(recsOf(doc).length, 0);
});
