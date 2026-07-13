import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMurmur, murmurConfig,
  assertLogAppendAllowed, assertMembraneSafe, assertNoMurmurInPrompt,
  canCite, canGround, canPromote, isMurmurEmission,
  buildSteer, createImpressionSink,
  buildConnection, canGroundConnection,
} from '../src/murmur/index.js';

// The membrane invariants (spec §9). These are the guards code review and the contract test must
// enforce; a violation of any one defeats the architecture's reason for existing. Static + runtime
// assertions that no `impression`/`steer` reaches the log-append path or the answer prompt (§12).

test('invariant 1: the ONLY log write is a typed steer event, and only when the membrane permits', () => {
  const off = murmurConfig();                        // default — audit-only
  assert.equal(off.membrane.canAppendLog, false);
  assert.throws(() => assertLogAppendAllowed(buildSteer({ amplitude: 0.9 }), off.membrane),
    /audit-only/, 'a steer is refused while canAppendLog is false');

  const on = murmurConfig({ membrane: { canAppendLog: true } });
  assert.equal(assertLogAppendAllowed(buildSteer({ amplitude: 0.9 }), on.membrane), true,
    'with the membrane opened, a steer event is the one legal write');
  assert.throws(() => assertLogAppendAllowed({ kind: 'assertion', claim: 'x' }, on.membrane),
    /typed steer event/, 'an assertion is refused even with the membrane open');
  assert.throws(() => assertLogAppendAllowed({ kind: 'impression', register: 'drift' }, on.membrane),
    /typed steer event/, 'an impression is never a log write');
});

test('invariant 2: steer is never evidence — barred from citation, grounding, promotion', () => {
  const steer = buildSteer({ amplitude: 0.8, phrase: 'we wandered' });
  assert.equal(canCite(steer), false, 'a steer cannot be cited');
  assert.equal(canGround(steer), false, 'a claim cannot be grounded against a steer');
  assert.equal(canPromote(steer), false, 'a steer cannot be promoted to a credence');
  assert.equal(canCite({ kind: 'impression' }), false, 'nor can an impression');
  // a real grounded event is unaffected.
  assert.equal(canCite({ kind: 'assertion' }), true);
});

test('invariant 3: no murmur text ever enters the answer prompt', () => {
  assert.throws(() => assertNoMurmurInPrompt({ kind: 'impression', phrase: 'something is off' }),
    /answer prompt/, 'an impression phrase is refused at the prompt seam');
  assert.throws(() => assertNoMurmurInPrompt(buildSteer({ amplitude: 0.5, phrase: 'come back' })),
    /answer prompt/, 'a steer phrase is refused at the prompt seam');
  assert.equal(assertNoMurmurInPrompt({ kind: 'span', text: 'real evidence' }), true,
    'ordinary evidence passes through');
  assert.equal(assertNoMurmurInPrompt('plain string'), true);
});

test('invariant 3/4: canEditPrompt is false by construction and cannot be turned on', () => {
  const forced = murmurConfig({ membrane: { canEditPrompt: true } });   // try to turn it on
  assert.equal(forced.membrane.canEditPrompt, false, 'canEditPrompt is pinned false (spec §9.3)');
  assert.equal(assertMembraneSafe(murmurConfig()).ok, true, 'the default config is membrane-safe');
});

test('the impression sink is structurally incapable of sinking a grounded event', () => {
  const sink = createImpressionSink();
  assert.throws(() => sink.flush(null, [{ kind: 'assertion', claim: 'dolphins outlive humans' }]),
    /non-impression/, 'an assertion cannot be flushed as an impression');
  // an impression flushes fine.
  const out = sink.flush(null, [{ kind: 'impression', register: 'drift', decayedIntensity: 0.7, source: 'geometry' }]);
  assert.equal(out.count, 1);
  assert.equal(out.tag, 'impression');
});

test('a default (audit-only) murmur never appends to the log, even on a forced collapse', async () => {
  const appended = [];
  const m = createMurmur({ config: murmurConfig(), appendLog: (e) => appended.push(e), rng: () => 0.0, now: () => 5000 });
  // force a strong signal + rng≈0 so the Born rule WOULD commit …
  const V = (x, y) => Float32Array.from([x, y]);
  await m.observe({ ref: { turnId: 't1', stepName: 'fold', t: 100 }, query: 'the worst movie', queryVec: V(1, 0), readingVecs: [V(1, 0)], concentration: { concentrated: true, top: 0.9 } });
  const r = await m.observe({ ref: { turnId: 't2', stepName: 'fold', t: 100 }, query: 'go research that', queryVec: V(1, 0), readingVecs: [V(0, 1)], concentration: { concentrated: false, top: 0.4 } });
  assert.equal(r.collapse.commit, true, 'the collapse fires (strong signal, rng≈0)');
  assert.equal(appended.length, 0, '… but audit-only murmur appends NOTHING to the log');
  assert.equal(m.steers().length, 0, 'no steer events retained');
});

test('emissions are only ever impression | steer', () => {
  assert.equal(isMurmurEmission({ kind: 'impression' }), true);
  assert.equal(isMurmurEmission({ kind: 'steer' }), true);
  assert.equal(isMurmurEmission({ kind: 'assertion' }), false);
  assert.equal(isMurmurEmission({ kind: 'claim' }), false);
});

test('phase 4: a candidate connection is reafferent — it can never witness itself', () => {
  const c = buildConnection({ from: { turnId: 't3', cursor: 40 }, to: { turnId: 't1', cursor: 5 }, sim: 0.9 });
  assert.equal(c.kind, 'candidate', 'never an assertion / claim / event');
  assert.equal(c.grounded, false, 'a candidate is not grounded on its own say-so');
  assert.equal(canGroundConnection(c), false, 'the promotion gate must find an EXAFFERENT document witness (§8)');
});

test('phase 4: nominations() is a READ side-channel — nominating/draining appends NOTHING to the log', async () => {
  const appended = [];
  const m = createMurmur({ appendLog: (e) => appended.push(e), now: () => 5000 });
  const a = Float32Array.from([1, 0]);
  // read A, then read A again → a recognition fires and nominates a candidate connection.
  await m.observe({ ref: { turnId: 't1', docId: 'd', sentIdxs: [0], cursor: 0 }, query: 'topic', queryVec: a, readingVecs: [a], measuresMeaning: true });
  await m.observe({ ref: { turnId: 't2', docId: 'd', sentIdxs: [9], cursor: 9 }, query: 'topic', queryVec: a, readingVecs: [a], measuresMeaning: true });
  assert.ok(m.peekNominations().length >= 1, 'a recognition nominated a candidate connection');
  assert.equal(appended.length, 0, 'nominating appends NOTHING to the log (audit-only, §9)');
  assert.equal(m.config.membrane.canAppendLog, false, 'the membrane stays shut — a candidate is not a steer');
  assert.equal(m.config.membrane.canEditPrompt, false);
  m.nominations();   // drain
  assert.equal(appended.length, 0, 'draining the read side-channel still appends nothing');
});
