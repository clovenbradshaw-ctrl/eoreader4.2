import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBase, toOpenAIRequest, deltaFromLine, pickModel,
} from '../src/model/openai-local.js';
import { availableBackends, createModel } from '../src/model/interface.js';

// The LM Studio / Ollama local-server backend — the bridge that lets the tab reach a
// big model running natively on the same machine. The pure seams (base normalisation,
// request build, SSE delta parse, model auto-discovery) are unit-tested here, and the
// live path (probe → discover → stream) is driven with a mocked global fetch backed by
// a real ReadableStream — so the streaming parser is exercised for real, no network.

test('model/openai-local: registers both lmstudio and ollama backends', () => {
  const names = availableBackends();
  assert.ok(names.includes('lmstudio'), 'lmstudio is registered');
  assert.ok(names.includes('ollama'), 'ollama is registered');
  for (const id of ['lmstudio', 'ollama']) {
    const m = createModel(id);
    assert.equal(m.id, id);
    assert.equal(m.kind, 'remote');
    assert.equal(m.isLoaded(), false);
    assert.equal(typeof m.load, 'function');
    assert.equal(typeof m.phrase, 'function');
  }
});

test('model/openai-local: normalizeBase appends /v1 only when no version is present', () => {
  assert.equal(normalizeBase('http://localhost:1234'), 'http://localhost:1234/v1');
  assert.equal(normalizeBase('http://localhost:1234/'), 'http://localhost:1234/v1');
  assert.equal(normalizeBase('http://localhost:11434/v1/'), 'http://localhost:11434/v1');
  assert.equal(normalizeBase('http://localhost:11434/v1'), 'http://localhost:11434/v1');
  assert.equal(normalizeBase(''), '');
});

test('model/openai-local: toOpenAIRequest stringifies content and attaches sampling opts', () => {
  const body = toOpenAIRequest(
    [{ role: 'system', content: 'S' }, { role: 'user', content: 5 }, { bogus: true }],
    { model: 'q', maxTokens: 10, temperature: 0.2, stop: ['\n'] },
  );
  assert.equal(body.model, 'q');
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 10);
  assert.equal(body.temperature, 0.2);
  assert.deepEqual(body.stop, ['\n']);
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'S' },
    { role: 'user', content: '5' },
  ]);
});

test('model/openai-local: toOpenAIRequest omits opts that were not given', () => {
  const body = toOpenAIRequest([{ role: 'user', content: 'hi' }], { model: 'q' });
  assert.equal('max_tokens' in body, false);
  assert.equal('temperature' in body, false);
  assert.equal('stop' in body, false);
});

test('model/openai-local: deltaFromLine reads content, DONE, and skips noise', () => {
  assert.deepEqual(deltaFromLine('data: {"choices":[{"delta":{"content":"Hi"}}]}'), { content: 'Hi' });
  assert.deepEqual(deltaFromLine('data: [DONE]'), { done: true });
  assert.equal(deltaFromLine(': keepalive'), null);
  assert.equal(deltaFromLine(''), null);
  assert.equal(deltaFromLine('data: {not json'), null, 'a malformed frame is skipped, not thrown');
  // The legacy completions shape (choices[].text) is also honoured.
  assert.deepEqual(deltaFromLine('data: {"choices":[{"text":"x"}]}'), { content: 'x' });
});

test('model/openai-local: pickModel prefers a valid pin, else the first listed', () => {
  assert.equal(pickModel(['a', 'b'], 'b'), 'b');       // pin present → pin
  assert.equal(pickModel(['a', 'b'], 'z'), 'a');       // pin absent from list → first
  assert.equal(pickModel(['x', 'y']), 'x');            // no pin → first
  assert.equal(pickModel([], 'only'), 'only');         // empty list but named → trust the pin
  assert.equal(pickModel([]), null);                   // nothing to run
});

test('model/openai-local: phrase() before load() refuses', async () => {
  const m = createModel('lmstudio');
  await assert.rejects(() => m.phrase([{ role: 'user', content: 'hi' }]), /not loaded/);
});

test('model/openai-local: load() surfaces an honest, actionable error when the server is down', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
  try {
    const m = createModel('ollama', { baseURL: 'http://localhost:11434/v1' });
    await assert.rejects(() => m.load(), /Ollama isn't reachable.*OLLAMA_ORIGINS/s);
    assert.equal(m.isLoaded(), false, 'a failed probe leaves the backend unloaded');
  } finally { globalThis.fetch = saved; }
});

test('model/openai-local: load() fails clearly when the server has no model', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  try {
    const m = createModel('lmstudio', { baseURL: 'http://localhost:1234/v1' });
    await assert.rejects(() => m.load(), /no model loaded/);
  } finally { globalThis.fetch = saved; }
});

// A ReadableStream that emits the given string chunks as UTF-8 — a real streamed body,
// so the backend's getReader()/TextDecoder path runs exactly as in the browser.
const streamOf = (chunks) => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
};

test('model/openai-local: load() auto-discovers the model, phrase() streams tokens', async () => {
  const saved = globalThis.fetch;
  const seen = { model: null, url: null };
  // The SSE reply, deliberately split so one JSON frame straddles a chunk boundary —
  // proving the newline buffer reassembles across reads.
  const sse = [
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    'data: {"choices":[{"delta":{"con',
    'tent":", world"}}]}\n\ndata: [DONE]\n\n',
  ];
  globalThis.fetch = async (url, init) => {
    seen.url = String(url);
    if (String(url).endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'qwen3-coder-next' }, { id: 'other' }] }), { status: 200 });
    }
    seen.model = JSON.parse(init.body).model;   // capture the discovered id sent to chat
    return new Response(streamOf(sse), { status: 200 });
  };
  try {
    const m = createModel('ollama', { baseURL: 'http://localhost:11434/v1' });
    const phases = [];
    await m.load((p) => phases.push(p.phase));
    assert.equal(m.isLoaded(), true);
    assert.deepEqual(m.describe().model, 'qwen3-coder-next', 'discovered the first listed model');
    assert.ok(phases.includes('ready'), 'reported a ready phase');

    const tokens = [];
    const out = await m.phrase([{ role: 'user', content: 'hi' }], { onToken: (t) => tokens.push(t) });
    assert.equal(out, 'Hello, world', 'the streamed pieces reassemble into the full answer');
    assert.deepEqual(tokens, ['Hello', ', world'], 'onToken fired once per delta');
    assert.equal(seen.model, 'qwen3-coder-next', 'chat/completions was sent the discovered model');
    assert.ok(seen.url.endsWith('/chat/completions'));
  } finally { globalThis.fetch = saved; }
});

test('model/openai-local: an explicit model pin overrides auto-discovery', async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'auto-a' }, { id: 'pin-me' }] }), { status: 200 });
    }
    return new Response(streamOf(['data: [DONE]\n\n']), { status: 200 });
  };
  try {
    const m = createModel('lmstudio', { baseURL: 'http://localhost:1234/v1', model: 'pin-me' });
    await m.load();
    assert.equal(m.describe().model, 'pin-me');
  } finally { globalThis.fetch = saved; }
});

test('model/openai-local: phrase() honours an already-aborted signal without a request', async () => {
  const saved = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
    called = true;
    return new Response(streamOf(['data: [DONE]\n\n']), { status: 200 });
  };
  try {
    const m = createModel('ollama', { baseURL: 'http://localhost:11434/v1' });
    await m.load();
    const ac = new AbortController();
    ac.abort();
    const out = await m.phrase([{ role: 'user', content: 'hi' }], { signal: ac.signal });
    assert.equal(out, '');
    assert.equal(called, false, 'no chat request is made once the signal is already aborted');
  } finally { globalThis.fetch = saved; }
});
