// The prompt byte-identity oracle (docs/prompt-as-site.md, Tier 3 §3). The three
// prompt builders became PROJECTIONS over the band catalog (model/bands.js); this
// test pins their output byte-for-byte against fixtures captured from the
// hand-rolled assembly they replaced (tests/fixtures/prompt-golden.json, generated
// at the refactor commit). Byte-identity is projection equality: any future
// band-catalog change that moves a byte on a default turn fails here first —
// the migration test the projection makes free.
//
// Also pinned: the probe (the Tier 2 research instrument) is IDENTITY when null —
// no probe, no byte moved — and does exactly its three documented things when set.
// And the catalog itself closes: every band names a real terrain, in agreement
// with the kernel's Site face (core/cube.js), so `unknown-terrain` cannot happen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildGroundedMessages, buildCursorMessages, buildChatMessages,
} from '../src/model/prompt.js';
import {
  GROUNDED_BANDS, CURSOR_BANDS, CHAT_BANDS,
  projectGroundedBands, TERRAIN_GRAIN,
} from '../src/model/bands.js';
import { TERRAINS } from '../src/core/cube.js';
import { GRAINS } from '../src/core/operators.js';
import { GROUNDED_CASES, CURSOR_CASES, CHAT_CASES } from './helpers/prompt-golden-cases.js';

const golden = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/prompt-golden.json', import.meta.url)), 'utf8'));

const suites = [
  ['grounded', GROUNDED_CASES, buildGroundedMessages],
  ['cursor',   CURSOR_CASES,   buildCursorMessages],
  ['chat',     CHAT_CASES,     buildChatMessages],
];

for (const [name, cases, build] of suites) {
  test(`prompt-golden: ${name} builder is byte-identical to the pre-projection assembly`, () => {
    for (const c of cases) {
      const got = build(c.args);
      const want = golden[name][c.name];
      assert.ok(want, `fixture missing for ${name}/${c.name} — regenerate prompt-golden.json`);
      assert.deepEqual(got, want, `${name}/${c.name} moved a byte`);
    }
  });
}

test('prompt-golden: every golden case is exercised (no orphan fixtures)', () => {
  for (const [name, cases] of suites) {
    const fixtureNames = Object.keys(golden[name]).sort();
    const caseNames = cases.map(c => c.name).sort();
    assert.deepEqual(caseNames, fixtureNames, `${name}: case matrix and fixtures diverged`);
  }
});

test('prompt-golden: a null/absent probe is the identity projection', () => {
  for (const c of GROUNDED_CASES) {
    const bare = buildGroundedMessages(c.args);
    assert.deepEqual(buildGroundedMessages({ ...c.args, probe: null }), bare);
    assert.deepEqual(buildGroundedMessages({ ...c.args, probe: undefined }), bare);
  }
});

test('prompt-golden: the band catalog closes over the kernel Site face', () => {
  // The nine legal terrains, from the kernel — not from this module's own table.
  const kernelTerrains = new Map();
  for (const [, row] of Object.entries(TERRAINS))
    for (const grain of GRAINS) kernelTerrains.set(row[grain], grain);

  // The hardcoded mirror agrees with the kernel exactly (no drift).
  assert.equal(Object.keys(TERRAIN_GRAIN).length, 9);
  for (const [terrain, grain] of Object.entries(TERRAIN_GRAIN))
    assert.equal(kernelTerrains.get(terrain), grain, `TERRAIN_GRAIN disagrees with core/cube.js at ${terrain}`);

  // Every band in every catalog lands on a real terrain — unknown-terrain cannot happen.
  for (const [name, bands] of [['grounded', GROUNDED_BANDS], ['cursor', CURSOR_BANDS], ['chat', CHAT_BANDS]]) {
    const keys = new Set();
    for (const b of bands) {
      assert.ok(kernelTerrains.has(b.terrain), `${name}/${b.key}: unknown terrain ${b.terrain}`);
      assert.ok(['system', 'user'].includes(b.role), `${name}/${b.key}: unknown role`);
      assert.ok(Array.isArray(b.prose), `${name}/${b.key}: prose must be declared (may be empty)`);
      assert.ok(!keys.has(b.key), `${name}/${b.key}: duplicate band key`);
      keys.add(b.key);
    }
  }
});

test('prompt-golden: probe.drop ablates exactly the named user-role terrains', () => {
  const args = GROUNDED_CASES.find(c => c.name === 'kitchen-sink').args;
  const bare = projectGroundedBands(args);
  const probed = projectGroundedBands(args, { drop: ['Atmosphere', 'Field'] });
  // Nothing Ground-row remains in the user block…
  assert.ok(!probed.some(b => b.role === 'user' && (b.terrain === 'Atmosphere' || b.terrain === 'Field')));
  // …the system voice (Atmosphere) is not a probe target…
  assert.ok(probed.some(b => b.role === 'system' && b.terrain === 'Atmosphere'));
  // …and every surviving band is unchanged, in order.
  const kept = bare.filter(b => b.role !== 'user' || !['Atmosphere', 'Field'].includes(b.terrain));
  assert.deepEqual(probed.map(b => b.key), kept.map(b => b.key));
  assert.deepEqual(probed.map(b => b.text), kept.map(b => b.text));
});

test('prompt-golden: probe.dropBands ablates by key', () => {
  const args = { question: 'Summarize it.', spans: [{ text: 'a line', score: 1 }], task: 'summary' };
  assert.ok(projectGroundedBands(args).some(b => b.key === 'summary-guard'));
  const probed = projectGroundedBands(args, { dropBands: ['summary-guard'] });
  assert.ok(!probed.some(b => b.key === 'summary-guard'));
});

test('prompt-golden: probe.absenceFirst hoists the Void bands to the head of the user block', () => {
  const args = { question: 'What about the moon?', strict: true };
  const bare = projectGroundedBands(args);
  // Default: the absence clause rides late (after the question).
  const userKeys = bare.filter(b => b.role === 'user').map(b => b.key);
  assert.ok(userKeys.indexOf('absence') > userKeys.indexOf('question'));
  // Probed: the boundary precedes the bond and the synthesis (the helix order).
  const probed = projectGroundedBands(args, { absenceFirst: true });
  const probedKeys = probed.filter(b => b.role === 'user').map(b => b.key);
  assert.equal(probedKeys[0], 'absence');
  // Same band set — a reorder, never an edit.
  assert.deepEqual([...probedKeys].sort(), [...userKeys].sort());
});

test('prompt-golden: projected bands carry their Site coordinates', () => {
  const bands = projectGroundedBands({ question: 'q', spans: [{ text: 't', score: 1 }] });
  for (const b of bands) {
    assert.equal(b.grain, TERRAIN_GRAIN[b.terrain]);
    assert.equal(typeof b.text, 'string');
  }
  // The frozen projection is read-only — a projection cannot fire an act.
  assert.ok(Object.isFrozen(bands));
  assert.ok(bands.every(Object.isFrozen));
});
