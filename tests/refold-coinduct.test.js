// Assembly 3 (Logic Gaps v0.1) — the cycle is a holon boundary.
//
//   condensation   the SCC graph is ALWAYS a DAG (a theorem, not an assertion) —
//                  pinned as a structural property on real fixtures.
//   refoldCycle    a module-grain cycle that is only a FILE-BOUNDARY artifact
//                  dissolves at declaration grain.
//   coherenceOf    legitimate mutual recursion (external ground) reads coherent;
//                  a pure circular justification (no external ground) reads
//                  incoherent, with every member named as breach.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readCodebase, dependencyOrder, tarjanSCC, refoldCycle, declGraphOf, coherenceOf } from '../src/organs/code/index.js';

// ── condensation is always a DAG ──────────────────────────────────────────────────

test('condensation: the SCC graph of a fixture with a real cycle has no cycle of its own', () => {
  const { order } = readCodebase([
    { path: 'app.js', text: `import { l } from './lib.js'; import { u } from './util.js'; export const a = l + u;\n` },
    { path: 'lib.js', text: `import { u } from './util.js'; export const l = u;\n` },
    { path: 'util.js', text: 'export const u = 1;\n' },
    { path: 'p.js', text: `import { q } from './q.js'; export function p() { return q(); }\n` },
    { path: 'q.js', text: `import { p } from './p.js'; export function q() { return p(); }\n` },
  ]);
  assert.ok(order.cycles.length >= 1, 'this fixture has a real module-grain cycle');
  const { nodes, edgesOf } = order.condensation;
  const sccOfCondensation = tarjanSCC(nodes, edgesOf);
  const cyclesInCondensation = sccOfCondensation.filter((c) => c.length > 1 || (c.length === 1 && edgesOf(c[0]).has(c[0])));
  assert.equal(cyclesInCondensation.length, 0, 'the condensation is ALWAYS a DAG, even though the underlying module graph has a cycle');
});

test('condensation: an acyclic fixture condenses to an isomorphic (one node per module) DAG', () => {
  const { order } = readCodebase([
    { path: 'a.js', text: `export const a = 1;\n` },
    { path: 'b.js', text: `import { a } from './a.js'; export const b = a + 1;\n` },
  ]);
  assert.equal(order.cycles.length, 0);
  assert.equal(order.condensation.nodes.length, order.sccs.length);
});

// ── refoldCycle dissolves a file-boundary artifact, keeps a real cycle ────────────

test('refoldCycle: a file-boundary artifact (cross-imports, but no cross-call) dissolves at declaration grain', () => {
  const { events, order } = readCodebase([
    { path: 'a.js', text: `import { f2 } from './b.js'; export function f() { return 1; } export function useF2() { return f2(); }\n` },
    { path: 'b.js', text: `import { f } from './a.js'; export function f2() { return 2; }\n` },
  ]);
  assert.equal(order.cycles.length, 1);
  const r = refoldCycle(events, order.cycles[0]);
  assert.equal(r.resolved, true, 'f and f2 never call each other — the cross-imports are a file-boundary artifact');
  assert.deepEqual(r.irreducibleCore, []);
});

test('refoldCycle: a genuine cross-module call cycle survives (irreducible core non-empty)', () => {
  const { events, order } = readCodebase([
    { path: 'p.js', text: `import { q } from './q.js'; export function p() { return q(); }\n` },
    { path: 'q.js', text: `import { p } from './p.js'; export function q() { return p(); }\n` },
  ]);
  assert.equal(order.cycles.length, 1);
  const r = refoldCycle(events, order.cycles[0]);
  assert.equal(r.resolved, false);
  assert.ok(r.irreducibleCore.length >= 2);
});

test('refoldCycle: dissolves at least one real cycle in a synthetic corpus mimicking this repo\'s own import shape', () => {
  // the same shape docs/code-organ.md describes for a legitimate cross-file split:
  // two modules import each other's TYPES/helpers but never call into the cycle.
  const { events, order } = readCodebase([
    { path: 'shapes.js', text: `import { describeColor } from './color.js'; export function area(r) { return 3.14 * r * r; }\n` },
    { path: 'color.js', text: `import { area } from './shapes.js'; export function describeColor(c) { return c; }\n` },
  ]);
  assert.equal(order.cycles.length, 1);
  const r = refoldCycle(events, order.cycles[0]);
  assert.equal(r.resolved, true);
});

// ── coherenceOf — the greatest-fixpoint check ──────────────────────────────────────

test('coherenceOf: legitimate mutual recursion (each side also grounded outside the pair) reads coherent', () => {
  const { events, order } = readCodebase([
    { path: 'parity.js', text:
      `import { isOdd } from './odd.js';
export const ZERO = 0;
export function isEven(n) { if (n === ZERO) return true; return isOdd(n - 1); }
` },
    { path: 'odd.js', text:
      `import { isEven } from './parity.js';
export function isOdd(n) { return isEven(n - 1); }
` },
  ]);
  assert.equal(order.cycles.length, 1);
  const r = refoldCycle(events, order.cycles[0]);
  assert.equal(r.resolved, false, 'isEven and isOdd really do call each other');
  const c = coherenceOf(events, r.irreducibleCore);
  assert.equal(c.verdict, 'coherent');
  assert.ok(c.witness instanceof Map);
  assert.equal(c.breach, null);
});

test('coherenceOf: a hand-built A-because-B-because-A justification (no external ground) reads incoherent', () => {
  const { events, order } = readCodebase([
    { path: 'a.js', text: `import { b } from './b.js'; export function a() { return b(); }\n` },
    { path: 'b.js', text: `import { a } from './a.js'; export function b() { return a(); }\n` },
  ]);
  assert.equal(order.cycles.length, 1);
  const r = refoldCycle(events, order.cycles[0]);
  assert.equal(r.resolved, false);
  const c = coherenceOf(events, r.irreducibleCore);
  assert.equal(c.verdict, 'incoherent');
  assert.equal(c.witness, null);
  assert.deepEqual([...c.breach].sort(), [...r.irreducibleCore].sort());
});

test('coherenceOf: an empty scc is trivially coherent', () => {
  const c = coherenceOf([], []);
  assert.equal(c.verdict, 'coherent');
  assert.equal(c.breach, null);
});

// ── the fold: tier1/tier2/tier3, wired ─────────────────────────────────────────────

test('issues.js: a coherent, refold-irreducible cycle is reported as info-severity "cycle", never refuses', () => {
  const { issues } = readCodebase([
    { path: 'parity.js', text:
      `import { isOdd } from './odd.js';
export const ZERO = 0;
export function isEven(n) { if (n === ZERO) return true; return isOdd(n - 1); }
` },
    { path: 'odd.js', text:
      `import { isEven } from './parity.js';
export function isOdd(n) { return isEven(n - 1); }
` },
  ]);
  const found = issues.filter((f) => f.law === 'cycle');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'info');
});

test('issues.js: an incoherent cycle is reported as an error-severity "cycle-incoherent" finding', () => {
  const { issues } = readCodebase([
    { path: 'a.js', text: `import { b } from './b.js'; export function a() { return b(); }\n` },
    { path: 'b.js', text: `import { a } from './a.js'; export function b() { return a(); }\n` },
  ]);
  const found = issues.filter((f) => f.law === 'cycle-incoherent');
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, 'error');
});

test('issues.js: a dissolved (file-boundary artifact) cycle produces no cycle finding at all', () => {
  const { issues } = readCodebase([
    { path: 'a.js', text: `import { f2 } from './b.js'; export function f() { return 1; } export function useF2() { return f2(); }\n` },
    { path: 'b.js', text: `import { f } from './a.js'; export function f2() { return 2; }\n` },
  ]);
  assert.equal(issues.filter((f) => f.law === 'cycle' || f.law === 'cycle-incoherent').length, 0);
});

// ── declGraphOf, directly ───────────────────────────────────────────────────────────

test('declGraphOf: exposes the finer graph as a reusable primitive', () => {
  const { events, order } = readCodebase([
    { path: 'p.js', text: `import { q } from './q.js'; export function p() { return q(); }\n` },
    { path: 'q.js', text: `import { p } from './p.js'; export function q() { return p(); }\n` },
  ]);
  const r = refoldCycle(events, order.cycles[0]);
  const g = declGraphOf(events, r.irreducibleCore);
  for (const m of r.irreducibleCore) assert.ok(g.get(m).size > 0, 'each member of a real cycle has an outgoing declaration edge');
});
