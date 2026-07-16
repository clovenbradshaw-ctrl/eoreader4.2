import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderApp } from '../src/rooms/reader/app.js';

const ready = async (app) => {
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
};

test('audit mode: optional synthesis off is valid, and chat answers from the record without loading a model', async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  await ready(app);
  app.setBackend('none');
  assert.equal(app.synthesisMode(), 'off');
  await assert.rejects(() => app.ensureModel(), /Optional synthesis is off/);

  app.ingestText('Dolphins are marine mammals. Dolphins live in the ocean. Dolphins hunt in pods.', 'Dolphins');
  const msg = await app.chat('Dolphins ocean', { web: 'off' });
  assert.equal(msg.route, 'record-only');
  assert.match(msg.text, /## Audit mode/);
  assert.match(msg.text, /Dolphins live in the ocean/);
  assert.equal(app.state.model.state, 'off');
});

test('audit mode: an empty record does not attempt web or model research', async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  await ready(app);
  app.setBackend('none');

  const msg = await app.chat('Who is Victor Frankenstein?', { web: 'auto' });
  assert.equal(msg.route, 'empty');
  assert.match(msg.text, /Audit mode is on and nothing is recorded yet/);
  assert.equal(app.state.model.state, 'cold');
});
