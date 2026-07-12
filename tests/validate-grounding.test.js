// The answer weighed by the reader's own reaction — the Born measure. The mechanical veto
// battery reads an answer's LEXICAL contact with the retrieved spans; it cannot tell a
// grounded paraphrase from a confident fabrication that shares the passages' vocabulary, so
// an `unbound-contact` answer rides, shown as grounded (the audit export "New topic": over a
// set of skyscraper lists the talker, invited to "answer from general knowledge", named a
// 10.4 m Korean straw hut "the tallest house in the world"). The move is actor–critic with a
// MEASURED signal: the reader reacts to its own draft, and the reaction is put through the
// Born rule (square, normalise, read the two shares of the one distribution). A positive
// reaction (the good frame holds) goes forward; a negative one goes back. These tests pin the
// valence read, the Born measure, and the stage's forward/back behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { valenceAtoms, bornAssessment, embeddingAssessment, assessAnswer, buildAssessmentMessages } from '../src/enactor/ground/validate.js';
import { stages } from '../src/turn/stages.js';
import { runTurn } from '../src/turn/pipeline.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';

// ── the valence read (the front-end map into the good ↔ not-good basis) ────────
test('valenceAtoms: signs the polarity words, and a negator flips the one it governs', () => {
  assert.deepEqual(valenceAtoms('This is a good, accurate answer.').map((a) => a.sign), [1, 1]);
  assert.deepEqual(valenceAtoms('It is wrong and unsupported.').map((a) => a.sign), [-1, -1]);
  // "not good" → the positive word turns negative; a bare negator alone scores nothing.
  assert.deepEqual(valenceAtoms('This is not good.').map((a) => a.sign), [-1]);
  assert.deepEqual(valenceAtoms("It isn't accurate.").map((a) => a.sign), [-1]);
  // a discourse "No" reinforces a following negative word rather than cancelling it (the leading
  // "No" is the answer-particle atom; unsupported/wrong add two more — all negative).
  assert.deepEqual(valenceAtoms('No, this is unsupported and wrong.').map((a) => a.sign), [-1, -1, -1]);
  assert.equal(valenceAtoms('The sky is blue today.').length, 0, 'no valence word → no atoms');
});

test('valenceAtoms: a discourse-initial answer particle carries approval on its own', () => {
  // "is this good?" answered with a bare particle — the whole signal is the leading word.
  const yes = valenceAtoms('Yes.');
  assert.equal(yes.length, 1); assert.equal(yes[0].sign, 1);
  const no = valenceAtoms('No.');
  assert.equal(no.length, 1); assert.equal(no[0].sign, -1);
  assert.equal(bornAssessment('Yes, absolutely.').positive, true);
  assert.equal(bornAssessment('No.').positive, false, 'a bare "No" now reads as disapproval');
  // a mid-sentence "no" is NOT the answer particle (it is a negator) — no lead atom from it.
  assert.equal(valenceAtoms('There is no clear support.')[0].key !== 'lead', true);
});

// ── the Born measure (the good frame holds or breaks) ──────────────────────────
test('bornAssessment: the good frame holds on a positive reaction, breaks on a negative one', () => {
  const good = bornAssessment('Yes, this is a good, accurate, well-supported answer.');
  assert.equal(good.positive, true);
  assert.ok(good.onMass > good.offMass, 'positive Born mass holds the frame');

  const bad = bornAssessment('No, this is wrong and completely unsupported by the lines.');
  assert.equal(bad.positive, false);
  assert.ok(bad.offMass > bad.onMass, 'the mass moved off the good frame');
});

test('bornAssessment: one strong negative outweighs several faint positives (the square suppresses noise)', () => {
  // three mild positives vs one strong negative — linear counting would call it positive,
  // Born squaring lets the strong "wrong" (amp 2) dominate.
  const a = bornAssessment('It is okay and fine and reasonable, but the core claim is wrong.');
  assert.equal(a.positive, false, 'the strong negative wins under the Born square');
});

test('bornAssessment: an unreadable reaction carries no mass and goes forward (never a manufactured refusal)', () => {
  const none = bornAssessment('The document is about buildings in several cities.');
  assert.equal(none.measured, false);
  assert.equal(none.positive, true, 'no valence mass → forward by default');
});

// ── the embedding path: the difference-in-means APPROVAL axis ──────────────────
// A deterministic meaning embedder: an approving text projects toward one dimension, a
// disapproving one toward another, plus a length dimension and jitter. The un-/in-/ir-
// antonyms in the canon are claimed by the disapproval set (word-boundary matched, so
// `unsupported` does NOT count as `supported`). This exercises the geometric path (the paired
// difference-in-means axis · projection · Born magnitude) without a real MiniLM.
const GOOD_RE = /\b(good|great|accurate|correct|supported|support|grounded|relevant|solid|founded|reflects|reflect|matches|match|confirms|confirm|true|verifiable|holds|hold|right|follows|follow|reliable|sound|well|yes)\b/;
const BAD_RE = /\b(bad|inaccurate|unsupported|contradicts|contradict|ungrounded|irrelevant|shaky|unfounded|distorts|distort|false|unverifiable|breaks|break|wrong|fabrication|fabricat|unrelated|weak|nope|no|not)\b/;
const fakeMeaningEmbedder = () => ({
  measuresMeaning: true,
  isWarm: () => true,
  async embed(t) {
    const s = String(t).toLowerCase();
    const good = GOOD_RE.test(s) ? 1 : 0;
    const bad = BAD_RE.test(s) ? 1 : 0;
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 101;
    return Float32Array.from([good * 3 + (h % 3) * 0.05, bad * 3 + (h % 5) * 0.05, (h % 7) * 0.02]);
  },
});

test('embeddingAssessment: the approval axis routes a reaction positive/negative by its projection', async () => {
  const emb = fakeMeaningEmbedder();
  const neg = await embeddingAssessment('No, this is wrong and unsupported by the lines.', emb);
  assert.equal(neg.rode, 'embedding');
  assert.equal(neg.positive, false, 'a disapproving reaction projects to the − side of the axis');
  assert.ok(neg.proj < 0, 'the axis projection is negative');
  const pos = await embeddingAssessment('Yes, this is a good and accurate, well-grounded answer.', emb);
  assert.equal(pos.positive, true, 'an approving reaction projects to the + side');
  assert.ok(pos.proj > 0);
});

test('embeddingAssessment: the difference-in-means axis is length-invariant (the confound control)', async () => {
  // an embedder that leaks a strong LENGTH signal on its own dimension. Because the canon pairs
  // are length-matched, the paired subtraction cancels it, so the axis carries ~no length — a
  // long disapproval still reads negative, where a raw cosine-to-poles would tie on shared length.
  const lengthy = () => ({
    measuresMeaning: true, isWarm: () => true,
    async embed(t) {
      const s = String(t).toLowerCase();
      const good = GOOD_RE.test(s) ? 1 : 0, bad = BAD_RE.test(s) ? 1 : 0;
      const len = (s.match(/[a-z]+/g) || []).length;
      return Float64Array.from([good * 2, bad * 2, len * 0.8]);   // dim2 = a big length signal
    },
  });
  const shortNeg = await embeddingAssessment('This is wrong.', lengthy());
  const longNeg = await embeddingAssessment('This is wrong and unsupported and ungrounded and irrelevant and unfounded and it contradicts and distorts the lines that were asked about at some considerable length here.', lengthy());
  assert.equal(shortNeg.positive, false);
  assert.equal(longNeg.positive, false, 'a long disapproval is still disapproval — length did not flip it');
  assert.ok(shortNeg.proj < 0 && longNeg.proj < 0, 'both project to the disapproval side despite the length gap');
});

test('embeddingAssessment: degrades to null without an embedder or on an empty reaction', async () => {
  assert.equal(await embeddingAssessment('anything', null), null, 'no embedder → null (caller falls back to lexical)');
  assert.equal(await embeddingAssessment('', fakeMeaningEmbedder()), null, 'empty reaction → null');
  const boom = { measuresMeaning: true, isWarm: () => true, async embed() { throw new Error('embed fault'); } };
  assert.equal(await embeddingAssessment('this is wrong', boom), null, 'an embedding fault → null, never a throw');
});

test('assessAnswer: prefers the embedding path when a meaning embedder is warm, else the lexical read', async () => {
  const spans = [{ text: 'A line about tall buildings.' }];
  const withEmb = await assessAnswer({ model: stubModel('No, this is wrong and unsupported.'), question: 'q', spans, answer: 'a', embedder: fakeMeaningEmbedder() });
  assert.equal(withEmb.rode, 'embedding', 'the embedding approval axis is the primary measure');
  assert.equal(withEmb.positive, false);
  const noEmb = await assessAnswer({ model: stubModel('No, this is wrong and unsupported.'), question: 'q', spans, answer: 'a' });
  assert.equal(noEmb.rode, 'valence', 'no embedder → the lexical valence basis (the fallback)');
  assert.equal(noEmb.positive, false);
});

// ── the reaction (model-injected) ──────────────────────────────────────────────
const stubModel = (reply) => ({
  id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
  async phrase() { return reply; },
});

test('assessAnswer: measures the reaction; degrades to null without a model, lines, or answer', async () => {
  const spans = [{ idx: 0, text: "BHP House was the city's tallest for a few years." }];
  const neg = await assessAnswer({ model: stubModel('No — that is unsupported and unrelated to these lines.'), question: 'tallest house?', spans, answer: 'A Korean straw hut.' });
  assert.equal(neg.positive, false);
  assert.equal(await assessAnswer({ model: null, question: 'q', spans, answer: 'a' }), null, 'no model → null');
  assert.equal(await assessAnswer({ model: stubModel('x'), question: 'q', spans: [], answer: 'a' }), null, 'no lines → null');
  assert.equal(await assessAnswer({ model: stubModel('x'), question: 'q', spans, answer: '' }), null, 'no answer → null');
});

test('assessAnswer: a model fault degrades to null, never throws', async () => {
  const boom = { id: 'boom', kind: 'local', isLoaded: () => true, async load() {}, async phrase() { throw new Error('backend fault'); } };
  assert.equal(await assessAnswer({ model: boom, question: 'q', spans: [{ text: 'a line' }], answer: 'an answer' }), null);
});

test('buildAssessmentMessages: the lines, question, and draft all reach the prompt', () => {
  const [sys, user] = buildAssessmentMessages({ question: 'the tallest residential house?', lines: ['BHP House was the tallest.'], answer: 'A Korean straw hut.' });
  assert.equal(sys.role, 'system');
  assert.match(user.content, /BHP House was the tallest/);
  assert.match(user.content, /tallest residential house/);
  assert.match(user.content, /Korean straw hut/);
});

// ── the stage: forward on a positive reaction, back on a negative one ──────────
// The state the pipeline is in AFTER veto on the export's turn 3: a claim that made lexical
// contact with a span but tied to no single sentence — uncited, nothing in `sources` — and
// the veto battery's unbound-contact flag fired.
const fabricationCtx = (overrides = {}) => ({
  validate: true,
  model: stubModel('No — this is wrong and unsupported; the lines are skyscraper lists, unrelated to a house.'),
  question: 'like anywhere in the world',
  task: 'answer',
  doc: parseText("BHP House was the city's tallest for a few years. Eleven American buildings have held the title of tallest building in the world.", { docId: 'S-1' }),
  spans: [
    { idx: 0, score: 0.33, text: 'Eleven American buildings have held the title of tallest building in the world.' },
    { idx: 1, score: 0.30, text: "BHP House was the city's tallest for a few years." },
  ],
  rawOutput: 'The tallest residential house is the Antilia building in Mumbai, India.',
  answer: 'The tallest residential house is the Antilia building in Mumbai, India. [no source]',
  bound: [{ claim: 'The tallest residential house is the Antilia building in Mumbai, India.', citation: null, score: 0.13 }],
  sources: [],
  vetoes: [{ id: 'unbound-contact', refuses: true, message: 'a paraphrase that rides, flagged.' }],
  revisions: null,
  ...overrides,
});

test('stages.validate: a negative reaction sends a one-shot draft BACK (regenerate)', async () => {
  // The model reacts negatively to the fabrication, then, sent back, answers with the honest miss.
  const twoFaced = {
    id: 'two', kind: 'local', isLoaded: () => true, async load() {},
    async phrase(messages) {
      const sys = messages[0]?.content || '';
      if (/reviewing a draft answer/.test(sys)) return 'No — this is wrong and unsupported by these lines.';
      return "I didn't find that in what I read.";
    },
  };
  const out = await stages.validate(fabricationCtx({ model: twoFaced }));
  assert.equal(out.wentBack, true, 'the draft went back for another pass');
  assert.equal(out.assessment.positive, false, 'the reaction weighed negative');
  assert.ok(!/Antilia/.test(out.answer), 'the fabricated claim is out of the shipped answer');
  assert.match(out.answer, /didn't find that/i, 'the redraft is the honest miss the corrective steered toward');
  assert.ok(out.revisions.some((r) => /Antilia/.test(r.draft)), 'the superseded draft rides in the trail (SEG/retract)');
});

test('stages.validate: a negative reaction with no redraft HOLDS the draft for the honest absence', async () => {
  // The reaction is negative and the model returns nothing on the go-back → hold it.
  const emptyRedraft = {
    id: 'er', kind: 'local', isLoaded: () => true, async load() {},
    async phrase(messages) { return /reviewing a draft answer/.test(messages[0]?.content || '') ? 'This is wrong and unsupported.' : '   '; },
  };
  const out = await stages.validate(fabricationCtx({ model: emptyRedraft }));
  assert.equal(out.gated, true, 'the draft is held back');
  assert.equal(out.voidSpoken, true);
  assert.match(out.answer, /didn't find that/i, 'held back for the honest absence');
  assert.ok(out.vetoes.some((v) => v.id === 'assessment-negative' && v.refuses));
});

test('stages.validate: the streaming path never un-streams — a negative reaction flags, it does not go back', async () => {
  const out = await stages.validate(fabricationCtx({ streamed: { paragraphs: [], draft: 'x', done: true } }));
  assert.notEqual(out.wentBack, true, 'a streamed answer already shown does not go back');
  assert.notEqual(out.gated, true);
  assert.match(out.answer, /Antilia/, 'the streamed answer rides unchanged (suppress-never-erase)');
  assert.ok(out.vetoes.some((v) => v.id === 'assessment-negative' && v.refuses), 'a refusing flag is pinned to it');
});

test('stages.validate: a POSITIVE reaction goes forward — the paraphrase that rides stays protected', async () => {
  const ctx = fabricationCtx({ model: stubModel('Yes, this is a good and accurate answer, well supported by the lines.') });
  const out = await stages.validate(ctx);
  assert.notEqual(out.wentBack, true);
  assert.notEqual(out.gated, true);
  assert.equal(out.answer, ctx.answer, 'the answer is untouched');
  assert.equal(out.assessment.positive, true);
});

test('stages.validate: an unreadable reaction carries no Born mass and goes forward', async () => {
  const out = await stages.validate(fabricationCtx({ model: stubModel('The lines discuss buildings in several cities over the years.') }));
  assert.notEqual(out.wentBack, true);
  assert.notEqual(out.gated, true);
  assert.equal(out.assessment.positive, true, 'no valence mass → forward, never a manufactured refusal');
});

test('stages.validate: off by default, and inert where the grounding is not in doubt', async () => {
  const off = fabricationCtx({ validate: false });
  assert.equal(await stages.validate(off), off, 'validate:false returns the ctx untouched');

  const cited = fabricationCtx({ bound: [{ claim: 'x', citation: 's0', score: 0.9 }], sources: [0], vetoes: [] });
  assert.equal((await stages.validate(cited)).assessment, undefined, 'a cited answer is not weighed');

  const confident = fabricationCtx({ vetoes: [] });
  assert.equal((await stages.validate(confident)).assessment, undefined, 'no weak flag → no reaction asked for');

  const abstained = fabricationCtx({ rawOutput: "I didn't find that in what I read." });
  assert.equal((await stages.validate(abstained)).assessment, undefined, 'an honest abstention is left alone');
});

// ── wired into the pipeline ───────────────────────────────────────────────────
test('runTurn: the validate stage is in the pipeline and silent by default', async () => {
  const doc = parseText("BHP House was the city's tallest for a few years. Eleven American buildings have held the title of tallest building in the world.", { docId: 'S-1' });
  const echo = { id: 'echo', kind: 'local', isLoaded: () => true, async load() {}, async phrase(m) { return m[m.length - 1].content.slice(0, 40); } };
  const audit = createAuditLog({ capacity: 64 });
  const r = await runTurn({ question: 'which buildings were the tallest in the world?', doc, model: echo, embedder: createHashEmbedder(), auditLog: audit /* validate defaults off */ });
  const step = (r.turn.steps || []).find((s) => s.name === 'validate');
  assert.ok(step, 'the validate stage runs as part of the fold');
  assert.equal(step.data.ran, undefined, 'with the flag off it is a silent no-op — no reaction weighed');
});
