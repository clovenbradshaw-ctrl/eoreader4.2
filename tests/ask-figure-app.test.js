import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// ASK A FIGURE wired into the reader session (rooms/reader/app/rashomon.js). Answer a question as
// the record holds it from inside one figure's fold — bounded to that figure's own words, at one
// source or across the whole topic. Model-free end to end.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

const SCENE = 'Reyes and Delgado met. Reyes said, "Fusus is a surveillance tool." Reyes said, "Fusus watches the city." Delgado said, "Fusus is a safety tool."';

test('askFigureSource answers from a figure\'s own fold, bounded and divergent between figures', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  const src = app.topicSources()[0];
  const cands = app.rashomonCandidates({ sn: src.sn });
  const reyes = cands.find((c) => c.label === 'Reyes'), delgado = cands.find((c) => c.label === 'Delgado');

  const r = app.askFigureSource(src.docId, reyes.id, 'what kind of tool is Fusus?');
  const d = app.askFigureSource(src.docId, delgado.id, 'what kind of tool is Fusus?');
  assert.equal(r.scope, 'source');
  assert.equal(r.addressed, true);
  assert.equal(r.contained, true, 'the answer never steps outside Reyes\'s words');
  assert.ok(/surveillance/.test(r.answer), 'Reyes answers surveillance');
  assert.ok(/safety/.test(d.answer), 'Delgado answers safety');
  assert.ok(!/safety/.test(r.answer), 'Delgado\'s characterization does not leak into Reyes\'s answer');
});

test('askFigureSource dwells in the void when the figure\'s words don\'t address it', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  const src = app.topicSources()[0];
  const reyes = app.rashomonCandidates({ sn: src.sn }).find((c) => c.label === 'Reyes');
  const a = app.askFigureSource(src.docId, reyes.id, 'who won the mayoral election?');
  assert.equal(a.addressed, false);
  assert.equal(a.claims.length, 0);
});

test('askFigureTopic answers from a figure\'s fold unioned across the whole topic', async () => {
  const app = await freshApp();
  app.ingestText('Reyes spoke at the hearing. Reyes said, "Fusus watches the city."', 'Hearing');
  app.ingestText('Reyes spoke to the press. Reyes said, "Fusus scans the streets."', 'Presser');
  const a = app.askFigureTopic('Reyes', 'what does Fusus watch or scan?');
  assert.equal(a.scope, 'topic');
  assert.equal(a.addressed, true);
  // the corpus-wide fold carries claims from BOTH sources
  const text = a.answer + ' ' + a.claims.map((c) => c.text).join(' ');
  assert.ok(/watch/.test(text) || /scan/.test(text), 'the answer draws on the topic-wide fold');
  assert.equal(a.contained, true);
});

test('unknown figure / missing source yield null, never a throw', async () => {
  const app = await freshApp();
  app.ingestText(SCENE, 'Council');
  assert.equal(app.askFigureSource('nope', 999, 'q'), null);
  assert.equal(app.askFigureTopic('', 'q'), null);
  const none = app.askFigureTopic('Nobody', 'anything?');
  assert.equal(none.addressed, false);
});
