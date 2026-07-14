import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEAMS, SEAM_SET, seamKey } from '../src/core/seams.js';

// The holon-boundary checkpoint (docs/holons.md, docs/architecture.md: "No holon
// imports another's internals — only its index.js"; docs/eo-for-coders.md §7.5:
// a crossing is legal but must be DECLARED — the sin was crossing silently).
//
// A holon is the nearest ancestor directory carrying an index.js. Any import that
// resolves inside a DIFFERENT holon must land on that holon's index.js — or be a
// declared seam in src/core/seams.js. The registry is a ratchet: it may only
// shrink (heal a seam → delete its row; the orphan check enforces the deletion),
// and a new deep import fails here until it is either routed through the entrance
// or deliberately declared in review.
//
// Excluded from the walk, both directions: the eo-contract.js manifests and
// core/contracts.js (the conformance layer itself — the registry must reach every
// manifest, and every manifest must reach core/contract.js).

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const allJs = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) allJs.push(p);
  }
};
walk(SRC);

const hasIndex = (dir) => existsSync(path.join(dir, 'index.js'));
const holonOf = (file) => {
  let dir = path.dirname(file);
  while (dir.startsWith(SRC)) {
    if (hasIndex(dir)) return dir;
    dir = path.dirname(dir);
  }
  return SRC;
};
const resolveImport = (fromFile, spec) => {
  const target = path.resolve(path.dirname(fromFile), spec);
  for (const c of [target, target + '.js', path.join(target, 'index.js')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
};
const IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;

const crossings = []; // every live deep import, as [from, to] repo-relative
for (const file of allJs) {
  if (file.endsWith('eo-contract.js')) continue;
  if (file === path.join(SRC, 'core', 'contracts.js')) continue;
  const text = readFileSync(file, 'utf8');
  const fromHolon = holonOf(file);
  let m;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = resolveImport(file, spec);
    if (!target || !target.startsWith(SRC)) continue;
    if (target.endsWith('eo-contract.js')) continue;
    const toHolon = holonOf(target);
    if (fromHolon === toHolon) continue;
    if (path.resolve(target) === path.resolve(path.join(toHolon, 'index.js'))) continue;
    crossings.push([path.relative(ROOT, file), path.relative(ROOT, target)]);
  }
}

test('no undeclared boundary crossing — every deep import is a declared seam', () => {
  const undeclared = crossings.filter(([f, t]) => !SEAM_SET.has(seamKey(f, t)));
  assert.equal(undeclared.length, 0,
    `${undeclared.length} import(s) reach past a holon's entrance undeclared ` +
    `(route through the holon's index.js, or declare the seam in src/core/seams.js):\n  ` +
    undeclared.map(([f, t]) => `${f} → ${t}`).join('\n  '));
});

test('no stale seam — every declared seam is a live import (heal → delete the row)', () => {
  const live = new Set(crossings.map(([f, t]) => seamKey(f, t)));
  const stale = SEAMS.filter(([f, t]) => !live.has(seamKey(f, t)));
  assert.equal(stale.length, 0,
    `${stale.length} declared seam(s) no longer exist — delete their rows:\n  ` +
    stale.map(([f, t]) => `${f} → ${t}`).join('\n  '));
});

test('core purity — nothing under src/core imports outside src/core', () => {
  const CORE = path.join(SRC, 'core');
  const escapes = [];
  for (const file of allJs) {
    if (!file.startsWith(CORE + path.sep)) continue;
    if (file.endsWith('eo-contract.js')) continue;
    if (file === path.join(CORE, 'contracts.js')) continue;
    const text = readFileSync(file, 'utf8');
    let m;
    while ((m = IMPORT_RE.exec(text))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = resolveImport(file, spec);
      if (target && !target.startsWith(CORE + path.sep))
        escapes.push(`${path.relative(ROOT, file)} → ${path.relative(ROOT, target)}`);
    }
  }
  assert.equal(escapes.length, 0,
    `core imported upward — "core cannot import anything" (docs/architecture.md):\n  ${escapes.join('\n  ')}`);
});

test('the membrane is exemplary — rooms/reader/boot.js imports only entrances', () => {
  const boot = path.join(SRC, 'rooms', 'reader', 'boot.js');
  const bootHolon = holonOf(boot);
  const pierced = [];
  const text = readFileSync(boot, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    const target = resolveImport(boot, spec);
    if (!target || !target.startsWith(SRC)) continue;
    const toHolon = holonOf(target);
    if (toHolon === bootHolon) continue;
    if (path.resolve(target) !== path.resolve(path.join(toHolon, 'index.js')))
      pierced.push(path.relative(ROOT, target));
  }
  assert.equal(pierced.length, 0,
    `the surface↔engine membrane reached inside a holon:\n  ${pierced.join('\n  ')}`);
});

test('the seam census is reported', () => {
  console.log(`  boundary seams: ${crossings.length} declared deep imports · registry may only shrink`);
  assert.ok(SEAMS.length >= crossings.length - 0, 'registry covers the census');
});
