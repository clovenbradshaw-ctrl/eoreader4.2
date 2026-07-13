import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../src/core/verdicts.js';
import { makeDef, createJudgmentLog, isVerdict, isGrain, GRAINS } from '../src/core/def.js';
import {
  recordBindingDefs, recordCorrespondenceDefs, recordReferenceDef, recordVoidDef,
} from '../src/turn/judgments.js';

// The DEF substrate (docs "The Work, v2" §0). The reframe: the whole system asks SAME or OTHER,
// and the object that answers is a JUDGMENT — a typed verdict carrying its witness, on an
// append-only log, revisable. These tests are falsifiers: each fails if the substrate is
// decorative — if a DEF can be an oracle (verdict with no witness), if a revision OVERWRITES
// instead of appending, or if the distribution reads anything but the current verdict per subject.

test('makeDef — a well-formed DEF is a typed, frozen, witnessed judgment', () => {
  const d = makeDef({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:x', witness: { score: 0.9 } });
  assert.equal(d.type, 'def');
  assert.equal(d.verdict, VERDICTS.CORROBORATED);
  assert.equal(d.grain, 'claim');
  assert.ok(Object.isFrozen(d), 'a DEF is immutable — revision appends, never mutates');
  assert.equal(d.malformed, undefined, 'a witnessed, typed DEF is well-formed');
});

test('the oracle trap — a verdict with no witness is recorded malformed, never crashes', () => {
  const oracle = makeDef({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.CLAIM, of: 'x' });   // no witness
  assert.ok(oracle.malformed?.includes('no-witness'), 'a DEF without a derivation is an oracle — flagged');
  const badVerdict = makeDef({ verdict: 'supported:0.87', witness: {} });                     // scalar, not a verdict
  assert.ok(badVerdict.malformed?.some(m => m.startsWith('unknown-verdict')));
  assert.equal(isVerdict('supported:0.87'), false);
  assert.equal(isGrain('claim'), true);
});

test('the log is append-only with monotonic stamps', () => {
  const log = createJudgmentLog();
  log.judge({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.CLAIM, of: 'a', witness: {} });
  log.judge({ verdict: VERDICTS.UNSUPPORTED, grain: GRAINS.CLAIM, of: 'b', witness: {} });
  const all = log.all();
  assert.equal(all.length, 2);
  assert.equal(all[0].t, 0);
  assert.equal(all[1].t, 1);
  assert.equal(log.size, 2);
});

test('REVISABILITY — a disagreeing later read APPENDS a counter-DEF; the first is never erased', () => {
  const log = createJudgmentLog();
  const first = log.judge({ verdict: VERDICTS.INDETERMINATE, grain: GRAINS.REFERENT, of: 'referent:7', witness: { margin: 0.01 } });
  // a later read, with more evidence, cuts the other way
  const counter = log.revise('referent:7', { verdict: VERDICTS.CORROBORATED, witness: { margin: 0.4 } });

  // the counter-DEF links back to the DEF it re-judges — a linked list, not an overwrite
  assert.equal(counter.revises, first.t);
  assert.equal(counter.grain, GRAINS.REFERENT, 'a revision keeps cutting at the same grain');

  // the ORIGINAL still stands in the log — a superseded verdict is out-voted, never deleted
  assert.equal(log.size, 2);
  assert.equal(log.all()[0].verdict, VERDICTS.INDETERMINATE);
  assert.ok(Object.isFrozen(first));

  // the PROJECTION recomputes to the latest verdict per subject
  const now = log.project().get('referent:7');
  assert.equal(now.verdict, VERDICTS.CORROBORATED);
  assert.equal(log.latestOf('referent:7').verdict, VERDICTS.CORROBORATED);
});

test('revise with no prior judgment is simply a first judgment (revises = null)', () => {
  const log = createJudgmentLog();
  const d = log.revise('never-seen', { verdict: VERDICTS.UNSUPPORTED, grain: GRAINS.FIELD, witness: { kind: 'elsewhere' } });
  assert.equal(d.revises, null);
  assert.equal(log.project().get('never-seen').verdict, VERDICTS.UNSUPPORTED);
});

test('distribution — counts the CURRENT verdict per subject, split by grain', () => {
  const log = createJudgmentLog();
  log.judge({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:1', witness: {} });
  log.judge({ verdict: VERDICTS.UNSUPPORTED,  grain: GRAINS.CLAIM, of: 'claim:2', witness: {} });
  log.judge({ verdict: VERDICTS.INDETERMINATE, grain: GRAINS.REFERENT, of: 'referent:∅', witness: {} });
  // subject claim:2 is re-judged — the distribution must reflect the LATEST, not double-count
  log.revise('claim:2', { verdict: VERDICTS.CORROBORATED, witness: { score: 0.7 } });

  const d = log.distribution();
  assert.equal(d.corroborated, 2, 'claim:1 + the revised claim:2');
  assert.equal(d.unsupported, 0, 'the superseded UNSUPPORTED verdict is not counted');
  assert.equal(d.indeterminate, 1);
  assert.equal(d.total, 3, 'three subjects, one current verdict each');
  assert.equal(d.byGrain.claim.corroborated, 2);
  assert.equal(d.byGrain.referent.indeterminate, 1);
});

test('binding mapper — cited CORROBORATES, contact-but-unborn is INDETERMINATE, nowhere is UNSUPPORTED', () => {
  const log = createJudgmentLog();
  recordBindingDefs(log, [
    { claim: 'A cited claim.',      citation: 's2', score: 0.8 },
    { claim: 'A touched paraphrase.', citation: null, score: 0.3 },   // made contact, not born
    { claim: 'Prose from nowhere.',  citation: null, score: 0 },      // no contact
  ]);
  const proj = log.project();
  assert.equal(proj.get('claim:A cited claim.').verdict, VERDICTS.CORROBORATED);
  assert.equal(proj.get('claim:A touched paraphrase.').verdict, VERDICTS.INDETERMINATE);
  assert.equal(proj.get('claim:Prose from nowhere.').verdict, VERDICTS.UNSUPPORTED);
  // every DEF carries its witness — none is an oracle
  for (const ev of log.all()) assert.equal(ev.malformed, undefined);
  assert.equal(proj.get('claim:A cited claim.').witness.citation, 's2');
});

test('reference mapper — a concentrated field CORROBORATES, a split field abstains', () => {
  const log = createJudgmentLog();
  recordReferenceDef(log, { id: 7, w: 0.9, margin: 0.4, concentrated: true });
  recordReferenceDef(log, { id: 3, w: 0.3, margin: 0.001, concentrated: false });
  const all = log.all();
  assert.equal(all[0].verdict, VERDICTS.CORROBORATED);
  assert.equal(all[0].grain, GRAINS.REFERENT);
  assert.equal(all[1].verdict, VERDICTS.INDETERMINATE, 'a diffuse field is the honest abstention, not a guess');
  assert.equal(all[1].witness.margin, 0.001);
});

test('void mapper — a DEF of absence is UNSUPPORTED at the field grain, carrying which absence', () => {
  const log = createJudgmentLog();
  recordVoidDef(log, { kind: 'elsewhere', receipt: 'scanned 40 units', rode: 3 });
  const d = log.all()[0];
  assert.equal(d.verdict, VERDICTS.UNSUPPORTED);
  assert.equal(d.grain, GRAINS.FIELD);
  assert.equal(d.witness.kind, 'elsewhere');
  assert.equal(d.witness.receipt, 'scanned 40 units');
});

test('correspondence mapper — passes typed verdicts through at the predication grain; skips untyped', () => {
  const log = createJudgmentLog();
  recordCorrespondenceDefs(log, [
    { verdict: VERDICTS.CONTRADICTED, sentence: 'The mayor is X.', citation: 's1', reason: 'disjoint' },
    { verdict: VERDICTS.OFF_DIAGONAL, sentence: 'A specific claim at a void.' },
    { verdict: 'not-a-verdict', sentence: 'ignored' },
  ]);
  const all = log.all();
  assert.equal(all.length, 2, 'the untyped claim is skipped — a DEF must carry a verdict');
  assert.equal(all[0].verdict, VERDICTS.CONTRADICTED);
  assert.equal(all[0].grain, GRAINS.PREDICATION);
  assert.equal(all[0].witness.reason, 'disjoint');
  assert.equal(all[1].verdict, VERDICTS.OFF_DIAGONAL);
});

test('the four judges land on ONE log — the whole turn\'s judgment census is one projection', () => {
  const log = createJudgmentLog();
  recordReferenceDef(log, { id: 1, w: 0.9, margin: 0.4, concentrated: true });
  recordVoidDef(log, null);   // no void this turn — a no-op
  recordBindingDefs(log, [{ claim: 'Cited.', citation: 's1', score: 0.9 }]);
  recordCorrespondenceDefs(log, [{ verdict: VERDICTS.INDETERMINATE, sentence: 'Held.' }]);
  const d = log.distribution();
  assert.equal(d.total, 3);
  assert.equal(d.corroborated, 2);   // reference + binding
  assert.equal(d.indeterminate, 1);  // correspondence
  assert.ok(d.byGrain.referent && d.byGrain.claim && d.byGrain.predication);
});

test('mappers are best-effort — a missing log or malformed input never throws', () => {
  assert.doesNotThrow(() => recordBindingDefs(null, [{ claim: 'x' }]));
  assert.doesNotThrow(() => recordBindingDefs(createJudgmentLog(), null));
  assert.doesNotThrow(() => recordReferenceDef(createJudgmentLog(), null));
  assert.doesNotThrow(() => recordVoidDef(createJudgmentLog(), undefined));
  assert.doesNotThrow(() => recordCorrespondenceDefs(createJudgmentLog(), 'nope'));
});
