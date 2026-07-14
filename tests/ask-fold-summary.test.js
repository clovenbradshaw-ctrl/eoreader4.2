// The fold-summary feed and the shape-exemplar anti-leak (docs/topline.md, docs/answer-expectation.md).
//
// The reported failure ("ask not working on basics"): a weak in-browser talker, handed thin raw
// spans plus a fact-laden SHAPE exemplar copied verbatim from an unrelated sample answer, copied the
// sample's FACTS — a Supreme Court transcript (case 17-530) answered with an ML paper's "quarter of
// the training cost", and "summarize the document" answered with a stray "there's no chapter 3".
//
// The cure is two-sided and pinned here:
//   1. the fold pre-digests — the source's (and its figures') standing topline is handed to the
//      prompt, so the model phrases what the reading already decided instead of re-deriving it;
//   2. the exemplar contributes FORM ONLY — a content-free register/length descriptor built from the
//      matched sample's shape_tags, never its verbatim text, so no foreign fact can ride in.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { createReaderApp } from '../src/rooms/reader/app.js';
import { runTurn } from '../src/turn/pipeline.js';
import { shapeDescriptor, composeFoldSummary } from '../src/turn/stages.js';
import { buildShapeLibrary } from '../src/turn/shape.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createModel } from '../src/model/interface.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import '../src/model/echo.js';   // registers the deterministic, network-free 'echo' backend

// A short transcript that is unambiguously NOT about ML training costs — the reported case shape.
const TRANSCRIPT = [
  'Mr Dupree: Mr Chief Justice, and may it please the Court.',
  'The question in this case is whether the Railroad Retirement Tax Act taxes stock.',
  'Justice Ginsburg asked whether Congress meant money remuneration only.',
  'The IRS argues that stock is compensation and therefore taxable under the Act.',
  'Mr Dupree replied that money means money, not shares of stock.',
].join('\n');

const embedder = createHashEmbedder();

// A deterministic fake MEANING embedder (mirrors tests/shape-grammar.test.js): a 4-dim first-letter
// hash, warm and meaning-measuring, so the form library navigates predictably.
const fakeMeaning = () => ({
  id: 'fake', organ: 'fake', model: 'fake-4d', measuresMeaning: true,
  isWarm: () => true, async warm() {},
  async embed(text) {
    const v = new Float32Array(4);
    for (const w of String(text).toLowerCase().split(/\s+/)) if (w) v[w.charCodeAt(0) % 4] += 1;
    const n = Math.hypot(...v) || 1;
    for (let i = 0; i < 4; i++) v[i] /= n;
    return v;
  },
});

// ── unit: the shape descriptor is content-free ───────────────────────────────
test('shapeDescriptor: register + length from tags, never facts or move-structure', () => {
  assert.equal(shapeDescriptor(['short', 'analytical', 'quote-then-gloss']), 'A short, analytical answer.');
  // 'quote-then-gloss' is a move-structure a small model would turn into a fabricated quote — dropped.
  assert.ok(!shapeDescriptor(['quote-then-gloss', 'short']).includes('quote'));
  // one length + up to two registers
  assert.equal(shapeDescriptor(['one-liner', 'crisp', 'committed', 'formal']), 'A one-line, crisp, committed answer.');
  // nothing safe to say → empty (the exemplar band then simply does not ride)
  assert.equal(shapeDescriptor([]), '');
  assert.equal(shapeDescriptor(['unknown-tag']), '');
  assert.equal(shapeDescriptor(undefined), '');
});

// ── unit: the fold summary folds source + only the figures the turn centres on ─
test('composeFoldSummary: source topline plus the centred figures, nothing else', () => {
  const out = composeFoldSummary({
    foldSummary: 'The case is about whether the Railroad Retirement Tax Act taxes stock.',
    entitySummaries: {
      'Mr Dupree': 'Mr Dupree argues money means money, not stock.',
      'IRS': 'The IRS argues stock is taxable compensation.',
      'Elvis': 'Elvis is never mentioned here.',
    },
    prediction: { entities: ['Mr Dupree'] },   // named by the mechanical draft
    surf: { focus: 'IRS' },                     // the fold's settled focus
  });
  assert.match(out, /Railroad Retirement Tax Act taxes stock/);
  assert.match(out, /Mr Dupree argues money means money/);
  assert.match(out, /IRS argues stock is taxable/);
  assert.doesNotMatch(out, /Elvis/, 'a figure the turn did not centre on is not folded in');
});

test('composeFoldSummary: empty when nothing is threaded (keeps the prompt byte-identical)', () => {
  assert.equal(composeFoldSummary({}), '');
  assert.equal(composeFoldSummary({ foldSummary: '', entitySummaries: null }), '');
});

// ── integration: the source topline is handed to the model, pre-digested ──────
test('runTurn: the fold summary rides the grounded prompt', async () => {
  const doc = parseText(TRANSCRIPT, { docId: 'S-0025' });
  const audit = createAuditLog({ capacity: 8 });
  const r = await runTurn({
    question: 'What does this case claim?',
    doc, model: createModel('echo'), embedder, auditLog: audit, grounding: 'auto',
    foldSummary: 'The case argues the Railroad Retirement Tax Act does not tax stock.',
    entitySummaries: { 'Mr Dupree': 'Mr Dupree argues money means money, not stock.' },
  });
  assert.equal(r.route, 'grounded');
  assert.match(r.turn.prompt, /standing summary it composed/, 'the fold-summary frame is present');
  assert.match(r.turn.prompt, /does not tax stock/, 'the composed summary text is handed over');
});

// ── integration: a matched exemplar contributes FORM, never its foreign facts ──
test('runTurn: a matched shape exemplar leaks no verbatim fact into the prompt', async () => {
  const doc = parseText(TRANSCRIPT, { docId: 'S-0025' });
  // The exact failure shape: an exemplar whose response carries an ML paper's distinctive fact.
  const LEAK = 'Our model achieves comparable quality while requiring less than a quarter of the training cost of the best prior result.';
  const EXEMPLARS = [
    { id: 'ml-1', intent: 'connect-passages', shape_tags: ['short', 'analytical'],
      user_turn: 'what does this case claim', response: LEAK },
    { id: 'aside-1', intent: 'conversational-aside', shape_tags: ['warm', 'prose'],
      user_turn: 'is this a good read', response: 'A lovely place to start.' },
  ];
  const meaning = fakeMeaning();
  const lib = await buildShapeLibrary(EXEMPLARS, (t) => meaning.embed(t));   // cosine (legacy) mode
  const audit = createAuditLog({ capacity: 8 });
  const r = await runTurn({
    question: 'what does this case claim',
    doc, model: createModel('echo'), embedder, geometricEmbedder: meaning,
    shapeLibrary: lib, auditLog: audit, grounding: 'auto',
  });
  // the exemplar band fired — but with the content-free descriptor, not the sample's text
  assert.match(r.turn.prompt, /A short, analytical answer\./, 'the form descriptor rode the prompt');
  assert.doesNotMatch(r.turn.prompt, /training cost/, 'the foreign sample fact must not leak');
  assert.doesNotMatch(r.turn.prompt, /comparable quality/, 'the foreign sample fact must not leak');
});

// ── end-to-end (real reader app): entity toplines generate on their own ───────
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready)
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test("reader: recording a source auto-composes its figures' toplines (no panel open)", async () => {
  const app = await freshApp();
  app.ingestText(TRANSCRIPT, '17-530');
  await settle(); await settle();                 // let the deferred auto-gen run
  const ents = app.entities();
  assert.ok(ents.length > 0, 'entities were admitted from the transcript');
  // Dominant figures carry a topline WITHOUT anyone opening their panel — autoEntitySummaries ran,
  // model-free, on record. This is the fix for the "SUMMARY · NOTHING FOUND YET" the dossier showed.
  const withSummary = ents.filter((e) => {
    const s = app.entitySummaryFor(e.label);
    return s && typeof s.text === 'string' && s.text.length > 0;
  });
  assert.ok(withSummary.length > 0, 'at least one figure got an auto-composed topline on record');
});
