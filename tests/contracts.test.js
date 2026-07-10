import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONTRACTS, contractOf, contractedPaths } from '../src/core/contracts.js';
import { isContract } from '../src/core/contract.js';

// The all-module conformance checkpoint (docs/eo-for-coders.md Law 1,
// docs/spec-good-watchmaker.md §4). Every module in the tree declares an EO contract
// — its ops (Act), its terrains split into targets/products (Site), its stances
// (Stance). This test is the guard: 100% coverage, every contract on the cube's
// diagonal, no desert cell, no orphans. It reads the generated registry (a projection
// of the per-holon manifests) and the live filesystem, so a new module with no
// contract fails loudly.

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

// src/**/*.js minus the generated meta-files (the manifests and the registry).
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  if (!e.name.endsWith('.js')) return [];
  if (e.name === 'eo-contract.js' || e.name === 'contracts.js') return [];
  return [p];
});
const actualModules = walk(SRC).map(p => 'src/' + path.relative(SRC, p)).sort();

test('every module in the tree has an EO contract — 100% coverage', () => {
  const contracted = new Set(contractedPaths());
  const missing = actualModules.filter(f => !contracted.has(f));
  assert.equal(missing.length, 0,
    `${missing.length} module(s) have no EO contract:\n  ${missing.join('\n  ')}`);
});

test('no orphan contracts — every contract names a real module', () => {
  const actual = new Set(actualModules);
  const orphans = contractedPaths().filter(p => !actual.has(p));
  assert.equal(orphans.length, 0,
    `${orphans.length} contract(s) name a non-existent module:\n  ${orphans.join('\n  ')}`);
});

test('every contract is a valid contract object on the cube', () => {
  const bad = [];
  for (const p of contractedPaths()) {
    const c = contractOf(p);
    if (!isContract(c)) { bad.push(`${p}: not a contract`); continue; }
    if (!c.valid) bad.push(`${p}: ${c.errors.join('; ')}`);
  }
  assert.equal(bad.length, 0, `${bad.length} invalid contract(s):\n  ${bad.join('\n  ')}`);
});

test('no contract declares the desert cell (SYN at Ground)', () => {
  const desert = contractedPaths().filter(p => contractOf(p).desertCell);
  assert.equal(desert.length, 0,
    `${desert.length} contract(s) declare the desert cell:\n  ${desert.join('\n  ')}`);
});

test('every contract fires at least one operator and lands somewhere', () => {
  for (const p of contractedPaths()) {
    const c = contractOf(p);
    assert.ok(c.ops.length >= 1, `${p}: no operator`);
    assert.ok(c.terrains.length >= 1, `${p}: no terrain`);
    assert.ok(c.stances.length >= 1, `${p}: no stance`);
    // targets and products are each a subset of terrains (the Site face is their union)
    for (const t of c.targets)  assert.ok(c.terrains.includes(t),  `${p}: target ${t} outside terrains`);
    for (const t of c.products) assert.ok(c.terrains.includes(t), `${p}: product ${t} outside terrains`);
  }
});

test('the cross-column census is reported (declared crossings are legal, §7.5)', () => {
  const paths = contractedPaths();
  const crossed = paths.filter(p => contractOf(p).crossColumn);
  // informational: a crossing is legal when the ops declare it; this just surfaces the count.
  console.log(`  EO contracts: ${paths.length} modules · ${crossed.length} cross-column (declared) · ${paths.length - crossed.length} native-column`);
  assert.ok(paths.length > 0, 'the registry is non-empty');
});
