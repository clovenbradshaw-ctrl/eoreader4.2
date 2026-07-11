import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// SPAN-LEVEL PROVENANCE (rooms/reader/app.js, answerSegments with { sources }) — links mode now
// discloses, span by span, exactly what stands behind each stretch of an answer. The run of prose
// SINCE the last [sN] citation is grounded in the source that citation resolves to; a run with no
// trailing citation stays ungrounded (gsn null). The surface paints grounded spans with their
// source's tint and ungrounded ones with a dashed wash, so this pins the grounding walk itself.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

const proseSegs = (paras) => paras.flatMap((p) => p.segs).filter((s) => s.t === 'text' || s.t === 'ent');
// a "span" is words — only wordful runs are what the surface actually grounds or leaves ungrounded;
// connective punctuation is rendered plain, so it is excluded here just as it is in the UI.
const wordSegs = (paras) => proseSegs(paras).filter((s) => /[\p{L}\p{N}]/u.test(s.s || ''));

test('answerSegments back-fills each prose run with the source its trailing citation resolves to', async () => {
  const app = await freshApp();
  const msg = {
    text: 'Alpha is grounded [s1]. Beta is grounded too [s2]. Gamma has no citation behind it.',
    cites: [
      { idx: 1, sn: 'S1', reg: 'S-0001', title: 'One', text: 'a' },
      { idx: 2, sn: 'S2', reg: 'S-0002', title: 'Two', text: 'b' },
    ],
  };
  const paras = app.answerSegments(msg, { entities: false, cites: true, sources: true });
  const prose = proseSegs(paras);

  const alpha = prose.find((s) => /Alpha/.test(s.s));
  const beta = prose.find((s) => /Beta/.test(s.s));
  const gamma = prose.find((s) => /Gamma/.test(s.s));

  assert.equal(alpha.gsn, 'S1', 'the run before [s1] is grounded in S1');
  assert.equal(beta.gsn, 'S2', 'the run between [s1] and [s2] is grounded in S2');
  assert.equal(gamma.gsn, undefined, 'the trailing run with no citation stays ungrounded');
});

test('sources:false leaves prose ungrounded — the grounding walk is opt-in (links mode off)', async () => {
  const app = await freshApp();
  const msg = { text: 'A claim [s1].', cites: [{ idx: 1, sn: 'S1', reg: 'S-0001', title: 'One', text: 'a' }] };
  const paras = app.answerSegments(msg, { entities: false, cites: true, sources: false });
  assert.ok(proseSegs(paras).every((s) => s.gsn === undefined), 'no gsn painted when sources is off');
  // the cite chip is still emitted regardless — grounding disclosure is additive, not a replacement
  assert.ok(paras.flatMap((p) => p.segs).some((s) => s.t === 'cite' && s.sn === 'S1'), 'cite chip still present');
});

test('a shared citation grounds a whole multi-sentence run in one source', async () => {
  const app = await freshApp();
  const msg = {
    text: 'First sentence. Second sentence, same source [s1].',
    cites: [{ idx: 1, sn: 'S1', reg: 'S-0001', title: 'One', text: 'a' }],
  };
  const words = wordSegs(app.answerSegments(msg, { entities: false, cites: true, sources: true }));
  assert.ok(words.length > 0 && words.every((s) => s.gsn === 'S1'), 'every word up to [s1] carries S1');
});

test('a fully uncited answer leaves every word ungrounded — the surface flags it', async () => {
  const app = await freshApp();
  const msg = { text: 'This is just the model talking, with nothing recorded behind it.', cites: [] };
  const words = wordSegs(app.answerSegments(msg, { entities: false, cites: true, sources: true }));
  assert.ok(words.length > 0 && words.every((s) => s.gsn === undefined), 'no word is grounded when nothing is cited');
});
