import { readFileSync } from 'fs';
import { parseText } from './src/perceiver/parse/index.js';
import { siteTerrainAt } from './src/surfer/terrain.js';

const text = readFileSync('/tmp/cymbeline.txt', 'utf-8');

const doc = parseText(text, { docId: 'cymbeline' });
const snapshot = doc.log.snapshot();
const nUnits = doc.units.length;
const nEvents = snapshot.length;

const ids = new Set();
for (const e of snapshot) {
  if (e.id != null) ids.add(e.id);
  if (e.src != null) ids.add(e.src);
  if (e.tgt != null) ids.add(e.tgt);
}

const terrainCounts = { Link:0, Lens:0, Network:0, Paradigm:0, Entity:0, Void:0 };
const step = 10;

for (let i = 0; i < nUnits; i += step) {
  const t = siteTerrainAt(doc, i);
  terrainCounts[t]++;
}

console.log('=== Cymbeline Terrain Profile ===');
console.log(`Units (sentences): ${nUnits}`);
console.log(`Events: ${nEvents}`);
console.log(`Unique IDs (entityIds + roles): ${ids.size}`);
console.log(`Sample rate: every ${step} units`);
console.log('');
const total = Object.values(terrainCounts).reduce((a,b) => a+b, 0);
for (const [k, v] of Object.entries(terrainCounts)) {
  console.log(`${k}: ${v} (${(v/total*100).toFixed(1)}%)`);
}

console.log('\n=== Entity IDs ===');
const sorted = [...ids].sort();
console.log(`Total: ${sorted.length}`);
for (const id of sorted) {
  console.log('  ', id);
}
