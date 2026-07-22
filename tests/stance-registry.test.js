import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// docs/universalizing-stance-face.md §9: there is exactly one Stance face —
// core/cube.js's Mode × Object cross. Nothing outside core/cube.js, core/faces.js,
// and core/stance-face.js may DEFINE a symbol named STANCES, stanceOf, stanceFold, or
// createStance — the four names finding #1 found colliding across unrelated concepts
// (the real Resolution face, the dialectical CON warrant, and the drift-calibration
// fold). A declared shim may keep RE-EXPORTING an old name at its old path for one
// release (surfer/dag/stance.js -> causal-warrant.js, core/enacted/stance.js ->
// calibration-fold.js), but nothing may author a NEW competing definition. This walks
// src/ and fails loudly the moment a file reaches for one of these names as its own,
// exactly the mechanism tests/cube.test.js and tests/contracts.test.js already use for
// "exactly nine operators"-style invariants — a static self-check, not a runtime guard.

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const FORBIDDEN_NAMES = ['STANCES', 'stanceOf', 'stanceFold', 'createStance'];

const ALLOWED_PATHS = new Set([
  'src/core/cube.js',
  'src/core/faces.js',
  'src/core/stance-face.js',
  'src/surfer/dag/stance.js',      // shim -> causal-warrant.js
  'src/core/enacted/stance.js',    // shim -> calibration-fold.js
]);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return walk(p);
  return e.name.endsWith('.js') ? [p] : [];
});

// A LOCAL declaration — `export const NAME`, `export function NAME`, `export class
// NAME` — is a new definition. `export { NAME } from './somewhere.js'` is forwarding
// an existing binding (a barrel, a shim), not authoring a rival one, so it is not
// flagged; the declaration site is what the vocabulary rule polices.
const definesSymbol = (src, name) =>
  new RegExp(`export\\s+(const|function|class)\\s+${name}\\b`).test(src);

test('stance vocabulary: only core/cube.js, core/faces.js, core/stance-face.js, and the declared shims may define STANCES/stanceOf/stanceFold/createStance', () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = 'src/' + path.relative(SRC, file);
    if (ALLOWED_PATHS.has(rel)) continue;
    const src = readFileSync(file, 'utf8');
    for (const name of FORBIDDEN_NAMES) {
      if (definesSymbol(src, name)) offenders.push(`${rel}: defines ${name}`);
    }
  }
  assert.equal(offenders.length, 0,
    `${offenders.length} module(s) define a competing Stance-vocabulary symbol:\n  ${offenders.join('\n  ')}`);
});

test('surfer/dag/stance.js is a re-export shim onto causal-warrant.js', () => {
  const shim = readFileSync(path.join(SRC, 'surfer/dag/stance.js'), 'utf8');
  assert.ok(/from\s+['"]\.\/causal-warrant\.js['"]/.test(shim), 'must re-export from ./causal-warrant.js');
  assert.ok(/WARRANTS\s+as\s+STANCES/.test(shim), 'must alias WARRANTS back to the old STANCES name');
  assert.ok(/proposeWarrant\s+as\s+proposeStance/.test(shim), 'must alias proposeWarrant back to the old proposeStance name');
  assert.ok(!definesSymbol(shim, 'STANCES'), 'the shim must not locally define STANCES');
});

test('core/enacted/stance.js is a re-export shim onto calibration-fold.js', () => {
  const shim = readFileSync(path.join(SRC, 'core/enacted/stance.js'), 'utf8');
  assert.ok(/from\s+['"]\.\/calibration-fold\.js['"]/.test(shim), 'must re-export from ./calibration-fold.js');
  assert.ok(/calibrationFold\s+as\s+stanceFold/.test(shim), 'must alias calibrationFold back to the old stanceFold name');
  assert.ok(/createCalibration\s+as\s+createStance/.test(shim), 'must alias createCalibration back to the old createStance name');
  assert.ok(!definesSymbol(shim, 'stanceFold') && !definesSymbol(shim, 'createStance'), 'the shim must not locally define stanceFold/createStance');
});
