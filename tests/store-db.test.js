// The spreadsheet-database engine checkpoint — proves the query, table, formula,
// and rollup layers over the durable store: filter/sort/group/aggregate, foreign
// keys, Airtable-dialect formulas, and the whole thing wired over a room's fold.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  inferType, toNum, nfold, coerce,
  foldToRows, materializeRecords, resolveLinks, importRows, recordLabel,
  buildTable, buildTableForSet, listSets,
  compileFilter, sortRows, aggregate, query, relatedRecords, linkedSetsFor, indexRows,
  evaluate, evaluateRollup,
  createDatabase, configureVaultStorage,
} from '../src/store/index.js';
import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';

const freshMetaStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

// ── types ────────────────────────────────────────────────────────────────────

test('types: inferType reads number/date/select/text/boolean', () => {
  assert.equal(inferType([1, 2, 3]), 'number');
  assert.equal(inferType(['$1,000', '2,500']), 'number');
  assert.equal(inferType(['2024-01-01', '2025-12-31']), 'date');
  assert.equal(inferType(['a', 'b', 'a', 'b', 'a', 'b']), 'select');
  assert.equal(inferType([true, false]), 'boolean');
  assert.equal(inferType([]), 'text');
});

test('types: toNum strips currency; nfold folds accents; coerce types', () => {
  assert.equal(toNum('$1,234.56'), 1234.56);
  assert.equal(nfold('  MÉXICO '), 'mexico');
  assert.equal(coerce('42', 'number'), 42);
  assert.equal(coerce('yes', 'boolean'), true);
});

// ── rows ─────────────────────────────────────────────────────────────────────

test('rows: foldToRows turns fold entities into rows and edges into connections', () => {
  const log = createLog({ docId: 'd' });
  log.append({ op: 'INS', id: 'c1', label: 'Alice' });
  log.append({ op: 'DEF', id: 'c1', key: 'type', value: 'client' });
  log.append({ op: 'DEF', id: 'c1', key: 'age', value: 30 });
  log.append({ op: 'INS', id: 'm1', label: 'Matter 1' });
  log.append({ op: 'DEF', id: 'm1', key: 'type', value: 'matter' });
  log.append({ op: 'CON', src: 'c1', tgt: 'm1', via: 'represents' });
  const { rows, connections } = foldToRows(projectGraph(log));
  const alice = rows.find((r) => r._id === 'c1');
  assert.equal(alice._set, 'client');
  assert.equal(alice.age, 30);
  assert.equal(recordLabel(alice), 'Alice');
  assert.deepEqual(connections, [{ source: 'c1', target: 'm1', type: 'represents' }]);
});

test('rows: importRows(CSV) materializes typed rows; resolveLinks builds connections', () => {
  const csv = 'name,age\nAlice,30\nBob,25\n';
  const rows = importRows(csv, {
    setName: 'client', shape: 'csv', hasHeader: true,
    fieldPlan: [{ name: 'name', csvIdx: 0, type: 'text' }, { name: 'age', csvIdx: 1, type: 'number' }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].age, 30);
  assert.equal(rows[1].name, 'Bob');

  const linked = materializeRecords([
    { id: 'o1', _links: { client: { to: 'client', rel: 'ordered_by', ids: ['client#r0'] } } },
  ], 'order');
  const conns = resolveLinks([...rows, ...linked]);
  assert.deepEqual(conns, [{ source: 'o1', target: 'client#r0', type: 'ordered_by' }]);
});

// ── table (grid engine) ──────────────────────────────────────────────────────

test('table: buildTable orders declared schema fields first, then data-only extras', () => {
  const rows = [{ _id: '1', _set: 'client', name: 'Alice', age: 30, note: 'x' }];
  const t = buildTable(rows, { schemaFields: [{ name: 'name', type: 'text' }, { name: 'age', type: 'number' }] });
  assert.deepEqual(t.cols.map((c) => c.name), ['name', 'age', 'note']);
  assert.equal(t.cols[0].schematized, true);
  assert.equal(t.cols[2].schematized, false);
  assert.equal(t.cols[2].type, 'text');
});

test('table: listSets counts each set, biggest first', () => {
  const rows = [
    { _id: '1', _set: 'client' }, { _id: '2', _set: 'client' }, { _id: '3', _set: 'matter' },
  ];
  const sets = listSets(rows);
  assert.deepEqual(sets, [
    { name: 'client', rows: 2, declared: false },
    { name: 'matter', rows: 1, declared: false },
  ]);
});

// ── query engine ─────────────────────────────────────────────────────────────

const PEOPLE = [
  { _id: '1', _set: 'p', name: 'Alice', age: 30, city: 'Paris', tags: ['a', 'b'] },
  { _id: '2', _set: 'p', name: 'Bob', age: 25, city: 'México', tags: ['b'] },
  { _id: '3', _set: 'p', name: 'Carol', age: 40, city: 'Paris', tags: [] },
  { _id: '4', _set: 'p', name: 'Dan', age: null, city: '', tags: ['c'] },
];

test('query: typed filter operators across kinds', () => {
  const run = (node) => PEOPLE.filter(compileFilter(node)).map((r) => r.name);
  assert.deepEqual(run({ field: 'age', op: 'gt', value: 28 }), ['Alice', 'Carol']);
  assert.deepEqual(run({ field: 'age', op: 'between', value: [25, 30] }), ['Alice', 'Bob']);
  assert.deepEqual(run({ field: 'city', op: 'is', value: 'paris' }), ['Alice', 'Carol']);
  assert.deepEqual(run({ field: 'city', op: 'contains', value: 'mexico' }), ['Bob']); // accent-folded
  assert.deepEqual(run({ field: 'city', op: 'isEmpty' }), ['Dan']);
  assert.deepEqual(run({ field: 'tags', op: 'hasAnyOf', value: ['b'] }), ['Alice', 'Bob']);
  assert.deepEqual(run({ field: 'tags', op: 'hasNoneOf', value: ['a', 'b'] }), ['Carol', 'Dan']);
  assert.deepEqual(run({ field: 'name', op: 'isAnyOf', value: ['Alice', 'Dan'] }), ['Alice', 'Dan']);
});

test('query: boolean and/or/not tree', () => {
  const node = { op: 'and', clauses: [
    { field: 'city', op: 'is', value: 'Paris' },
    { op: 'not', clauses: [{ field: 'age', op: 'gt', value: 35 }] },
  ] };
  assert.deepEqual(PEOPLE.filter(compileFilter(node)).map((r) => r.name), ['Alice']);
  const or = { op: 'or', clauses: [{ field: 'name', op: 'is', value: 'Bob' }, { field: 'age', op: 'gte', value: 40 }] };
  assert.deepEqual(PEOPLE.filter(compileFilter(or)).map((r) => r.name), ['Bob', 'Carol']);
});

test('query: multi-key sort keeps empties last in both directions', () => {
  const asc = sortRows(PEOPLE, [{ field: 'age', dir: 'asc' }]).map((r) => r.name);
  assert.deepEqual(asc, ['Bob', 'Alice', 'Carol', 'Dan']); // Dan (null age) sinks
  const desc = sortRows(PEOPLE, [{ field: 'age', dir: 'desc' }]).map((r) => r.name);
  assert.deepEqual(desc, ['Carol', 'Alice', 'Bob', 'Dan']); // Dan still last
});

test('query: aggregate count/sum/avg/min/max, grouped', () => {
  assert.equal(aggregate(PEOPLE, { agg: 'count' }).value, 4);
  assert.equal(aggregate(PEOPLE, { agg: 'sum', field: 'age' }).value, 95);
  assert.equal(aggregate(PEOPLE, { agg: 'max', field: 'age' }).value, 40);
  const g = aggregate(PEOPLE, { agg: 'avg', field: 'age', groupBy: 'city' });
  assert.equal(g.grouped, true);
  const paris = g.rows.find((r) => r.key === 'Paris');
  assert.equal(paris.value, 35);
  assert.equal(paris.count, 2);
});

test('query: query() returns page/total/groups with a window', () => {
  const res = query(PEOPLE, { filter: { field: 'city', op: 'is', value: 'Paris' }, sort: [{ field: 'age', dir: 'desc' }], offset: 0, limit: 1 });
  assert.equal(res.total, 2);
  assert.equal(res.page.length, 1);
  assert.equal(res.page[0].name, 'Carol');
  const grouped = query(PEOPLE, { group: { field: 'city' } });
  assert.ok(grouped.groups.find((g) => g.key === 'Paris').count === 2);
});

test('query: relatedRecords + linkedSetsFor follow foreign keys', () => {
  const rows = [
    { _id: 'c1', _set: 'client', _label: 'Alice' },
    { _id: 'm1', _set: 'matter', _label: 'Matter 1' },
  ];
  const connections = [{ source: 'c1', target: 'm1', type: 'represents' }];
  const rowsById = indexRows(rows);
  const rel = relatedRecords('c1', { connections, rowsById });
  assert.equal(rel[0].set, 'matter');
  assert.equal(rel[0].dir, 'out');
  assert.equal(rel[0].records[0].label, 'Matter 1');
  assert.deepEqual(linkedSetsFor('client', { connections, rowsById }), ['matter']);
});

// ── formula + rollup ─────────────────────────────────────────────────────────

test('formula: arithmetic, field refs, string, logic, functions', () => {
  const r = (expr, record) => evaluate(expr, { record }).value;
  assert.equal(r('{qty} * {price}', { qty: 3, price: 4 }), 12);
  assert.equal(r('ROUND({x} / 3, 2)', { x: 10 }), 3.33);
  assert.equal(r('UPPER({name}) & "!"', { name: 'alice' }), 'ALICE!');
  assert.equal(r('IF({age} >= 18, "adult", "minor")', { age: 20 }), 'adult');
  assert.equal(r('SUM(1, 2, 3) + LEN("abcd")', {}), 10);
  assert.equal(r('SWITCH({s}, "a", 1, "b", 2, 0)', { s: 'b' }), 2);
  assert.equal(r('CONCAT(LEFT({n}, 3), "-", RIGHT({n}, 2))', { n: 'ABCDEF' }), 'ABC-EF');
});

test('formula: guards non-finite and traps errors; is not eval()', () => {
  assert.equal(evaluate('1 / 0', {}).ok, false); // non-finite
  assert.equal(evaluate('IFERROR(1/0, 99)', {}).value, 99);
  assert.equal(evaluate('ISERROR(1/0)', {}).value, true);
  // A field named after a keyword is safe (case-insensitive resolve, not source-upcasing).
  assert.equal(evaluate('{Value} + 1', { record: { Value: 5 } }).value, 6);
});

test('formula: rollups aggregate across a foreign-key relation', () => {
  const rowsById = indexRows([
    { _id: 'inv', _set: 'invoice' },
    { _id: 'l1', _set: 'line', total: 10 },
    { _id: 'l2', _set: 'line', total: 15 },
  ]);
  const connections = [
    { source: 'inv', target: 'l1', type: 'line' },
    { source: 'inv', target: 'l2', type: 'line' },
  ];
  const ctx = { record: { _id: 'inv' }, connections, rowsById };
  assert.equal(evaluateRollup({ via: 'line', fn: 'count' }, ctx).value, 2);
  assert.equal(evaluateRollup({ via: 'line', field: 'total', fn: 'sum' }, ctx).value, 25);
  assert.equal(evaluateRollup({ via: 'line', field: 'total', fn: 'max' }, ctx).value, 15);
});

// ── the whole engine over a durable, encrypted room ──────────────────────────

test('database: query/buildTable/related/formula over a room’s encrypted fold', async () => {
  configureVaultStorage(freshMetaStore());
  const db = createDatabase();
  await db.unlock('firm@local', 'pw');

  const { log } = await db.openLog('crm');
  const add = (id, label, fields) => {
    log.append({ op: 'INS', id, label });
    for (const [k, v] of Object.entries(fields)) log.append({ op: 'DEF', id, key: k, value: v });
  };
  add('c1', 'Alice', { type: 'client', age: 30 });
  add('c2', 'Bob', { type: 'client', age: 25 });
  add('m1', 'Matter One', { type: 'matter' });
  log.append({ op: 'CON', src: 'c1', tgt: 'm1', via: 'represents' });

  const clients = await db.query('crm', { filter: { field: 'type', op: 'is', value: 'client' }, sort: [{ field: 'age', dir: 'desc' }] });
  assert.equal(clients.total, 2);
  assert.deepEqual(clients.page.map((r) => r._label), ['Alice', 'Bob']);

  const table = await db.buildTable('crm', { setName: 'client' });
  assert.equal(table.rows.length, 2);
  assert.ok(table.cols.some((c) => c.name === 'age'));

  const sets = await db.listSets('crm');
  assert.ok(sets.find((s) => s.name === 'client').rows === 2);

  const rel = await db.related('crm', 'c1');
  assert.equal(rel[0].records[0].label, 'Matter One');

  const avg = await db.aggregate('crm', { agg: 'avg', field: 'age', groupBy: 'type' });
  assert.equal(avg.rows.find((r) => r.key === 'client').value, 27.5);

  assert.equal(db.formula('{age} * 2', { age: 30 }).value, 60);
});
