import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { ingestMusic } from '../src/organs/in/music.js';
import { arrivalsOfDoc, foresightOf } from '../src/metabolism/foresight.js';
import { score, createMetabolism } from '../src/metabolism/index.js';
import { createMonitor } from '../src/enactor/monitor.js';
import { senseReturn, commitVoice } from '../src/enactor/selfline.js';
import { createCommitmentLedger } from '../src/enactor/ledger.js';
import { stages } from '../src/turn/stages.js';
import { stageFace } from '../src/turn/stage-faces.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';

// The body from the organs — the four seams, each proven closed:
//   truth     the one surprise wired to selection (foresight anchors fitness as 'world')
//   omnimodal the same grading runs on a melody as on prose (log-derived, adapter-blind)
//   honesty   the void reaches the voice (absence spoken) and the self line runs live
//             (echoes attenuated, push-back recorded)
//   ledger    a serializable, append-only record of assertions and corrections

const STORY = 'Anna Vale trusted Ben Cole. Anna spoke to Ben in the hall. ' +
  'Grete Vale visited Gregor Pike. Grete carried a bowl. Gregor thanked Grete. ' +
  'Anna met Grete at noon. Ben watched Gregor.';

// A melody whose returns sit BEYOND the one-step horizon: four distinct notes cycling,
// so consecutive steps share nothing and only a held profile can price the return.
const cycleMelody = () => {
  const notes = [];
  for (let i = 0; i < 16; i++) notes.push('C4', 'E4', 'G4', 'B4');
  return ingestMusic({ name: 'cycle', notes });
};

// A model that confabulates: fluent, specific, grounded in nothing the corpus holds.
const confabulator = () => ({
  id: 'stub-confab', kind: 'local', isLoaded: () => true,
  async phrase() { return 'Zorro fought the dragon at dawn and won the golden sword.'; },
});
const parrot = (line) => ({
  id: 'stub-parrot', kind: 'local', isLoaded: () => true,
  async phrase() { return line; },
});

// ── the truth seam: surprise → selection ─────────────────────────────────────

test('foresight grades a held motif above chance, and the horizon gene moves the grade', () => {
  const arr = arrivalsOfDoc(cycleMelody());
  const far = foresightOf(arr, { gamma: 0.9 });
  const near = foresightOf(arr, { gamma: 0.5 });
  assert.ok(far && far.skill > 0.1, `a long horizon holds the distance-4 motif (got ${far?.skill})`);
  assert.ok(near.skill < far.skill, 'a short horizon holds less of it — the gene has a gradient');
  assert.ok(far.predictedBits < far.chanceBits, 'the profile is less surprised than the no-horizon reader');
});

test('foresight refuses to grade what has no answer key', () => {
  // pure novelty: nothing in the tail ever returns — no recurrence, no grade
  const noise = Array.from({ length: 12 }, (_, i) => new Map([[`e:x${i}`, 1]]));
  assert.equal(foresightOf(noise, { gamma: 0.7 }), null);
  // too short to hold out a tail
  assert.equal(foresightOf([new Map([['a', 1]])], { gamma: 0.7 }), null);
});

test('the prediction anchor outranks the judge, and only the human outranks the world', () => {
  const judged = score({ grounded: 2, claimed: 2, delivered: true, validated: 0.9 });
  assert.equal(judged.anchoredBy, 'judge');
  const world = score({ grounded: 2, claimed: 2, delivered: true, validated: 0.9, predicted: 0.4 });
  assert.equal(world.anchoredBy, 'prediction', 'predictive skill on held-out reality beats the judge’s taste');
  assert.equal(world.anchor, 0.4);
  const human = score({ grounded: 2, claimed: 2, delivered: true, predicted: 0.4, endorsed: 1 });
  assert.equal(human.anchoredBy, 'human');
});

test('metabolize grades arrivals with the RUNNING genome’s gamma and anchors on prediction', () => {
  const meta = createMetabolism();
  const arrivals = arrivalsOfDoc(cycleMelody());
  const r = meta.metabolize({ delivered: true, grounded: 1, claimed: 1, arrivals });
  assert.equal(r.fitness.anchoredBy, 'prediction', 'the loop is graded by what it predicted, not by taste');
  assert.equal(r.fitness.provisional, false);
});

// ── the omnimodal seam: the currency is adapter-blind ────────────────────────

test('a melody and prose feed the same grading — the currency does not care about the organ', () => {
  const music = arrivalsOfDoc(cycleMelody());
  const prose = arrivalsOfDoc(parseText(STORY + ' ' + STORY, { docId: 'omni' }));
  assert.ok(music.length >= 4 && prose.length >= 4, 'both adapters emit per-unit arrivals off the one log');
  const fm = foresightOf(music, { gamma: 0.9 });
  const fp = foresightOf(prose, { gamma: 0.9 });
  assert.ok(fm && fp, 'both modalities grade under the same forward distribution');
});

// ── the honesty seam, half one: the void reaches the voice ───────────────────

test('the absence stage speaks the typed absence when nothing witnessed the draft', async () => {
  const ctx = {
    voidMeasure: { kind: 'elsewhere', receipt: 'scanned 7 sentences', rode: 'retrieval-void' },
    voidText: '"Zorro" is not in this document.',
    rawOutput: 'Zorro fought the dragon at dawn.',
    answer: 'Zorro fought the dragon at dawn.',
    bound: [{ claim: 'Zorro fought the dragon at dawn.', citation: null }],
    sources: [], vetoes: [],
  };
  const out = await stages.absence(ctx);
  assert.equal(out.answer, '"Zorro" is not in this document.');
  assert.equal(out.gated, true);
  assert.equal(out.voidSpoken, true);
  assert.equal(out.revisions.length, 1, 'the draft is preserved beside the absence, never erased');
  assert.equal(out.revisions[0].draft, 'Zorro fought the dragon at dawn.');
  assert.ok(out.vetoes.some((v) => v.id === 'void-asserted' && !v.refuses));
});

test('the absence stage never replaces a witnessed answer or the talker’s own abstention', async () => {
  const base = {
    voidMeasure: { kind: 'never-set', receipt: 'scanned 3 sentences' },
    voidText: 'The document does not say.',
    vetoes: [],
  };
  const cited = await stages.absence({ ...base,
    rawOutput: 'Anna trusted Ben.', answer: 'Anna trusted Ben. [s0]',
    bound: [{ claim: 'Anna trusted Ben.', citation: 's0' }], sources: [0] });
  assert.equal(cited.voidSpoken, undefined, 'a cited claim ships untouched');
  const honest = await stages.absence({ ...base,
    rawOutput: 'The document does not say anything about that.',
    answer: 'The document does not say anything about that.', bound: [], sources: [] });
  assert.equal(honest.voidSpoken, undefined, 'honesty is not replaced with different honesty');
  const silent = await stages.absence({ rawOutput: 'x', answer: 'x', bound: [], sources: [], vetoes: [] });
  assert.equal(silent.voidSpoken, undefined, 'no measured void — the stage is a pass-through');
});

test('the absence stage is a real pipeline stage with printed faces', () => {
  assert.equal(typeof stages.absence, 'function');
  const face = stageFace('absence');
  assert.ok(face && face.notation, 'the stage carries its cube spelling in the trace');
});

test('end to end: a confabulation at a measured void ships as the typed absence', async () => {
  const doc = parseText(STORY, { docId: 'e2e' });
  const audit = createAuditLog();
  const r = await runTurn({
    question: 'Did Zorro fight the dragon?',
    doc, model: confabulator(), embedder: createHashEmbedder(), auditLog: audit,
  });
  assert.match(r.answer, /Zorro.*not in this document|document does not say/i,
    `the voice asserts the absence instead of the invention (got: ${r.answer})`);
  assert.ok(r.flags.some((f) => f.id === 'void-asserted') || r.turn.gated,
    'the substitution is flagged, never silent');
});

// ── the honesty seam, half two: the self line runs live ──────────────────────

test('the monitor draws the line: echo attenuated, push-back recorded as a correction', () => {
  const doc = parseText(STORY, { docId: 'self' });
  const monitor = createMonitor();

  const c1 = commitVoice(monitor, { text: 'Anna trusted Ben.', doc });
  assert.ok(c1 && c1.committed >= 1, 'the voice’s claim is held as an efference copy');

  const echo = senseReturn(monitor, { text: 'Anna trusted Ben.', doc });
  assert.equal(echo.self, 1, 'the voice’s own words returning read as SELF');
  assert.equal(echo.world, 0);

  commitVoice(monitor, { text: 'Grete visited Gregor.', doc });
  const push = senseReturn(monitor, { text: 'Grete avoided Gregor.', doc });
  assert.equal(push.mismatched, 1, 'same figures, diverged relation — the world pushed back');
  assert.equal(push.corrections.length, 1);
  assert.ok(monitor.corrections().length >= 1, 'the correction is held for the record');
});

test('the monitor’s outstanding window is bounded, and expiries are surfaced not swallowed', () => {
  const doc = parseText(STORY, { docId: 'exp' });
  const monitor = createMonitor();
  commitVoice(monitor, { text: 'Anna trusted Ben.', doc, keep: 0 });
  // keep: 0 expires the copy the same call held — it must come back, not vanish
  const c = commitVoice(monitor, { text: 'Grete visited Gregor.', doc, keep: 0 });
  assert.ok(c.expired.length >= 1, 'a never-returned commitment is reported when expired');
  assert.equal(monitor.outstanding().length, 0);
});

test('end to end: the session monitor threads through runTurn and flags a self-echo', async () => {
  const doc = parseText(STORY, { docId: 'thread' });
  const monitor = createMonitor();
  const ledger = createCommitmentLedger({ now: () => 't' });
  const embedder = createHashEmbedder();

  const t1 = await runTurn({
    question: 'Who did Anna trust?',
    doc, model: parrot('Anna trusted Ben.'), embedder, auditLog: createAuditLog(),
    monitor, ledger,
  });
  assert.ok(t1.selfLine && t1.selfLine.committed >= 1, 'the answer’s claim was committed to the one monitor');
  assert.ok(ledger.turns >= 1 && ledger.asserts().length >= 1, 'the ledger holds the turn’s public word');

  const t2 = await runTurn({
    question: 'Anna trusted Ben.',   // the user hands the voice’s own words back
    doc, model: parrot('Anna trusted Ben.'), embedder, auditLog: createAuditLog(),
    monitor, ledger,
  });
  assert.ok(t2.selfLine.self >= 1, 'the return of the voice’s own words reads as SELF');
  assert.ok(t2.flags.some((f) => f.id === 'self-echo'),
    'the voice tells the user an echo is not independent confirmation');
});

// ── the ledger seam: commitments and corrections, durable ────────────────────

test('the ledger records assertions (relay vs authored) and corrections beside their errors', () => {
  const ledger = createCommitmentLedger({ now: () => 't0' });
  ledger.recordTurn({
    question: 'Who trusted Ben?', answer: 'Anna trusted Ben. [s0] The moon is cheese.',
    route: 'grounded',
    bound: [
      { claim: 'Anna trusted Ben.', citation: 's0' },
      { claim: 'The moon is cheese.', citation: null },
    ],
    verdicts: [{ verdict: 'contradicted', claim: 'The moon is cheese.', reason: 'the record denies it' }],
    revisions: [{ draft: 'first draft', replacedBy: 'second draft', why: 'confabulation at a void' }],
  });
  const asserts = ledger.asserts();
  assert.equal(asserts.length, 2);
  assert.equal(asserts[0].authored, false, 'a cited claim is a relay of the record');
  assert.equal(asserts[1].authored, true, 'an uncited claim is spoken in the system’s own name');
  const corrections = ledger.corrections();
  assert.ok(corrections.some((c) => c.via === 'contradicted'));
  assert.ok(corrections.some((c) => c.via === 'revision'));
  assert.ok(corrections.every((c) => c.was), 'every correction stands beside what it corrects');
});

test('the ledger survives serialization — a memory answerable to its own past', () => {
  const a = createCommitmentLedger({ now: () => 't0' });
  a.recordTurn({ question: 'q', answer: 'a', bound: [{ claim: 'a claim', citation: null }] });
  a.correct({ via: 'self-mismatch', was: 'a claim', now: 'the world says otherwise', why: 'push-back' });
  const b = createCommitmentLedger({ now: () => 't1' });
  assert.equal(b.restore(a.serialize()), true);
  assert.equal(b.size, a.size);
  assert.equal(b.turns, a.turns);
  assert.deepEqual(b.entries().map((e) => e.kind), a.entries().map((e) => e.kind));
  // every exported line is one JSON entry — the append-only spine, readable outside
  const lines = b.exportJSONL().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, b.size);
});
