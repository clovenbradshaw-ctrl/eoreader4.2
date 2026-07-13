import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../src/core/verdicts.js';
import {
  CUT_KINDS, GROUNDS, makeCut, foldCuts, groundsOut, violatesB1, makeRuledOut,
} from '../src/core/cut.js';

// The typed cut (The Work v3, #1–#2, §8). A Cut is the atomic same/other judgment; a DEF's
// witness is the tree of Cuts that produced its verdict. These are falsifiers: each fails if the
// fold guesses where it should hold, if an ungrounded comparative cut can ship CORROBORATED (B1),
// or if the operators are secretly organ-specific rather than one cut parameterized by grain.

const V = VERDICTS;
const presence  = (v) => makeCut({ kind: CUT_KINDS.PRESENCE,  of: 'x', grounds: GROUNDS.NULSIG,   verdict: v, witness: { score: 1 } });
const argument  = (v) => makeCut({ kind: CUT_KINDS.ARGUMENT,  of: 'x', grounds: GROUNDS.INS,       verdict: v, witness: { anchor: 7 } });
const predicate = (v) => makeCut({ kind: CUT_KINDS.PREDICATE, of: 'x', grounds: GROUNDS.RESIDUAL,  verdict: v, witness: { relation: 'equal' } });

test('makeCut — a well-formed cut is typed, grounded, witnessed; presence is never indeterminate', () => {
  const c = presence(V.CORROBORATED);
  assert.equal(c.kind, 'presence');
  assert.equal(c.grounds, 'NULSIG');
  assert.ok(Object.isFrozen(c));
  assert.equal(c.malformed, undefined);
  // presence is decidable by definition — a suspended presence is malformed
  const bad = makeCut({ kind: CUT_KINDS.PRESENCE, of: 'x', verdict: V.INDETERMINATE, witness: {} });
  assert.ok(bad.malformed?.includes('presence-indeterminate'));
  // a witness-less cut is an oracle, like a witness-less DEF
  const oracle = makeCut({ kind: CUT_KINDS.ARGUMENT, of: 'x', verdict: V.CORROBORATED });
  assert.ok(oracle.malformed?.includes('no-witness'));
});

test('foldCuts §2 — the exact precedence: UNSUPPORTED → CONTRADICTED → CORROBORATED → held', () => {
  // 1. a required cut UNSUPPORTED dominates — nothing to seat
  assert.equal(foldCuts([presence(V.UNSUPPORTED), predicate(V.CORROBORATED)]), V.UNSUPPORTED);
  assert.equal(foldCuts([presence(V.CORROBORATED), argument(V.UNSUPPORTED), predicate(V.CORROBORATED)]), V.UNSUPPORTED);
  // 2. else any CONTRADICTED (wrong anchor / contrary predicate)
  assert.equal(foldCuts([presence(V.CORROBORATED), argument(V.CORROBORATED), predicate(V.CONTRADICTED)]), V.CONTRADICTED);
  assert.equal(foldCuts([presence(V.CORROBORATED), argument(V.CONTRADICTED), predicate(V.CORROBORATED)]), V.CONTRADICTED);
  // 3. all argument+presence CORROBORATED and predicate CORROBORATED → CORROBORATED
  assert.equal(foldCuts([presence(V.CORROBORATED), argument(V.CORROBORATED), predicate(V.CORROBORATED)]), V.CORROBORATED);
  // 4. else (the predicate stalled) → INDETERMINATE
  assert.equal(foldCuts([presence(V.CORROBORATED), argument(V.CORROBORATED), predicate(V.INDETERMINATE)]), V.INDETERMINATE);
});

test('foldCuts — an affirmation with no comparative cut cannot pass (the about≠says guard)', () => {
  // presence + argument corroborated but NO predicate cut — cannot affirm on aboutness alone
  assert.equal(foldCuts([presence(V.CORROBORATED), argument(V.CORROBORATED)]), V.INDETERMINATE);
  // no cuts at all — nothing to decide
  assert.equal(foldCuts([]), V.INDETERMINATE);
});

test('B1 — an ungrounded comparative cut can never ship CORROBORATED', () => {
  // a predicate cut that never grounded out (it is INDETERMINATE) is not "grounded"
  assert.equal(groundsOut(predicate(V.INDETERMINATE)), false);
  // a residual cut that RESOLVED to a witnessed CORROBORATED does ground out
  assert.equal(groundsOut(predicate(V.CORROBORATED)), true);
  // NULSIG / INS cuts always ground out
  assert.equal(groundsOut(presence(V.CORROBORATED)), true);
  assert.equal(groundsOut(argument(V.CORROBORATED)), true);

  // B1 is vacuous for a non-affirmation
  assert.equal(violatesB1(V.INDETERMINATE, [predicate(V.INDETERMINATE)]), null);
  // a CORROBORATED verdict whose cuts all ground out is clean
  assert.equal(violatesB1(V.CORROBORATED, [presence(V.CORROBORATED), predicate(V.CORROBORATED)]), null);
  // a CORROBORATED verdict carrying an ungrounded residual cut VIOLATES B1
  const bad = violatesB1(V.CORROBORATED, [presence(V.CORROBORATED), predicate(V.INDETERMINATE)]);
  assert.match(bad, /ungrounded-cut:predicate/);
  // a CORROBORATED verdict with no cuts at all violates B1 (nothing earned it)
  assert.equal(violatesB1(V.CORROBORATED, []), 'no-cuts');
});

test('makeRuledOut — the ruled-out other is bounded to one near-miss (§3)', () => {
  const r = makeRuledOut({ other: 's5', cut: CUT_KINDS.PREDICATE, margin: 0.4 });
  assert.deepEqual(r, { other: 's5', cut: 'predicate', margin: 0.4 });
  // an uncontested affirmation names no other, but the shape is still exactly one ruledOut
  const uncontested = makeRuledOut({ cut: CUT_KINDS.PRESENCE });
  assert.equal(uncontested.other, null);
});

// §8 — the cross-organ transfer test: the operators are one cut parameterized by grain, not N
// bespoke judges. A predicate cut calibrated on TEXT bindings (spans) must judge a TABLE-CELL
// witness and a TIME-SPAN (audio) witness with NO change to the fold — only the witness payload
// differs. If this fails, the tuple was never consilient and the "single cut" claim is false.
test('§8 cross-organ — the same fold judges text, table, and audio witnesses unchanged', () => {
  // a TABLE-CELL binding: the argument grounds out at a cell coordinate, the predicate at the
  // cell's own value being the claimed one. Same kinds, same grounds, cell coords for witness.
  const tableCorroborated = [
    makeCut({ kind: CUT_KINDS.PRESENCE,  of: 'cell', grounds: GROUNDS.NULSIG,  verdict: V.CORROBORATED, witness: { row: 3, col: 'revenue' } }),
    makeCut({ kind: CUT_KINDS.ARGUMENT,  of: 'cell', grounds: GROUNDS.INS,     verdict: V.CORROBORATED, witness: { anchor: 'row:3' } }),
    makeCut({ kind: CUT_KINDS.PREDICATE, of: 'cell', grounds: GROUNDS.RESIDUAL, verdict: V.CORROBORATED, witness: { relation: 'equal', cell: '4.2M' } }),
  ];
  assert.equal(foldCuts(tableCorroborated), V.CORROBORATED, 'a fully grounded table binding corroborates by the SAME fold');
  assert.equal(violatesB1(foldCuts(tableCorroborated), tableCorroborated), null);

  // a TABLE-CELL claim whose relation the cell does not witness (a computed superlative no cell
  // states) holds — exactly as an unstated text predicate holds.
  const tableHeld = [tableCorroborated[0], tableCorroborated[1], makeCut({ kind: CUT_KINDS.PREDICATE, of: 'cell', grounds: GROUNDS.RESIDUAL, verdict: V.INDETERMINATE, witness: { relation: 'unestablished' } })];
  assert.equal(foldCuts(tableHeld), V.INDETERMINATE);

  // an AUDIO (time-span) witness: the argument won't resolve (two speakers, unseparated) → held,
  // the reference-void shape, organ-independent.
  const audioHeld = [
    makeCut({ kind: CUT_KINDS.PRESENCE,  of: 'utt', grounds: GROUNDS.NULSIG, verdict: V.CORROBORATED, witness: { tStart: 12.4, tEnd: 15.1 } }),
    makeCut({ kind: CUT_KINDS.ARGUMENT,  of: 'utt', grounds: GROUNDS.INS,    verdict: V.INDETERMINATE, witness: { reason: 'speaker-unseparated' } }),
    makeCut({ kind: CUT_KINDS.PREDICATE, of: 'utt', grounds: GROUNDS.RESIDUAL, verdict: V.CORROBORATED, witness: { relation: 'equal' } }),
  ];
  assert.equal(foldCuts(audioHeld), V.INDETERMINATE, 'an unresolved speaker suspends the fold identically to an unresolved referent');
});
