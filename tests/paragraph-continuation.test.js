import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streamParagraphs } from '../src/weave/write/paragraphs.js';

// streamParagraphs writes the answer one paragraph per model call: the first from the
// grounded prompt, each CONTINUATION from an appended CONTINUE_CUE ("pick up where you
// left off"). A small model reads that cue literally and opens the continuation with its
// own ellipsis ("…One species, the Bermuda flicker…") — a seam artifact, never content.
// The boundary gate must skip that leading ellipsis before anything is streamed, so it
// appears neither in the live stream nor in the stored draft (no flicker).

// A model scripted to return one canned paragraph per call, streamed in two chunks so the
// boundary gate has to hold-then-open exactly as it does against a real backend. The chunk
// split falls BEFORE the first sentence closes, so the ellipsis is seen while `!opened`.
const scriptedModel = (paras) => {
  let call = 0;
  return {
    phrase: async (_messages, { onToken } = {}) => {
      const full = paras[Math.min(call, paras.length - 1)];
      call += 1;
      const cut = Math.max(1, Math.floor(full.length / 3));   // split ahead of the first '.'
      onToken?.(full.slice(0, cut));
      onToken?.(full.slice(cut));
      return full;
    },
  };
};

const messages = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'what is the largest woodpecker' },
];

test('a continuation paragraph opening with an ellipsis is cleaned', async () => {
  let streamed = '';
  const model = scriptedModel([
    'The largest woodpecker is the great slaty woodpecker.',
    '...One species, the Bermuda flicker, is believed to be extinct.',
    '...This woodpecker is native to North America.',
  ]);

  const res = await streamParagraphs({ model, messages, onToken: (s) => { streamed += s; }, budget: 384 });

  assert.ok(res, 'a draft was realised');
  assert.equal(res.paragraphs.length, 3, 'three paragraphs, one per model call (budget 384 → cap 3)');

  // The first paragraph is untouched; the continuations open on their real first word.
  assert.equal(res.paragraphs[0], 'The largest woodpecker is the great slaty woodpecker.');
  assert.ok(res.paragraphs[1].startsWith('One species'), `continuation 1 keeps its ellipsis: ${JSON.stringify(res.paragraphs[1])}`);
  assert.ok(res.paragraphs[2].startsWith('This woodpecker'), `continuation 2 keeps its ellipsis: ${JSON.stringify(res.paragraphs[2])}`);

  // No paragraph in the draft opens with an ellipsis, ASCII or unicode.
  for (const p of res.paragraphs) assert.ok(!/^\s*(?:\.{2,}|…)/.test(p), `paragraph still leads with an ellipsis: ${JSON.stringify(p)}`);

  // The streaming invariant: what the user saw live IS the stored draft — the ellipsis was
  // never streamed, so there is no flicker where it appears then vanishes.
  assert.equal(streamed, res.draft, 'the emitted stream is byte-identical to the draft');
});

test('a continuation that is nothing but an ellipsis is dropped, not shown', async () => {
  let streamed = '';
  const model = scriptedModel([
    'The largest woodpecker is the great slaty woodpecker.',
    '...',                                   // the model answers the cue with only an ellipsis
    'This paragraph must never be reached.',
  ]);

  const res = await streamParagraphs({ model, messages, onToken: (s) => { streamed += s; }, budget: 384 });

  assert.ok(res, 'a draft was realised');
  assert.equal(res.paragraphs.length, 1, 'the ellipsis-only continuation halts the loop like an empty paragraph');
  assert.equal(res.paragraphs[0], 'The largest woodpecker is the great slaty woodpecker.');
  assert.ok(!streamed.includes('...'), 'the bare ellipsis was never streamed');
  assert.equal(streamed, res.draft, 'the emitted stream is byte-identical to the draft');
});

test('a genuine first-paragraph opener is never mistaken for the seam artifact', async () => {
  // The first paragraph never sees CONTINUE_CUE, so its opening is left exactly as written —
  // the strip is scoped to continuations. (A lone leading period is also not an ellipsis.)
  const model = scriptedModel(['0.5 kg is the mass the study reports for it.']);
  const res = await streamParagraphs({ model, messages, budget: 128 });
  assert.ok(res);
  assert.equal(res.paragraphs[0], '0.5 kg is the mass the study reports for it.');
});
