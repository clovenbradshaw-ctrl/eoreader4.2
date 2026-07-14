import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// THE ASK SURFACE IS RECORD-FIRST, NOT RECORD-ONLY (rooms/reader/app.js + index.html sendChat). The
// Ask tab grounds every answer in your record and names where it looked — but a measured gap is a
// question addressed to the world (docs/web-search.md). When no passage on record answers, the turn
// reaches the web, fetches, and comes back grounded in the pages it found. So an Ask turn no longer
// pins `web: 'off'`; it honors the GLOBAL web mode (default `auto`), the same reach Chat has. A
// deliberate global `off` keeps both surfaces record-only, so the privacy opt-out is respected.
//
// `ask()` still takes a per-turn `web` override, used by callers that must stay offline (this file,
// and topic-per-question.test.js). These pin that: the surface follows the global mode, `auto`
// reaches the web, `off` stays record-only, and the `web` override wins over the global when set.

// A blind fake backend: reads every turn as factual (never phatic) and answers plainly, so the
// front door never short-circuits and the mode gate is what's under test.
registerBackend('ask-web-fake', () => ({
  id: 'ask-web-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'ask-web-fake', kind: 'local', model: 'ask-web-fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages) {
    const user = String(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || '');
    if (/In two or three plain sentences/.test(user)) return 'They are asking a factual question; the answer is not in any loaded reading.';
    return 'Dolphins are marine mammals in the cetacean family.';
  },
}));

// A fetch that always fails cleanly — no network, no throw. A web reach over it gathers nothing, so
// answerFromWeb lands on its "couldn't pull anything readable" line: enough to PROVE the turn left
// the record and reached the net, without depending on a live proxy or a canned page corpus (the
// happy path is covered offline in webfetch.test.js / research-trail.test.js).
const failFetch = async () => ({ ok: false, status: 503, text: async () => '' });

const freshApp = async (webMode, opts = {}) => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }), ...opts });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('ask-web-fake');
  app.setWebMode(webMode);
  return app;
};

test('an unpinned Ask turn follows the GLOBAL mode — confirm offers the web proposal, off does not', async () => {
  // This is the crux of the change: the Ask surface no longer pins `off`, so an unpinned turn (what
  // sendChat now passes) picks up the persisted global. Under `confirm` an empty-record ask offers
  // the one-click "Search the web" proposal; under `off` it stays record-only and offers nothing.
  const confirmApp = await freshApp('confirm');
  const offered = await confirmApp.ask('what is the capital of france?');
  assert.equal(offered.route, 'empty');
  assert.ok(offered.webProposal, 'under global confirm, an unpinned Ask turn offers the web-search proposal');
  assert.equal(offered.webProposal.query, 'what is the capital of france?');

  const offApp = await freshApp('off');
  const silent = await offApp.ask('what is the capital of germany?');
  assert.equal(silent.route, 'empty');
  assert.ok(!silent.webProposal, 'under global off, an unpinned Ask turn stays record-only — no proposal');
  assert.match(silent.text || '', /Nothing is on the record/i, 'and it says the record is silent');
});

test('an unpinned Ask turn REACHES the web under the default auto mode', async () => {
  // The headline: the same empty-record question that used to dead-end at "the record does not say"
  // now goes to the net. With a cleanly-failing fetch the reach gathers nothing, so we see the
  // web-reach report ("I searched the web…") rather than the record-only line — proof the turn left
  // the record. (A live proxy would return a grounded answer here instead.)
  const app = await freshApp('auto', { fetchImpl: failFetch });
  const pending = await app.ask('who is neil armstrong married to?');
  assert.doesNotMatch(pending.text || '', /Nothing is on the record/i,
    'it did NOT take the record-only branch — it reached the web');
  assert.match(pending.text || '', /searched the web|couldn.t pull anything readable|web (lookup|proxy)/i,
    'the response reports a web reach, not a record-only abstention');
});

test('a referential first ask ("what did he do?") with nothing to anchor it does NOT reach the web', async () => {
  // The exported failure: with no thread naming who "he" is, the verbatim pronoun query went to
  // Wikipedia and admitted "What Did Jack Do?" and the Waco siege into the record. There is
  // nothing to search FOR — the turn says what's missing instead of fetching noise.
  const app = await freshApp('auto', { fetchImpl: failFetch });
  const pending = await app.ask('what did he do?');
  assert.equal(pending.route, 'empty');
  assert.match(pending.text || '', /who or what that refers to/i, 'it names the missing referent');
  assert.doesNotMatch(pending.text || '', /searched the web|couldn.t pull anything/i, 'no web reach fired');
});

test('the `web: off` override still forces record-only, even when the global mode is auto', async () => {
  // The per-turn override is the offline escape hatch other tests lean on (topic-per-question). It
  // must still win over the global: a turn pinned `off` never reaches the net and offers no proposal.
  const app = await freshApp('auto', { fetchImpl: failFetch });
  const pending = await app.ask('what is the capital of france?', { web: 'off' });
  assert.equal(pending.route, 'empty', 'the record-only branch answered, not the auto web reach');
  assert.match(pending.text || '', /Nothing is on the record/i, 'it said the record is silent');
  assert.doesNotMatch(pending.text || '', /Searching the web|couldn.t pull anything|Paris/i,
    'no web search fired and no web-sourced answer came back');
  assert.ok(!pending.webProposal, 'and no "Search the web" proposal button is offered on a pinned record-only turn');
});

test('the `web` override is per-turn: it does not mutate the persisted global web mode', async () => {
  const app = await freshApp('auto');
  await app.ask('what is the capital of france?', { web: 'off' });
  assert.equal(app.webMode(), 'auto', 'the stored global mode is untouched by a per-turn pin');
});
