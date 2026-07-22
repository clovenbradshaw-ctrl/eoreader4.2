// feedback.js — a CSV/tabular feedback export folded into the terrains room's scene shape.
// Pins: column auto-detection picks the PROSE column over a same-named id column and the real
// category column over a same-named but wrong one; feature-phrase extraction keeps only what
// recurs and merges a wrap-around variant into its shorter form; every one of the nine terrains
// gets a real (not fabricated) value; the fold is deterministic; and the output actually feeds
// overlay.js's buildOverlay without throwing (the whole point of matching scene.js's shape).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectTextColumn, detectSentimentColumn, detectCategoryColumn, detectFlagColumn,
  extractFeaturePhrases, sceneFromRows, sceneFromCSV,
} from '../src/rooms/terrains/feedback.js';
import { buildOverlay } from '../src/rooms/terrains/overlay.js';

// A small, hand-traceable table: two recurring feature phrases ("customer support",
// "delivery"), one row that mentions both (a real Link), one flagged row per phrase (Void),
// and each phrase read under both a positive and a negative row (Lens).
const ROWS = [
  { id: '1', area: 'Support',  text: 'Customer support was very helpful.', sentiment: 'positive', resolution_needed: '0' },
  { id: '2', area: 'Support',  text: 'Customer support was very helpful.', sentiment: 'positive', resolution_needed: '0' },
  { id: '3', area: 'Support',  text: 'Customer support was not helpful.', sentiment: 'negative', resolution_needed: '1' },
  { id: '4', area: 'Delivery', text: 'The delivery was delayed.', sentiment: 'negative', resolution_needed: '1' },
  { id: '5', area: 'Delivery', text: 'The delivery arrived on time.', sentiment: 'positive', resolution_needed: '0' },
  { id: '6', area: 'Delivery', text: 'The delivery arrived on time and customer support was very helpful.', sentiment: 'positive', resolution_needed: '0' },
  { id: '7', area: 'Sales',    text: 'A one-off remark about pricing plans.', sentiment: 'neutral', resolution_needed: '0' },
];
const COLUMNS = ['id', 'area', 'text', 'sentiment', 'resolution_needed'];

test('detectTextColumn prefers the actual prose column over a same-named id column', () => {
  assert.equal(detectTextColumn(ROWS, COLUMNS), 'text');
  // an "id" column would also match a looser name pattern ("id" alone does not, but a column
  // literally named "comment_id" would match "comment") — the length check must still win.
  const withCommentId = ROWS.map((r, i) => ({ ...r, comment_id: String(i + 1) }));
  assert.equal(detectTextColumn(withCommentId, [...COLUMNS, 'comment_id']), 'text');
});

test('detectSentimentColumn finds a named column; falls back to a value-shaped one', () => {
  assert.equal(detectSentimentColumn(ROWS, COLUMNS), 'sentiment');
  const renamed = ROWS.map((r) => ({ area: r.area, text: r.text, mood: r.sentiment, flag: r.flag }));
  assert.equal(detectSentimentColumn(renamed, ['area', 'text', 'mood', 'flag']), 'mood');
});

test('detectCategoryColumn prefers an area/category/segment name over a type/topic name, and never a numeric rating', () => {
  const withType = ROWS.map((r) => ({ ...r, customer_type: r.area === 'Support' ? 'New' : 'Returning' }));
  assert.equal(detectCategoryColumn(withType, [...COLUMNS, 'customer_type'], ['text', 'sentiment']), 'area');
  const withScore = ROWS.map((r, i) => ({ ...r, score: String((i % 5) + 1) }));
  assert.notEqual(detectCategoryColumn(withScore, [...COLUMNS, 'score'], ['text', 'sentiment']), 'score');
});

test('detectFlagColumn matches a resolution/follow-up style name, and misses a bare "flag" column', () => {
  assert.equal(detectFlagColumn(ROWS, COLUMNS, ['text']), 'resolution_needed');
  const bareFlag = ROWS.map(({ resolution_needed, ...r }) => ({ ...r, flag: resolution_needed }));
  assert.equal(detectFlagColumn(bareFlag, ['id', 'area', 'text', 'sentiment', 'flag'], ['text']), null);
});

test('extractFeaturePhrases keeps what recurs, drops a one-off, and folds a wrap-around variant', () => {
  const texts = [
    'the company customer support was great.',   // wraps "customer support"
    'customer support was great.',
    'customer support was bad.',
    'a one-off remark about pricing plans.',      // never recurs
  ];
  const { byRow, vocabulary } = extractFeaturePhrases(texts, { minCount: 2 });
  assert.deepEqual(vocabulary, ['customer support']);
  assert.deepEqual(byRow[0], ['customer support']);   // the wrap-around folded, not a separate entity
  assert.deepEqual(byRow[1], ['customer support']);
  assert.deepEqual(byRow[3], []);                     // the one-off never clears the recurrence bar
});

test('sceneFromRows: Entity + Kind + Network are real, derived values', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  assert.equal(scene.meta.textColumn, 'text');
  assert.equal(scene.meta.sentimentColumn, 'sentiment');
  assert.equal(scene.meta.categoryColumn, 'area');
  assert.equal(scene.meta.flagColumn, 'resolution_needed');
  assert.equal(scene.SENTENCES.length, 7);

  const ids = new Set(scene.ENTITIES.map((e) => e.id));
  assert.deepEqual([...ids].sort(), ['customer-support', 'delivery']);

  const support = scene.ENTITIES.filter((e) => e.id === 'customer-support');
  assert.deepEqual(support.map((e) => e.sent).sort((a, b) => a - b), [0, 1, 2, 5]);
  assert.ok(support.every((e) => e.kind === 'support'));
  assert.equal(support[0].cluster, 'Support', 'majority of the rows mentioning it are Support');

  const delivery = scene.ENTITIES.filter((e) => e.id === 'delivery');
  assert.deepEqual(delivery.map((e) => e.sent).sort((a, b) => a - b), [3, 4, 5]);
  assert.ok(delivery.every((e) => e.kind === 'delivery'));
  assert.equal(delivery[0].cluster, 'Delivery');

  // row 6 (sent 5) is the only row naming BOTH features — a real literal substring each time
  for (const e of scene.ENTITIES) assert.ok(scene.SENTENCES[e.sent].includes(e.text));
});

test('sceneFromRows: Link only where two known phrases literally co-occur — nothing invented', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  assert.equal(scene.LINKS.length, 1, 'only row 6 (sent 5) names two features');
  const [link] = scene.LINKS;
  assert.equal(link.sent, 5);
  assert.deepEqual([link.src, link.tgt].sort(), ['customer-support', 'delivery']);
  assert.equal(link.polarity, '+', 'sent 5 is a positive row');
  assert.ok(scene.SENTENCES[5].includes(link.text), 'the link anchors on a literal substring');
});

test('sceneFromRows: Atmosphere is the table\'s own sentiment column, painted straight', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  assert.deepEqual(scene.ATMOSPHERE.map((a) => a.tone),
    ['positive', 'positive', 'negative', 'negative', 'positive', 'positive', 'neutral']);
  assert.deepEqual(scene.ATMOSPHERE.map((a) => a.hue),
    ['green', 'green', 'amber', 'amber', 'green', 'green', 'blue']);
});

test('sceneFromRows: Field is 0..1, scaled by the table\'s own maximum phrase count', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  // sent 5 (row 6) names two phrases — the corpus max — so it alone reaches 1
  assert.equal(scene.FIELD[5], 1);
  assert.equal(scene.FIELD[6], 0, 'the one-off row raises no known feature');
  assert.ok(scene.FIELD.every((v) => v >= 0 && v <= 1));
});

test('sceneFromRows: Void marks a flagged row that never states its resolution', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  assert.deepEqual(scene.VOIDS.map((v) => v.sent).sort((a, b) => a - b), [2, 3]);
  for (const v of scene.VOIDS) assert.ok(scene.SENTENCES[v.sent].includes(v.text));
});

test('sceneFromRows: Lens is a phrase read under 2+ different sentiments', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  const ids = scene.LENSES.map((l) => l.id).sort();
  assert.deepEqual(ids, ['customer-support', 'delivery']);
  for (const lens of scene.LENSES) {
    assert.ok(lens.senses.length >= 2);
    assert.ok(scene.SENTENCES[lens.sent].includes(lens.text));
  }
});

test('sceneFromRows: Paradigm — a rolling-window majority of tone, break exactly where it turns', () => {
  const rows = ['p', 'p', 'p', 'p', 'p', 'n', 'n', 'n', 'n', 'n'].map((t, i) => ({
    text: `Row ${i}.`, mood: t === 'p' ? 'positive' : 'negative',
  }));
  const scene = sceneFromRows(rows, { columns: ['text', 'mood'], sentimentColumn: 'mood', paradigmWindow: 3 });
  assert.equal(scene.PARADIGM.length, 10);
  const breaks = scene.PARADIGM.map((p, i) => (p.break ? i : null)).filter((i) => i != null);
  assert.deepEqual(breaks, [6], 'a 3-row trailing window flips from positive to negative once the last 2-of-3 are negative');
  assert.equal(scene.PARADIGM[6].frame, 'negative');
  assert.ok(scene.PARADIGM[6].note.length > 0);
  assert.equal(scene.PARADIGM[0].break, false, 'the first row never breaks — there is nothing before it');
});

test('sceneFromRows is a pure fold — same rows, same scene', () => {
  const a = sceneFromRows(ROWS, { columns: COLUMNS });
  const b = sceneFromRows(ROWS, { columns: COLUMNS });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('sceneFromRows never invents a sequence a table does not carry — honest about row order standing in for time', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  for (const p of scene.PARADIGM) if (p.break) assert.ok(/table order/.test(p.note));
});

test('a table with no text at all still folds to an empty, non-throwing scene', () => {
  const scene = sceneFromRows([], {});
  assert.equal(scene.SENTENCES.length, 0);
  assert.equal(scene.ENTITIES.length, 0);
  assert.doesNotThrow(() => buildOverlay({ inline: new Set(['entity', 'link', 'lens', 'void']), wash: 'atmosphere' }, scene));
});

test('sceneFromCSV parses raw CSV text end-to-end to the same shape sceneFromRows produces', () => {
  const csv = 'area,text,sentiment,resolution_needed\n' +
    ROWS.map((r) => `${r.area},"${r.text}",${r.sentiment},${r.resolution_needed}`).join('\n');
  const scene = sceneFromCSV(csv);
  const expected = sceneFromRows(ROWS.map(({ area, text, sentiment, resolution_needed }) => ({ area, text, sentiment, resolution_needed })), {});
  assert.deepEqual(scene.SENTENCES, expected.SENTENCES);
  assert.deepEqual(scene.ENTITIES, expected.ENTITIES);
});

test('every terrain a loaded feedback scene carries feeds buildOverlay without throwing, for every wash and recolour', () => {
  const scene = sceneFromRows(ROWS, { columns: COLUMNS });
  for (const wash of ['none', 'field', 'atmosphere', 'paradigm']) {
    for (const recolor of ['identity', 'kind', 'network']) {
      const model = buildOverlay({ inline: new Set(['entity', 'link', 'lens', 'void']), recolor, wash }, scene);
      assert.equal(model.sentences.length, scene.SENTENCES.length);
    }
  }
  const withLinks = buildOverlay({ inline: new Set(['entity', 'link']) }, scene);
  assert.equal(withLinks.arcs.length, scene.LINKS.length);
  for (const arc of withLinks.arcs) { assert.equal(arc.hasFrom, true); assert.equal(arc.hasTo, true); }
});
