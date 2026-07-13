import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { registerBackend } from '../src/model/interface.js';

// THE CONVERSATION WINDOW (rooms/reader/app.js). The grounded turn hands the pipeline the settled
// dialogue MINUS this turn's own question. It must drop exactly ONE message (the current user turn,
// last after the empty pending assistant is filtered) so the most recent ASSISTANT reply stays in.
// The earlier `.slice(0, -2)` dropped that reply too, so the prompt's "conversation so far" band only
// ever showed the user's turns — a follow-up like "which is the best?" had nothing to resolve
// against (the exported bug: a bare "You: research elvis films…" with the answer it refers to gone).

// A backend that answers each grounded turn by echoing a verbatim sentence from the doc (so the
// reply BINDS and is not dropped as an unbound turn by the session fold), and reads every discourse
// statement as plainly factual (so nothing routes phatic/clarify).
registerBackend('echo-doc-fake', () => ({
  id: 'echo-doc-fake', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'echo-doc-fake', kind: 'local', model: 'echo-doc-fake', label: 'fake' }),
  async load(onProgress) { onProgress?.({ phase: 'ready', pct: 1 }); },
  async phrase(messages, _opts = {}) {
    const user = String(messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n') || '');
    if (/In two or three plain sentences/.test(user)) return 'They are asking a factual question about the loaded document; the answer sits in the reading.';
    return 'Dolphins are marine mammals.';   // a verbatim span of the doc → binds
  },
}));

test('the second grounded turn carries the first assistant reply in its prompt (two-sided window)', async () => {
  const app = createReaderApp({ audit: createAuditLog({ capacity: 64 }) });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  app.setBackend('echo-doc-fake');
  if (app.setWebMode) app.setWebMode('off');   // keep the turn offline — the window is under test
  app.ingestText('Dolphins are marine mammals. Dolphins live in the ocean. Dolphins hunt in pods.', 'Dolphins');

  await app.ask('what are dolphins?');
  const second = await app.ask('where do they live?');

  assert.equal(second.route, 'grounded', 'the follow-up reached a grounded turn');
  assert.ok(second.prompt, 'the grounded turn captured its verbatim prompt');
  // The assistant role marker only appears in the "conversation so far" band when a prior ASSISTANT
  // turn made it into the window — impossible under the old `.slice(0, -2)`.
  assert.match(second.prompt, /\bMe:\s*Dolphins are marine mammals/,
    'the first assistant reply is folded into the second turn\'s conversation window');
});
