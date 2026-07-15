import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// Pins + record search, end to end over a real recorded document (docs/search-and-pins.md).
// No model anywhere — everything below is the deterministic machinery.

const BOOK =
  'Gregor Samsa was a travelling salesman. Gregor woke to find himself changed into an insect. ' +
  'His body was hard and armored. Grete was his sister. Grete brought him food each morning. ' +
  'The chief clerk arrived and demanded an explanation. His father drove Gregor back with a cane. ' +
  'Gregor Samsa was a travelling salesman who supported the family. Grete was his devoted sister.';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test('searchRecord — one query over the record, grouped, with the entity facet', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle(); await settle();                     // let the auto toplines land

  const r = app.searchRecord('Grete');
  assert.ok(r.entities.some((e) => /grete/i.test(e.label)), 'the figure is an entity hit');
  assert.ok(r.passages.length > 0, 'verbatim passages carry the term');
  assert.ok(r.passages.every((p) => /grete/i.test(p.text) && Number.isInteger(p.unit)));
  assert.ok(r.claims.length > 0, 'the reading mint already made claims about her');
  assert.ok(r.sources.some((s) => s.sn === src.sn));

  const contested = app.searchRecord('contradicts:');
  assert.equal(contested.claims.length, 0, 'nothing contested on a clean record — honestly empty');
});

test('a passage pin — minted from a unit, resolved exactly, idempotent on its refKey', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();

  const anchor = app.anchorAt(src.sn, { unit: 3 });   // "Grete was his sister."
  assert.ok(anchor && anchor.charSpan, 'the anchor minted with a char span');
  assert.equal(anchor.text, 'Grete was his sister.');

  const pin = app.pinAdd({ kind: 'passage', label: anchor.text, anchor, refId: `${anchor.docId}:${anchor.unit}` });
  assert.ok(pin && pin.id);
  assert.equal(app.pins().length, 1);
  const again = app.pinAdd({ kind: 'passage', label: anchor.text, anchor, refId: `${anchor.docId}:${anchor.unit}` });
  assert.equal(again.id, pin.id, 'pinning the same place twice keeps the first record');
  assert.equal(app.pins().length, 1);

  const r = app.pinResolve(pin);
  assert.equal(r.status, 'exact');
  assert.equal(r.text, 'Grete was his sister.');
  assert.equal(r.jump.sn, src.sn);

  app.pinRemove(pin.id);
  assert.equal(app.pins().length, 0);
});

test('a query pin re-runs live against the record as it grows', async () => {
  const app = await freshApp();
  app.ingestText(BOOK, 'Metamorphosis');
  await settle();

  const pin = app.pinAdd({ kind: 'query', label: 'contradicts:', query: { q: 'contradicts:' } });
  const before = app.searchRecord(pin.query.q);
  app.pinUpdate(pin.id, { queryLast: { at: 'then', counts: { claims: before.claims.length } } });
  assert.equal(app.pins()[0].query.last.counts.claims, 0);

  // the record grows — the same pinned query sees the new ground on its next run
  app.ingestText('Grete was never his sister. The lodger said so.', 'A denial');
  await settle(); await settle();
  const after = app.searchRecord('Grete');
  assert.ok(after.passages.some((p) => /never his sister/i.test(p.text)), 'the pinned query would surface the new source');
});

test('a moved pin says so — the ground moved, never a silent rebind', async () => {
  const app = await freshApp();
  const src = app.ingestText(BOOK, 'Metamorphosis');
  await settle();
  const anchor = app.anchorAt(src.sn, { quote: 'His body was hard and armored.' });
  const pin = app.pinAdd({ kind: 'passage', label: anchor.text, anchor, refId: 'x' });
  // the source is deleted out from under the pin
  app.state.sources = app.state.sources.filter((s) => s.sn !== src.sn);
  const r = app.pinResolve(pin);
  assert.equal(r.status, 'moved');
  assert.equal(r.text, 'His body was hard and armored.', 'the embedded quote still testifies');
});
