// The code organ — ingests code, converts it to EOT, finds issues NATIVELY from the
// dependency order (src/organs/code/, docs/code-organ.md).
//
// Three properties pinned here:
//   1. the conversion is lossless INTO the shared medium — the lowered EOT re-parses
//      through the one ingester (organs/ingest/eot.js) with zero diagnostics, and the
//      judgments re-parse the same way (auditable means re-runnable);
//   2. the laws fire from the TUPLES in dependency order — every fixture plants one
//      violation per law and asserts the finding (and the legal twin of each case
//      asserts the absence: hoisting, closures, typeof-guards, rest-omission);
//   3. the organ reads the engine's own body — the self-read over src/core and over
//      the organ's own holon must come back with no error-grade finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCodebase, extractFacts, dependencyOrder, parseSign, HELIX, helixRank } from '../src/organs/code/index.js';
import { parseEOT } from '../src/organs/ingest/eot.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const laws = (r) => r.issues.map((f) => f.law);
const of = (r, law) => r.issues.filter((f) => f.law === law);
const errors = (r) => r.issues.filter((f) => f.severity === 'error');

// ── the structural reading (facts) ──────────────────────────────────────────────

test('facts: imports (single- and multi-line), exports, decls, scopes, references', () => {
  const f = extractFacts(`
import { alpha, beta as b } from './x.js';
import * as ns from './y.js';
import {
  gamma,
  delta,
} from './z.js';
export const one = alpha + b + gamma + delta + ns.thing;
export function two(p, q = one) { return p + q; }
export { one as uno };
export * from './z.js';
`, { path: 'm.js' });
  assert.deepEqual(f.imports.map((i) => i.local).sort(), ['alpha', 'b', 'delta', 'gamma', 'ns']);
  assert.equal(f.imports.find((i) => i.local === 'b').imported, 'beta');
  assert.equal(f.imports.find((i) => i.local === 'delta').line, 6, 'a multi-line clause binding carries its OWN line');
  assert.ok(f.decls.some((d) => d.name === 'one' && d.declKind === 'const' && d.exported));
  assert.ok(f.decls.some((d) => d.name === 'two' && d.declKind === 'function' && d.hoisted));
  assert.ok(f.decls.some((d) => d.name === 'q' && d.declKind === 'param'));
  assert.ok(f.exports.some((e) => e.name === 'uno' && e.local === 'one'));
  assert.ok(f.exports.some((e) => e.name === '*' && e.from === './z.js'), 'export * is a re-export thread');
  assert.ok(f.uses.some((u) => u.name === 'one' && u.kind === 'use'), 'a default value reads the outer binding');
});

test('facts: scopes — braced and expression arrows, for-heads, catch, class bodies', () => {
  const f = extractFacts(`
const inc = (x) => x + 1;
const dec = (y) => { return y - 1; };
for (const item of list) if (item) keep(item);
try { risky(); } catch (err) { log(err); }
class C { m(v) { return v; } }
`, { path: 's.js' });
  const byKind = {};
  for (const s of f.scopes) byKind[s.kind] = (byKind[s.kind] || 0) + 1;
  assert.ok(byKind.fn >= 3, 'both arrows and the method carve fn scopes');
  assert.ok(byKind.block >= 2, 'the brace-less for and the try carve block scopes');
  assert.ok(byKind.catch >= 1);
  assert.ok(byKind.class >= 1);
  const item = f.decls.find((d) => d.name === 'item');
  assert.notEqual(item.scopeId, 0, 'a for-head binding does NOT leak into the module scope');
  const x = f.decls.find((d) => d.name === 'x');
  assert.equal(f.scopes[x.scopeId].kind, 'fn', 'an expression-arrow param lives in its own virtual fn scope');
});

test('facts: strings, templates, regex literals and comments never leak references', () => {
  const f = extractFacts(`
const re = /["\\{(]+/g;                  // regex with quotes and braces
const s = 'phantom1 inside string';
// phantom2 inside comment
const t = \`static phantom3 \${real} more\`;
`, { path: 'r.js' });
  const names = new Set(f.uses.map((u) => u.name));
  assert.ok(!names.has('phantom1') && !names.has('phantom2') && !names.has('phantom3'));
  assert.ok(names.has('real'), 'a template interpolation is real code');
  assert.ok(!f.uses.some((u) => u.name === 'g'), 'regex flags are not identifiers');
});

// ── the lowering (EOT) ──────────────────────────────────────────────────────────

test('eot: the lowered corpus re-parses through the one ingester with zero diagnostics', () => {
  const r = readCodebase([
    { path: 'src/a.js', text: `import { f } from './b.js';\nexport const a = f(1);\n` },
    { path: 'src/b.js', text: `export function f(x) { return x; }\n` },
  ]);
  const parsed = parseEOT(r.eotText);
  assert.equal(parsed.diagnostics.length, 0, 'the code dialect is canonical EOT');
  assert.ok(r.eotText.includes('mod:src-a : Module'));
  assert.ok(r.eotText.includes('mod:src-a -> mod:src-b : imports'), 'the module-grain bond the order reads');
  assert.ok(/dcl:src-b:L1:c\d+:f : Function/.test(r.eotText), 'a declaration is an INS with its site in the sign');
  assert.ok(/use:src-a:L2:c\d+:f -> sc:src-a:s0:module : within/.test(r.eotText), 'a reference is one CON line');
});

test('eot: the corpus doc lands on the engine log through the PERCEIVER door', () => {
  const r = readCodebase([{ path: 'a.js', text: 'export const one = 1;\n' }]);
  const events = r.doc.log.snapshot();
  assert.ok(events.length > 0);
  assert.ok(events.every((e) => e.door === 'perceiver'), 'source read from disk is the world — exafference');
  assert.equal(r.doc.diagnostics.length, 0);
  assert.ok(typeof r.doc.projectGraph === 'function', 'the corpus graph projects like any other reading');
});

test('eot: parseSign inverts the sign grammar', () => {
  assert.deepEqual(parseSign('dcl:src-a:L3:c14:alpha'),
    { kind: 'dcl', mod: 'src-a', line: 3, col: 14, name: 'alpha' });
  assert.equal(parseSign('sc:m:s2:fn').scopeKind, 'fn');
  assert.equal(parseSign('ex:m:uno').name, 'uno');
});

// ── the dependency order (helix) ────────────────────────────────────────────────

test('helix: modules order dependencies-first; cycles are found with their members', () => {
  const r = readCodebase([
    { path: 'app.js', text: `import { l } from './lib.js'; import { u } from './util.js'; export const a = l + u;\n` },
    { path: 'lib.js', text: `import { u } from './util.js'; export const l = u;\n` },
    { path: 'util.js', text: 'export const u = 1;\n' },
  ]);
  const o = r.order.order.filter((s) => s.startsWith('mod:'));
  assert.ok(o.indexOf('mod:util') < o.indexOf('mod:lib'), 'a dependency folds before its importer');
  assert.ok(o.indexOf('mod:lib') < o.indexOf('mod:app'));
  assert.equal(r.order.cycles.length, 0);

  const c = readCodebase([
    { path: 'p.js', text: `import { q } from './q.js'; export const p = 1;\n` },
    { path: 'q.js', text: `import { p } from './p.js'; export const q = 2;\n` },
  ]);
  assert.equal(c.order.cycles.length, 1);
  assert.deepEqual([...c.order.cycles[0]].sort(), ['mod:p', 'mod:q']);
  assert.equal(of(c, 'no-order').length, 1, 'a cycle is a finding: no dependency order exists');
});

test('helix: the nine operators keep their one surviving order', () => {
  assert.deepEqual([...HELIX], ['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC']);
  assert.ok(helixRank('INS') < helixRank('CON'), 'existence precedes structure');
  assert.ok(helixRank('CON') < helixRank('EVA'), 'structure precedes significance');
});

// ── the laws, one fixture each ──────────────────────────────────────────────────

test('law dependency: a use before its const/let/class declaration — and its legal twins', () => {
  const r = readCodebase([{ path: 'm.js', text: `
run();
const run = () => 1;
hoisted();
function hoisted() { return later; }
const later = 2;
` }]);
  const dep = of(r, 'dependency');
  assert.equal(dep.length, 1, 'exactly one premature bond');
  assert.equal(dep[0].name, 'run');
  assert.equal(dep[0].line, 2);
  assert.equal(dep[0].severity, 'error');
  // hoisted() before its function declaration: legal. `later` inside the function
  // body before its declaration line: a closure, deferred — legal.
});

test('law void-binding + fabrication: a thread that never binds, and the use of it', () => {
  const r = readCodebase([
    { path: 'a.js', text: `import { real, missing } from './b.js';\nexport const x = real + missing;\n` },
    { path: 'b.js', text: 'export const real = 1;\n' },
  ]);
  assert.equal(of(r, 'void-binding').length, 1, 'the held thread that never binds');
  assert.equal(of(r, 'void-binding')[0].name, 'missing');
  assert.equal(of(r, 'fabrication').length, 1, 'dwelling is legal; the USE is the fabrication');
  assert.equal(of(r, 'fabrication')[0].line, 2);
  assert.ok(!laws(r).includes('unbound'), 'the import site itself is not double-reported');
});

test('law unbound: no scope, no import, no global — with the typeof-dwell exempt', () => {
  const r = readCodebase([{ path: 'm.js', text: `
console.log(Math.max(1, 2));                       // globals — the host, not the Void
export const x = phantom + 1;
if (typeof maybe !== 'undefined') { void 0; }      // a typeof test may dwell
` }]);
  const u = of(r, 'unbound');
  assert.equal(u.length, 1);
  assert.equal(u[0].name, 'phantom');
});

test('law contract-violation: a write to a const or an import binding', () => {
  const r = readCodebase([
    { path: 'm.js', text: `
import { dep } from './d.js';
const FIXED = 1;
let open = 1;
FIXED = 2;
open = 2;
dep = 3;
export const out = FIXED + open + dep;
` },
    { path: 'd.js', text: 'export const dep = 1;\n' },
  ]);
  const v = of(r, 'contract-violation');
  assert.deepEqual(v.map((f) => f.name).sort(), ['FIXED', 'dep']);
  assert.ok(v.every((f) => f.severity === 'error'));
});

test('law collision: two declarations claim one name in one scope; var+var stays legal', () => {
  const r = readCodebase([{ path: 'm.js', text: `
let dup = 1;
let dup = 2;
var again = 1;
var again = 2;
export const keep = dup + again;
` }]);
  const c = of(r, 'collision');
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'dup');
});

test('law cycle-tdz: a top-level read across a cycle warns; an arrow-deferred read does not', () => {
  const r = readCodebase([
    { path: 'c.js', text: `import { d } from './d.js';\nexport const c = () => d;\n` },
    { path: 'd.js', text: `import { c } from './c.js';\nexport const d = c;\n` },
  ]);
  const w = of(r, 'cycle-tdz');
  assert.equal(w.length, 1, 'only the DIRECT top-level read is hazardous');
  assert.equal(w[0].name, 'c');
  assert.equal(w[0].path, 'd.js');
});

test('laws dead-entity + dwell: never read, never drawn on — with the deliberate exemptions', () => {
  const r = readCodebase([
    { path: 'm.js', text: `
import { used, spare } from './d.js';
const dead = 1;
const _intentional = 2;
const { drop, ...content } = used;
export const out = content;
` },
    { path: 'd.js', text: 'export const used = { drop: 1 };\nexport const spare = 2;\n' },
  ]);
  assert.deepEqual(of(r, 'dead-entity').map((f) => f.name), ['dead'],
    '_-prefixed and rest-omission siblings are set aside on purpose');
  assert.deepEqual(of(r, 'dwell').map((f) => f.name), ['spare']);
  assert.ok(of(r, 'dwell').every((f) => f.severity === 'note'), 'dwelling is legal');
});

test('law dead-export: closed world only, entries exempt', () => {
  const files = [
    { path: 'entry.js', text: `import { used } from './lib.js';\nexport const main = used;\n` },
    { path: 'lib.js', text: 'export const used = 1;\nexport const orphan = 2;\n' },
  ];
  const open = readCodebase(files);
  assert.equal(of(open, 'dead-export').length, 0, 'the open world exports to whom it may concern');
  const closed = readCodebase(files, { closedWorld: true, entries: ['entry.js'] });
  assert.deepEqual(of(closed, 'dead-export').map((f) => f.name), ['orphan']);
  assert.ok(!of(closed, 'dead-export').some((f) => f.name === 'main'), 'the entry is a root');
});

test('re-export chains bind across modules (export … from, export *)', () => {
  const r = readCodebase([
    { path: 'a.js', text: `import { deep, star } from './hub.js';\nexport const a = deep + star;\n` },
    { path: 'hub.js', text: `export { deep } from './src1.js';\nexport * from './src2.js';\n` },
    { path: 'src1.js', text: 'export const deep = 1;\n' },
    { path: 'src2.js', text: 'export const star = 2;\n' },
  ]);
  assert.equal(errors(r).length, 0, 'both the named re-export and the star fan bind');
});

// ── the judgments (enactor door) ────────────────────────────────────────────────

test('judgments: the issue report is EOT — re-parses cleanly, every line an EVA', () => {
  const r = readCodebase([{ path: 'm.js', text: 'export const x = phantom;\n' }]);
  assert.ok(r.issues.length > 0);
  const parsed = parseEOT(r.issuesEot);
  assert.equal(parsed.diagnostics.length, 0, 'auditable means re-runnable');
  assert.equal(parsed.events.length, r.issues.length, 'one EVA per finding');
  assert.ok(parsed.events.every((e) => e.op === 'EVA'), 'a finding is a judgment');
  assert.ok(parsed.events.every((e) => e.agent === 'organ:code'), 'the judge signs its lines');
  assert.ok(r.issuesEot.includes('use:m:L1:c18:phantom'), 'each judgment cites the witnessed sign');
});

test('judgments: findings order — errors first, then warns, then notes; by site within', () => {
  const r = readCodebase([
    { path: 'p.js', text: `import { q } from './q.js';\nconst unused = 1;\nexport const p = phantom;\n` },
    { path: 'q.js', text: `import { p } from './p.js';\nexport const q = p;\n` },
  ]);
  const sev = r.issues.map((f) => f.severity);
  const rank = { error: 0, warn: 1, note: 2 };
  for (let i = 1; i < sev.length; i++) assert.ok(rank[sev[i - 1]] <= rank[sev[i]]);
});

// ── the self-read — the organ reads the engine's own body ───────────────────────

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  return e.name.endsWith('.js') ? [p] : [];
});
const load = (dir) => walk(path.join(ROOT, dir)).map((p) => ({
  path: path.relative(ROOT, p), text: readFileSync(p, 'utf8'),
}));

test('self-read: the organ reads ITSELF and finds no error-grade issue', () => {
  const r = readCodebase(load('src/organs/code'), { doc: false });
  assert.equal(r.order.cycles.length, 0, 'the organ\'s own holon is acyclic');
  const errs = errors(r);
  assert.equal(errs.length, 0,
    `the organ must pass its own reading:\n${errs.map((f) => `  ${f.path}:${f.line} ${f.law} ${f.name}`).join('\n')}`);
});

test('self-read: the genome (src/core) parses, orders, and carries no error-grade issue', () => {
  const r = readCodebase(load('src/core'), { doc: false });
  assert.ok(r.events.length > 5000, 'the reading is substantial, not a stub');
  const errs = errors(r);
  assert.equal(errs.length, 0,
    `src/core must read clean:\n${errs.map((f) => `  ${f.path}:${f.line} ${f.law} ${f.name}`).join('\n')}`);
  const parsed = parseEOT(r.eotText);
  assert.equal(parsed.diagnostics.length, 0, 'the whole genome lowers to canonical EOT');
});
