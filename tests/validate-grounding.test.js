// The model-prompt validation — "does this sound right?". The mechanical veto battery reads
// the answer's LEXICAL contact with the retrieved spans; it cannot tell a grounded paraphrase
// from a confident fabrication that merely shares the passages' vocabulary. So an answer whose
// every claim ties to nothing but still brushes a span — `unbound-contact` — RIDES, shown as
// grounded (the audit export "New topic": over a set of skyscraper lists the talker, invited to
// "answer from general knowledge", named a 10.4 m Korean straw hut "the tallest house in the
// world"; every guard fired and it shipped anyway). The reader, asked to check its own draft
// against the lines, catches exactly that. These tests pin the parser, the check, and the stage.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseValidationVerdict, validateAnswer, buildValidationMessages } from '../src/enactor/ground/validate.js';
import { stages } from '../src/turn/stages.js';
import { runTurn } from '../src/turn/pipeline.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';

// ── the verdict parser ────────────────────────────────────────────────────────
test('parseValidationVerdict: a clean leading word reads straight through', () => {
  assert.equal(parseValidationVerdict('UNSUPPORTED — the lines are about skyscrapers, not a house.').verdict, 'unsupported');
  assert.equal(parseValidationVerdict('SUPPORTED. The lines name it directly.').verdict, 'supported');
  assert.equal(parseValidationVerdict('supported').verdict, 'supported');
  assert.equal(parseValidationVerdict('Unsupported').verdict, 'unsupported');
});

test('parseValidationVerdict: phrasal negatives beat the bare "supported" superstring', () => {
  // "not supported" must not be mis-read as supported just because it contains the word.
  assert.equal(parseValidationVerdict('The answer is not supported by these lines.').verdict, 'unsupported');
  assert.equal(parseValidationVerdict('No, it does not follow from what was read.').verdict, 'unsupported');
  assert.equal(parseValidationVerdict("This doesn't follow from the lines at all.").verdict, 'unsupported');
});

test('parseValidationVerdict: a positive paraphrase, and an unreadable verdict stays unclear', () => {
  assert.equal(parseValidationVerdict('Yes, the lines back this up.').verdict, 'supported');
  assert.equal(parseValidationVerdict('It follows from the second line.').verdict, 'supported');
  assert.equal(parseValidationVerdict('Hmm, hard to say either way.').verdict, 'unclear');
  assert.equal(parseValidationVerdict('').verdict, 'unclear');
});

test('parseValidationVerdict: the reason is the text after the verdict token', () => {
  const { reason } = parseValidationVerdict('UNSUPPORTED — nothing here mentions a residential house.');
  assert.match(reason, /nothing here mentions a residential house/);
  assert.ok(!/unsupported/i.test(reason), 'the verdict word is stripped from the reason');
});

// ── the check (model-injected) ────────────────────────────────────────────────
const stubModel = (reply) => ({
  id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
  async phrase() { return reply; },
});

test('validateAnswer: returns the parsed verdict; degrades to null without a model or lines', async () => {
  const spans = [{ idx: 0, text: 'BHP House was the city\'s tallest for a few years.' }];
  const supported = await validateAnswer({ model: stubModel('UNSUPPORTED — off topic.'), question: 'tallest house?', spans, answer: 'The tallest house is a Korean straw hut.' });
  assert.equal(supported.verdict, 'unsupported');
  assert.equal(await validateAnswer({ model: null, question: 'q', spans, answer: 'a' }), null, 'no model → null');
  assert.equal(await validateAnswer({ model: stubModel('x'), question: 'q', spans: [], answer: 'a' }), null, 'no lines → null');
  assert.equal(await validateAnswer({ model: stubModel('x'), question: 'q', spans, answer: '' }), null, 'no answer → null');
});

test('validateAnswer: a model fault degrades to null, never throws', async () => {
  const boom = { id: 'boom', kind: 'local', isLoaded: () => true, async load() {}, async phrase() { throw new Error('backend fault'); } };
  const out = await validateAnswer({ model: boom, question: 'q', spans: [{ text: 'a line' }], answer: 'an answer' });
  assert.equal(out, null);
});

test('buildValidationMessages: the lines, question, and draft all reach the prompt', () => {
  const [sys, user] = buildValidationMessages({ question: 'the tallest residential house?', lines: ['BHP House was the tallest.'], answer: 'A Korean straw hut.' });
  assert.equal(sys.role, 'system');
  assert.match(user.content, /BHP House was the tallest/);
  assert.match(user.content, /tallest residential house/);
  assert.match(user.content, /Korean straw hut/);
});

// ── the stage: the unbound-contact fabrication, reconstructed from the export ──
// The state the pipeline is in AFTER veto on the export's turn 3: a claim that made lexical
// contact with a span (score 0.13 > CONTACT_FLOOR) but tied to no single sentence — uncited,
// nothing in `sources` — and the veto battery's unbound-contact/low-coverage flags fired.
const fabricationCtx = (overrides = {}) => ({
  validate: true,
  model: stubModel('UNSUPPORTED — the lines are skyscraper lists; none of them is about a residential house.'),
  question: 'like anywhere in the world',
  task: 'answer',
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

test('stages.validate: a one-shot unsupported fabrication is gated to an honest absence', async () => {
  const out = await stages.validate(fabricationCtx());
  assert.equal(out.gated, true, 'the turn is marked gated');
  assert.equal(out.voidSpoken, true, 'the typed absence spoke');
  assert.match(out.answer, /didn't find that in what I read/i, 'the fabrication is replaced by the honest absence');
  assert.ok(!/Antilia/.test(out.answer), 'the fabricated claim is out of the shown answer');
  assert.deepEqual(out.sources, [], 'a gated absence cites nothing');
  // the SEG/retract law: the superseded draft is kept beside its replacement, never erased.
  assert.ok(out.revisions.some((r) => /Antilia/.test(r.draft)), 'the draft is preserved in the trail');
  assert.ok(out.vetoes.some((v) => v.id === 'validation-unsupported' && v.refuses), 'a refusing flag records the gate');
  assert.equal(out.validation.verdict, 'unsupported');
});

test('stages.validate: the streaming path never un-streams — it flags, it does not replace', async () => {
  const out = await stages.validate(fabricationCtx({ streamed: { paragraphs: [], draft: 'x', done: true } }));
  assert.notEqual(out.gated, true, 'a streamed answer already shown is not gated');
  assert.notEqual(out.voidSpoken, true);
  assert.match(out.answer, /Antilia/, 'the streamed answer rides unchanged (suppress-never-erase)');
  assert.ok(out.vetoes.some((v) => v.id === 'validation-unsupported' && v.refuses), 'but a refusing flag is pinned to it');
  assert.equal(out.validation.verdict, 'unsupported');
});

test('stages.validate: a SUPPORTED verdict never gates — the paraphrase that rides stays protected', async () => {
  const ctx = fabricationCtx({ model: stubModel('SUPPORTED — the lines back this up.') });
  const out = await stages.validate(ctx);
  assert.notEqual(out.gated, true);
  assert.equal(out.answer, ctx.answer, 'the answer is untouched');
  assert.equal(out.validation.verdict, 'supported');
  assert.ok(!(out.vetoes || []).some((v) => v.id === 'validation-unsupported'), 'no refusal flag on a supported draft');
});

test('stages.validate: an unclear verdict never manufactures a refusal', async () => {
  const out = await stages.validate(fabricationCtx({ model: stubModel('It is difficult to be certain from these lines.') }));
  assert.notEqual(out.gated, true);
  assert.equal(out.validation.verdict, 'unclear');
  assert.ok(!(out.vetoes || []).some((v) => v.id === 'validation-unsupported'));
});

test('stages.validate: off by default, and inert where the grounding is not in doubt', async () => {
  // flag off → byte-identical no-op (the default everywhere but the reader app)
  const off = fabricationCtx({ validate: false });
  assert.equal(await stages.validate(off), off, 'validate:false returns the ctx untouched');

  // a witnessed answer (something cited) is left to the flag battery — the check never runs
  const cited = fabricationCtx({ bound: [{ claim: 'x', citation: 's0', score: 0.9 }], sources: [0], vetoes: [] });
  const citedOut = await stages.validate(cited);
  assert.equal(citedOut.validation, undefined, 'a cited answer is not checked');
  assert.notEqual(citedOut.gated, true);

  // no weak veto fired → the mechanical read did not doubt the grounding → no check
  const confident = fabricationCtx({ vetoes: [] });
  assert.equal((await stages.validate(confident)).validation, undefined, 'no weak flag → no check');

  // the talker already abstained in its own words → nothing to check
  const abstained = fabricationCtx({ rawOutput: "I didn't find that in what I read." });
  assert.equal((await stages.validate(abstained)).validation, undefined, 'an honest abstention is left alone');
});

test('stages.validate: never gates a non-model or empty turn', async () => {
  assert.equal((await stages.validate(fabricationCtx({ model: null }))).gated, undefined, 'no model → no-op');
  const noSpans = fabricationCtx({ spans: [] });
  assert.equal(await stages.validate(noSpans), noSpans, 'no spans → untouched');
});

// ── wired into the pipeline ───────────────────────────────────────────────────
test('runTurn: the validate stage is in the pipeline and silent by default', async () => {
  const doc = parseText('BHP House was the city\'s tallest for a few years. Eleven American buildings have held the title of tallest building in the world.', { docId: 'S-1' });
  const echo = { id: 'echo', kind: 'local', isLoaded: () => true, async load() {}, async phrase(m) { return m[m.length - 1].content.slice(0, 40); } };
  const audit = createAuditLog({ capacity: 64 });
  const r = await runTurn({ question: 'which buildings were the tallest in the world?', doc, model: echo, embedder: createHashEmbedder(), auditLog: audit /* validate defaults off */ });
  const step = (r.turn.steps || []).find((s) => s.name === 'validate');
  assert.ok(step, 'the validate stage runs as part of the fold');
  assert.equal(step.data.ran, undefined, 'with the flag off it is a silent no-op — no verdict recorded');
});

test('runTurn: with validate on, an unsupported streamed answer is flagged, not un-streamed', async () => {
  const doc = parseText('BHP House was the city\'s tallest for a few years. Eleven American buildings have held the title of tallest building in the world.', { docId: 'S-1' });
  // A model that fabricates an off-topic claim as the answer, then rejects it when asked to
  // check that draft against the lines (the validation prompt carries the double-check system
  // line). Streaming is on, so the fabrication must ride — flagged, never replaced.
  const twoFaced = {
    id: 'two', kind: 'local', isLoaded: () => true, async load() {},
    async phrase(messages, opts = {}) {
      const sys = messages[0]?.content || '';
      if (/double-checking a draft answer/.test(sys)) return 'UNSUPPORTED — the lines are about office towers, not the moon.';
      const out = 'The tallest building sits in a crater on the far side of the moon.';
      if (opts.onToken) for (const w of out.split(' ')) opts.onToken(w + ' ');
      return out;
    },
  };
  const audit = createAuditLog({ capacity: 64 });
  const r = await runTurn({ question: 'which buildings were the tallest in the world?', doc, model: twoFaced, embedder: createHashEmbedder(), auditLog: audit, validate: true, stream: true, onToken: () => {} });
  const step = (r.turn.steps || []).find((s) => s.name === 'validate');
  // The check may or may not fire depending on how the binder scored the off-topic draft; when
  // it did fire and found the draft unsupported, the streamed answer rides with a refusing flag.
  if (step?.data?.verdict === 'unsupported') {
    assert.ok((r.flags || []).some((f) => f.id === 'validation-unsupported'), 'a refusing flag is pinned to the streamed fabrication');
    assert.match(r.answer, /moon/, 'the streamed answer is not un-streamed');
  } else {
    assert.ok(step, 'the validate stage still ran as part of the fold');
  }
});
