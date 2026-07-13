import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMurmur, murmurConfig } from '../src/murmur/index.js';
import { buildSteer, liveSteers, steerBias, isSteer } from '../src/murmur/steer/index.js';
import { createNarrator, narratorPrompt } from '../src/murmur/narrate/index.js';

// The steer channel (spec §4a, §10) and the narrator discipline (spec §6). A steer biases the
// projection's physics — retrieval/fold re-weighting — and nothing else. It decays; the user
// dominates it. The narrator wakes only on a twitch, is refractory-gated, capped, and audit-only.

const V = (x, y) => Float32Array.from([x, y]);

test('steerBias maps live steers to a retrieval re-weighting {towardAnchor, awayFromCluster, biasStrength}', () => {
  const now = 10000;
  const s = buildSteer({ anchor: V(1, 0), awayFrom: V(0, 1), amplitude: 0.9, ttlMs: 45000 }, () => now);
  assert.ok(isSteer(s));
  const bias = steerBias([s], now);
  assert.deepEqual([...bias.towardAnchor], [1, 0], 'bias re-weights toward the session topic');
  assert.deepEqual([...bias.awayFromCluster], [0, 1], 'and away from the drifted cluster');
  assert.ok(bias.biasStrength > 0.8, 'fresh steer biases near full amplitude');
});

test('steer decays — a stale steer weakens and then falls out of the live set (spec §9.7)', () => {
  const t0 = 0;
  const s = buildSteer({ anchor: V(1, 0), awayFrom: V(0, 1), amplitude: 1.0, ttlMs: 1000 }, () => t0);
  assert.equal(liveSteers([s], 500).length, 1, 'live within ttl');
  assert.ok(steerBias([s], 500).biasStrength < 1.0, 'strength decays with age');
  assert.equal(liveSteers([s], 1500).length, 0, 'expired past ttl — superseded, not obeyed');
  assert.equal(steerBias([s], 1500), null, 'no bias from an expired steer');
});

test('a wired murmur (membrane open) appends exactly ONE steer on collapse and biases from it', async () => {
  const appended = [];
  const m = createMurmur({
    config: murmurConfig({ membrane: { canAppendLog: true } }),
    appendLog: (e) => appended.push(e), rng: () => 0.0, now: () => 7000,
  });
  await m.observe({ ref: { turnId: 't1', stepName: 'fold', t: 100 }, query: 'the worst movie ever', queryVec: V(1, 0), readingVecs: [V(1, 0)], concentration: { concentrated: true, top: 0.9 } });
  const r = await m.observe({ ref: { turnId: 't2', stepName: 'fold', t: 100 }, query: 'go research that', queryVec: V(1, 0), readingVecs: [V(0, 1)], concentration: { concentrated: false, top: 0.4 } });
  assert.equal(r.collapse.commit, true);
  assert.equal(appended.length, 1, 'exactly one steer appended');
  assert.equal(appended[0].kind, 'steer');
  const bias = m.bias();
  assert.ok(bias && bias.biasStrength > 0, 'the projection consumer reads a bias from the appended steer');
});

test('narrator is silent with no backend (phases 1–2 ship audit-only, geometry flags it)', async () => {
  const n = createNarrator({ backend: null });
  assert.equal(n.available, false);
  assert.equal(await n.mutter({ register: 'drift', ref: { turnId: 't', stepName: 'fold' }, passageText: 'x' }), null);
});

test('narrator caps output at ≤maxTokens and never asks for facts', async () => {
  const chatty = async () => 'this is a very long winded analysis that goes on and on and on well past any reasonable mutter length indeed';
  const n = createNarrator({ backend: chatty, maxTokens: 8 });
  const phrase = await n.mutter({ register: 'unease', ref: { turnId: 't', stepName: 'fold' }, passageText: 'x' });
  assert.ok(phrase.split(/\s+/).length <= 8, 'a chatty backend is trimmed to the cap');
  // the prompt frames a feeling, not a truth query.
  const p = narratorPrompt('drift', 'some passage');
  assert.match(p, /mutter/i);
  assert.match(p, /Do not state facts/i);
});

test('narrator is refractory-gated per ref (spec §8)', async () => {
  let calls = 0;
  const backend = async () => { calls++; return 'off'; };
  // share a working feel so the refractory marker is visible to the narrator.
  const { createWorkingFeel } = await import('../src/murmur/valence/index.js');
  let now = 1000;
  const feel = createWorkingFeel({ refractoryMs: 8000, now: () => now });
  const n = createNarrator({ backend, refractoryMs: 8000, workingFeel: feel });
  const ref = { turnId: 't', stepName: 'fold' };
  assert.ok(await n.mutter({ register: 'drift', ref, passageText: 'x' }), 'fires the first time');
  assert.equal(await n.mutter({ register: 'drift', ref, passageText: 'x' }), null, 'muted within cooldown');
  assert.equal(calls, 1, 'backend called once');
});
