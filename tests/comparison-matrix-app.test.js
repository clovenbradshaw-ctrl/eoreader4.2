import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// The comparison matrix wired into the reader session (rooms/reader/app/findings.js →
// api.js → window.EO.app.comparisonMatrix). The Compare surface reads exactly this.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};

test('comparisonMatrix folds the corpus budget and completion across sources', async () => {
  const app = await freshApp();
  app.ingestText('The Harbor City seawall commits $120M with 2030 completion.', 'Plan');
  app.ingestText('The Harbor City Capital Budget Update revises the seawall budget from $120M to $145M and moves completion to 2032 from 2030.', 'Budget PDF');

  const m = app.comparisonMatrix();
  assert.ok(m && Array.isArray(m.rows), 'a shaped matrix');
  assert.equal(m.sources.length, 2, 'one column per source');

  const cost = m.rows.find((r) => r.measure === 'cost');
  assert.ok(cost, 'a cost row');
  assert.equal(cost.conflict, true);
  assert.equal(cost.reading, 'Revised upward');
  // The PDF cell carries the move, and its source id is a real sn the viewer can open.
  const pdfCell = cost.cells.find((c) => c && c.transition);
  assert.ok(pdfCell, 'the PDF cell states the transition');
  assert.equal(pdfCell.value, 145e6);
  assert.equal(pdfCell.transition.from, 120e6);
  assert.ok(app.sourceBySn(pdfCell.source), 'the cell source is an openable sn');

  const sched = m.rows.find((r) => r.measure === 'schedule');
  assert.ok(sched, 'a completion row');
  assert.equal(sched.reading, 'Pushed later');
});

test('comparisonMatrix on an empty topic is empty, never throws', async () => {
  const app = await freshApp();
  const m = app.comparisonMatrix();
  assert.deepEqual(m.rows, []);
});
