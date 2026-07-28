// FRAME-SCATTER, cross-genre — same measurement as probes/frame-scatter.mjs (M1/M2/M3),
// run over three deliberately dissimilar sources instead of the three Gutenberg novels it
// ships with: an epic realist novel (War and Peace), a government investigative report (the
// 9/11 Commission Report), and an Elizabethan verse tragedy (Hamlet). The question this asks:
// does the structural (operator-profile, embedder-free) significance basis extract Atmosphere/
// Lens/Paradigm-grade signal on genres that are NOT novels, and does it degrade gracefully or
// nonsensically when the source has no continuous prose (report headers/footnotes, verse +
// speech prefixes)?
//
//   node probes/frame-scatter-genres.mjs [--dir /tmp/reading-sources] [--alpha 0.05]
import fs from 'node:fs';
import { join } from 'node:path';
import { parseText } from '../src/perceiver/parse/index.js';
import { structuralActivations, structuralHorizon, structuralCommutator } from '../src/surfer/structure-basis.js';
import { buildDensity, eigenLenses, deriveNull } from '../src/core/index.js';
import { foldUnnamedFrames } from '../src/surfer/surf.js';

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const DIR = flag('--dir', process.env.READING_SOURCES || '/tmp/reading-sources');
const ALPHA = Number(flag('--alpha', '0.05'));

const SOURCES = [
  { id: 'warandpeace', file: 'warandpeace.txt', title: 'War and Peace', gutenberg: true },
  { id: '911', file: '911.txt', title: 'The 9/11 Commission Report', gutenberg: false },
  { id: 'hamlet', file: 'hamlet.txt', title: 'Hamlet', gutenberg: true },
];

const strip = (raw) => {
  const s = raw.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG/i);
  const e = raw.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  if (s < 0) return raw;
  return raw.slice(raw.indexOf('\n', s) + 1, e > s ? e : raw.length);
};
const round = (x) => Math.round(x * 1e4) / 1e4;

const docs = [];
for (const src of SOURCES) {
  const path = join(DIR, src.file);
  if (!fs.existsSync(path)) { console.error(`[skip ${src.id}] missing ${path}`); continue; }
  const raw = src.gutenberg ? strip(fs.readFileSync(path, 'utf8')) : fs.readFileSync(path, 'utf8');
  console.time(`parse:${src.id}`);
  const doc = parseText(raw, { docId: src.id, genderCoref: true, lang: 'en', unnamedReferents: true });
  console.timeEnd(`parse:${src.id}`);
  const { activations } = structuralActivations(doc, { relations: true });
  docs.push({ ...src, doc, acts: activations, chars: raw.length, units: doc.units.length });
  console.log(`  ${src.title}: ${raw.length} chars, ${doc.units.length} units, ${activations.length} activation rows`);
}
if (!docs.length) { console.error('no sources present; fetch them first.'); process.exit(1); }

console.log(`\n${'='.repeat(78)}\nM1 — fold-before-gate: is any real frame SPLIT-MASS?  (alpha=${ALPHA})\n${'='.repeat(78)}`);
let anyFrame = 0;
for (const d of docs) {
  const { rho } = buildDensity(d.acts);
  const full = eigenLenses(rho);
  const spectrum = full.map((l) => l.weight);
  const real = spectrum.filter((w) => { const n = deriveNull(spectrum, { scale: 'linear', alpha: ALPHA, leaveOut: w }); return Number.isFinite(n) && w > n; }).length;
  const frames = foldUnnamedFrames(full, d.acts, spectrum, { alpha: ALPHA });
  anyFrame += frames.length;
  console.log(`  ${d.title.padEnd(34)} lenses=${spectrum.length}  real=${real}  top3=${spectrum.slice(0,3).map(round).join(',')}  unnamedFrames=${frames.length}` +
    (frames.length ? '  ' + JSON.stringify(frames.map((f) => ({ rank: f.rank, pooled: f.pooledWeight }))) : ''));
}
console.log(`  VERDICT: ${anyFrame ? `POSITIVE — ${anyFrame} split-mass frame(s) recovered` : 'NEGATIVE — no split-mass frame in this basis'}`);

console.log(`\n${'='.repeat(78)}\nM2 — relativistic reading: does the document read in SEVERAL LOCAL KEYS?\n${'='.repeat(78)}`);
const W = 60, STRIDE = 30;
let anyLocal = false;
for (const d of docs) {
  const global = structuralHorizon(d.doc);
  const globalTone = global.tone?.label ?? '(none)';
  const local = new Map();
  let windows = 0, diverged = 0;
  for (let i = 0; i + W <= d.acts.length; i += STRIDE) {
    const win = d.acts.slice(i, i + W).map((v) => v.slice(0, 9));
    const h = structuralHorizon(win);
    const t = h.tone?.label ?? '(none)';
    local.set(t, (local.get(t) || 0) + 1);
    windows += 1;
    if (t !== globalTone) diverged += 1;
  }
  const distinct = local.size;
  const frac = windows ? round(diverged / windows) : 0;
  if (distinct > 1) anyLocal = true;
  console.log(`  ${d.title.padEnd(34)} global="${globalTone}"  windows=${windows}  distinctLocalKeys=${distinct}  divergedFromGlobal=${frac}`);
  const spread = [...local.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`);
  console.log(`      local spread: ${spread.join('  |  ')}`);
}
console.log(`  VERDICT: ${anyLocal ? 'POSITIVE — several local keys' : 'NEGATIVE — one global key throughout'}`);

console.log(`\n${'='.repeat(78)}\nM3 — incommensurability: does the paradigm commutator SEPARATE readings?\n${'='.repeat(78)}`);
const third = (acts, k) => { const n = Math.floor(acts.length / 3); return acts.slice(k * n, (k + 1) * n); };
for (const d of docs) {
  const mid = third(d.acts, 1), h = mid.length >> 1;
  const baseline = structuralCommutator(mid.slice(0, h), mid.slice(h), { m: 3 });
  const cross = structuralCommutator(third(d.acts, 0), third(d.acts, 2), { m: 3 });
  const beats = baseline > 0 && cross > baseline * 1.5;
  console.log(`  ${d.title.padEnd(34)} region0∦region2=${cross}  baseline=${baseline}  ${beats ? '>> beats (frames diverge within the doc)' : '(commensurable — one frame)'}`);
}
console.log('  cross-document (three DIFFERENT genres SHOULD be more incommensurable than within one):');
for (let i = 0; i < docs.length; i++)
  for (let j = i + 1; j < docs.length; j++) {
    const c = structuralCommutator(docs[i].acts, docs[j].acts, { m: 3 });
    console.log(`      ${docs[i].id} ∦ ${docs[j].id} = ${c}`);
  }
console.log('\n(interpretation is left to the reader — this probe reports, it does not decide.)');
