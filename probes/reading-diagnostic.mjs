// READING DIAGNOSTIC — run the real EO reading pipeline over a source and ask the essay
// questions it was written for, then print what the reading can and cannot do, so the failures
// become a backlog. Model-free, offline, deterministic. This is the "find problems with the
// reading" pass of the search-answer-descent loop: it asserts nothing, it reports.
//
//   node probes/reading-diagnostic.mjs [id] [--dir <sources-dir>]
//
// Texts are NOT committed; fetch them first (see probes/reading-diagnostic-questions.mjs for the
// exact URLs and how to place them). --dir defaults to $READING_SOURCES or /tmp/reading-sources.
// With no id it runs every source in the battery; with an id (911, quijote, hamlet, macbeth,
// lear, othello, tempest) it runs just that one. Per source it prints:
//   • the entity census — top figures by mention, with WELD/LONG-WELD tells and the
//     one-head→many-labels fragmentation the reference session chased
//   • per question — routeDomain, the answerable/void verdict, whether the figures the
//     question names resolve to admitted referents, and the top coarseSurf regions
import fs from 'node:fs';
import { join } from 'node:path';
import { parseText } from '../src/perceiver/parse/index.js';
import { namedReferents } from '../src/perceiver/index.js';
import { projectGraph } from '../src/core/index.js';
import { encodeLevels, coarseSurf, routeDomain } from '../src/surfer/levels.js';
import { fieldVerdict } from '../src/surfer/answerable.js';
import { BATTERY } from './reading-diagnostic-questions.mjs';

const argv = process.argv.slice(2);
const dirFlag = argv.indexOf('--dir');
const DIR = dirFlag >= 0 ? argv[dirFlag + 1]
  : (process.env.READING_SOURCES || '/tmp/reading-sources');
const only = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--dir') || null;

// Strip the Project Gutenberg licence frame — the reading is of the WORK. (PDF-born sources like
// 911.txt have no frame; the slice is a no-op there.)
const stripFrame = (raw) => {
  const s = raw.search(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG/i);
  const e = raw.search(/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG/i);
  if (s < 0) return raw;
  return raw.slice(raw.indexOf('\n', s) + 1, e > s ? e : raw.length);
};

const sources = only ? BATTERY.filter((b) => b.id === only) : BATTERY;
if (!sources.length) { console.error(`no source '${only}'. ids: ${BATTERY.map((b) => b.id).join(', ')}`); process.exit(1); }

const WELD = /\b(the|a|an|and|but|of|to|in|on|said|cried|for|with|that|thou|thy|thee)\b/i;

for (const src of sources) {
  const path = join(DIR, src.file);
  if (!fs.existsSync(path)) { console.error(`\n[skip ${src.id}] missing ${path} — fetch it (see reading-diagnostic-questions.mjs)`); continue; }
  const raw = stripFrame(fs.readFileSync(path, 'utf8'));
  console.log(`\n${'='.repeat(78)}\n${src.title}  [${src.id}, ${src.lang}]  (${raw.length} chars)\n${'='.repeat(78)}`);
  console.time('parse');
  // Match how the reader actually parses: the unnamed-referent read (a nameless figure known only by
  // description — Frankenstein's "creature") is OFF by default, so a bare parse would miss it and
  // misreport a solved problem as open. Its synonym-fold ("monster"/"wretch" → one body) still
  // needs the talker's nameReferent hook (world knowledge), absent in this model-free probe.
  const doc = parseText(raw, { docId: src.id, genderCoref: true, lang: src.lang, unnamedReferents: true });
  console.timeEnd('parse');
  const log = doc.log.snapshot ? doc.log.snapshot() : doc.log;
  const graph = projectGraph(doc.log);
  const rep = graph.representative || ((x) => x);
  const labelOf = (id) => doc.admission?.labelOf?.(id) || graph.entities.get(rep(id))?.label || id;

  // ── entity census ────────────────────────────────────────────────────────────
  const mentions = new Map();   // rep id → count
  for (const e of log) if (e.op === 'INS' && e.id) { const id = rep(e.id); mentions.set(id, (mentions.get(id) || 0) + 1); }
  const top = [...mentions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`\nsentences=${doc.units.length}  events=${log.length}  graph.entities=${graph.entities.size}  edges=${(graph.edges || []).length}`);
  console.log('\nTOP FIGURES (mention count, label):');
  for (const [id, n] of top) {
    const lab = labelOf(id);
    const flags = [];
    if (/\s/.test(lab) && WELD.test(lab)) flags.push('WELD?');
    if (lab.split(/\s+/).length >= 4) flags.push('LONG-WELD?');
    console.log(`  ${String(n).padStart(5)}  ${lab}${flags.length ? '   << ' + flags.join(',') : ''}`);
  }
  // fragmentation: labels sharing a head token but admitted as distinct referents
  const byHead = new Map();
  for (const [id, n] of mentions) {
    const head = labelOf(id).split(/\s+/)[0].toLowerCase();
    if (!byHead.has(head)) byHead.set(head, []);
    byHead.get(head).push({ lab: labelOf(id), n });
  }
  const frags = [...byHead.entries()]
    .filter(([, v]) => v.length >= 3 && v.reduce((a, b) => a + b.n, 0) >= 8)
    .sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0)).slice(0, 8);
  if (frags.length) {
    console.log('\nPOSSIBLE FRAGMENTATION (one head → many admitted labels):');
    for (const [head, v] of frags) console.log(`  ${head}: ${v.sort((a, b) => b.n - a.n).map((x) => `${x.lab}(${x.n})`).join(', ')}`);
  }

  // ── the questions ────────────────────────────────────────────────────────────
  const enc = encodeLevels(doc, { grain: 'auto' });
  console.log(`\ncoarse spine: ${enc.segments.length} segments (grain=${enc.grain})`);
  console.log('\nQUESTIONS:');
  src.questions.forEach((q, i) => {
    const route = routeDomain(q);
    const named = namedReferents(doc, q) || [];
    const verdict = fieldVerdict(doc, q, []);
    const surf = coarseSurf(enc, q, { top: 3 });
    console.log(`\n  Q${i + 1} [${route}] ${q.slice(0, 92)}${q.length > 92 ? '…' : ''}`);
    console.log(`     answerable: ${verdict.void ? `VOID(${verdict.kind}${verdict.term ? ':' + verdict.term : ''})` : 'ok'}   named-referents: ${named.length ? named.map((r) => r.label || r.id || r).slice(0, 5).join(', ') : '— none —'}`);
    if (!surf.regions.length) console.log('     regions: — NONE —');
    for (const r of surf.regions) console.log(`     region s${r.lo}-${r.hi} score=${r.score} figs=[${r.figures.map((f) => f.label).slice(0, 4).join(', ')}]  "${r.title.slice(0, 46)}"`);
  });
}
