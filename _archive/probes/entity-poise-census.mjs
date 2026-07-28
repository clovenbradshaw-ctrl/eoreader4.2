// Step 0 of "entity typing — emanons, protogons, and the motion between them" (the spec).
// The trimodality GATE. Cheap, read-only, allowed to come back negative and STOP the build.
//
//   node probes/entity-poise-census.mjs [book.txt]
//
// With no argument it reads data/metamorphosis.txt; point it at any plain-text book (a
// Gutenberg .txt, boilerplate stripped) for a real run. It PARSES the book on the real spine
// (perceiver/parse), projects the graph, detects holons (surfer/holons.detectHolons), and drives
// deep reading (surfer/fold.deepReading) — then, per referent, reads the four signals the type
// scheme rests on and prints the joint distribution, the pairwise correlations, the pure-figure
// population, and the grain-vs-triad agreement. It asserts NOTHING. It prints a report and, for
// each named falsifier (F1/F4/F5/F6), a PASS / FALSIFIED verdict.
//
// The three types live on the grain axis, read as regions of the Figure–Pattern–Ground simplex:
// the Ground corner is emanon, the Pattern corner is protogon, the center is holon, and the
// Figure corner is the (possibly-a-fourth-type) debt. This probe decides whether a real corpus
// actually OCCUPIES those attractors. If referents smear, there are no attractors and typing
// classifies noise — no modes, no thresholds, the build stops here.
//
//   F1  the gate       — is the joint (closure, escapes, forming) trimodal, or a smear?
//   F4  collapse        — are the three signals one axis wearing three names?
//   F5  fourth corner   — is the figure-pure region bare names (a debt) or stable entities?
//   F6  over-fit        — does grain-balance just relabel triad (domain) dominance?
//
// The thresholds that would separate the types are meant to be READ OFF the modes this prints,
// not invented; this probe hands back the natural cut points (or reports there are none).

import fs from 'node:fs';
import { parseText } from '../src/perceiver/parse/index.js';
import { projectGraph, terrainInfo } from '../src/core/index.js';
import { TERRAIN_GRAIN } from '../src/model/bands.js';
import { detectHolons } from '../src/surfer/holons.js';
import { surfFold } from '../src/surfer/index.js';
import { deepReading } from '../src/surfer/fold/index.js';

// ── report helpers (the repo's probe style) ─────────────────────────────────────────
const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(22)} ${v}`);
const verdict = (ok, msg) => console.log(`  ${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFALSIFIED\x1b[0m'} — ${msg}`);
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const r3 = (x) => Math.round(x * 1e3) / 1e3;

// ── the corpus ──────────────────────────────────────────────────────────────────────
const stripGutenberg = (raw) => {
  const s = raw.indexOf('*** START');
  const e = raw.indexOf('*** END');
  if (s < 0) return raw;
  const from = raw.indexOf('\n', s) + 1;
  return raw.slice(from, e > from ? e : raw.length);
};

const arg = process.argv[2] || 'data/metamorphosis.txt';
const rawPath = fs.existsSync(arg) ? arg : new URL(`../${arg}`, import.meta.url).pathname;
const raw = stripGutenberg(fs.readFileSync(rawPath, 'utf8'));
const docId = arg.split('/').pop();

h(`CENSUS — ${docId}`);
console.time('  parse');
const doc = parseText(raw, { docId, genderCoref: true });
console.timeEnd('  parse');
const log = doc.log.snapshot ? doc.log.snapshot() : doc.log;
const graph = projectGraph(doc.log);
const rep = graph.representative || ((x) => x);
const labelOf = (id) => graph.entities.get(rep(id))?.label || id;
kv('sentences', doc.units.length);
kv('events', log.length);
kv('graph entities', graph.entities.size);
kv('graph edges', (graph.edges || []).length);

// ── the four signals, per referent ───────────────────────────────────────────────────
// Every event carries `eo.terrain` — the Site the operation lands on. TERRAIN_GRAIN maps that
// terrain to a grain (Ground/Figure/Pattern); terrainInfo maps it to a domain (Existence /
// Structure / Interpretation = the triad's existence / structure / significance). We bin each
// referent's sightings by BOTH: the grain vector is the simplex position, the domain vector is
// the triad-dominance F6 compares against.
const GRAINS = ['Figure', 'Pattern', 'Ground'];
const DOMAINS = ['Existence', 'Structure', 'Interpretation'];

// the referents an event touches (as subject/endpoint) → their representative ids.
const touchedBy = (e) => {
  const ids = new Set();
  const add = (x) => { if (x != null && typeof x === 'string') ids.add(rep(x)); };
  if (e.id) add(e.id);
  if (e.src) add(e.src);
  if (e.tgt && e.tgtKind == null) add(e.tgt);   // a typed-entity endpoint, not an np phrase
  if (e.a) add(e.a);
  if (e.b) add(e.b);
  return ids;
};

// per-referent accumulators
const R = new Map();   // id → record
const rec = (id) => {
  let x = R.get(id);
  if (!x) { x = { id, sightings: 0, grain: { Figure: 0, Pattern: 0, Ground: 0 },
                  domain: { Existence: 0, Structure: 0, Interpretation: 0 },
                  escapes: 0, recEscapes: 0, forming: 0, closure: 0, degree: 0, grainDef: false };
            R.set(id, x); }
  return x;
};

for (const e of log) {
  const terrain = e.eo?.terrain || null;
  const info = terrain ? terrainInfo(terrain) : null;
  const grain = info?.grain || (terrain ? TERRAIN_GRAIN[terrain] : null);
  const domain = info?.domain || null;
  for (const id of touchedBy(e)) {
    const x = rec(id);
    if (e.op === 'INS') x.sightings++;
    if (grain) x.grain[grain] += 1;
    if (domain) x.domain[domain] += 1;
    // escapes — the emanon signal: instrumentation that did NOT hold. In the wiki this is a REC
    // held:false (migrate.js); at parse grain the analogue is a merge/identity RETRACTED or left
    // INDETERMINATE, and a naming reframed away — a ground-dominant subject resisting figure-
    // dominant instrumentation. Both are counted; the REC form is reported separately.
    if (e.op === 'REC' && e.held === false) { x.escapes++; x.recEscapes++; }
    if (e.op === 'SEG' && e.kind === 'retract') x.escapes++;
    if (e.op === 'EVA' && (e.verdict === 'contradicted' || e.verdict === 'indeterminate')) x.escapes++;
    // grain DEF — the reader committed a grain judgment for this referent (grain.js).
    if (e.op === 'DEF' && e.key === 'grain') x.grainDef = true;
  }
}

// degree — witnessed connectivity in the projected graph (is it bound to anything?).
for (const e of (graph.edges || [])) {
  const a = rep(e.from), b = rep(e.to);
  if (R.has(a)) R.get(a).degree++;
  if (R.has(b)) R.get(b).degree++;
}

// closure — the holon signal: over the region's own units, how much of each unit's Born mass its
// dominant lens captures (holons.js). A referent participates in a holon's closure when it is ON
// STAGE in that holon's span — so we assign closure by SCENE COVERAGE, not by the truncated top-5
// cast list (which would leave every minor figure at 0). Over each referent's sightings, find the
// covering holon and take the sighting-weighted mean of those holons' closure — the average
// coherence of the scenes the referent actually appears in. `castMax` keeps the stronger cast-
// membership reading alongside it for referents that HEAD a holon.
const holo = detectHolons(doc, {});
const holonAt = (u) => { for (const hol of holo.holons) if (u >= hol.lo && u < hol.hi) return hol; return null; };
const cloAccum = new Map();   // id → { sum, n }
for (const e of log) {
  if (e.op !== 'INS' || !Number.isInteger(e.sentIdx)) continue;
  const id = rep(e.id); if (!R.has(id)) continue;
  const hol = holonAt(e.sentIdx); if (!hol) continue;
  const a = cloAccum.get(id) || { sum: 0, n: 0 };
  a.sum += hol.closure; a.n += 1; cloAccum.set(id, a);
}
for (const [id, a] of cloAccum) if (a.n) R.get(id).closure = a.sum / a.n;
for (const hol of holo.holons) for (const c of (hol.cast || [])) {
  const id = rep(c.id); if (R.has(id)) R.get(id).castMax = Math.max(R.get(id).castMax || 0, hol.closure);
}

// forming — the protogon signal: a candidate the reading circles but the document has not yet
// witnessed (promote.js Tier 1 / a deepReading reflection, grounded:false, canWitness:false). We
// drive deepReading across the book, accumulating a `visited` set so each call finds a fresh peak,
// and tally the reflections by their focus referent. Capped so a long book stays a cheap probe.
const FORMING_STEPS = Math.min(80, Math.max(20, Math.round(doc.units.length / 40)));
const visited = new Set();
let reflections = 0;
const labelToId = new Map();
for (const [id, ent] of graph.entities) if (ent.label) labelToId.set(ent.label, rep(id));
for (let i = 0; i < FORMING_STEPS; i++) {
  const anchor = Math.floor((i / FORMING_STEPS) * doc.units.length);
  let ref = null;
  try { ref = deepReading(doc, { surf: surfFold, anchor, visited, commit: false }); } catch { ref = null; }
  if (!ref) continue;
  reflections++;
  if (Number.isInteger(ref.peak)) visited.add(ref.peak);
  const id = ref.focus ? labelToId.get(ref.focus) : null;
  if (id && R.has(id)) R.get(id).forming++;
}

// ── the referent universe: recurring figures (drop singletons — noise, not attractors) ──
const MIN_SIGHT = 3;
const refs = [...R.values()].filter((x) => x.sightings >= MIN_SIGHT);
kv('referents (≥3 sightings)', `${refs.length}  of ${R.size} total`);
kv('deep reflections', `${reflections} over ${FORMING_STEPS} surfs`);
const totalRecEscapes = [...R.values()].reduce((s, x) => s + x.recEscapes, 0);
kv('REC held:false (wiki)', `${totalRecEscapes}  ${totalRecEscapes === 0 ? '(none in a bare book parse — see note)' : ''}`);

// normalise the grain vector to a simplex position per referent
for (const x of refs) {
  const g = x.grain, tot = g.Figure + g.Pattern + g.Ground || 1;
  x.fig = g.Figure / tot; x.pat = g.Pattern / tot; x.gnd = g.Ground / tot;
  const d = x.domain, dt = d.Existence + d.Structure + d.Interpretation || 1;
  x.dExi = d.Existence / dt; x.dStr = d.Structure / dt; x.dInt = d.Interpretation / dt;
}

// ── signal liveness — which columns actually carry variance in THIS corpus ──────────────
// A falsifier verdict on a dead column is meaningless (a zero-variance signal correlates 0 with
// everything, and never lands a referent in a corner). Report the nonzero fraction up front so a
// PASS driven by an absent signal is visible for what it is.
h('signal liveness — nonzero fraction per referent');
const nz = (f) => refs.filter((x) => f(x) > 0).length / (refs.length || 1);
kv('closure > 0', pct(nz((x) => x.closure)));
kv('escapes > 0', `${pct(nz((x) => x.escapes))}  ${nz((x) => x.escapes) < 0.1 ? '← near-dead: emanon signal lives in the wiki layer, not a bare book parse' : ''}`);
kv('forming > 0', pct(nz((x) => x.forming)));
kv('figure-dominant', `${pct(refs.filter((x) => x.fig >= Math.max(x.pat, x.gnd)).length / (refs.length || 1))}  ← the Figure corner`);

// ── F1 — the gate: is the joint (closure, escapes, forming) trimodal, or a smear? ───────
h('F1 — the gate: modes in the joint (closure · escapes · forming)');
// The three types are simplex regions. Discretise each referent into a corner by its dominant
// grain, then split the center out by closure. If the population piles into distinct cells
// (emanon / protogon / holon / figure) rather than spreading evenly, there are attractors.
// The closure cut is read off the corpus (median participated closure) — scene closure runs high,
// so a fixed 0.8 would not discriminate; the median is where this corpus actually splits.
const cloVals = refs.map((x) => x.closure).filter((c) => c > 0).sort((a, b) => a - b);
const CLO_HI = cloVals.length ? cloVals[Math.floor(0.5 * (cloVals.length - 1))] : 0.8;
kv('closure cut (median)', r3(CLO_HI));
const cornerOf = (x) => {
  const m = Math.max(x.fig, x.pat, x.gnd);
  if (x.gnd === m && x.escapes > 0 && x.closure < CLO_HI) return 'emanon (Ground+escape)';
  if (x.pat === m && x.forming > 0 && x.closure < CLO_HI) return 'protogon (Pattern+forming)';
  if (x.closure >= CLO_HI && x.fig > 0 && x.pat > 0 && x.gnd > 0) return 'holon (center, high closure)';
  if (x.fig === m && x.pat < 0.1 && x.gnd < 0.1) return 'figure (bare name — the debt)';
  return 'null (unclassified)';
};
const corners = {};
for (const x of refs) { const c = cornerOf(x); corners[c] = (corners[c] || 0) + 1; }
for (const [c, n] of Object.entries(corners).sort((a, b) => b[1] - a[1]))
  kv(c, `${n}  (${pct(n / (refs.length || 1))})`);

// closure histogram — the shape that gives the holon cut. A trough between a low-closure mass and
// a high-closure mass is a real mode boundary; a flat/unimodal spread is not.
const clo = refs.map((x) => x.closure).sort((a, b) => a - b);
const bins = new Array(10).fill(0);
for (const c of clo) bins[Math.min(9, Math.floor(c * 10))]++;
kv('closure deciles', bins.map((n) => n).join(' '));
// a crude dip test: the emptiest interior decile between the two tallest.
const modePeak = bins.indexOf(Math.max(...bins));
let trough = -1, troughVal = Infinity;
for (let i = 1; i < 9; i++) if (bins[i] < troughVal) { troughVal = bins[i]; trough = i; }
kv('closure mode / trough', `peak@0.${modePeak} · thinnest interior decile 0.${trough} (${troughVal})`);
const classified = refs.length - (corners['null (unclassified)'] || 0);
const smear = classified / (refs.length || 1) < 0.5;
verdict(!smear && refs.length >= 8,
  refs.length < 8 ? `only ${refs.length} recurring referents — corpus too small to read modes; run on a longer book`
  : smear ? `${pct((corners['null (unclassified)'] || 0) / refs.length)} land in NULL — the joint is a smear, not trimodal; keep the scalars, cut the vocabulary`
  : `${pct(classified / refs.length)} of referents fall into a named corner — the attractors are occupied; cut points below`);

// ── F4 — collapse: are the three signals one axis wearing three names? ───────────────────
h('F4 — collapse: pairwise correlation of the signals');
const pearson = (xs, ys) => {
  const n = xs.length; if (n < 3) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx === 0 || syy === 0) ? 0 : sxy / Math.sqrt(sxx * syy);
};
const col = (f) => refs.map(f);
const pairs = [
  ['closure · escapes', col((x) => x.closure), col((x) => x.escapes)],
  ['closure · forming', col((x) => x.closure), col((x) => x.forming)],
  ['escapes · forming', col((x) => x.escapes), col((x) => x.forming)],
  ['closure · gnd-mass', col((x) => x.closure), col((x) => x.gnd)],
  ['escapes · gnd-mass', col((x) => x.escapes), col((x) => x.gnd)],
  ['forming · pat-mass', col((x) => x.forming), col((x) => x.pat)],
];
let maxAbs = 0;
for (const [name, xs, ys] of pairs) { const r = pearson(xs, ys); maxAbs = Math.max(maxAbs, Math.abs(r) || 0); kv(name, Number.isNaN(r) ? 'n/a' : r3(r)); }
verdict(maxAbs < 0.9,
  maxAbs < 0.9 ? `no pair exceeds |0.9| (max ${r3(maxAbs)}) — the signals carry independent information`
  : `a pair is near-collinear (|${r3(maxAbs)}|) — the three-way balance may be one axis; ablate before trusting the type`);

// ── F5 — the fourth corner: is figure-pure a debt (bare names) or stable entities? ──────
h('F5 — the fourth corner: the figure-pure population');
// Structural note: every referent is INS'd into the Void (a naming — Ground mass), so a literally
// ground-free figure cannot exist in this reading model. Figure-pure is therefore read as FIGURE-
// DOMINANT with negligible PATTERN uptake (a name the corpus bounds but never bonds or categorises).
const figurePure = refs.filter((x) => x.fig === Math.max(x.fig, x.pat, x.gnd) && x.pat < 0.15);
const groundFloor = refs.length ? Math.min(...refs.map((x) => x.gnd)) : 0;
kv('ground floor (min gnd mass)', `${r3(groundFloor)}  (naming always grounds — no literal figure-pure)`);
kv('figure-dominant, low-pattern', `${figurePure.length}  (${pct(figurePure.length / (refs.length || 1))})`);
// a "bare name" owes the reading its ground and its pattern: it is NOT connected elsewhere and the
// reader never committed a grain for it. A "stable entity" is grounded/connected — which would
// force a fourth type rather than a debt.
let bare = 0, stable = 0;
// grounded elsewhere = the corpus BONDED it (graph degree) or COMMITTED a grain for it. Scene
// closure is a region property, not a mark of the referent's own standing, so it is not the test.
for (const x of figurePure) {
  const grounded = x.degree >= 2 || x.grainDef;
  if (grounded) { stable++; } else { bare++; }
}
for (const x of figurePure.slice(0, 12).sort((a, b) => b.sightings - a.sightings))
  kv(`· ${labelOf(x.id)}`, `sight ${x.sightings} · deg ${x.degree} · closure ${r3(x.closure)} · grainDef ${x.grainDef} · fig ${r3(x.fig)}`);
kv('bare names (a debt)', bare);
kv('stable entities (force a 4th type)', stable);
verdict(figurePure.length === 0 || bare >= stable,
  figurePure.length === 0 ? 'the figure corner is empty here — three corners, no fourth'
  : bare >= stable ? `the figure corner is mostly bare names (${bare} vs ${stable}) — a debt to route to the blind-spot surface, not a fourth type`
  : `the figure corner holds ${stable} stable, connected entities — the triangle may be a tetrahedron; a fourth type is in play`);

// ── F6 — over-fit: does grain-balance just relabel triad (domain) dominance? ────────────
h('F6 — over-fit: grain-balance vs triad (domain) dominance');
const argmax3 = (a, b, c, names) => { const m = Math.max(a, b, c); return a === m ? names[0] : b === m ? names[1] : names[2]; };
const grainDom = (x) => argmax3(x.fig, x.pat, x.gnd, ['Figure', 'Pattern', 'Ground']);
const domainDom = (x) => argmax3(x.dExi, x.dStr, x.dInt, ['Existence', 'Structure', 'Interpretation']);
// the two partitions align by design (Existence↔Ground-ish, Structure↔Pattern-ish); the question
// is whether they are the SAME partition. We measure agreement under the natural pairing that
// maximises the diagonal, then report it.
const gCount = {}, dCount = {}, cross = {};
for (const x of refs) {
  const g = grainDom(x), d = domainDom(x);
  gCount[g] = (gCount[g] || 0) + 1; dCount[d] = (dCount[d] || 0) + 1;
  cross[`${g} · ${d}`] = (cross[`${g} · ${d}`] || 0) + 1;
}
kv('grain dominance', Object.entries(gCount).map(([k, v]) => `${k}:${v}`).join('  '));
kv('domain dominance', Object.entries(dCount).map(([k, v]) => `${k}:${v}`).join('  '));
// natural pairing Figure↔Existence, Pattern↔Structure, Ground↔Interpretation is NOT the identity
// the terrains use (grain and domain are orthogonal cube axes) — so agreement is the fraction on
// the best matching. We compute the max-diagonal over the mapping that lines the two up by their
// terrain co-membership: Figure~Existence? No — pick the empirical best mapping.
const gLevels = ['Figure', 'Pattern', 'Ground'], dLevels = ['Existence', 'Structure', 'Interpretation'];
// try all 6 bijections, take the one maximising agreement (the over-fit is worst-case)
const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
let bestAgree = 0, bestMap = null;
for (const p of perms) {
  let agree = 0;
  for (const x of refs) if (dLevels[p[gLevels.indexOf(grainDom(x))]] === domainDom(x)) agree++;
  if (agree > bestAgree) { bestAgree = agree; bestMap = p; }
}
const agreeRate = bestAgree / (refs.length || 1);
kv('best grain→domain map', bestMap ? gLevels.map((g, i) => `${g}→${dLevels[bestMap[i]]}`).join('  ') : 'n/a');
kv('agreement (best case)', pct(agreeRate));
console.log('  \x1b[2m(caveat: grain and domain are two orthogonal coordinates of the SAME eo.terrain; deriving');
console.log('   both from one event-terrain histogram makes them collinear wherever a corpus concentrates on');
console.log('   a few terrains — here Void (Ground·Existence) for sightings and Network (Pattern·Structure) for');
console.log('   bonds. A clean F6 needs an INDEPENDENT grain read (grain.js commitments) or a wiki corpus.)\x1b[0m');
verdict(agreeRate < 0.9,
  agreeRate < 0.9 ? `grain-balance and triad-dominance disagree ${pct(1 - agreeRate)} of the time — grain carries its own cut`
  : `grain-balance ≈ triad-dominance (${pct(agreeRate)} agree) — the type may be a relabeling of the triad you already compute`);

// ── the cut points handed back ───────────────────────────────────────────────────────
h('cut points (read off this corpus — the thresholds are found, not invented)');
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))] ?? 0; };
kv('closure holon-cut ~', `${r3(q(clo, 0.66))}  (66th pct of participated closure)`);
kv('ground-dominant ~', `gnd > ${r3(q(refs.map((x) => x.gnd), 0.66))}  (66th pct of ground mass)`);
kv('escape floor ~', `escapes ≥ ${q(refs.map((x) => x.escapes), 0.75) || 1}  (75th pct)`);

console.log('\nNote: `escapes` here combines the wiki REC held:false signal (0 in a bare book parse — that');
console.log('signal lives in the migrate/wiki layer) with the parse-grain analogue: retracted/indeterminate');
console.log('merges and reframed namings — instrumentation that did not hold. `forming` is driven from real');
console.log('deepReading reflections. A wiki-corpus run would populate REC held:false directly.');
console.log('\nDone. This probe asserts nothing; it prints a report and the F1/F4/F5/F6 verdicts.');
