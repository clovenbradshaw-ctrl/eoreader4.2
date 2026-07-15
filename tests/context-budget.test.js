import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitMessages, messagesTokens, estimateTokens } from '../src/model/context-budget.js';
import { registerBackend, createModel, modelContextWindow } from '../src/model/interface.js';

// THE CONTEXT-WINDOW GUARD (model/context-budget.js + the createModel wrapper). The assembler
// keeps a prompt small in the common case; this is the floor that GUARANTEES it fits the model
// that will decode it. The contract: a no-op when the prompt already fits (byte-identical, so the
// golden prompts stand), and just enough shed — history first, then the middle of the largest
// block — to fit when it would overflow, never cutting the system voice or the trailing question.

const sys = (n) => ({ role: 'system', content: 'S'.repeat(n) });
const usr = (n, tag = 'U') => ({ role: 'user', content: tag.repeat(n) });
const asst = (n) => ({ role: 'assistant', content: 'A'.repeat(n) });

test('estimateTokens: ASCII stays chars/4 (byte-identical), whitespace-only is nothing', () => {
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  assert.equal(estimateTokens('   '), 0);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  // A pure-ASCII string of any length matches the old flat chars/4 exactly, so the golden
  // English prompts are unchanged.
  const ascii = 'The quick brown fox jumps over the lazy dog. He went first to the market.';
  assert.equal(estimateTokens(ascii), Math.ceil(ascii.length / 4));
});

test('estimateTokens counts non-Latin scripts denser than chars/4 (byte-level BPE reality)', () => {
  // The bug this guards: chars/4 UNDER-counts non-Latin, so a Cyrillic/CJK prompt slips past the
  // window guard and overflows a 4k local model (ContextWindowSizeExceededError). The estimate
  // must be strictly higher than chars/4 for these scripts so the guard actually trims them.
  const ru = 'Сначала он пошёл на рынок, потом домой.';          // Cyrillic — 2-byte code points
  const ja = '彼は最初に市場へ行き、それから家に帰りました。';    // CJK/kana — 3-byte code points
  assert.ok(estimateTokens(ru) > Math.ceil(ru.length / 4), 'Cyrillic counts denser than chars/4');
  assert.ok(estimateTokens(ja) > Math.ceil(ja.length / 4), 'CJK/kana counts denser than chars/4');
  // CJK/kana is the densest: a 3-byte code point is estimated at ~1.5 tokens, so the count is at
  // least one token per character — ~6× the chars/4 guess.
  assert.ok(estimateTokens(ja) >= ja.length, 'each CJK/kana char is estimated at ≥1 token');
});

test('fitMessages is a no-op — same array — when the prompt already fits', () => {
  const messages = [sys(40), usr(40)];
  const out = fitMessages(messages, 1000);
  assert.equal(out.trimmed, false);
  assert.equal(out.messages, messages);   // same reference: nothing was copied or changed
});

test('fitMessages drops interior history oldest-first, keeping system + last question', () => {
  // Five turns of ~200 tokens each (800 chars); a 700-token limit forces most history out.
  const messages = [
    sys(400),          // ~101 tokens — the boundary/voice, never dropped
    usr(800),          // oldest interior — dropped first
    asst(800),
    usr(800),
    asst(800),
    usr(120, 'Q'),     // the live question — never dropped
  ];
  const out = fitMessages(messages, 700);
  assert.equal(out.trimmed, true);
  assert.ok(out.after <= 700, `after=${out.after} must be within the limit`);
  // The system message and the final question both survive.
  assert.equal(out.messages[0].role, 'system');
  assert.equal(out.messages[0].content, messages[0].content);
  const last = out.messages[out.messages.length - 1];
  assert.equal(last.content, messages[messages.length - 1].content);
  // Fewer messages than we started with — interior turns were shed.
  assert.ok(out.messages.length < messages.length);
});

test('fitMessages truncates the big block\'s middle, preserving head and the trailing question', () => {
  // Only a system + one huge user block (the grounded shape). The question rides at the very end.
  const head = 'READING FRAME: what I found reading it:\n';
  const excerpts = 'X'.repeat(20000);
  const question = '\nTheir question: what is the fastest animal?';
  const messages = [sys(300), { role: 'user', content: head + excerpts + question }];
  const out = fitMessages(messages, 800);
  assert.equal(out.trimmed, true);
  assert.ok(out.after <= 800, `after=${out.after} must be within the limit`);
  const user = out.messages[1].content;
  assert.ok(user.startsWith(head.slice(0, 20)), 'the frame head is preserved');
  assert.ok(user.endsWith(question), 'the trailing question is preserved');
  assert.ok(user.includes('trimmed to fit'), 'the elision marker marks the cut');
  assert.ok(user.length < head.length + excerpts.length + question.length, 'the block shrank');
});

test('fitMessages trims a dense non-Latin block to NEAR the budget, not a fraction of it', () => {
  // Regression on the truncation math: dropping chars at a fixed 4-per-token over-sheds a dense
  // CJK block ~6×, leaving the model a sliver of the context it was allowed. The cut must land
  // close to the budget (density-aware), while still fitting and keeping the trailing question.
  const head = 'READING:\n';
  const excerpts = 'それから彼は市場へ行きました。'.repeat(500);   // dense CJK/kana (3-byte code points)
  const question = '\n最初にどこへ行きましたか？';
  const messages = [{ role: 'system', content: 'S'.repeat(200) },
                    { role: 'user', content: head + excerpts + question }];
  const limit = 2000;
  const out = fitMessages(messages, limit);
  assert.equal(out.trimmed, true);
  assert.ok(out.after <= limit, `after=${out.after} must be within the limit`);
  assert.ok(out.after > limit * 0.6, `after=${out.after} should use most of the ${limit} budget, not a fraction`);
  assert.ok(out.messages[1].content.startsWith(head.slice(0, 8)), 'the frame head is preserved');
  assert.ok(out.messages[1].content.endsWith(question), 'the trailing question is preserved');
});

test('fitMessages tolerates non-arrays and empty input', () => {
  assert.equal(fitMessages(null, 100).messages, null);
  assert.deepEqual(fitMessages([], 100).messages, []);
});

// ── The createModel wrapper ───────────────────────────────────────────────────

// A capture backend that records exactly the messages its phrase()/propose() were handed.
const makeCapture = (id, contextWindow) => {
  const seen = { phrase: null, propose: null };
  registerBackend(id, () => ({
    id, kind: 'local', contextWindow,
    isLoaded: () => true,
    async load() {},
    async phrase(messages) { seen.phrase = messages; return 'ok'; },
    async *propose(messages) { seen.propose = messages; yield { tokens: [{ token: '.', logprob: 0 }] }; },
  }));
  return seen;
};

test('createModel keeps a prompt within a declared context window before it reaches the backend', async () => {
  const seen = makeCapture('capture-4k', 4096);
  const model = createModel('capture-4k');
  assert.equal(modelContextWindow(model), 4096);
  // A prompt far past the 4096 window (system + a ~40k-char excerpt block).
  const big = [{ role: 'system', content: 'S'.repeat(400) },
               { role: 'user', content: 'X'.repeat(160000) + '\nquestion?' }];
  await model.phrase(big, { maxTokens: 384 });
  assert.ok(seen.phrase !== big, 'the backend received a fitted copy, not the raw oversized prompt');
  assert.ok(messagesTokens(seen.phrase) <= 4096, 'what the backend saw fits the window');
  assert.ok(seen.phrase[1].content.endsWith('\nquestion?'), 'the question still reaches the model');
});

test('createModel trims a non-Latin prompt the old chars/4 rule would have called "fits"', async () => {
  // The regression: a CJK excerpt block whose chars/4 estimate sits UNDER the window but whose
  // real (byte-level-BPE) token count overflows it. The old flat estimator trimmed nothing and the
  // runtime threw ContextWindowSizeExceededError; the script-aware estimate sheds it to fit.
  const seen = makeCapture('capture-nonlatin', 4096);
  const model = createModel('capture-nonlatin');
  // ~11k CJK characters. chars/4 ⇒ ~2800 "tokens" (looks like it fits under 4096); byte-level
  // reality is ~1.5 tokens/char ⇒ far past the window.
  const cjk = '彼は最初に市場へ行きました。'.repeat(800);
  const question = '\n最初にどこへ行きましたか？';
  const big = [{ role: 'system', content: 'Answer from the text.' },
               { role: 'user', content: cjk + question }];
  const oldChars4 = Math.ceil(big[1].content.length / 4);
  assert.ok(oldChars4 < 4096, `precondition: chars/4 (${oldChars4}) would have called this a fit`);
  await model.phrase(big, { maxTokens: 384 });
  assert.ok(seen.phrase !== big, 'the backend received a fitted copy, not the raw oversized prompt');
  assert.ok(messagesTokens(seen.phrase) <= 4096, 'what the backend saw fits the window');
  assert.ok(seen.phrase[1].content.endsWith(question), 'the trailing question still reaches the model');
});

test('createModel is a pass-through when the prompt already fits (byte-identical)', async () => {
  const seen = makeCapture('capture-fit', 4096);
  const model = createModel('capture-fit');
  const small = [{ role: 'system', content: 'be helpful' }, { role: 'user', content: 'hi' }];
  await model.phrase(small);
  assert.equal(seen.phrase, small, 'a fitting prompt is handed through untouched');
});

test('createModel does not enforce a window a backend never declares', async () => {
  const seen = makeCapture('capture-none', undefined);
  const model = createModel('capture-none');
  assert.equal(modelContextWindow(model), null);
  const big = [{ role: 'user', content: 'X'.repeat(200000) }];
  await model.phrase(big);
  assert.equal(seen.phrase, big, 'no declared window ⇒ nothing trimmed');
});

test('createModel wraps propose too, and preserves the .next(pick) protocol', async () => {
  const seen = makeCapture('capture-prop', 4096);
  const model = createModel('capture-prop');
  assert.equal(typeof model.propose, 'function');
  const big = [{ role: 'user', content: 'X'.repeat(160000) }];
  const it = model.propose(big, { maxTokens: 256 });
  const first = await it.next();
  assert.equal(first.done, false);
  assert.ok(seen.propose !== big && messagesTokens(seen.propose) <= 4096, 'propose saw a fitted prompt');
});

test('a backend without propose stays without one (the gated path detects its absence)', () => {
  registerBackend('capture-nopropose', () => ({
    id: 'capture-nopropose', kind: 'local', contextWindow: 4096,
    isLoaded: () => true, async load() {}, async phrase() { return ''; },
  }));
  const model = createModel('capture-nopropose');
  assert.equal(model.propose, undefined);
});
