import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// THE STOP BUTTON (rooms/reader/app.js). Stop aborts the turn's signal and finalizes the answer
// bubble AT ONCE (the watchdog settles the race). But a local backend can be SLOW — or, on a bad
// day, fail — to honor that abort mid-decode: it keeps handing the turn tokens after Stop. The turn's
// `onToken`/`onStep` callbacks outlive the settled turn (the backend is still unwinding), so unless
// they check the abort they keep appending to the finalized bubble — the answer visibly keeps
// writing itself after Stop, which reads as "the Stop button did nothing". This pins the guard: once
// the turn's signal is aborted, its callbacks are inert and the bubble never grows again — no matter
// how long, or whether, the backend gets around to stopping its own decode.

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// A backend deaf to the abort signal: it streams a sentence every ~25ms to completion and NEVER
// checks opts.signal. The counter proves it really is still decoding after Stop, so a passing
// assertion means the APP froze the bubble, not that the backend happened to stop on its own.
const deaf = { emitted: 0 };
registerBackend('deaf-decoder', () => ({
  id: 'deaf-decoder', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'deaf-decoder', kind: 'local', model: 'deaf-decoder', label: 'deaf' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages, opts = {}) {
    const onToken = typeof opts.onToken === 'function' ? opts.onToken : null;
    const cap = Math.max(1, Math.min(8, opts.maxTokens ?? 8));   // honor maxTokens so the 1-token warmup is quick
    const sents = ['Dolphins are marine mammals. ', 'They are intelligent. ', 'They live in oceans. ',
      'They use clicks and whistles. ', 'They hunt in pods. ', 'They are highly social. ',
      'They leap from the water. ', 'They rest one hemisphere at a time. '];
    let text = '';
    for (let i = 0; i < Math.min(sents.length, cap); i++) {
      text += sents[i]; deaf.emitted++;
      if (onToken) onToken(sents[i]);
      await delay(25);            // NB: never inspects opts.signal — deaf to Stop
    }
    return text.trim();
  },
}));

const freshApp = async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 128 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('deaf-decoder');
  if (app.setWebMode) app.setWebMode('off');   // answer from the record, no network
  return app;
};

test('Stop freezes the answer bubble even when the backend keeps decoding', async () => {
  const app = await freshApp();
  app.ingestText(
    'Dolphins are marine mammals. Dolphins are intelligent. Dolphins live in the ocean. ' +
    'Dolphins communicate with clicks and whistles. Dolphins hunt in pods.',
    'Dolphins',
  );

  const askP = app.ask('Tell me about dolphins').catch(() => {});
  const t = app.topic();
  const pending = t.messages[t.messages.length - 1];

  // Wait until the answer is actually streaming into the bubble.
  const t0 = Date.now();
  while ((pending.text || '').length < 10 && Date.now() - t0 < 8000) await delay(10);
  assert.ok((pending.text || '').length >= 10, 'the answer began streaming before Stop');

  const lenAtStop = (pending.text || '').length;
  const emittedAtStop = deaf.emitted;

  app.stop();

  // Give the deaf backend room to keep decoding past the Stop.
  await delay(300);

  assert.ok(deaf.emitted > emittedAtStop,
    `the backend kept decoding after Stop (${emittedAtStop} → ${deaf.emitted}) — the test is meaningful`);
  assert.equal((pending.text || '').length, lenAtStop,
    'the answer bubble did not grow after Stop — no token leaks into a stopped turn');
  assert.equal(pending.pending, false, 'the turn settled the moment Stop was hit');
  assert.equal(pending.route, 'stopped', 'the settled turn is marked stopped, not errored');

  await askP;
});

test('a turn that runs to completion still streams the whole answer (the guard only bites on abort)', async () => {
  const app = await freshApp();
  app.ingestText(
    'Dolphins are marine mammals. Dolphins are intelligent. Dolphins live in the ocean. Dolphins hunt in pods.',
    'Dolphins',
  );

  const msg = await app.ask('Tell me about dolphins');   // no Stop — let it finish
  assert.notEqual(msg.route, 'stopped', 'an un-stopped turn is not marked stopped');
  assert.notEqual(msg.route, 'error', 'an un-stopped turn does not error');
  assert.ok((msg.text || '').length > 20, 'the full answer streamed through when never stopped');
  assert.equal(msg.pending, false, 'the completed turn settled');
});
