import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMurmur, murmurConfig, senseSignal, meanVec } from '../src/murmur/index.js';
import { SESSIONS, worstMovie, dolphin } from './fixtures/murmur-sessions.js';

// The replay harness (spec §12). murmur lives or dies on its threshold, so we tune it against a
// corpus of recorded failures fed through `sense` OFFLINE. The load-bearing assertions:
//   · the off-topic exchange raises `drift` BEFORE the generation step's timestamp (the
//     pre-generation catch — a 60s post-hoc flag turned into a pre-stream correction);
//   · the phatic opener raises NOTHING (the control — the worker stays asleep with no signal);
//   · the deictic follow-up is what makes the catch possible: the anchor stays on the SESSION
//     topic, not the contentless query string (spec §5 worst-movie exchange-2);
//   · a USER redirect re-anchors and does not read as drift (spec §9.6).
//
// Fresh murmur per session, deterministic (no narrator, audit-only). We drive `observe` per
// exchange and read the registers RAISED THIS exchange (not the whole ring).

// A murmur with commit forced OFF (rng≈1) so replay is about the SIGNAL, not the stochastic
// commit — commit is exercised separately in murmur-born.test.js.
const freshMurmur = () => createMurmur({ config: murmurConfig(), rng: () => 0.999, now: (() => { let t = 1000; return () => (t += 1000); })() });

const registerNames = (result) => result.registers.map(r => r.register);

for (const session of SESSIONS) {
  test(`replay [${session.id}]: drift fires on the off-topic exchange, before generation`, async () => {
    const m = freshMurmur();
    for (let i = 0; i < session.exchanges.length; i++) {
      const ex = session.exchanges[i];
      const result = await m.observe({
        ref: { turnId: `${session.id}-${i}`, stepName: 'fold', t: ex.foldTs },
        query: ex.query, queryVec: ex.queryVec, readingVecs: ex.readingVecs,
        concentration: ex.concentration, measuresMeaning: true,
      });
      const names = registerNames(result);

      if (ex.expect.drift) {
        assert.ok(names.includes('drift'),
          `[${session.id} ex${i} "${ex.query}"] expected drift, got [${names.join(', ')}] (drift=${result.signal.drift})`);
        // pre-generation: the fold stop that raised drift happened before the first token.
        assert.ok(ex.foldTs < ex.generationTs,
          `[${session.id} ex${i}] drift must be caught at fold (${ex.foldTs}ms) before generation (${ex.generationTs}ms)`);
      } else {
        assert.ok(!names.includes('drift'),
          `[${session.id} ex${i} "${ex.query}"] expected NO drift, got [${names.join(', ')}] (drift=${result.signal.drift})`);
      }

      if (ex.expect.phatic) {
        assert.equal(names.length, 0,
          `[${session.id} ex${i}] the phatic opener is the control — it must raise nothing, got [${names.join(', ')}]`);
      }
      if (ex.expect.deictic) {
        assert.equal(result.topicNote.deictic, true,
          `[${session.id} ex${i} "${ex.query}"] expected a deictic follow-up (anchor stays on topic)`);
      }
      if (ex.expect.userRedirect) {
        assert.equal(result.topicNote.deictic, false,
          `[${session.id} ex${i} "${ex.query}"] a user redirect is content, not deictic`);
      }
    }
  });
}

test('worst-movie exchange 2 fires ONLY because the anchor is the session topic, not the query', async () => {
  // The exact spec claim (§5): "yeah go research that" carries no topical content; anchoring drift
  // on that string lets retrieval wander freely. Prove the counterfactual — if we (wrongly) anchor
  // on the follow-up query itself, drift collapses and the failure is missed.
  const ex1 = worstMovie.exchanges[0], ex2 = worstMovie.exchanges[1];

  // correct: session-topic anchor → drift fires.
  const m = freshMurmur();
  await m.observe({ ref: { turnId: 'wm-0', stepName: 'fold', t: ex1.foldTs }, query: ex1.query, queryVec: ex1.queryVec, readingVecs: ex1.readingVecs, concentration: ex1.concentration });
  const good = await m.observe({ ref: { turnId: 'wm-1', stepName: 'fold', t: ex2.foldTs }, query: ex2.query, queryVec: ex2.queryVec, readingVecs: ex2.readingVecs, concentration: ex2.concentration });
  assert.ok(registerNames(good).includes('drift'), 'with the session-topic anchor, drift fires');
  assert.equal(good.topicNote.deictic, true, 'the follow-up is recognized as deictic');

  // counterfactual: if drift were anchored on the follow-up QUERY embedding (the naive design),
  // it collapses — the query vector sits near the drifted reading, so there is nothing to catch.
  const reading = meanVec(ex2.readingVecs);
  const anchoredOnTopic = senseSignal({ anchorVec: ex1.queryVec, readingCentroid: reading, measuresMeaning: true }).drift;
  const anchoredOnQuery = senseSignal({ anchorVec: ex2.queryVec, readingCentroid: reading, measuresMeaning: true }).drift;
  assert.ok(anchoredOnTopic >= 0.55, `session-topic anchor keeps drift high (${anchoredOnTopic.toFixed(3)})`);
  assert.ok(anchoredOnQuery < anchoredOnTopic - 0.3,
    `anchoring on the contentless follow-up (${anchoredOnQuery.toFixed(3)}) would miss the failure the topic anchor catches (${anchoredOnTopic.toFixed(3)})`);
});

test('the sense stays asleep on the phatic control — no impressions, no commit', async () => {
  const m = freshMurmur();
  const opener = dolphin.exchanges[0];
  const result = await m.observe({ ref: { turnId: 'd-0', stepName: 'fold', t: opener.foldTs }, query: opener.query, queryVec: opener.queryVec, readingVecs: opener.readingVecs, concentration: opener.concentration });
  assert.equal(result.registers.length, 0, 'phatic opener raises no registers');
  assert.equal(result.collapse.commit, false, 'nothing to commit');
  assert.equal(result.steer, null, 'no steer event');
});
