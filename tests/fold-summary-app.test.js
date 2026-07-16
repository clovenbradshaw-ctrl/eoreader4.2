// The fold-summary wiring in the reader app (rooms/reader/app/summaries.js):
// foldSummary at any place ({scope:'cursor'}), any lens ({scope:'entity'}), any detail
// ('brief' | 'standard' | 'paragraph'), over a real recorded document, with NO model —
// so the deterministic telegram is what ships, stored and readable back synchronously.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

const NOVEL = (() => {
  const acts = [
    { who: 'Miriam Vale', where: 'Harbourton', deed: 'mended the lighthouse lamp' },
    { who: 'Corin Ashe', where: 'the Saltmarsh', deed: 'traded maps with the ferrymen' },
    { who: 'Odette Brant', where: 'Windmere', deed: 'signed the harbour treaty' },
  ];
  const lines = [];
  for (const [a, act] of acts.entries()) {
    lines.push(`CHAPTER ${['I', 'II', 'III'][a]}.`);
    for (let i = 0; i < 20; i++) {
      lines.push(`${act.who} ${act.deed} in ${act.where} once more.`);
      lines.push(`The people of ${act.where} watched ${act.who} through the long season.`);
    }
  }
  return lines.join('\n');
})();

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a paragraph fold summary of a whole work: arc coverage, telegram floor, stored', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');

  const rec = await app.foldSummary({ sn: src.sn, scope: 'full', detail: 'paragraph' });
  assert.ok(rec && rec.text.length > 0, 'a summary shipped');
  assert.equal(rec.via, 'telegram', 'no model loaded — the floor stands');
  assert.equal(rec.modelless, true);
  assert.equal(rec.coverage, 'arc', 'the whole-work packet covered the arc');
  // readable back synchronously, same record
  const back = app.foldSummaryFor({ sn: src.sn, scope: 'full', detail: 'paragraph' });
  assert.equal(back.text, rec.text);
  // and it persists on the summaries store
  assert.ok(app.state.summaries.folds[back.key], 'stored under its key');
});

test('a brief fold summary at a place in the fold, and each detail keyed apart', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');

  const here = await app.foldSummary({ sn: src.sn, scope: 'cursor', cursor: 30, detail: 'brief' });
  assert.ok(here && here.text.length > 0, 'the fast voice answers at a place');
  assert.equal(here.scope, 'cursor');
  assert.equal(here.detail, 'brief');

  const whole = await app.foldSummary({ sn: src.sn, scope: 'full', detail: 'brief' });
  assert.notEqual(whole.key, here.key, 'place and whole are separate records');
  // a repeat read is the cached record, not a re-generation
  const again = await app.foldSummary({ sn: src.sn, scope: 'cursor', cursor: 30, detail: 'brief' });
  assert.equal(again.generatedAt, here.generatedAt, 'served from the store');
});

test('an entity-lens fold summary rides the same door', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  const rec = await app.foldSummary({ sn: src.sn, scope: 'entity', entity: 'Miriam Vale', detail: 'standard' });
  assert.ok(rec && rec.text.length > 0);
  assert.equal(rec.entity, 'Miriam Vale');
});
