import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';
import { phaticFromSpeech } from '../src/turn/meta-route.js';

// THE PHATIC FRONT DOOR (rooms/reader/app.js). A greeting is no longer caught by a regex floor; the
// model speaks ONE discourse statement and the physics reads the phatic current off it. This pins
// the two properties that matters: (1) the plumbing — phaticFromSpeech settles a social paragraph to
// the phatic door and a factual one away from it; (2) the bug the design closes — a greeting on an
// EMPTY record with web mode `auto` answers with a warm line and NEVER reaches the web.

const GREETING = 'They are just greeting me with a friendly hello — a social pleasantry, they want a warm word back, nothing to look up.';
const GROUND   = 'They are asking a factual question about the loaded document; the answer sits in the reading and I should quote the passage that holds it.';

// A fake backend that plays a competent metacognition: handed the discourse prompt it says the turn
// is social for a greeting and factual otherwise; handed the phatic-reply prompt it says a warm
// line; handed a grounded prompt it answers plainly. Branching on the prompt is the FAKE standing in
// for the model's judgment — the physics (phaticFromSpeech) is the real thing under test.
const isGreeting = (s) => /\b(hi|hey|hello|how are you|good morning|thanks|thank you|bye)\b/i.test(s);
registerBackend('discourse-fake', () => ({
  id: 'discourse-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'discourse-fake', kind: 'local', model: 'discourse-fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages, _opts = {}) {
    const sys  = String(messages.find((m) => m.role === 'system')?.content || '');
    const user = String(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || '');
    // The discourse statement (readDiscourse → discoursePrompt).
    if (/In two or three plain sentences/.test(user)) {
      const said = (user.match(/They just said: "([^"]*)"/) || [])[1] || '';
      return isGreeting(said) ? GREETING : GROUND;
    }
    // The phatic door's own reply prompt (phaticReply).
    if (/social message/.test(sys)) return 'Doing well — thanks for asking.';
    // Any grounded/chat answer.
    return 'Dolphins are marine mammals in the cetacean family.';
  },
}));

const freshApp = async (webMode) => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('discourse-fake');
  if (app.setWebMode) app.setWebMode(webMode);
  return app;
};

test('phaticFromSpeech settles a social statement to the phatic door, a factual one away from it', () => {
  assert.equal(phaticFromSpeech(GREETING).phatic, true, 'a social paragraph is the phatic door');
  assert.equal(phaticFromSpeech(GROUND).phatic, false, 'a factual paragraph is NOT phatic');
  assert.equal(phaticFromSpeech('').phatic, false, 'no statement abstains (safe direction)');
});

test('a greeting on an EMPTY record with web=auto answers warmly and never reaches the web', async () => {
  const app = await freshApp('auto');   // the dangerous mode: empty record + auto would web-search a substantive ask
  const pending = await app.ask('how are you?');
  assert.equal(pending.route, 'phatic', 'the physics front door caught it, not the empty-record web reach');
  assert.ok(/thanks for asking/i.test(pending.text || ''), 'answered with the warm reply, not a web result');
  assert.ok(!/search|couldn.t pull|web/i.test(pending.text || ''), 'no web lookup happened');
});

test('a substantive question over a document is NOT phatic — it proceeds to a grounded turn', async () => {
  const app = await freshApp('off');
  app.ingestText('Dolphins are marine mammals. Dolphins live in the ocean. Dolphins hunt in pods.', 'Dolphins');
  const pending = await app.ask('what is a dolphin?');
  assert.notEqual(pending.route, 'phatic', 'a real question must not be routed phatic');
  assert.ok((pending.text || '').length > 0, 'it produced an answer');
});

// THE INSTANT FLOOR (docs/response-demand.md rung 3) — the OFFLINE layer the front-door refactor
// dropped, restored. The graded model door only fires when the metacognition's discourse read lands
// phatic; a tiny 1B on a one-word "hi" can fail to cohere there (the exported bug: a doc loaded, the
// read blind, the greeting fell through to grounding → "The document does not say — scanned 4327
// sentences", and in auto web mode a corpus-steered walk on a hello). This BLIND backend reads EVERY
// turn as factual — greeting or not — so ONLY the floor (the user's own words) can catch the greeting.
registerBackend('blind-discourse-fake', () => ({
  id: 'blind-discourse-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'blind-discourse-fake', kind: 'local', model: 'blind-discourse-fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages, _opts = {}) {
    const sys  = String(messages.find((m) => m.role === 'system')?.content || '');
    const user = String(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || '');
    // The discourse statement — read as factual for EVERYTHING, so the model door never fires.
    if (/In two or three plain sentences/.test(user)) return GROUND;
    if (/social message/.test(sys)) return 'Hey there — ask me anything you like.';
    return 'Dolphins are marine mammals in the cetacean family.';
  },
}));

test('a bare "hi" over a loaded doc settles phatic on the OFFLINE floor even when the model read is blind to it', async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('blind-discourse-fake');
  if (app.setWebMode) app.setWebMode('auto');   // the dangerous mode: a grounded void would auto-walk the web
  app.ingestText('Dolphins are marine mammals. Dolphins live in the ocean. Dolphins hunt in pods.', 'Dolphins');
  const pending = await app.ask('hi');
  assert.equal(pending.route, 'phatic', 'the offline floor caught the greeting the blind model read missed');
  assert.doesNotMatch(pending.text || '', /document does not say|does not cover|scanned|couldn.t|search/i,
    'no grounded void answer and no web walk — the greeting never reached grounding');
});

// THE DETERMINISTIC PHATIC GATE (rooms/reader/app.js). The phatic short-circuit no longer trusts the
// tiny model's discourse read — a 1B model unreliably (and with a bias toward "casual opinion")
// describes a real question as social, and the phatic exemplars then out-score ground/research, so a
// genuine ask was intermittently answered as chit-chat with the sources never consulted (the exported
// "what is the best elvis movie?" bug, and the "works some times but not another" flakiness). This
// BLIND-SOCIAL backend reads EVERY turn as a greeting — the wrong direction — so ONLY the offline
// floor decides phatic. A substantive ask must therefore reach a grounded turn regardless; a real
// greeting must still be caught by the floor.
registerBackend('blind-social-fake', () => ({
  id: 'blind-social-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'blind-social-fake', kind: 'local', model: 'blind-social-fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages, _opts = {}) {
    const sys  = String(messages.find((m) => m.role === 'system')?.content || '');
    const user = String(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || '');
    // The discourse statement — read as SOCIAL for everything, so the model door would (wrongly) fire.
    if (/In two or three plain sentences/.test(user)) return GREETING;
    if (/social message/.test(sys)) return 'Hey there — nice to hear from you!';
    return 'Dolphins are marine mammals in the cetacean family.';
  },
}));

test('a substantive question is NOT routed phatic even when the model read is blindly social — it reaches a grounded turn', async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('blind-social-fake');
  if (app.setWebMode) app.setWebMode('off');   // routing is under test, not the web reach
  app.ingestText('Dolphins are marine mammals. Dolphins live in the ocean. Dolphins hunt in pods.', 'Dolphins');
  for (const q of ['what is the best dolphin?', 'movie with a dolphin in it. search it']) {
    const pending = await app.ask(q);
    assert.notEqual(pending.route, 'phatic', `a real question ("${q}") must never be swallowed as social by the flaky model read`);
  }
});

test('a bare greeting still settles phatic under the blind-social backend — the offline floor decides phatic', async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('blind-social-fake');
  if (app.setWebMode) app.setWebMode('off');
  app.ingestText('Dolphins are marine mammals. Dolphins live in the ocean.', 'Dolphins');
  for (const q of ['hi', 'thanks']) {
    const pending = await app.ask(q);
    assert.equal(pending.route, 'phatic', `the offline floor still catches a clear greeting ("${q}")`);
  }
});
