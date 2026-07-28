// Terrain census for a real feedback CSV — the CSV analogue of wiki-terrain-census.mjs's
// PROBE 3, run over an ACTUAL corpus instead of a hand-built fixture. Prints the terrain
// distribution, its breakdown by every low-cardinality column the sheet carries, and the
// dominant-terrain-per-facet findings ("negative reads as Network 2.6x baseline").
//
//   node probes/feedback-terrain-census.mjs path/to.csv [textColumn]
//
// textColumn is optional — the free-text column is auto-detected when omitted.

import { readFileSync } from 'node:fs';
import {
  parseCSV, detectTextColumn, detectFacetColumns, detectNumericColumns,
  buildFeedbackReading, terrainDistribution, crossTab, numericAverageByTerrain,
  dominantTerrainInsights, ALL_TERRAINS,
} from './feedback-csv-terrain.mjs';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(16)} ${v}`);

const path = process.argv[2];
if (!path) {
  console.error('usage: node probes/feedback-terrain-census.mjs path/to.csv [textColumn]');
  process.exit(1);
}

const raw = readFileSync(path, 'utf8');
const { header, records } = parseCSV(raw);
if (!records.length) { console.error('no rows found in', path); process.exit(1); }

const textColumn = process.argv[3] || detectTextColumn(header, records);
console.log(`${records.length} rows · ${header.length} columns · reading column "${textColumn}"`);

const { mode, aligned, terrainOfRow } = buildFeedbackReading(records, textColumn);
if (!aligned) {
  console.log('\x1b[33mNOTE: row<->sentence alignment failed for some input — fell back to independent\x1b[0m');
  console.log('\x1b[33mper-row parsing (weaker: cross-row recurrence is lost, most rows read Void).\x1b[0m');
}
console.log(`reading mode: ${mode}`);

h('TERRAIN DISTRIBUTION (the cube\'s Site face, over this corpus)');
const { counts, total } = terrainDistribution(terrainOfRow);
for (const t of ALL_TERRAINS) if (counts[t]) kv(t, `${counts[t]}  (${(100 * counts[t] / total).toFixed(1)}%)`);
const flat = ALL_TERRAINS.every((t) => Math.abs((counts[t] || 0) / total - 1 / ALL_TERRAINS.length) < 0.4 / ALL_TERRAINS.length);
console.log(`\n  ${flat ? '\x1b[31mFLAT\x1b[0m — distribution is close to uniform; this reading is not finding structure' : '\x1b[32mDIFFERENTIATED\x1b[0m — the corpus reads unevenly across terrains, a real finding'}`);

const exclude = [textColumn];
const facets = detectFacetColumns(header, records, { exclude });
const numerics = detectNumericColumns(header, records, { exclude });

for (const col of facets) {
  h(`terrain by ${col}`);
  const table = crossTab(records, terrainOfRow, col);
  for (const [value, dist] of table) {
    const n = Object.values(dist).reduce((a, b) => a + b, 0);
    const parts = ALL_TERRAINS.filter((t) => dist[t]).map((t) => `${t}:${dist[t]}`).join(' ');
    kv(`${value} (n=${n})`, parts);
  }
}

for (const col of numerics) {
  h(`avg ${col} by terrain`);
  const avgs = numericAverageByTerrain(records, terrainOfRow, col);
  for (const t of ALL_TERRAINS) if (avgs[t]) kv(t, `avg=${avgs[t].avg.toFixed(2)}  n=${avgs[t].n}`);
}

h('HEADLINE FINDINGS (dominant terrain per facet value, vs. the dataset\'s own baseline)');
const insights = dominantTerrainInsights(records, terrainOfRow, facets);
if (!insights.length) console.log('  no facet value clears the minimum sample size / lift threshold');
for (const ins of insights) {
  console.log(`  ${ins.column}="${ins.value}" reads as ${ins.terrain} ${ins.lift.toFixed(2)}x baseline` +
    ` (${(100 * ins.shareHere).toFixed(0)}% vs ${(100 * ins.shareOverall).toFixed(0)}%, n=${ins.sampleSize})`);
}

console.log('\nDone. This is a read-time projection over the real parser — nothing here is stored or fabricated.');
