// tools/prompt-census — probe P1 of docs/prompt-as-site.md (offline, read-only).
//
// The terrain census of the prompt: every band the talker can be handed, tagged by
// Site terrain, its FIXED instructional prose weighed against the corpus population
// gradient (Figure > Pattern > Ground — docs/eo-wiki.md "EO Lexical Analysis v2").
//
// No drift by construction: the census imports the band catalogs from
// src/model/bands.js — the same objects the builders project — so what is measured
// is exactly what ships. The caller-side register cues (LIBRARIAN, CAPABILITY,
// GROUNDING) are censused too: they are prompt prose the file can emit, they just
// arrive through the `shape` slot instead of a catalog band.
//
// The falsifier (Tier 2, P1): if the Ground row is NOT over-represented against the
// gradient, docs/prompt-as-site.md §2 dies. The tool prints the verdict either way.
//
//   node tools/prompt-census/census.mjs           # markdown report
//   node tools/prompt-census/census.mjs --json    # machine-readable

import {
  GROUNDED_BANDS, CURSOR_BANDS, CHAT_BANDS, TERRAIN_GRAIN,
} from '../../src/model/bands.js';
import { LIBRARIAN_CUE, CAPABILITY_CUE, GROUNDING_CUE } from '../../src/model/prompt.js';
import { GRADIENT_BACKGROUND, terrainShares, judgePrompt } from '../../src/model/prompt-checkpoint.js';
import { projectGroundedBands } from '../../src/model/bands.js';

// The register cues ride the `shape`/steer slots as caller payloads; each is tagged
// with the terrain its INSTRUCTION lands on (the same accounting rule the catalog
// uses for asides): the librarian and capability cues set the voice (Atmosphere);
// the grounding cue rules what counts as a supported claim (Paradigm).
const CUES = [
  { key: 'librarian-cue', terrain: 'Atmosphere', catalog: 'cues', prose: [LIBRARIAN_CUE] },
  { key: 'capability-cue', terrain: 'Atmosphere', catalog: 'cues', prose: [CAPABILITY_CUE] },
  { key: 'grounding-cue', terrain: 'Paradigm', catalog: 'cues', prose: [GROUNDING_CUE] },
];

const NEGATIONS = [
  [/\b(?:don['’]t|doesn['’]t|didn['’]t|do not|does not|did not)\b/gi, "don't"],
  [/\bnever\b/gi, 'never'],
  [/\b(?:no|not|nothing)\b/gi, 'no/not'],
];

const measure = (prose) => {
  const text = prose.join('\n');
  const negations = {};
  for (const [re, label] of NEGATIONS) negations[label] = (text.match(re) || []).length;
  return {
    literals: prose.length,
    chars: text.length,
    parentheticals: (text.match(/\([^)]*\)/g) || []).length,
    negations,
  };
};

const rows = [];
for (const [catalog, bands] of [['grounded', GROUNDED_BANDS], ['cursor', CURSOR_BANDS], ['chat', CHAT_BANDS]]) {
  for (const b of bands) {
    rows.push({
      catalog, key: b.key, terrain: b.terrain, grain: TERRAIN_GRAIN[b.terrain],
      role: b.role, cell: b.cell ?? null, ...measure(b.prose),
    });
  }
}
for (const c of CUES) {
  rows.push({
    catalog: c.catalog, key: c.key, terrain: c.terrain, grain: TERRAIN_GRAIN[c.terrain],
    role: 'user', cell: null, ...measure(c.prose),
  });
}

// ── Aggregations ─────────────────────────────────────────────────────────────
const byGrain = {};
const byTerrain = {};
for (const r of rows) {
  const g = (byGrain[r.grain] ??= { bands: 0, chars: 0, parentheticals: 0, negations: 0 });
  g.bands += 1; g.chars += r.chars; g.parentheticals += r.parentheticals;
  g.negations += Object.values(r.negations).reduce((a, b) => a + b, 0);
  const t = (byTerrain[r.terrain] ??= { bands: 0, chars: 0 });
  t.bands += 1; t.chars += r.chars;
}
const totalChars = rows.reduce((a, r) => a + r.chars, 0);
const totalBands = rows.length;

const corpus = { Ground: 0, Figure: 0, Pattern: 0 };
for (const [terrain, share] of Object.entries(GRADIENT_BACKGROUND))
  corpus[TERRAIN_GRAIN[terrain]] += share;

const promptShare = (grain, field) =>
  (byGrain[grain]?.[field] ?? 0) / (field === 'bands' ? totalBands : totalChars);

// The P1 verdict: over-representation factor of the Ground row, by instructional
// char mass (the primary measure) and by band count.
const factorChars = promptShare('Ground', 'chars') / corpus.Ground;
const factorBands = promptShare('Ground', 'bands') / corpus.Ground;
const verdict = factorChars > 1
  ? `GROUND ROW OVER-REPRESENTED ×${factorChars.toFixed(1)} by prose mass (×${factorBands.toFixed(1)} by band count) — §2 stands`
  : 'Ground row NOT over-represented — §2 dies (the falsifier fired)';

// Assembly-level cross-check: what the checkpoint measures on live turns.
const defaultTurn = terrainShares(projectGroundedBands({
  question: 'What did the survey find?',
  spans: [{ text: 'The survey counted ninety-two individuals.', score: 0.9 }],
}));
const defaultVerdict = judgePrompt(projectGroundedBands({
  question: 'What did the survey find?',
  spans: [{ text: 'The survey counted ninety-two individuals.', score: 0.9 }],
}));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, byGrain, byTerrain, corpus, factorChars, factorBands, verdict }, null, 2));
  process.exit(0);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log('# prompt-census — P1, the terrain census of the prompt\n');
console.log(`${totalBands} bands/cues across three catalogs; ${totalChars} chars of fixed instructional prose.\n`);
console.log('| band | catalog | terrain | grain | chars | parens | negations |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  const negs = Object.values(r.negations).reduce((a, b) => a + b, 0);
  console.log(`| ${r.key} | ${r.catalog} | ${r.terrain} | ${r.grain} | ${r.chars} | ${r.parentheticals} | ${negs} |`);
}
console.log('\n## The gradient comparison (the P1 measurement)\n');
console.log('| grain | corpus share | prompt share (chars) | prompt share (bands) | factor (chars) |');
console.log('|---|---|---|---|---|');
for (const grain of ['Figure', 'Pattern', 'Ground']) {
  console.log(`| ${grain} | ${pct(corpus[grain])} | ${pct(promptShare(grain, 'chars'))} | ` +
    `${pct(promptShare(grain, 'bands'))} | ×${(promptShare(grain, 'chars') / corpus[grain]).toFixed(1)} |`);
}
console.log(`\n**Verdict:** ${verdict}\n`);
console.log('## Assembly-level cross-check (a default grounded turn, live shares)\n');
for (const [t, s] of Object.entries(defaultTurn.shares).sort((a, b) => b[1] - a[1]))
  console.log(`- ${t} (${TERRAIN_GRAIN[t]}): ${pct(s)}`);
console.log(`\nCheckpoint findings on that turn: ${defaultVerdict.findings.map(f => f.error).join(', ') || 'none'}.`);
