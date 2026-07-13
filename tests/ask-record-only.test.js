import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// THE ASK SURFACE IS RECORD-ONLY (rooms/reader/app.js + index.html sendChat). The Ask tab promises
// every answer is measured against your record, and it carries NO web control (the web-mode chip
// lives on Chat). So an Ask turn is pinned to `web: 'off'` at send time and never reaches the net,
// regardless of the persisted global web mode. `ask()` takes a per-turn `web` override; this pins
// that the override wins over the global, and that it is a per-turn pin — the stored mode is
// untouched, so Chat (no pin) still honours the global toggle.

// A blind fake backend: reads every turn as factual (never phatic) and answers plainly, so the
// front door never short-circuits and the mode gate is what's under test.
registerBackend('record-only-fake', () => ({
  id: 'record-only-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'record-only-fake', kind: 'local', model: 'record-only-fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages) {
    const user = String(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || '');
    if (/In two or three plain sentences/.test(user)) return 'They are asking a factual question; the answer is not in any loaded reading.';
    return 'Dolphins are marine mammals in the cetacean family.';
  },
}));

const freshApp = async (webMode) => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('record-only-fake');
  app.setWebMode(webMode);
  return app;
};

test('an Ask turn (web pinned off) on an empty record stays record-only even when the global mode is auto', async () => {
  // `auto` is the dangerous mode: an empty-record ask would auto-walk the web. The per-turn pin the
  // Ask surface passes must win — the turn declares the record is silent and never reaches the net.
  const app = await freshApp('auto');
  const pending = await app.ask('what is the capital of france?', { web: 'off' });
  assert.equal(pending.route, 'empty', 'the record-only branch answered, not the auto web reach');
  assert.match(pending.text || '', /Nothing is on the record/i, 'it said the record is silent');
  assert.doesNotMatch(pending.text || '', /Searching the web|couldn.t pull anything|Paris/i,
    'no web search fired and no web-sourced answer came back');
  assert.ok(!pending.webProposal, 'and no "Search the web" proposal button is offered on a record-only turn');
});

test('the web pin overrides the global confirm mode too — no "Search the web" button on an Ask turn', async () => {
  // Under `confirm`, an unpinned empty-record ask offers the one-click "Search the web" button.
  // The Ask surface's `web: 'off'` pin suppresses even that — Ask answers only from the record.
  const app = await freshApp('confirm');

  const unpinned = await app.ask('what is the capital of france?');
  assert.ok(unpinned.webProposal, 'unpinned (Chat) confirm mode offers the web-search proposal button');

  const pinned = await app.ask('what is the capital of germany?', { web: 'off' });
  assert.ok(!pinned.webProposal, 'the Ask pin suppresses the proposal button');
  assert.equal(pinned.route, 'empty');
});

test('the web pin is per-turn: it does not mutate the persisted global web mode', async () => {
  const app = await freshApp('auto');
  await app.ask('what is the capital of france?', { web: 'off' });
  assert.equal(app.webMode(), 'auto', 'the stored global mode (which Chat reads) is untouched by an Ask pin');
});
