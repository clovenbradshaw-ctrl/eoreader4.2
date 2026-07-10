// The harvest — a program assembled from pieces foraged off the web, the search driven
// by the organ's OWN findings (src/organs/code/harvest.js).
//
// The thesis under test: a model need not hold in its weights how to build anything. It
// writes STRUCTURE (a seed that names the pieces it needs); the organ's `unbound` findings
// say exactly what is still missing; a retriever fetches precisely those names; and when a
// fetched piece itself references something unbound, THAT becomes the next round's search.
// The loop resolves a dependency chain gap by witnessed gap, and carries a provenance trail.
//
// The retriever is injected (pure organ, injected world). Here it is a deterministic fixed
// "web"; the live path (npm search → unpkg) is createWebRetriever, exercised out of band.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { harvestProgram } from '../src/organs/code/harvest.js';

// a fixed corpus standing in for the internet. `slugify` DEPENDS on `deburr` (its body
// references it) — so fetching slugify opens a new gap the loop must also close.
const WEB = {
  deburr: { code: "const deburr = (s) => String(s).normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '');", source: 'fake://deburr' },
  slugify: { code: "const slugify = (s) => deburr(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');", source: 'fake://slugify' },
  clamp: { code: 'const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));', source: 'fake://clamp' },
};
const fakeWeb = async (name) => WEB[name] ?? null;

test('the organ\'s gaps drive iterative retrieval, resolving a dependency chain', async () => {
  const seed = { code: "export const key = (title) => slugify(title);" };
  const r = await harvestProgram(seed, fakeWeb);
  assert.ok(r.ok, `should close: ${r.findings.filter((f) => f.severity === 'error').map((f) => f.law + ' ' + f.name).join(', ')}`);
  // round 0 found slugify; round 1 found deburr (named only once slugify's body was present)
  assert.deepEqual(r.trail.map((t) => t.name), ['slugify', 'deburr'], 'the chain resolved gap by gap');
  assert.ok(r.rounds >= 2, 'it took more than one round — the dependency surfaced iteratively');
  assert.deepEqual(r.provenance.map((p) => p.source), ['fake://slugify', 'fake://deburr'], 'every fetched line is cited');
});

test('the assembled program actually runs', async () => {
  const seed = { code: "export const key = (title) => slugify(title);" };
  const r = await harvestProgram(seed, fakeWeb);
  const f = path.join(mkdtempSync(path.join(tmpdir(), 'harvest-')), 'h.mjs');
  writeFileSync(f, r.code);
  const mod = await import(pathToFileURL(f).href);
  assert.equal(mod.key('Café Été 2026!'), 'cafe-ete-2026');
});

test('a compose.js blueprint can be the seed — structure first, pieces foraged after', async () => {
  const seed = {
    blueprint: `
key : Function
key.params = "title"
key.expr = "slugify(title)"
!sig key : exported`,
  };
  const r = await harvestProgram(seed, fakeWeb);
  assert.ok(r.ok);
  assert.ok(r.code.includes('const slugify') && r.code.includes('const deburr'));
});

test('an unfetchable gap leaves the record open — reported, never faked', async () => {
  const seed = { code: 'export const f = (x) => missingPiece(x);' };
  const r = await harvestProgram(seed, fakeWeb, { maxRounds: 3 });
  assert.equal(r.ok, false, 'the Void is not fabricated over');
  assert.ok(r.unresolved.includes('missingPiece'), 'the still-open name is named');
});

test('the verify gate is the syntax check the organ deliberately is not', async () => {
  // a piece that is structurally fine (binds) but a caller-supplied verify rejects —
  // proves ok requires organ-clean AND the injected gate (a truncated fetch would pass
  // the dependency laws yet fail to parse; the gate is where that is caught).
  const seed = { code: 'export const g = (x) => clamp(x, 0, 10);' };
  const passing = await harvestProgram(seed, fakeWeb, { verify: () => true });
  assert.ok(passing.ok && passing.structural && passing.parsed);
  const gated = await harvestProgram(seed, fakeWeb, { verify: () => false });
  assert.ok(gated.structural, 'the dependency laws still pass');
  assert.equal(gated.parsed, false, 'but the injected syntax gate fails');
  assert.equal(gated.ok, false, 'so it is not trusted');
});
