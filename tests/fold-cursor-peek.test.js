// The TEMPORARY fold-peek door (rooms/reader/app/summaries.js cursorFold): the summary fold at a
// cursor made VISIBLE — the objects the engine holds in focus at the place AND the reading's
// assertions (settled / held-open / turns / properties / relations), distinct from the verbatim
// spans. Synchronous, model-free, unstored. Resolvable by an explicit index or by the block text
// under the reader's eye, exactly as co-reading resolves its position.
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

test('cursorFold returns the objects in focus and the reading — not just the spans', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');

  const peek = app.cursorFold({ sn: src.sn, cursor: 30 });
  assert.ok(peek, 'a peek came back for a real place');
  assert.equal(peek.cursor, 30, 'the cursor is the sentence asked for');
  assert.ok(peek.sentence.length > 0, 'the sentence at the cursor is carried');

  // the OBJECTS at the cursor — the salience field, labelled (never bare ids in the display)
  assert.ok(Array.isArray(peek.objects) && peek.objects.length, 'objects in focus at the place');
  for (const o of peek.objects) {
    assert.equal(typeof o.label, 'string');
    assert.ok(o.label.trim().length, 'each object is labelled');
    assert.equal(typeof o.weight, 'number');
  }

  // the READING — the assertions, structured, distinct from the spans
  assert.ok(peek.reading, 'the reading is present');
  for (const k of ['settled', 'heldOpen', 'turns', 'properties', 'relations', 'figures']) {
    assert.ok(Array.isArray(peek.reading[k]), `reading.${k} is an array`);
  }
  assert.ok(Array.isArray(peek.spans), 'the spans are carried apart from the reading');

  // the reading is MORE than the spans: at least one assertion channel is populated
  const r = peek.reading;
  const hasAssertion = r.settled.length || r.heldOpen.length || r.turns.length || r.properties.length || r.relations.length;
  assert.ok(hasAssertion, 'the fold made at least one assertion here');

  // the deterministic floor is always available
  assert.equal(typeof peek.telegram, 'string');
});

test('cursorFold resolves the cursor from the block text under the eye', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  const doc = app.docFor(src.sn);
  const sents = doc.units || doc.sentences || [];
  const target = sents.findIndex((s) => /Corin Ashe/.test(s));
  assert.ok(target > 0, 'the fixture carries the target sentence');

  const peek = app.cursorFold({ sn: src.sn, visibleText: sents[target] });
  assert.ok(peek, 'the block text resolved to a place');
  assert.equal(peek.cursor, target, 'resolved to the sentence the block belongs to');
});

test('cursorFold is model-free and stores nothing', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  const before = Object.keys(app.state.summaries.folds || {}).length;
  const peek = app.cursorFold({ sn: src.sn, cursor: 12 });
  assert.ok(peek);
  const after = Object.keys(app.state.summaries.folds || {}).length;
  assert.equal(after, before, 'a peek writes nothing to the summaries store');
});

test('cursorFold fails soft on a bad place', async () => {
  const app = await freshApp();
  const src = app.ingestText(NOVEL, 'The Harbour Treaty');
  assert.equal(app.cursorFold({ sn: src.sn }), null, 'no cursor and no visible text → null');
  assert.equal(app.cursorFold({ sn: 'no-such-source', cursor: 0 }), null, 'unknown source → null');
});
