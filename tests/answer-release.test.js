import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// EARLY RELEASE (rooms/reader/app.js `releaseOnAnswer`). The answer is FORMED at the `bind`
// stage; the stages after it (factcheck · veto · absence · validate · settle) and the epilogue
// (reflection · self-line · ledger · assembleBrief) only ANNOTATE an already-visible, already-
// final draft — yet they run before runTurn resolves, and the composer used to stay blocked for
// that whole tail (a MiniLM fact-check per claim, a document-sized assembleBrief, and, when the
// draft earned no witness, a second model decode in validate). That was the "long delay after the
// answer before I can send again." The fix settles the pending message at `bind`, so `.pending`
// — which gates both the composer (index.html `_generating`) and the turn's inclusion in the next
// turn's history — flips false the moment the answer is done, while the grounding finishes in the
// background. These pin the ordering (release BEFORE the tail's finishMessage) and prove the
// background tail still finalizes the message correctly.

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// A backend that streams a few sentences, then (deliberately) waits before RETURNING — the pause
// stands in for the post-answer grounding tail. It never inspects the doc; the sentences are about
// dolphins so bind finds citations in the recorded text.
registerBackend('release-decoder', () => ({
  id: 'release-decoder', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'release-decoder', kind: 'local', model: 'release-decoder', label: 'release' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages, opts = {}) {
    const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
    const cap = Math.max(1, Math.min(6, opts.maxTokens ?? 6));   // the 1-token warmup/front-door reads stay quick
    const sents = ['Dolphins are marine mammals. ', 'They are intelligent. ', 'They live in oceans. ',
      'They communicate with clicks and whistles. ', 'They hunt in pods. ', 'They are highly social. '];
    let text = '';
    for (let i = 0; i < Math.min(sents.length, cap); i++) {
      text += sents[i];
      if (onToken) onToken(sents[i]);
      await delay(10);
    }
    return text.trim();
  },
}));

const freshApp = async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 128 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('release-decoder');
  if (app.setWebMode) app.setWebMode('off');   // answer from the record, no network follow-up
  return app;
};

test('the pending message settles at the answer, before the grounding tail finishes', async () => {
  const app = await freshApp();
  app.ingestText(
    'Dolphins are marine mammals. Dolphins are intelligent. Dolphins live in the ocean. ' +
    'Dolphins communicate with clicks and whistles. Dolphins hunt in pods.',
    'Dolphins',
  );

  const t = app.topic();

  // Capture the state at the FIRST emit where the pending answer becomes settled. releaseOnAnswer
  // (at `bind`) is the only thing that clears `.pending` mid-turn, and it sets nothing else; the
  // route/verdicts/reflection are written later, by finishMessage, once the whole tail has run. So
  // if the first settled-emit carries no route yet, the composer was released BEFORE the tail — the
  // exact decoupling the fix makes.
  let firstSettledSnapshot = null;
  const un = app.subscribe(() => {
    const m = t.messages[t.messages.length - 1];
    if (m && m.role === 'assistant' && m.pending === false && !firstSettledSnapshot) {
      firstSettledSnapshot = { route: m.route, verdicts: m.verdicts, reflection: m.reflection, text: m.text };
    }
  });

  const msg = await app.ask('Tell me about dolphins');
  un();

  assert.ok(firstSettledSnapshot, 'the pending answer was observed settling during the turn');
  assert.equal(firstSettledSnapshot.route, undefined,
    'pending cleared BEFORE finishMessage set the route — the composer is released at the answer, not after grounding');
  assert.equal(firstSettledSnapshot.verdicts, undefined,
    'pending cleared before the fact-check verdicts were folded in — the tail was still to come');
  assert.ok((firstSettledSnapshot.text || '').length > 0,
    'the answer text was already present when the message settled');

  // ...and the background tail still ran to a proper finish: the message is fully finalized.
  assert.equal(msg.pending, false, 'the turn settled');
  assert.notEqual(msg.route, 'stopped', 'a completed turn is not marked stopped');
  assert.notEqual(msg.route, 'error', 'a completed turn did not error');
  assert.ok(typeof msg.route === 'string' && msg.route.length > 0, 'finishMessage set the route once the tail finished');
  assert.ok((msg.text || '').length > 20, 'the whole answer is present after the turn settles');
  assert.ok(!msg.unverified, 'a completed answer ran the grounding pipeline — never flagged unverified');
  assert.ok(Array.isArray(msg.verdicts), 'the fact-check verdicts were folded in by finishMessage');
});

test('a settled-but-still-grounding answer is visible to the next turn as history', async () => {
  const app = await freshApp();
  app.ingestText(
    'Dolphins are marine mammals. Dolphins are intelligent. Dolphins live in the ocean. Dolphins hunt in pods.',
    'Dolphins',
  );

  // The whole point of clearing `.pending` at the answer (not after grounding) is that a fast
  // follow-up is well-formed: ask() builds the next turn's history from non-pending messages, so a
  // settled answer must carry its final text. Run one turn to completion, then confirm the recorded
  // assistant message is non-pending with its text intact (what a second ask() would fold in).
  const first = await app.ask('Tell me about dolphins');
  assert.equal(first.pending, false, 'the first answer settled');
  assert.ok((first.text || '').length > 0, 'the settled answer kept its text for the next turn to read');

  const t = app.topic();
  const settledAssistant = t.messages.filter((m) => m.role === 'assistant' && !m.pending && m.text);
  assert.ok(settledAssistant.length >= 1, 'the settled answer is eligible history for a follow-up turn');
  assert.equal(settledAssistant[settledAssistant.length - 1].text, first.text,
    'the history-eligible text matches the finalized answer — no divergence from an early release');
});
