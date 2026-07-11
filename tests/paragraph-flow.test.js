import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streamParagraphs } from '../src/weave/write/paragraphs.js';

// The observed symptom: a small instruct model puts a blank line after EVERY sentence, so the
// paragraph gate (which closed at the first blank line) turned each sentence into its own
// paragraph, re-joined with '\n\n' — "one sentence with a return break". The gate now closes a
// paragraph only at a blank line whose preceding segment is SUBSTANTIAL (a real, developed
// passage); a blank line after a single sentence is the per-sentence habit and collapses to a
// space, so the sentences flow into a paragraph. Length stays emergent — the loop still ends
// when the model closes (DONE / a repeat / an empty draw).

const messages = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'tell me about the great slaty woodpecker' },
];

test('a decode that breaks after every sentence flows into one paragraph, not one-per-line', async () => {
  let streamed = '';
  let call = 0;
  const model = {
    phrase: async (_m, { onToken } = {}) => {
      call += 1;
      if (call === 1) {
        // one decode, the per-sentence-blank-line habit
        for (const p of ['The great slaty woodpecker is the largest.\n\n',
                         'It lives in Southeast Asia.\n\n',
                         'It can reach fifty centimetres.']) onToken?.(p);
        return 'The great slaty woodpecker is the largest.\n\nIt lives in Southeast Asia.\n\nIt can reach fifty centimetres.';
      }
      onToken?.('DONE'); return 'DONE';
    },
  };

  const res = await streamParagraphs({ model, messages, onToken: (s) => { streamed += s; }, budget: 384 });
  assert.ok(res, 'a draft was realised');
  assert.equal(res.paragraphs.length, 1, 'the per-sentence breaks collapsed into ONE flowing paragraph');
  assert.ok(!/\n/.test(res.paragraphs[0]), 'no blank lines left inside the paragraph');
  assert.match(res.paragraphs[0], /largest\. It lives in Southeast Asia\. It can reach fifty centimetres\./);
  assert.equal(streamed, res.draft, 'the emitted stream is byte-identical to the draft (no un-streaming)');
});

test('a substantial multi-sentence segment still closes on its blank line — real paragraphs survive', async () => {
  let call = 0;
  const model = {
    phrase: async (_m, { onToken } = {}) => {
      call += 1;
      if (call === 1) {
        const t = 'Woodpeckers drum on trees to signal. They also excavate insects with strong beaks.\n\nA further point that must not merge in.';
        onToken?.(t); return t;
      }
      onToken?.('DONE'); return 'DONE';
    },
  };

  const res = await streamParagraphs({ model, messages, budget: 384 });
  assert.ok(res);
  // the first segment carries two sentences → substantial → its blank line closes the paragraph.
  assert.ok(res.paragraphs[0].startsWith('Woodpeckers drum on trees to signal. They also excavate'));
  assert.ok(!/further point/.test(res.paragraphs[0]), 'the substantial paragraph closed at its blank line, did not swallow the next');
});

test('a single-line answer that ends cleanly is untouched', async () => {
  // the common short answer — one decode, one sentence, no trailing blank line: byte-identical.
  const model = {
    phrase: async (_m, { onToken } = {}) => { const t = 'The largest is the great slaty woodpecker.'; onToken?.(t); return t; },
  };
  let streamed = '';
  const res = await streamParagraphs({ model, messages, onToken: (s) => { streamed += s; }, budget: 384 });
  assert.equal(res.paragraphs.length, 1);
  assert.equal(res.paragraphs[0], 'The largest is the great slaty woodpecker.');
  assert.equal(streamed, res.draft);
});
