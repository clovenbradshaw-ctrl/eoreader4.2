import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../src/core/verdicts.js';
import { createJudgmentLog, GRAINS } from '../src/core/def.js';
import { typeAbsence, evaluationAbsence, REFILL_STRONG } from '../src/enactor/answer/absence.js';
import { recordAbsenceDef, recordVoidDef } from '../src/turn/judgments.js';
import { bindCitations } from '../src/enactor/ground/bind.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { runTurn } from '../src/turn/pipeline.js';

// Typed void (docs "The Work, v2" #4) — an absence is a RESULT with a cause, and each cause
// is its own witnessed DEF. Falsifiers: each fails if the void regresses to a fallthrough —
// VOID declared for material that was merely unreached, causes collapsed into one message, a
// corpus absence declared without its failed probe, or a post-draw witness that contradicts
// the pre-draw void living only in control flow.

const FLIGHT = 'Orville Wright flew the first powered aircraft at Kitty Hawk in 1903. '
  + 'Wilbur Wright piloted the longest flight of that December day. '
  + 'The brothers built their flyer in a bicycle shop in Dayton. '
  + 'Their wind tunnel tests corrected the published lift tables.';

// ── 1 · unreached-but-present never VOIDs ──────────────────────────────────────

test('the adversarial refill finds present-but-unreached material — a retrieval miss, not a void', () => {
  const doc = parseText(FLIGHT, { docId: 'tv1' });
  // The field measure (faked here) declared a void for a question the corpus plainly holds.
  const a = typeAbsence({ doc, question: 'Where did the brothers build their flyer?',
    verdict: { kind: 'never-set', receipt: 'faked', rode: 0 } });
  assert.equal(a.cause, 'retrieval-miss', 'the refill disproved the measured void');
  assert.ok(a.refillSpans.length > 0, 'the found spans feed forward — the turn answers');
  assert.ok(a.refill.found.some((f) => f.score >= REFILL_STRONG));
  const log = createJudgmentLog();
  recordAbsenceDef(log, a);
  const def = log.latestOf('field:retrieval');
  assert.equal(def.verdict, VERDICTS.INDETERMINATE, 'present-but-unreached is Codd\'s UNKNOWN, never a corpus claim');
  assert.equal(def.witness.cause, 'retrieval-miss');
  assert.ok(def.witness.refill.found.length, 'the probe\'s hits ride in the witness');
});

test('a true corpus void is declared only WITH its failed probe in the witness', () => {
  const doc = parseText(FLIGHT, { docId: 'tv2' });
  const a = typeAbsence({ doc, question: 'What did Errol Musk contribute?',
    verdict: { kind: 'elsewhere', receipt: 'no strong hit', rode: 2 } });
  assert.equal(a.cause, 'corpus');
  assert.equal(a.voidMeasure.cause, 'corpus');
  assert.ok(a.voidMeasure.probes.refill, 'the refill that FAILED is part of the record');
  const log = createJudgmentLog();
  recordVoidDef(log, a.voidMeasure);
  const def = log.latestOf('field:elsewhere');
  assert.equal(def.verdict, VERDICTS.UNSUPPORTED);
  assert.ok(def.witness.probes?.refill, 'no unwitnessed VOID: the witness carries the probe that tried to disprove it');
  assert.equal(def.witness.kind, 'elsewhere', 'the measured kind survives beside the cause');
});

// ── 2 · the evaluation void: dense-yet-empty, witnessed by the scan ────────────

test('the evaluation absence is witnessed by the exhaustive subject scan and typed distinctly', () => {
  const doc = parseText(
    'The bottlenose dolphin lives in warm coastal waters and hunts fish. '
    + 'The orca hunts in coordinated pods across cold seas.', { docId: 'tv3' });
  const spans = doc.sentences.map((text, idx) => ({ idx, text }));
  const bound = bindCitations('The bottlenose is the best dolphin.', spans, { doc, cursor: 0, typed: true });
  const a = evaluationAbsence({ doc, bound });
  assert.ok(a, 'the unsupported EVA claim triggers the probe');
  assert.equal(a.cause, 'evaluation');
  assert.equal(a.subject, 'bottlenose');
  assert.ok(a.probed.length >= 1, 'every subject-bearing sentence was scanned');
  assert.match(a.text, /no source ranks or evaluates/);
  const log = createJudgmentLog();
  recordAbsenceDef(log, a);
  const def = log.latestOf('field:evaluation:bottlenose');
  assert.equal(def.verdict, VERDICTS.UNSUPPORTED, 'dense-yet-empty is a measured absence, not a maybe');
  assert.equal(def.witness.term, 'best');
  assert.ok(Array.isArray(def.witness.probed) && def.witness.refill, 'scan indices + refill — a re-runnable witness');
});

test('an entailing judgment in the corpus disarms the evaluation void — the ranking exists', () => {
  const doc = parseText(
    'Critics called the bottlenose the best dolphin of the coast. '
    + 'The orca hunts in pods.', { docId: 'tv4' });
  const spans = doc.sentences.map((text, idx) => ({ idx, text }));
  // Force an unsupported-EVA row shape with the ranking present in the doc: the probe must
  // find the sentence and refuse to declare the absence.
  const bound = [{ claim: 'The bottlenose is the best dolphin.', citation: null, score: 0.1,
    typed: { op: 'EVA', verdict: 'unsupported', reason: 'never-ranked', eval: { claim: 'best', span: null, subject: 'bottlenose' } } }];
  assert.equal(evaluationAbsence({ doc, bound }), null, 'a found judgment means the void is NOT declared');
  void spans;
});

test('a subject the corpus never mentions is not an evaluation void — that is the corpus probe\'s territory', () => {
  const doc = parseText('The orca hunts in coordinated pods.', { docId: 'tv5' });
  const bound = [{ claim: 'The zorblatt is the best dolphin.', citation: null, score: 0,
    typed: { op: 'EVA', verdict: 'unsupported', reason: 'never-ranked', eval: { claim: 'best', span: null, subject: 'zorblatt' } } }];
  assert.equal(evaluationAbsence({ doc, bound }), null);
});

// ── 3 · three causes, three surfaces — never one collapsed message ─────────────

const stub = (reply) => ({
  id: 'stub', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'stub', kind: 'local', model: 'stub', label: 'stub' }),
  async load() {}, async phrase() { return reply; },
});
const drive = (question, text, reply) => runTurn({
  question, doc: parseText(text, { docId: 'tv-e2e' }), model: stub(reply),
  embedder: createHashEmbedder(), auditLog: createAuditLog({ capacity: 64 }),
});

test('e2e: the evaluation void speaks its own cause and lands its own DEF', async () => {
  const r = await drive('What dolphin lives in warm coastal waters?',
    'The bottlenose dolphin lives in warm coastal waters and hunts fish. '
    + 'The orca hunts in coordinated pods across cold seas. '
    + 'The Maui dolphin is the smallest and rarest species.',
    'The bottlenose is the best dolphin.');
  assert.match(r.answer, /no source ranks or evaluates/, 'the typed cause IS the answer, not a footnote');
  assert.ok(r.flags.some((f) => (f.id || f) === 'void-evaluation'));
  const def = r.judgmentLog.latestOf('field:evaluation:bottlenose');
  assert.equal(def?.verdict, VERDICTS.UNSUPPORTED);
  assert.equal(r.judgmentLog.latestOf('field:never-set'), null, 'no cause-collapse into the corpus kind');
});

test('e2e: the reference void rides beside the ask, pointing at the mention DEFs', async () => {
  const r = await drive('What did Elvis record first?',
    'Elvis Presley recorded his first single at Sun Studio in Memphis in 1954. '
    + 'Elvis Costello recorded his first album in London in 1977. '
    + 'Presley toured the American South. Costello wrote sharp lyrics. '
    + 'Elvis performed on television to great acclaim.',
    'Elvis recorded his first single in 1954.');
  assert.match(r.answer, /^Which elvis do you mean/i, 'the reference cause reports as the ask');
  const def = r.judgmentLog.latestOf('field:reference:elvis');
  assert.equal(def?.verdict, VERDICTS.INDETERMINATE, 'scattered is UNKNOWN, not absent');
  assert.equal(def.witness.cause, 'reference');
  assert.equal(def.witness.mention, 'referent:mention:elvis', 'the field DEF points at the referent-grain DEFs that hold the collision');
  assert.equal(r.judgmentLog.latestOf('field:never-set'), null, 'no corpus claim is made for a scattered field');
});

// ── 4 · the post-draw witness revises the pre-draw void ────────────────────────

test('a citation earned while a field DEF stands appends a counter-DEF — the retreat is on the log', () => {
  // Unit-level: the absence stage's revise discipline, exercised directly on the log.
  const log = createJudgmentLog();
  recordVoidDef(log, { kind: 'never-set', receipt: 'flat field', rode: 1 });
  const prior = log.latestOf('field:never-set');
  log.revise('field:never-set', { verdict: VERDICTS.INDETERMINATE,
    witness: { reason: 'witness-earned-post-measure', citation: 's2' } });
  const cur = log.latestOf('field:never-set');
  assert.equal(cur.verdict, VERDICTS.INDETERMINATE);
  assert.equal(cur.revises, prior.t, 'the void\'s retreat is a chained revision, not a control-flow secret');
  assert.equal(cur.grain, GRAINS.FIELD, 'a revision keeps cutting at the same grain');
  assert.equal(log.all().length, 2, 'nothing erased');
});
