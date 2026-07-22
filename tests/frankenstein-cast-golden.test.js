// The Frankenstein cast golden — a regression guard for the cast-quality bug: the CAST panel
// ("figures across the reading") was showing place names (Geneva, Switzerland, Italy, London…)
// and a couple of malformed entities alongside real characters, because entitiesInDoc never read
// grain (perceiver/parse/grain.js's figure/kind/setting classification) and nestComposite barely
// produced it at all on a nested (chaptered) document — see nest.js's reseatWholeDocGrain.
//
// This runs the REAL reading path (tests/helpers/frankenstein-cast.mjs — nestComposite +
// entitiesInDoc + mergeEntitiesByReferent + the same filter/score/slice index.html's _mvpCast()
// applies) over the full, real text of Mary Shelley's Frankenstein and pins the result against a
// captured baseline (tests/fixtures/frankenstein-cast-golden.json), so any future change to the
// reading path, the merge, or the grain reader that moves the cast fails here first — not silently,
// in a screenshot. Slow (~20s: nestComposite re-parses every chapter/letter of the book) —
// deliberately a real novel, not a synthetic snippet, because the bug this guards only showed up
// at the scale and structure (many nested chapters) a real book has.
//
// Regenerate ONLY after an intentional change to the reading path:
//   node tests/helpers/regen-frankenstein-cast-golden.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { frankensteinCast } from './helpers/frankenstein-cast.mjs';

const golden = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/frankenstein-cast-golden.json', import.meta.url)), 'utf8'));

// Computed once for the whole file (not per test) — nestComposite's per-chapter re-parse is the
// ~20s cost; three tests must not pay it three times.
const got = frankensteinCast();

test('frankenstein cast golden: the panel (count, top 8 bars, top 30 rows, excluded) is identical to the captured baseline', () => {
  assert.deepEqual(got, golden,
    'the cast moved — if intentional, regenerate with tests/helpers/regen-frankenstein-cast-golden.mjs');
});

test('frankenstein cast golden: no place name or category from the reported bug leaks back into the cast', () => {
  const labels = new Set(got.rows.map((r) => r.label));
  // Exactly the pollutants the original report showed in the CAST panel alongside the real cast.
  const REPORTED_POLLUTANTS = ['Geneva', 'Switzerland', 'Italy', 'London', 'Paris', 'Ingolstadt', 'Leghorn', 'Heaven'];
  for (const p of REPORTED_POLLUTANTS) assert.ok(!labels.has(p), `${p} leaked back into the top-30 cast`);
});

test('frankenstein cast golden: the real cast is present, graded a figure, and outranks the atlas', () => {
  const byLabel = new Map(got.rows.map((r) => [r.label, r]));
  for (const name of ['Elizabeth Lavenza', 'Henry Clerval', 'Justine Moritz', 'Felix', 'Safie', 'William', 'Agatha']) {
    const r = byLabel.get(name);
    assert.ok(r, `${name} is missing from the cast`);
    assert.equal(r.grain, 'figure', `${name} is not graded a figure`);
  }
  // The creature has no proper name in the book — tracked by its recurring description
  // (perceiver/parse/unnamed-referent.js) — but it is one of the book's central figures and
  // belongs in the cast exactly as much as any named character.
  const creature = got.rows.find((r) => /creature/i.test(r.label));
  assert.ok(creature, 'the creature is missing from the cast');
  assert.equal(creature.grain, 'figure');
});

test('frankenstein cast golden: every excluded row is confidently graded setting or kind, never held', () => {
  // "excluded" only has meaning as a positive exclusion — a referent the grain reader HELD
  // (thin evidence) must stay IN the cast (frankenstein-cast.mjs / index.html's _mvpCast), so
  // nothing here should ever be null.
  for (const e of got.excluded) {
    assert.ok(e.grain === 'setting' || e.grain === 'kind', `${e.label} excluded with grain=${e.grain}`);
  }
});
