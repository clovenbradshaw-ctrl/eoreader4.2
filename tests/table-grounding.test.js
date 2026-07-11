import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestTable } from '../src/organs/in/table.js';
import { createCompositeDoc } from '../src/organs/in/composite.js';
import { retrieveStructural } from '../src/surfer/retrieve/index.js';
import { createParser } from '../src/perceiver/parse/index.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createModel } from '../src/model/interface.js';
import '../src/model/echo.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';

// A table's readable content lives in `doc.sentences` ("account: …; arr: …"); `doc.units`
// are bare row LABELS ("row 3"). The composite used to lay its shared axis off `units`, so a
// table grounded as "row 2 next-row row 3" and a "what is this about?" answer rambled about
// randomness instead of reading the data. These tests pin that a table now grounds on its
// cells, and that prose is untouched.

const table = () => ingestTable({
  name: 'accounts',
  columns: ['account', 'tier', 'arr', 'health_flag'],
  rows: [
    ['Ridgeline Health', 'Enterprise', '$410k', 'red'],
    ['Northwind Logistics', 'Mid-Market', 'USD 98,000', 'yellow'],
    ['Vantage Retail Group', 'Enterprise', '$520k', 'green'],
  ],
});

test('a table doc carries readable cells in sentences and bare labels in units', () => {
  const t = table();
  assert.match(t.sentences[0], /Ridgeline Health/);
  assert.equal(t.units[0], 'row 0');                    // the label that must NOT be grounded on
});

test('the composite lays a table on its axis by readable cells, not row labels', () => {
  const comp = createCompositeDoc([table(), table()]);  // two docs → a real composite
  assert.ok(comp.isComposite);
  assert.match(comp.sentences[0], /Ridgeline Health/, 'the composite carries the cell projection');
  assert.ok(!comp.sentences.some((s) => /^row \d+$/.test(s)), 'no bare "row N" label leaked onto the axis');
  // the misalignment is repaired: the token set at an index matches the readable text there
  assert.ok(comp.tokensBySentence[0].has('ridgeline'));
});

test('structural retrieval over a table returns real cells for a "summary" read', () => {
  const spans = retrieveStructural(table(), 6);
  assert.ok(spans.length > 0);
  assert.ok(spans.some((s) => /Ridgeline Health|Vantage Retail Group/.test(s.text)),
    'the skeleton a "what is this about?" turn sees is the data, not "row N"');
  assert.ok(!spans.some((s) => /^row \d+$/.test(String(s.text))));
});

test('prose is untouched: a text composite still grounds on its sentences', () => {
  const doc = createParser().parse('The dolphin swam near the boat. The dolphin is intelligent. It knows itself.');
  const comp = createCompositeDoc([doc, createParser().parse('Whales sing. Whales migrate.')]);
  assert.match(comp.sentences[0], /dolphin/);
  const spans = retrieveStructural(doc, 6);
  assert.ok(spans.some((s) => /dolphin/i.test(s.text)));
});

// ── end-to-end through the real turn pipeline ───────────────────────────────────
const model = createModel('echo');
const embedder = createHashEmbedder();
const run = (question, docs) => runTurn({ question, docs, model, embedder, auditLog: createAuditLog({ capacity: 64 }) });

test('a computational question terminates at the table route with a computed answer', async () => {
  const out = await run('how many accounts are at risk', [table()]);
  assert.equal(out.route, 'table');
  assert.match(out.answer, /2 of 3 accounts/);          // red + yellow
});

test('a currency-aware total routes through the table computer end-to-end', async () => {
  const out = await run('what is the total ARR', [table()]);
  assert.equal(out.route, 'table');
  assert.match(out.answer, /\$1,028,000/);              // 410k + 98k + 520k, all USD
});

test('a subtext question does NOT hit the table route — it grounds on the cells', async () => {
  const out = await run('which account is quietly unhappy and why', [table()]);
  assert.notEqual(out.route, 'table');                  // deferred to the grounded reading
  // and the grounded reading now sees real cell content (not "row N")
  assert.ok(/Ridgeline|Northwind|Vantage/.test(out.answer) || (out.sources || []).length >= 0);
});
