import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTLED, UNSETTLED, RETRACTED,
  dependents, costOfSuperseding, supersedeEntries, resettleEntry,
  statusOf, standing, unsettledRefs,
} from '../src/core/supersede.js';
import { createCommitmentLedger } from '../src/enactor/ledger.js';

// A hand-built log, so the pure functions are tested without the ledger's ceremony.
const build = (rows) => rows.map((r, i) => Object.freeze({ seq: i, ...r }));

const CHAIN = build([
  { kind: 'def', id: 'basis@1', defKind: 'basis', provenance: 'corpus-covariance', under: null },
  { kind: 'assert', turn: 1, claim: 'a', under: 'basis@1' },
  { kind: 'assert', turn: 1, claim: 'b', under: 'basis@1' },
  { kind: 'def', id: 'frame@7', defKind: 'frame', provenance: 'retrieval', under: 'basis@1' },
  { kind: 'assert', turn: 2, claim: 'c', under: 'frame@7' },      // two edges from the basis
  { kind: 'assert', turn: 3, claim: 'd', under: null },           // judged from nowhere
]);

test('sigma reaches everything derived under a def, transitively', () => {
  assert.deepEqual([...dependents(CHAIN, 'basis@1')].sort((x, y) => x - y), [1, 2, 3, 4]);
  // the frame is a def built under the basis, so the claim measured under the FRAME
  // is reached at depth two. A list walk would miss it; supersession walks a graph.
  assert.ok(dependents(CHAIN, 'basis@1').has(4));
});

test('the bill is legible before it is paid', () => {
  assert.deepEqual(costOfSuperseding(CHAIN, 'basis@1'), { asserts: 3, defs: 1, total: 4 });
  assert.equal(costOfSuperseding(CHAIN, 'nosuchdef').total, 0);
});

test('a claim measured under no declared stance is born unsettled, not immune', () => {
  // The inversion. Leave it SETTLED and it is supersession-proof: no rebuild can reach
  // it, so the cheapest way to protect credit is to stop saying where you stand.
  assert.equal(statusOf(CHAIN, 5), UNSETTLED);
  assert.equal(statusOf(CHAIN, 1), SETTLED);
});

test('REC unsettles the dependents and leaves the rest alone', () => {
  const log = [...CHAIN];
  let seq = log.length;
  const other = Object.freeze({ seq: seq++, kind: 'def', id: 'basis@9', under: null });
  const safe = Object.freeze({ seq: seq++, kind: 'assert', claim: 'e', under: 'basis@9' });
  log.push(other, safe);

  for (const e of supersedeEntries(log, { was: 'basis@1', now: 'basis@2', turn: 4 })) {
    log.push(Object.freeze({ seq: seq++, ...e }));
  }
  assert.equal(statusOf(log, 1), UNSETTLED);   // direct
  assert.equal(statusOf(log, 4), UNSETTLED);   // two edges out, through the frame
  assert.equal(statusOf(log, 3), UNSETTLED);   // the frame def itself
  assert.equal(statusOf(log, 7), SETTLED);     // measured under a basis that still holds
});

test('a double REC does not double-charge', () => {
  const log = [...CHAIN];
  let seq = log.length;
  for (const e of supersedeEntries(log, { was: 'basis@1', turn: 4 })) log.push(Object.freeze({ seq: seq++, ...e }));
  const after = log.length;
  for (const e of supersedeEntries(log, { was: 'basis@1', turn: 5 })) log.push(Object.freeze({ seq: seq++, ...e }));
  assert.equal(log.length, after, 'sigma must be idempotent on a def already superseded');
});

test('a cycle in the under edges terminates', () => {
  const cyc = build([
    { kind: 'def', id: 'x', under: 'y' },
    { kind: 'def', id: 'y', under: 'x' },
    { kind: 'assert', claim: 'q', under: 'x' },
  ]);
  const hit = dependents(cyc, 'x');   // must not hang
  assert.ok(hit.has(1));
  assert.ok(hit.has(2));
});

test('standing is a projection, and credit is payable only by re-measurement', () => {
  const log = [...CHAIN];
  let seq = log.length;
  // a, b, and c. c is measured under frame@7, and frame@7 stands under basis@1, so c
  // stands. d was judged from nowhere and never stood at all.
  assert.equal(standing(log).settled, 3);
  for (const e of supersedeEntries(log, { was: 'basis@1', now: 'basis@2', turn: 4 })) log.push(Object.freeze({ seq: seq++, ...e }));
  log.push(Object.freeze({ seq: seq++, kind: 'def', id: 'basis@2', under: null }));

  assert.equal(standing(log).credit, 0, 'a lost basis takes the whole standing read with it');
  assert.deepEqual(unsettledRefs(log), [1, 2, 4, 5]);

  log.push(Object.freeze({ seq: seq++, ...resettleEntry({ ref: 1, under: 'basis@2', turn: 5, onMass: 0.71 }) }));
  assert.equal(statusOf(log, 1), SETTLED);
  assert.equal(standing(log).settled, 1);
});

test('a retraction is not an unsettling, and a rebuild does not un-deny it', () => {
  const log = [...CHAIN];
  let seq = log.length;
  log.push(Object.freeze({ seq: seq++, kind: 'retract', ref: 2, why: 'the sources deny it' }));
  for (const e of supersedeEntries(log, { was: 'basis@1', turn: 4 })) log.push(Object.freeze({ seq: seq++, ...e }));
  assert.equal(statusOf(log, 2), RETRACTED, 'the world denied it; no basis change un-denies anything');
  assert.equal(standing(log).retracted, 1);
});

// ── the ledger seam ─────────────────────────────────────────────────────────

test('a finite ledger with nowhere to spill refuses to be built', () => {
  assert.throws(() => createCommitmentLedger({ capacity: 10 }), /durable spill/);
  assert.doesNotThrow(() => createCommitmentLedger({ capacity: 10, spill: () => {} }));
  assert.doesNotThrow(() => createCommitmentLedger());   // Infinity by default
});

test('the ledger spills, it never drops', () => {
  const cold = [];
  const led = createCommitmentLedger({ capacity: 4, spill: (rows) => cold.push(...rows) });
  for (let i = 0; i < 10; i++) led.recordTurn({ answer: `line ${i}` });
  assert.equal(led.size, 4);
  assert.equal(cold.length + led.size, 20, 'every entry is either hot or spilled; none vanish');
  assert.equal(led.spilled, cold.length);
  // and the fold is recoverable: cold prefix plus hot tail is the whole log
  const whole = [...cold, ...led.entries()];
  assert.deepEqual(whole.map((e) => e.seq), whole.map((_, i) => i));
});

test('the ledger charges a rebuild and reports what it cost', () => {
  const led = createCommitmentLedger();
  led.def({ id: 'basis@1', kind: 'basis', provenance: 'corpus-covariance' });
  led.recordTurn({ answer: 'x', bound: [
    { claim: 'the pilot ran 118 flights', citation: 's1', under: 'basis@1' },
    { claim: 'the consent set does not match', citation: 's2', under: 'basis@1' },
  ] });
  assert.equal(led.standing().credit, 1);

  const bill = led.cost('basis@1');
  assert.equal(bill.asserts, 2);

  const paid = led.supersede({ was: 'basis@1', now: 'basis@2', why: 'the mass moved off the frame' });
  assert.deepEqual(paid, bill, 'the bill quoted is the bill charged');
  assert.equal(led.standing().credit, 0);
  assert.equal(led.unsettled().length, 2);
});

test('an uncited turn writes its confession into the log', () => {
  const led = createCommitmentLedger();
  led.recordTurn({ answer: 'spoken from nowhere in particular' });
  const [a] = led.asserts();
  assert.equal(a.under, null);
  assert.equal(led.statusOf(a.seq), UNSETTLED, 'no declared stance, no standing');
  assert.equal(led.standing().credit, 0);
});

test('serialize and restore preserve the projection, not just the rows', () => {
  const led = createCommitmentLedger();
  led.def({ id: 'basis@1', kind: 'basis', provenance: 'corpus' });
  led.recordTurn({ answer: 'x', bound: [{ claim: 'p', citation: 's1', under: 'basis@1' }] });
  led.supersede({ was: 'basis@1', now: 'basis@2' });
  const before = led.standing();

  const two = createCommitmentLedger();
  assert.ok(two.restore(led.serialize()));
  assert.deepEqual(two.standing(), before, 'status survives a reload, because status is folded not stored');
});

test('nothing is ever overwritten', () => {
  const led = createCommitmentLedger();
  led.def({ id: 'basis@1', kind: 'basis' });
  led.recordTurn({ answer: 'x', bound: [{ claim: 'p', citation: 's1', under: 'basis@1' }] });
  const snapshot = led.entries();
  led.supersede({ was: 'basis@1', now: 'basis@2' });
  const after = led.entries();
  assert.deepEqual(after.slice(0, snapshot.length), snapshot, 'supersession appends beside, never over');
  assert.ok(after.length > snapshot.length);
});

test('a claim cannot be resettled under a def that is itself unsettled', () => {
  // The laundering case. Pay the debt with counterfeit currency: re-measure a claim
  // under a stance that was ALSO pulled out from under the system. If the fold accepts
  // it, the whole ledger can be restored to full credit without a single honest
  // measurement, and the cost that makes REC an act evaporates.
  const log = [...CHAIN];
  let seq = log.length;
  for (const e of supersedeEntries(log, { was: 'basis@1', now: 'basis@2', turn: 4 })) log.push(Object.freeze({ seq: seq++, ...e }));
  assert.equal(statusOf(log, 3), UNSETTLED, 'frame@7 went down with the basis');

  log.push(Object.freeze({ seq: seq++, ...resettleEntry({ ref: 1, under: 'frame@7', turn: 5 }) }));
  assert.equal(statusOf(log, 1), UNSETTLED, 'a stance that does not stand cannot make a claim stand');
});
