// FRAME-SCATTER — the measurement the recursion is gated on (docs/referents-recursed-up-the-
// domain-axis.md, "Honest seam"). It asks, on real texts, whether the three landed primitives
// have any signal to act on — and it can come back NEGATIVE, which is the point. Model-free,
// offline, deterministic. Asserts nothing; it reports, exactly like probes/reading-diagnostic.mjs.
//
//   node probes/frame-scatter.mjs [--dir <sources-dir>] [--alpha 0.05]
//
// Texts are NOT committed (public-domain but large). Fetch them first:
//   DIR=/tmp/reading-sources; mkdir -p "$DIR"
//   curl -sL https://www.gutenberg.org/cache/epub/84/pg84.txt     -o "$DIR/frankenstein.txt"
//   curl -sL https://www.gutenberg.org/cache/epub/5200/pg5200.txt -o "$DIR/metamorphosis.txt"
//   curl -sL https://www.gutenberg.org/cache/epub/11/pg11.txt     -o "$DIR/alice.txt"
//
// The reading substrate is the STRUCTURAL significance basis (src/surfer/structure-basis.js):
// each unit's activation is its profile over the nine operators (± the relation classes), read
// straight off the log with no embedder. That is the basis the significance column now prefers
// (the embedder is a VOX/surface organ), so it is the honest place to measure — and it is the
// only one available offline. The original creature-scatter claim was made in the MiniLM meaning
// basis; reproducing THAT needs a meaning embedder and is out of this probe's model-free scope.
//
// Three measurements, one per landed primitive, each with its falsifier:
//   M1 — fold-before-gate (surf.js foldUnnamedFrames): is any real frame split-mass — below the
//        per-eigenvector null yet clearing it pooled? Falsifier: zero unnamed frames anywhere →
//        the primitive is correctly inert in this basis; do NOT wire it.
//   M2 — relativistic reading (atmosphere.js local tone / D4): does a document read in several
//        local keys? Falsifier: every window shares the global tone → one global key → D4 buys
//        nothing here.
//   M3 — incommensurability (frame-channel.js negative evidence): does the paradigm commutator
//        ever separate two readings past a within-document baseline? Falsifier: cross-region
//        never beats baseline AND cross-document does not exceed cross-region → the channel's
//        conflict never fires on real material.
import fs from 'node:fs';
import { join } from 'node:path';
import { parseText } from '../src/perceiver/parse/index.js';
import { structuralActivations, structuralHorizon, structuralCommutator } from '../src/surfer/structure-basis.js';
import { buildDensity, eigenLenses, deriveNull, projectorFrom } from '../src/core/index.js';
import { foldUnnamedFrames } from '../src/surfer/surf.js';

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const DIR = flag('--dir', process.env.READING_SOURCES || '/tmp/reading-sources');
const ALPHA = Number(flag('--alpha', '0.05'));

const SOURCES = [
  { id: 'frankenstein', file: 'frankenstein.txt', title: 'Frankenstein' },
  { id: 'metamorphosis', file: 'metamorphosis.txt', title: 'Metamorphosis' },
  { id: 'alice', file: 'alice.txt', title: "Alice's Adventures in Wonderland" },
];

const strip = (raw) => {
  const s = raw.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG/i);
  const e = raw.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  if (s < 0) return raw;
  return raw.slice(raw.indexOf('\n', s) + 1, e > s ? e : raw.length);
};
const round = (x) => Math.round(x * 1e4) / 1e4;

// Load + parse every present source once (M3 needs them together for the cross-doc commutator).
const docs = [];
for (const src of SOURCES) {
  const path = join(DIR, src.file);
  if (!fs.existsSync(path)) { console.error(`[skip ${src.id}] missing ${path} — fetch it (see header)`); continue; }
  const raw = strip(fs.readFileSync(path, 'utf8'));
  const doc = parseText(raw, { docId: src.id, genderCoref: true, lang: 'en', unnamedReferents: true });
  const { activations } = structuralActivations(doc, { relations: true });
  docs.push({ ...src, doc, acts: activations });
}
if (!docs.length) { console.error('no sources present; fetch them first (see header).'); process.exit(1); }

// ── M1: fold-before-gate ────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(78)}\nM1 — fold-before-gate: is any real frame SPLIT-MASS?  (alpha=${ALPHA})\n${'='.repeat(78)}`);
let anyFrame = 0;
for (const d of docs) {
  const { rho } = buildDensity(d.acts);
  const full = eigenLenses(rho);
  const spectrum = full.map((l) => l.weight);
  const real = spectrum.filter((w) => { const n = deriveNull(spectrum, { scale: 'linear', alpha: ALPHA, leaveOut: w }); return Number.isFinite(n) && w > n; }).length;
  const frames = foldUnnamedFrames(full, d.acts, spectrum, { alpha: ALPHA });
  anyFrame += frames.length;
  console.log(`  ${d.title.padEnd(34)} lenses=${spectrum.length}  real=${real}  unnamedFrames=${frames.length}` +
    (frames.length ? '  ' + JSON.stringify(frames.map((f) => ({ rank: f.rank, pooled: f.pooledWeight }))) : ''));
}
console.log(`  VERDICT: ${anyFrame ? `POSITIVE — ${anyFrame} split-mass frame(s) recovered; fold-before-gate has signal` : 'NEGATIVE — no split-mass frame in this basis; the Lens fold is correctly inert here'}`);

// ── M2: does a document read in several local keys? ──────────────────────────────────────────
console.log(`\n${'='.repeat(78)}\nM2 — relativistic reading: does the document read in SEVERAL LOCAL KEYS?\n${'='.repeat(78)}`);
const W = 60, STRIDE = 30;
let anyLocal = false;
for (const d of docs) {
  // Global and local BOTH in the operator basis (structuralHorizon on a profiles array is
  // op-only), so their tone labels are commensurable — comparing a relation-basis global to
  // op-basis windows would make every window "diverge" by construction.
  const global = structuralHorizon(d.doc);
  const globalTone = global.tone?.label ?? '(none)';
  const local = new Map();          // window tone label → count
  let windows = 0, diverged = 0;
  for (let i = 0; i + W <= d.acts.length; i += STRIDE) {
    const win = d.acts.slice(i, i + W).map((v) => v.slice(0, 9));   // op dims only, matching global
    const h = structuralHorizon(win);       // profiles array → op-basis horizon
    const t = h.tone?.label ?? '(none)';
    local.set(t, (local.get(t) || 0) + 1);
    windows += 1;
    if (t !== globalTone) diverged += 1;
  }
  const distinct = local.size;
  const frac = windows ? round(diverged / windows) : 0;
  if (distinct > 1) anyLocal = true;
  console.log(`  ${d.title.padEnd(34)} global="${globalTone}"  windows=${windows}  distinctLocalKeys=${distinct}  divergedFromGlobal=${frac}`);
  const spread = [...local.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`);
  console.log(`      local spread: ${spread.join('  |  ')}`);
}
console.log(`  VERDICT: ${anyLocal ? 'POSITIVE — documents read in several local keys; a relativistic read has signal' : 'NEGATIVE — one global key throughout; relativity buys nothing here'}`);

// ── M3: incommensurability — within-document vs cross-document ────────────────────────────────
console.log(`\n${'='.repeat(78)}\nM3 — incommensurability: does the paradigm commutator SEPARATE readings?\n${'='.repeat(78)}`);
const third = (acts, k) => { const n = Math.floor(acts.length / 3); return acts.slice(k * n, (k + 1) * n); };
for (const d of docs) {
  // within-document: two disjoint regions (thirds 0 and 2) vs a baseline of two halves of the middle third.
  const mid = third(d.acts, 1), h = mid.length >> 1;
  const baseline = structuralCommutator(mid.slice(0, h), mid.slice(h), { m: 3 });
  const cross = structuralCommutator(third(d.acts, 0), third(d.acts, 2), { m: 3 });
  const beats = baseline > 0 && cross > baseline * 1.5;
  console.log(`  ${d.title.padEnd(34)} withinDoc region0∦region2=${cross}  baseline=${baseline}  ${beats ? '>> beats (frames diverge within the doc)' : '(commensurable — one frame)'}`);
}
console.log('  cross-document (two different works SHOULD be more incommensurable than within one):');
for (let i = 0; i < docs.length; i++)
  for (let j = i + 1; j < docs.length; j++) {
    const c = structuralCommutator(docs[i].acts, docs[j].acts, { m: 3 });
    console.log(`      ${docs[i].id} ∦ ${docs[j].id} = ${c}`);
  }
console.log('\n(interpretation is left to the reader — this probe reports, it does not decide.)');
