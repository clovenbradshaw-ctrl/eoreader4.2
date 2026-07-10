import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toClaudeRequest, DEFAULT_CLAUDE_MODEL } from '../src/model/anthropic.js';
import { availableBackends, createModel } from '../src/model/interface.js';

// The claude hosted-API backend — the seams that can be proven without a network:
// registration, the pipeline→Anthropic request lift, and the honest no-key /
// not-loaded failures. The live path (SDK import, key check, streaming) is a
// browser concern exercised through the model chip.

test('model/anthropic: registers the claude backend with the expected shape', () => {
  assert.ok(availableBackends().includes('claude'), 'claude is registered');
  const m = createModel('claude');
  assert.equal(m.id, 'claude');
  assert.equal(m.kind, 'remote');
  assert.equal(m.isLoaded(), false);
  assert.equal(typeof m.load, 'function');
  assert.equal(typeof m.phrase, 'function');
});

test('model/anthropic: toClaudeRequest lifts system messages to the top-level param', () => {
  const { system, messages } = toClaudeRequest([
    { role: 'system', content: 'ground rules' },
    { role: 'system', content: 'more rules' },
    { role: 'user', content: 'question?' },
  ]);
  assert.equal(system, 'ground rules\n\nmore rules');
  assert.deepEqual(messages, [{ role: 'user', content: 'question?' }]);
});

test('model/anthropic: toClaudeRequest keeps the history and drops leading assistant turns', () => {
  const { system, messages } = toClaudeRequest([
    { role: 'assistant', content: 'orphaned opener' },
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: 42 },            // content is stringified
  ]);
  assert.equal(system, null);
  assert.deepEqual(messages, [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'reply' },
    { role: 'user', content: '42' },
  ]);
});

test('model/anthropic: toClaudeRequest never yields an empty message list', () => {
  const { messages } = toClaudeRequest([{ role: 'system', content: 'only rules' }]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
});

test('model/anthropic: the default model is the current hosted default', () => {
  assert.equal(DEFAULT_CLAUDE_MODEL, 'claude-opus-4-8');
});

test('model/anthropic: load() without a key fails honestly, before any network', async () => {
  const m = createModel('claude');            // Node has no localStorage and no opts key
  await assert.rejects(() => m.load(), /no API key/);
  assert.equal(m.isLoaded(), false);
});

test('model/anthropic: phrase() before load() refuses', async () => {
  const m = createModel('claude');
  await assert.rejects(() => m.phrase([{ role: 'user', content: 'hi' }]), /not loaded/);
});
