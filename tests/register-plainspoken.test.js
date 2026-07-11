import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM_GROUND, buildGroundedMessages } from '../src/model/index.js';
import { CONTINUE_CUE, streamParagraphs } from '../src/weave/write/index.js';

// The stilted answer these guard against (an exported chat where a small local model,
// asked about orcas over a loaded document, answered):
//   "Based on what I read, it seems that the author is talking about orcas… The text
//    mentions… The text doesn't provide… which suggests… also implies…" — the same
//   large-brain→intelligence point restated across four paragraphs.
// Two causes, two layers: the grounded register seeded the reading-narration preamble,
// and the paragraph loop padded the answer by re-covering ground in fresh words. These
// tests pin the fix at each layer so it cannot silently regress.

test('SYSTEM_GROUND asks for the answer head-on, not a narration of the reading', () => {
  // The old bait "say what those lines show" came back as "the text shows / mentions…".
  assert.ok(!/say what those lines show/i.test(SYSTEM_GROUND),
    'the reading-narration bait ("say what those lines show") is gone');
  // It now asks for the answer head-on and names the preamble tics as things to avoid.
  assert.match(SYSTEM_GROUND, /head-on/i, 'asks for the answer head-on');
  assert.match(SYSTEM_GROUND, /narrating your own reading/i, 'warns off narrating the reading');
  assert.match(SYSTEM_GROUND, /say each thing once/i, 'asks it not to circle back and restate');
  // The honest frame and its natural gap-voicing are preserved, not steered away.
  assert.match(SYSTEM_GROUND, /voice of a reader/i, 'keeps the honest reader frame');
  assert.match(SYSTEM_GROUND, /I didn't find that in what I read/i, 'keeps the natural gap-voicing');
});

test('the grounded prompt carries the head-on register to the talker', () => {
  const [sys] = buildGroundedMessages({
    question: 'what is the largest species of dolphin?',
    spans: [{ text: 'Orcas are the largest members of the dolphin family.' }],
  });
  assert.equal(sys.role, 'system');
  assert.match(sys.content, /head-on/i, 'the system frame the talker receives leads with the answer');
});

test('CONTINUE_CUE makes a clean close the default and forbids reworded restatement', () => {
  // A close is the easy path, not "always write another paragraph".
  assert.match(CONTINUE_CUE, /only if you have a genuinely new point/i,
    'continuation is gated on a genuinely new point');
  assert.match(CONTINUE_CUE, /reply with only DONE/i, 'DONE stays the clean close');
  // Rewording an already-made point in fresh words is named as forbidden (the orca failure).
  assert.match(CONTINUE_CUE, /reword[^.]*even in other words/i,
    'reworded restatement is forbidden, not just verbatim repetition');
});

// The behavioural backstop still holds under the new cue: a continuation that only
// re-covers already-said ground never reaches the surface (surfer/salience.js retreads).
// The guard is LEXICAL — it catches a near-repeat (the same point re-ordered), not a
// synonym-level paraphrase; catching that rewording is what the CONTINUE_CUE nudge is for,
// which is why the cue forbids it outright rather than leaning on this backstop alone.
test('a re-covering continuation is still dropped by the loop', async () => {
  const paras = [
    'Orcas have the second-largest brain mass of any animal, after the sperm whale.',
    'After the sperm whale, orcas have the second-largest brain mass of any animal.',
    'This paragraph must never be reached.',
  ];
  let call = 0;
  const model = {
    phrase: async (_m, { onToken } = {}) => {
      const full = paras[Math.min(call, paras.length - 1)];
      call += 1;
      onToken?.(full);
      return full;
    },
  };
  let streamed = '';
  const res = await streamParagraphs({
    model,
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'tell me about orcas' }],
    onToken: (s) => { streamed += s; },
    budget: 384,
  });
  assert.ok(res, 'a draft was realised');
  assert.equal(res.paragraphs.length, 1, 'the reworded restatement halts the loop');
  assert.ok(!/must never be reached/.test(streamed), 'nothing past the restatement was streamed');
});
