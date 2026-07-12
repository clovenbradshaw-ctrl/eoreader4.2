import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGroundedResearch } from '../src/rooms/research/driver.js';
import { createResearchSession, formatChatReply, pendingClarification, refocusQuery } from '../src/rooms/research/session.js';

// The deep-research driver opens with a PRELIMINARY clarification: when the subject
// is a homonym — it binds to more than one entity — it surfaces ONE up-front ask so
// the user can say which sense they meant. The rules the ask must obey (the reason it
// exists): it must NOT nag (only a measured homonym, once per run, deduped across the
// session, never offline) and it must NOT gate the research (the run proceeds on its
// best-guess sense whether or not it is answered). These lock that behaviour.

// A homonym prior in the shape modelDisambiguator returns (disambiguate.js): the
// committed sense plus the rival senses it is steering away from.
const dolphinPrior = {
  subject: 'dolphins', sense: 'marine mammal', senseTerms: ['cetacean', 'marine'],
  anchor: 'cetacean', collision: 'NFL team',
  alternatives: [{ sense: 'NFL team', terms: ['football', 'miami'] }],
};
const homonymDisambiguator = async () => dolphinPrior;
// The unambiguous answer: a subject that names only one thing (photosynthesis) — the
// gate returns null, exactly as modelDisambiguator does on {"ambiguous":false}.
const unambiguousDisambiguator = async () => null;

// A pinned source about the marine mammal — well-formed sentences that carry the
// subject term so the root frame binds and the run produces grounded propositions
// (proof the research actually ran). No URL → no network in the pin.
const dolphinSource = {
  title: 'River dolphins',
  text: 'Dolphins are highly intelligent marine mammals found across the world. '
      + 'Dolphins use echolocation to navigate and to hunt fish in murky water. '
      + 'Dolphins live in social groups called pods and cooperate when feeding.',
};

const runOpts = (extra = {}) => ({ sources: [dolphinSource], save: false, now: () => 0, ...extra });

const asks = (log) => log.filter((e) => e.kind === 'ask');
const disambiguateAsks = (log) => asks(log).filter((e) => e.trigger === 'disambiguate');

test('fires ONE disambiguate ask on a homonym subject, at the root, with the senses as options', async () => {
  const { log, report } = await runGroundedResearch('dolphins', runOpts({ disambiguate: homonymDisambiguator }));

  const da = disambiguateAsks(log);
  assert.equal(da.length, 1, 'exactly one preliminary clarification');
  assert.equal(da[0].frameId, 'root', 'raised on the root frame, before any gather');
  assert.deepEqual(da[0].options, ['marine mammal', 'NFL team'], 'the committed sense first, then the rivals');
  assert.match(da[0].text, /more than one thing/);

  // It is the FIRST thing that happens after the root frame opens (advisory, up front).
  const kinds = log.map((e) => e.kind);
  assert.equal(kinds[0], 'open');
  assert.equal(kinds[1], 'ask');

  // NON-GATING: the research still ran — the corpus was pinned, read, and grounded.
  assert.ok(report.propositions.length >= 1, 'the run produced grounded propositions regardless of the ask');
});

test('never fires without a disambiguator (offline is byte-identical)', async () => {
  const withOut = await runGroundedResearch('dolphins', runOpts());
  const withNull = await runGroundedResearch('dolphins', runOpts({ disambiguate: null }));
  assert.equal(disambiguateAsks(withOut.log).length, 0);
  assert.equal(disambiguateAsks(withNull.log).length, 0);
  // The two logs match event-for-event: injecting a null disambiguator changes nothing.
  assert.deepEqual(withOut.log.map((e) => e.kind), withNull.log.map((e) => e.kind));
});

test('does not fire on an unambiguous subject (the gate returned no rival senses)', async () => {
  const { log } = await runGroundedResearch('photosynthesis', runOpts({ disambiguate: unambiguousDisambiguator }));
  assert.equal(disambiguateAsks(log).length, 0, 'no homonym → no clarification, so it never nags');
});

test('clarify:false suppresses the ask even when the subject is a homonym', async () => {
  const { log } = await runGroundedResearch('dolphins', runOpts({ disambiguate: homonymDisambiguator, clarify: false }));
  assert.equal(disambiguateAsks(log).length, 0);
});

test('deduped across runs on the same subject in one session — asks at most once', async () => {
  const session = createResearchSession({ disambiguate: homonymDisambiguator, save: false, now: () => 0 });
  await session.research('dolphins', { sources: [dolphinSource] });
  await session.research('dolphins', { sources: [dolphinSource] });   // same subject again
  assert.equal(disambiguateAsks(session.log).length, 1, 'the second run on the same subject stays silent');

  // A genuinely different homonym in the same session still gets its own clarification.
  await session.research('mercury', { sources: [{ title: 'Mercury', text:
    'Mercury is the smallest planet in the Solar System and the closest to the Sun. '
    + 'Mercury has almost no atmosphere and swings between extreme heat and cold.' }] });
  assert.equal(disambiguateAsks(session.log).length, 2, 'a different subject asks on its own');
});

test('does not gate: an injected ask is recorded but the findings are identical either way', async () => {
  const unanswered = await runGroundedResearch('dolphins', runOpts({ disambiguate: homonymDisambiguator }));
  const answered = await runGroundedResearch('dolphins', runOpts({
    disambiguate: homonymDisambiguator,
    // A user who answers only the clarification and lets the rest ride.
    ask: async (ev) => (ev.trigger === 'disambiguate' ? 'the marine mammal' : null),
  }));

  // The clarification's answer was logged against its ask...
  const da = disambiguateAsks(answered.log)[0];
  const ans = answered.log.filter((e) => e.kind === 'answer' && e.askId === da.id);
  assert.equal(ans.length, 1);
  assert.equal(ans[0].reply, 'the marine mammal');
  assert.equal(unanswered.log.filter((e) => e.kind === 'answer').length, 0);

  // ...but the research is the same run either way: the grounded propositions match.
  const spans = (r) => r.report.propositions.map((p) => p.span.text).sort();
  assert.deepEqual(spans(answered), spans(unanswered), 'the reply never changes what was researched');
});

// ── The popup's projection (surface.js drives its non-blocking card off these) ──

test('pendingClarification surfaces the newest unanswered, un-resolved disambiguate ask with its subject', async () => {
  const { log } = await runGroundedResearch('dolphins', runOpts({ disambiguate: homonymDisambiguator }));
  const pending = pendingClarification(log);
  assert.ok(pending, 'a homonym run has a clarification to offer');
  assert.equal(pending.ask.trigger, 'disambiguate');
  assert.equal(pending.question, 'dolphins', 'it carries the subject the card refocuses from');
  assert.deepEqual(pending.ask.options, ['marine mammal', 'NFL team']);
});

test('pendingClarification hides the card once the ask is answered or the user dismisses it', async () => {
  const { log } = await runGroundedResearch('dolphins', runOpts({
    disambiguate: homonymDisambiguator,
    ask: async (ev) => (ev.trigger === 'disambiguate' ? 'marine mammal' : null),
  }));
  assert.equal(pendingClarification(log), null, 'an answered ask is no longer pending');

  // And an un-answered ask the user dismissed in the UI (its id in `resolved`) is gone too.
  const { log: log2 } = await runGroundedResearch('dolphins', runOpts({ disambiguate: homonymDisambiguator }));
  const askId = log2.find((e) => e.kind === 'ask' && e.trigger === 'disambiguate').id;
  assert.equal(pendingClarification(log2, new Set([askId])), null);
  assert.ok(pendingClarification(log2), 'but it is pending until dismissed');
});

test('pendingClarification returns null when there was no clarification', async () => {
  const { log } = await runGroundedResearch('dolphins', runOpts());   // offline, no disambiguator
  assert.equal(pendingClarification(log), null);
});

test('refocusQuery sharpens the subject with the chosen sense', () => {
  assert.equal(refocusQuery('dolphins', 'NFL team'), 'dolphins NFL team');
  assert.equal(refocusQuery('mercury', 'the planet'), 'mercury the planet');
  assert.equal(refocusQuery('dolphins', ''), 'dolphins');   // empty sense → subject unchanged
});

test('the chat reply lifts an unanswered clarification to the top as an offer to refocus', async () => {
  const session = createResearchSession({ disambiguate: homonymDisambiguator, save: false, now: () => 0 });
  const { report, rootId } = await session.research('dolphins', { sources: [dolphinSource] });
  const reply = formatChatReply(report, rootId);
  const first = reply.split('\n').find((l) => l.trim());
  assert.match(first, /could mean more than one thing/, 'the clarification leads the reply');
  assert.match(first, /marine mammal/, 'it names the sense the run chose');
});
