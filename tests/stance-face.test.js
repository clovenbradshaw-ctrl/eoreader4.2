import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readStanceFace, clearedComponents, cellForGrain, makeStanceCapability,
} from '../src/core/stance-face.js';
import { isDiagonal } from '../src/core/cube.js';
import { DESERT_CELL } from '../src/core/contract.js';
import { MODES, GRAINS } from '../src/core/operators.js';

// docs/universalizing-stance-face.md §12: the shared instrument's own acceptance
// tests — everything a caller of readStanceFace/clearedComponents/cellForGrain can
// rely on, independent of either adapter (surfer/stance.js, weave/generate-row/
// stance.js) that consumes it.

const ROW_CAPABILITY = makeStanceCapability({
  mode: 'Generate', reachableGrains: ['Ground', 'Figure', 'Pattern'], unreachable: {},
});
const SURFER_CAPABILITY = makeStanceCapability({
  mode: 'Generate', reachableGrains: ['Ground', 'Figure'],
  unreachable: { Pattern: 'a continuous per-cursor field has no relation graph to traverse' },
});

// ── the shared instrument (§4) ────────────────────────────────────────────────

test('readStanceFace: a flat spectrum (nothing clears) returns Ground, for every Mode', () => {
  const flat = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
  for (const mode of MODES) {
    const r = readStanceFace({ spectrum: flat, mode, domain: 'Interpretation', capability: ROW_CAPABILITY });
    assert.equal(r.grain, 'Ground', `${mode}: expected Ground`);
    assert.equal(r.guard, true);
  }
});

test('readStanceFace: a single clean rank-1 spectrum returns Figure', () => {
  const r = readStanceFace({ spectrum: [0.9, 0.02, 0.01], mode: 'Generate', domain: 'Interpretation', capability: ROW_CAPABILITY });
  assert.equal(r.grain, 'Figure');
  assert.equal(r.stance, 'Making');
  assert.equal(r.guard, false);
});

test('readStanceFace: two-or-more-cleared + orderable:true returns Pattern', () => {
  const r = readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: ROW_CAPABILITY, orderable: true,
  });
  assert.equal(r.grain, 'Pattern');
  assert.equal(r.stance, 'Composing');
});

test('readStanceFace: two-or-more-cleared + orderable:false returns Ground, never a guessed Pattern', () => {
  const r = readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: ROW_CAPABILITY, orderable: false,
  });
  assert.equal(r.grain, 'Ground');
  assert.notEqual(r.grain, 'Pattern');
});

test('readStanceFace: never returns a grain outside capability.reachableGrains — refuses off-capability instead', () => {
  const r = readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: SURFER_CAPABILITY, orderable: true,   // would clear Pattern under ROW_CAPABILITY
  });
  assert.equal(r.refused, true);
  assert.equal(r.reason, 'off-capability');
  assert.equal(r.grain, 'Pattern');   // the honest reading of the evidence, even though refused
  assert.equal(r.stance, null);
  assert.equal(r.cell, null);
  assert.equal(r.firmness, 0);
});

test('readStanceFace: a refused reading still echoes mode/grain/capability for the audit trail', () => {
  const r = readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: SURFER_CAPABILITY, orderable: true,
  });
  assert.equal(r.mode, 'Generate');
  assert.equal(r.capability, SURFER_CAPABILITY);
  assert.ok(r.spectrum && typeof r.spectrum.clearedCount === 'number');
});

// ── the unified small-n floor (§5) ───────────────────────────────────────────

test('clearedComponents: above MIN_SAMPLES is byte-identical to a direct deriveNull call', () => {
  const spectrum = [0.9, 0.5, 0.3, 0.2, 0.15, 0.1, 0.05];   // 7 entries, > MIN_SAMPLES (4)
  const a = clearedComponents(spectrum, { alpha: 0.05 });
  const b = clearedComponents(spectrum, { alpha: 0.05 });
  assert.deepEqual(a, b, 'pure — identical input, identical output');
  assert.ok(a.every((w) => spectrum.includes(w)));
});

test('clearedComponents: at or below MIN_SAMPLES, a component with real mass still clears', () => {
  const cleared = clearedComponents([0.9, 0.3, 0.1], { alpha: 0.05 });
  assert.ok(cleared.length >= 1, 'a dominant component clears the small-n floor');
});

test('clearedComponents: at or below MIN_SAMPLES, a flat/negligible spectrum clears nothing', () => {
  const cleared = clearedComponents([0.001, 0.001, 0.001], { alpha: 0.05 });
  assert.equal(cleared.length, 0);
});

test('clearedComponents: the small-n floor is a monotonic function of alpha (the same knob every large-n caller tunes)', () => {
  // epsilon(n, alpha) = 1/sqrt(n/alpha) grows WITH alpha (opposite deriveNull's own
  // direction — see the source comment) — a smaller alpha here means a LOWER floor,
  // so more mass clears, not less. It is still one shared, alpha-linked knob rather
  // than an unrelated hardcoded constant, which is the property release invariant 5
  // actually requires.
  const spectrum = [0.15, 0.1, 0.05];
  const smallAlpha = clearedComponents(spectrum, { alpha: 0.001 });
  const largeAlpha = clearedComponents(spectrum, { alpha: 0.5 });
  assert.ok(smallAlpha.length >= largeAlpha.length, 'a smaller alpha yields a lower small-n floor here, clearing at least as much');
});

// ── the dynamic desert-cell guard (§6) ────────────────────────────────────────

test('cellForGrain: Generate×Structure×Ground is exactly the desert cell — refused', () => {
  const cell = cellForGrain('Generate', 'Structure', 'Ground');
  assert.equal(cell.refused, true);
  assert.equal(cell.reason, 'desert-cell');
});

test('cellForGrain: Generate×Interpretation×Ground (REC·Cultivating) is legal and unaffected', () => {
  const cell = cellForGrain('Generate', 'Interpretation', 'Ground');
  assert.equal(cell.refused, undefined);
  assert.equal(cell.op, 'REC');
  assert.equal(cell.stance, 'Cultivating');
});

test('cellForGrain: every one of the 27 diagonal cells except the one desert cell resolves, non-refused', () => {
  const refusedDesertCells = [];
  for (const mode of MODES) {
    for (const domain of ['Existence', 'Structure', 'Interpretation']) {
      for (const grain of GRAINS) {
        const cell = cellForGrain(mode, domain, grain);
        if (cell.refused) refusedDesertCells.push({ mode, domain, grain, reason: cell.reason });
      }
    }
  }
  assert.equal(refusedDesertCells.length, 1, `expected exactly one refusal (the desert cell), got: ${JSON.stringify(refusedDesertCells)}`);
  assert.equal(refusedDesertCells[0].reason, 'desert-cell');
});

test('cellForGrain: a resolved cell is always Object-diagonal', () => {
  for (const mode of MODES) {
    for (const grain of GRAINS) {
      const cell = cellForGrain(mode, 'Interpretation', grain);
      if (cell.refused) continue;
      assert.ok(isDiagonal({ op: cell.op, terrain: cell.terrain, stance: cell.stance }));
    }
  }
});

test('cellForGrain: the desert cell it refuses matches core/contract.js DESERT_CELL exactly', () => {
  const cell = cellForGrain('Generate', 'Structure', 'Ground');
  assert.equal(cell.reason, 'desert-cell');
  // sanity: SYN is the (Generate, Structure) operator, and Ground at Structure is Field —
  // exactly core/contract.js's declared DESERT_CELL.
  assert.equal(DESERT_CELL.op, 'SYN');
  assert.equal(DESERT_CELL.terrain, 'Field');
  assert.equal(DESERT_CELL.stance, 'Cultivating');
});

// ── StanceCapability (§2.1) ───────────────────────────────────────────────────

test('makeStanceCapability: a capability whose reachableGrains + unreachable do not cover all three grains throws at construction', () => {
  assert.throws(() => makeStanceCapability({ mode: 'Generate', reachableGrains: ['Ground', 'Figure'], unreachable: {} }));
});

test('makeStanceCapability: a fully covered capability constructs cleanly', () => {
  const cap = makeStanceCapability({
    mode: 'Generate', reachableGrains: ['Ground'],
    unreachable: { Figure: 'not reachable here', Pattern: 'not reachable here' },
  });
  assert.deepEqual([...cap.reachableGrains], ['Ground']);
});

test('ROW_CAPABILITY reproduces the row instrument\'s own Pattern-grain composing behavior', () => {
  const r = readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: ROW_CAPABILITY, orderable: true,
  });
  assert.equal(r.refused, false);
  assert.equal(r.grain, 'Pattern');
  assert.equal(r.cell, 'REC_Composing_Paradigm');
});

test('SURFER_CAPABILITY refuses a synthetic Pattern-clearing spectrum rather than downgrading it silently or crashing', () => {
  assert.doesNotThrow(() => readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: SURFER_CAPABILITY, orderable: true,
  }));
  const r = readStanceFace({
    spectrum: [0.5, 0.4, 0.05], mode: 'Generate', domain: 'Interpretation',
    capability: SURFER_CAPABILITY, orderable: true,
  });
  assert.equal(r.refused, true);
  assert.equal(r.reason, 'off-capability');
});
