import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDecodeGate } from '../src/model/decode-gate.js';

// The decode gate (model/decode-gate.js) — the per-backend serializer both local
// runtimes decode through. The contract under test: entrants run ONE AT A TIME in
// arrival order; a rejection belongs to its own caller and never wedges the queue;
// every caller gets its own result back.

const tick = () => new Promise((r) => setTimeout(r, 0));

test('decode gate: entrants run strictly one at a time, in arrival order', async () => {
  const gate = makeDecodeGate();
  const events = [];
  let releaseA;
  const a = gate(() => new Promise((res) => { events.push('a:start'); releaseA = () => { events.push('a:end'); res('A'); }; }));
  const b = gate(async () => { events.push('b:start'); return 'B'; });
  await tick();
  // b queued behind the still-running a — it must not have started
  assert.deepEqual(events, ['a:start'], 'the second decode waits for the first');
  releaseA();
  assert.equal(await a, 'A');
  assert.equal(await b, 'B');
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start'], 'b starts only after a settles');
});

test('decode gate: a rejection is the caller\'s own and never wedges the queue', async () => {
  const gate = makeDecodeGate();
  const boom = gate(async () => { throw new Error('decode fault'); });
  await assert.rejects(boom, /decode fault/, 'the failing entrant keeps its own error');
  const after = await gate(async () => 'still alive');
  assert.equal(after, 'still alive', 'the next entrant runs despite the earlier rejection');
});

test('decode gate: results pass through untouched', async () => {
  const gate = makeDecodeGate();
  const out = await Promise.all([
    gate(async () => 1),
    gate(async () => 2),
    gate(async () => 3),
  ]);
  assert.deepEqual(out, [1, 2, 3]);
});
