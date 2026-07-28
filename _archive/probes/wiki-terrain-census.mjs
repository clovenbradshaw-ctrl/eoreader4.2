// Probes for "Terrain-Typed Article Templates" (docs/terrain-typed-templates.md §10).
// Cheap, read-only, allowed to come back negative and STOP the build. Run:
//
//   node probes/wiki-terrain-census.mjs [articles.json]
//
// The optional argument is a JSON array of article-shaped records, each { terrain, log }
// (or { terrain, sections:{op:hasContent} }). With no argument the probe runs on a small
// built-in fixture so the harness is exercised end-to-end; a real run points it at the
// dataset. It prints a report and, for §10's falsifiable probes, prints PASS / FALSIFIED.
//
// The doc says: run PROBE 3 first. It costs a query. If the per-terrain distribution is
// flat, the dataset is not behaving like language and the whole transfer of the corpus
// finding to the wiki needs rethinking — stop before building the rest.

import { TERRAIN_NAMES, renderArticle, absenceProfile } from '../src/wiki/index.js';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(14)} ${v}`);
const verdict = (ok, msg) => console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFALSIFIED\x1b[0m'} — ${msg}`);

// A built-in fixture: the corpus PREDICTS Entity is the gravity well and the Ground
// column (Void/Field/Atmosphere) is sparse (docs/prompt-as-site.md Tier 0). This fixture
// is shaped to that prediction so the harness demonstrably reports PASS on language-like
// data; a flat fixture would report FALSIFIED, which is the point of the probe.
const FIXTURE_COUNTS = { Entity: 42, Kind: 11, Link: 14, Network: 6, Lens: 9, Paradigm: 3, Void: 2, Field: 3, Atmosphere: 1 };
const synthFixture = () => Object.entries(FIXTURE_COUNTS).flatMap(([terrain, n]) =>
  Array.from({ length: n }, (_, i) => ({
    terrain,
    // most articles have NO SYN content; a couple of Pattern-terrain ones do (composition)
    log: [{ seq: 0, op: 'DEF', kind: 'define', id: 'd', text: `${terrain} #${i}` },
      ...(terrain === 'Network' && i === 0 ? [{ seq: 1, op: 'SYN', kind: 'edge', edge: 'composes', dir: 'out', to: 'Network:parent' }] : [])],
  })));

const load = () => {
  const arg = process.argv[2];
  if (!arg) { console.log('  (no dataset argument — running on the built-in fixture)'); return synthFixture(); }
  const data = JSON.parse(require('node:fs').readFileSync(arg, 'utf8'));
  return Array.isArray(data) ? data : (data.articles || []);
};

const articles = load();

// A per-terrain non-empty-section fingerprint, read via the SAME projection production
// uses (renderArticle), so the probe can never disagree with the renderer.
const synFilled = (a) => {
  try {
    const art = renderArticle(a.log || [], a.terrain);
    const syn = art?.sections.find((s) => s.op === 'SYN');
    return !!(syn && !syn.empty);
  } catch { return false; }
};

// ── PROBE 3 — the Ground column is underpopulated in the predicted way (RUN FIRST) ──
h('PROBE 3 — terrain distribution (run first; if flat, STOP)');
const counts = Object.fromEntries(TERRAIN_NAMES.map((t) => [t, 0]));
for (const a of articles) if (a && counts[a.terrain] != null) counts[a.terrain]++;
const total = Object.values(counts).reduce((s, n) => s + n, 0) || 1;
for (const t of TERRAIN_NAMES) kv(t, `${counts[t]}  (${(100 * counts[t] / total).toFixed(1)}%)`);

const ground = counts.Void + counts.Field + counts.Atmosphere;
const groundShare = ground / total;
const entityShare = counts.Entity / total;
const meanShare = 1 / TERRAIN_NAMES.length;
// Falsifier: a flat distribution, or a skew the wrong way (Entity not the gravity well,
// or the Ground column not sparse). "Flat" ≈ every terrain within ±40% of the mean share.
const flat = TERRAIN_NAMES.every((t) => Math.abs(counts[t] / total - meanShare) < 0.4 * meanShare);
kv('ground col', `${(100 * groundShare).toFixed(1)}%  (Void+Field+Atmosphere)`);
kv('entity', `${(100 * entityShare).toFixed(1)}%  (the predicted gravity well)`);
verdict(!flat && entityShare > meanShare && groundShare < 3 * meanShare,
  flat ? 'distribution is FLAT — the dataset is not behaving like language; stop and rethink the transfer'
       : 'Entity is the gravity well and the Ground column is sparse, as the corpus predicts');

// ── PROBE 4 — the desert holds (SYN empty in the Ground column) ─────────────────────
h('PROBE 4 — the desert holds (SYN content by terrain)');
const synByTerrain = Object.fromEntries(TERRAIN_NAMES.map((t) => [t, 0]));
for (const a of articles) if (a && synByTerrain[a.terrain] != null && synFilled(a)) synByTerrain[a.terrain]++;
for (const t of TERRAIN_NAMES) if (synByTerrain[t]) kv(t, `${synByTerrain[t]} SYN-filled`);
const groundSyn = synByTerrain.Void + synByTerrain.Field + synByTerrain.Atmosphere;
kv('ground SYN', groundSyn);
// Falsifier: the Ground-column SYN sections fill readily. Near-zero holds the desert.
verdict(groundSyn === 0,
  groundSyn === 0 ? 'the desert holds — no SYN content in Void/Field/Atmosphere'
                  : `SYN filled in the Ground column ${groundSyn}×; the desert cell is leaking — worth more than the build (§10)`);

// ── coverage note: every terrain has a typed absence to headline ────────────────────
h('coverage — typed absence per terrain (the headline content)');
for (const t of TERRAIN_NAMES) {
  const prof = absenceProfile(t);
  kv(t, `${prof.length} typed absences · leads with "${(prof.find((x) => x.subject) || prof[0]).headline}"`);
}

console.log('\nDone. These probes assert nothing; they print a report and a falsifier verdict.');
