import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODEL_ORIGINS, probeOrigins, explainReach } from '../src/model/reach.js';

// The reachability probe (model/reach.js): when NO local model can load, the
// runtimes' own errors can't tell "your GPU" from "your firewall" — a blocked
// huggingface.co surfaces as a bare "network error" after minutes of silent 0%.
// probeOrigins asks each model host whether the wire answers at all;
// explainReach turns the results into one honest sentence, or stays silent
// when it has nothing provable to say.

test('model/reach: the origin roster covers the whole local-model path', () => {
  const hosts = MODEL_ORIGINS.map((o) => new URL(o.origin).host);
  // runtimes (jsdelivr), weights (huggingface), webllm's GPU kernels (github raw)
  assert.ok(hosts.includes('cdn.jsdelivr.net'));
  assert.ok(hosts.includes('huggingface.co'));
  assert.ok(hosts.includes('raw.githubusercontent.com'));
  for (const o of MODEL_ORIGINS) assert.ok(o.role, `${o.origin} says what it carries`);
});

test('model/reach: probeOrigins marks answering origins ok and dead ones not', async () => {
  const stub = async (url) => {
    if (url.startsWith('https://huggingface.co')) throw new TypeError('Failed to fetch');
    return { type: 'opaque' };   // no-cors: opaque IS success — the wire answered
  };
  const res = await probeOrigins(MODEL_ORIGINS, stub);
  const byHost = Object.fromEntries(res.map((r) => [new URL(r.origin).host, r]));
  assert.equal(byHost['cdn.jsdelivr.net'].ok, true);
  assert.equal(byHost['huggingface.co'].ok, false);
  assert.equal(byHost['huggingface.co'].role, 'the model weights', 'roles ride along');
});

test('model/reach: explainReach stays silent unless it can prove a block', () => {
  // Nothing probed, everything fine, or unknown (ok: null — the probe itself
  // could not run) all say NOTHING: an unprovable suspicion in the error note
  // would send users chasing a firewall that isn't there.
  assert.equal(explainReach([]), '');
  assert.equal(explainReach([{ origin: 'https://huggingface.co', role: 'the model weights', ok: true }]), '');
  assert.equal(explainReach([{ origin: 'https://huggingface.co', role: 'the model weights', ok: null }]), '');
});

test('model/reach: explainReach names the blocked host, its cargo, and a way out', () => {
  const line = explainReach([
    { origin: 'https://cdn.jsdelivr.net', role: 'the model runtimes', ok: true },
    { origin: 'https://huggingface.co', role: 'the model weights', ok: false },
  ]);
  assert.ok(line.includes('huggingface.co'), 'names the host');
  assert.ok(!line.includes('jsdelivr'), 'does not smear the reachable one');
  assert.ok(line.includes('the model weights'), 'says what is lost');
  assert.ok(/Claude · hosted API/.test(line), 'offers the path that does not need the blocked host');
});

test('model/reach: two blocked hosts read as one sentence, joined honestly', () => {
  const line = explainReach([
    { origin: 'https://cdn.jsdelivr.net', role: 'the model runtimes', ok: false },
    { origin: 'https://huggingface.co', role: 'the model weights', ok: false },
  ]);
  assert.ok(line.includes('cdn.jsdelivr.net or huggingface.co'));
});
