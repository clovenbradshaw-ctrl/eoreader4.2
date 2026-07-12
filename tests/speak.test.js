import { test } from 'node:test';
import assert from 'node:assert/strict';

import { speak } from '../src/model/speak.js';

// The one decode organ (model/speak.js) — the guarded phrase every swallow-to-
// fallback call site goes through. The contract under test: a successful decode
// always returns a STRING (String(raw ?? '')); a failed decode returns the
// caller's declared fallback and never throws; decode opts pass through to the
// backend untouched (fallback and onToken are the organ's own, never the
// backend's); onToken routes the decode through streamPhrase, so a streaming
// backend surfaces pieces live and a non-streaming one draw-then-emits.

test('speak: success returns the String coercion of the phrase result', async () => {
  const model = { phrase: async () => 42 };
  assert.equal(await speak(model, []), '42', 'a non-string result is coerced');
  const model2 = { phrase: async () => '  an answer ' };
  assert.equal(await speak(model2, []), '  an answer ', 'a string result rides through untouched');
});

test('speak: a throwing phrase returns the default fallback \'\'', async () => {
  const model = { phrase: async () => { throw new Error('decode fault'); } };
  assert.equal(await speak(model, []), '', 'the default fallback is the empty string');
});

test('speak: a declared fallback (null) is respected on a fault', async () => {
  const model = { phrase: async () => { throw new Error('decode fault'); } };
  assert.equal(await speak(model, [], { fallback: null }), null, 'the caller\'s null rides back');
  const off = { clarify: false };
  assert.equal(await speak(model, [], { fallback: off }), off, 'any declared fallback value rides back');
});

test('speak: decode opts pass through to phrase verbatim; fallback never leaks', async () => {
  const seen = [];
  const model = { phrase: async (messages, opts) => { seen.push({ messages, opts }); return 'ok'; } };
  const messages = [{ role: 'user', content: 'q' }];
  const signal = new AbortController().signal;
  await speak(model, messages, { fallback: null, maxTokens: 220, temperature: 0, minPredict: 0, signal });
  assert.equal(seen.length, 1, 'exactly one decode');
  assert.equal(seen[0].messages, messages, 'the messages object is handed through by reference');
  assert.deepEqual(seen[0].opts, { maxTokens: 220, temperature: 0, minPredict: 0, signal },
    'the decode opts arrive untouched — and fallback is the organ\'s own, never the backend\'s');
});

test('speak: onToken routes through streamPhrase — a streaming backend surfaces pieces live', async () => {
  const model = {
    phrase: async (messages, opts) => {
      // a streaming backend: emits pieces through the handed onToken, returns the whole beat
      opts.onToken('two ');
      opts.onToken('words');
      return 'two words';
    },
  };
  const pieces = [];
  const out = await speak(model, [], { onToken: (p) => pieces.push(p), maxTokens: 8 });
  assert.equal(out, 'two words', 'the full beat comes back');
  assert.deepEqual(pieces, ['two ', 'words'], 'the pieces surfaced live, concatenating to the return');
});

test('speak: onToken with a non-streaming backend draw-then-emits the whole beat once', async () => {
  const model = { phrase: async () => 'whole beat' };       // ignores onToken entirely
  const pieces = [];
  const out = await speak(model, [], { onToken: (p) => pieces.push(p) });
  assert.equal(out, 'whole beat');
  assert.deepEqual(pieces, ['whole beat'], 'the fallback emission is the returned text, once');
});

test('speak: a fault on the onToken path still returns the fallback', async () => {
  const model = { phrase: async () => { throw new Error('decode fault'); } };
  assert.equal(await speak(model, [], { onToken: () => {}, fallback: null }), null);
});

test('speak: an undefined or null phrase result becomes \'\'', async () => {
  assert.equal(await speak({ phrase: async () => undefined }, []), '');
  assert.equal(await speak({ phrase: async () => null }, []), '');
});
