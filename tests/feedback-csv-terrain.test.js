import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCSV, neutralizeUnit, detectTextColumn, detectFacetColumns, detectNumericColumns,
  buildFeedbackReading, terrainDistribution, crossTab, numericAverageByTerrain,
  dominantTerrainInsights, samplesByTerrain, ALL_TERRAINS,
} from '../probes/feedback-csv-terrain.mjs';

test('parseCSV: header + quoted fields with embedded commas and escaped quotes', () => {
  const raw = 'a,b,c\n1,"hello, world",3\n2,"she said ""hi""",4\n';
  const { header, records } = parseCSV(raw);
  assert.deepEqual(header, ['a', 'b', 'c']);
  assert.equal(records.length, 2);
  assert.equal(records[0].b, 'hello, world');
  assert.equal(records[1].b, 'she said "hi"');
});

test('parseCSV: empty input yields no rows', () => {
  assert.deepEqual(parseCSV(''), { header: [], records: [] });
});

test('neutralizeUnit: folds internal sentence-ending punctuation, keeps one terminal mark', () => {
  assert.equal(neutralizeUnit('I liked it. the staff was kind.'), 'I liked it, the staff was kind.');
  assert.equal(neutralizeUnit('Great! the team helped, truly.'), 'Great, the team helped, truly.');
  assert.equal(neutralizeUnit('no punctuation at all'), 'no punctuation at all');
  assert.equal(neutralizeUnit(''), '');
  assert.equal(neutralizeUnit('   '), '');
});

test('detectTextColumn: picks the long free-text column over ids/categories', () => {
  const header = ['id', 'category', 'note'];
  const records = [
    { id: '1', category: 'A', note: 'This is a fairly long piece of feedback about the service.' },
    { id: '2', category: 'B', note: 'Another longer comment describing what happened during the visit.' },
    { id: '3', category: 'A', note: 'A third comment, also reasonably long and descriptive of the event.' },
  ];
  assert.equal(detectTextColumn(header, records), 'note');
});

test('detectFacetColumns: low-cardinality short columns only, excludes the text column and an all-distinct id', () => {
  const header = ['id', 'category', 'note'];
  const records = [
    { id: '1', category: 'A', note: 'long text one here' },
    { id: '2', category: 'B', note: 'long text two here' },
    { id: '3', category: 'A', note: 'long text three here' },
    { id: '4', category: 'B', note: 'long text four here' },
  ];
  const facets = detectFacetColumns(header, records, { exclude: ['note'] });
  assert.ok(facets.includes('category'));
  assert.ok(!facets.includes('note'));
  assert.ok(!facets.includes('id'));
});

test('detectNumericColumns: excludes id-shaped columns even though their values are numeric', () => {
  const header = ['comment_id', 'satisfaction_score', 'comment'];
  const records = [
    { comment_id: '1', satisfaction_score: '3', comment: 'x' },
    { comment_id: '2', satisfaction_score: '4', comment: 'y' },
    { comment_id: '3', satisfaction_score: '5', comment: 'z' },
  ];
  const numeric = detectNumericColumns(header, records, { exclude: ['comment'] });
  assert.ok(numeric.includes('satisfaction_score'));
  assert.ok(!numeric.includes('comment_id'));
});

test('buildFeedbackReading: row<->sentence alignment survives adversarial punctuation (internal periods, an ending "single-capital initial", no terminal mark, a blank row)', () => {
  const records = [
    { text: 'I am very satisfied with the service provided by the company. the product quality was excellent.' },
    { text: 'See Exhibit A.' },
    { text: 'the next customer had no punctuation at all' },
    { text: 'Great job! the team was helpful, truly.' },
    { text: '' },
  ];
  const { mode, aligned, terrainOfRow } = buildFeedbackReading(records, 'text');
  assert.equal(mode, 'joint');
  assert.equal(aligned, true);
  assert.equal(terrainOfRow.length, records.length);
  for (const t of terrainOfRow) assert.ok(ALL_TERRAINS.includes(t), `unexpected terrain ${t}`);
});

test('buildFeedbackReading: a corpus of many short rows sharing generic nouns reads as more than one terrain', () => {
  // Recurring generic nouns ("the company", "the staff") across many independent short rows
  // is exactly the shape common-noun admission needs to turn them into figures. This is the
  // property the whole feature depends on (a single row parsed alone reads flat Void — see
  // probes/feedback-csv-terrain.mjs's header comment) so it is pinned as a real regression guard.
  const rows = [
    'I am disappointed with the company because the delivery was delayed.',
    'The experience with this company was excellent because customer support was very helpful.',
    'I had a great experience and the company the staff was very professional.',
    'I would not recommend this company because customer support was not helpful.',
    'The experience was neither good nor bad because the service was average.',
    'Overall, the company met my expectations, but the process was standard.',
    'The company did a great job and the product quality was excellent.',
    'I am very satisfied with the service provided by the company. the staff was very professional.',
  ];
  const records = rows.map((text) => ({ text }));
  const { aligned, terrainOfRow } = buildFeedbackReading(records, 'text');
  assert.equal(aligned, true);
  const distinct = new Set(terrainOfRow);
  assert.ok(distinct.size > 1, `expected more than one terrain, got only ${[...distinct]}`);
  assert.ok(![...distinct].every((t) => t === 'Void'), 'the whole point of the joint-corpus read is that it is not flat Void');
});

test('terrainDistribution / crossTab / numericAverageByTerrain: pure aggregation over a controlled terrain assignment', () => {
  const records = [
    { group: 'a', score: '4' }, { group: 'a', score: '2' },
    { group: 'b', score: '5' }, { group: 'b', score: '5' },
  ];
  const terrainOfRow = ['Entity', 'Network', 'Entity', 'Entity'];

  const { counts, total } = terrainDistribution(terrainOfRow);
  assert.equal(total, 4);
  assert.equal(counts.Entity, 3);
  assert.equal(counts.Network, 1);

  const table = crossTab(records, terrainOfRow, 'group');
  assert.deepEqual(table.get('a'), { Entity: 1, Network: 1 });
  assert.deepEqual(table.get('b'), { Entity: 2 });

  const avgs = numericAverageByTerrain(records, terrainOfRow, 'score');
  assert.equal(avgs.Entity.n, 3);
  assert.equal(avgs.Entity.avg, (4 + 5 + 5) / 3);
  assert.equal(avgs.Network.n, 1);
  assert.equal(avgs.Network.avg, 2);
});

test('dominantTerrainInsights: surfaces a real skew per facet value, ignores a terrain too rare in the whole corpus to trust', () => {
  const records = [
    ...Array.from({ length: 10 }, () => ({ group: 'x' })),
    ...Array.from({ length: 11 }, () => ({ group: 'y' })),
  ];
  const terrainOfRow = [
    ...Array(10).fill('Network'),               // group x: all Network
    ...Array(10).fill('Entity'), 'Void',         // group y: mostly Entity, one stray Void
  ];
  const insights = dominantTerrainInsights(records, terrainOfRow, ['group'], { minCount: 5, minTerrainTotal: 3 });
  assert.ok(insights.some((i) => i.column === 'group' && i.value === 'x' && i.terrain === 'Network'));
  assert.ok(insights.some((i) => i.column === 'group' && i.value === 'y' && i.terrain === 'Entity'));
  assert.ok(!insights.some((i) => i.terrain === 'Void'), 'a terrain with only 1 occurrence total must not produce a finding');
});

test('samplesByTerrain: returns matching rows in row order, capped at the limit', () => {
  const records = [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }];
  const terrainOfRow = ['Entity', 'Network', 'Entity', 'Entity'];
  const out = samplesByTerrain(records, terrainOfRow, 'Entity', 'text', { limit: 2 });
  assert.deepEqual(out.map((s) => s.text), ['a', 'c']);
});
