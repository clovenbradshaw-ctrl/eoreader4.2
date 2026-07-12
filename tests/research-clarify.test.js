import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runGroundedResearch, splitSubjects } from '../src/rooms/research/driver.js';
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

// ── complex: the request bundles more than one distinct subject ─────────────

test('splitSubjects: comparative fires on two, a plain "and" needs a list of three', () => {
  assert.deepEqual(splitSubjects('React vs Vue'), ['React', 'Vue']);
  assert.deepEqual(splitSubjects('Tesla compared with Edison'), ['Tesla', 'Edison']);
  assert.deepEqual(splitSubjects('Tesla, Edison and Marconi'), ['Tesla', 'Edison', 'Marconi']);
  // conservative — a two-item "and" is often ONE compound name, so it stays quiet
  assert.deepEqual(splitSubjects('Romeo and Juliet'), []);
  assert.deepEqual(splitSubjects('Tesla and Edison'), []);
  // and a generic "X and Y" with no second entity is never two subjects
  assert.deepEqual(splitSubjects('origins and history of dolphins'), []);
  assert.deepEqual(splitSubjects('photosynthesis'), []);
});

test('fires ONE complex ask when the request names several subjects, with scope options', async () => {
  const { log } = await runGroundedResearch('React vs Vue', runOpts());
  const cx = asks(log).filter((e) => e.trigger === 'complex');
  assert.equal(cx.length, 1);
  assert.equal(cx[0].frameId, 'root');
  assert.deepEqual(cx[0].options, ['all of it', 'React', 'Vue', 'how React and Vue connect']);
});

test('does not fire complex on a single-subject request', async () => {
  const { log } = await runGroundedResearch('origins and history of dolphins', runOpts());
  assert.equal(asks(log).filter((e) => e.trigger === 'complex').length, 0);
});

test('at most one preliminary clarification — a homonym wins over the complex check', async () => {
  const { log } = await runGroundedResearch('React vs Vue', runOpts({ disambiguate: homonymDisambiguator }));
  assert.equal(disambiguateAsks(log).length, 1, 'the homonym ask fires');
  assert.equal(asks(log).filter((e) => e.trigger === 'complex').length, 0, 'so complex stays silent');
});

// ── incoherent: the gather returned a corpus that did not bind to the intent ──

// A search whose corpus is mostly off-subject: one page about quokkas, three about
// unrelated things. The naive gather pins them all; only one binds.
const scatterSearch = async () => ([
  { title: 'Quokkas', text: 'Quokkas are small marsupials native to Western Australia. Quokkas are known for a friendly facial expression and cope well around people. Quokkas feed at night on leaves and grasses.' },
  { title: 'Aqueducts', text: 'Roman aqueducts carried water across long distances using gravity and carefully surveyed gradients. The engineering relied on arches and channels built from stone and concrete.' },
  { title: 'Bebop', text: 'Bebop emerged in the nineteen forties as musicians pushed harmony and tempo beyond the swing era. Soloists improvised long lines over rapidly moving chord changes.' },
  { title: 'Volcanoes', text: 'A stratovolcano is built from many layers of hardened lava and ash from successive eruptions. Its steep profile results from viscous magma that cools before it flows far.' },
]);
// A search whose corpus is all on-subject.
const alignedSearch = async () => ([
  { title: 'Quokkas 1', text: 'Quokkas are small marsupials native to Western Australia and nearby islands. Quokkas shelter in dense vegetation during the heat of the day.' },
  { title: 'Quokkas 2', text: 'Quokkas breed once a year and carry a single joey in a pouch. Quokkas can survive long dry spells by drawing on fat stored in their tails.' },
  { title: 'Quokkas 3', text: 'Quokkas were first recorded by European visitors who mistook them for large rats. Quokkas are now protected and concentrated on Rottnest Island.' },
]);
const gatherOpts = (search) => ({ sources: [], save: false, now: () => 0, search, size: 'standard', strategy: 'depth' });

test('fires ONE incoherent ask when a gathered corpus mostly misses the subject', async () => {
  const { log } = await runGroundedResearch('quokkas', gatherOpts(scatterSearch));
  const inc = asks(log).filter((e) => e.trigger === 'incoherent');
  assert.equal(inc.length, 1);
  assert.equal(inc[0].frameId, 'root');
  assert.match(inc[0].text, /don't line up well/);
});

test('does not fire incoherent when the gathered corpus is on-subject', async () => {
  const { log } = await runGroundedResearch('quokkas', gatherOpts(alignedSearch));
  assert.equal(asks(log).filter((e) => e.trigger === 'incoherent').length, 0);
});

test('does not fire incoherent without a search (the corpus is the user\'s own)', async () => {
  // Only a pinned source that misses the subject → a plain VOID, not "incoherent".
  const { log } = await runGroundedResearch('quokkas', runOpts());   // dolphinSource, no search
  assert.equal(asks(log).filter((e) => e.trigger === 'incoherent').length, 0);
});

// ── the popup projection + chat reply cover every clarify trigger ────────────

test('pendingClarification surfaces complex and incoherent asks too', async () => {
  const cx = await runGroundedResearch('React vs Vue', runOpts());
  assert.equal(pendingClarification(cx.log).ask.trigger, 'complex');

  const inc = await runGroundedResearch('quokkas', gatherOpts(scatterSearch));
  assert.equal(pendingClarification(inc.log).ask.trigger, 'incoherent');
});

test('the chat reply lifts an unanswered clarification to the top as an offer to refocus', async () => {
  const session = createResearchSession({ disambiguate: homonymDisambiguator, save: false, now: () => 0 });
  const { report, rootId } = await session.research('dolphins', { sources: [dolphinSource] });
  const reply = formatChatReply(report, rootId);
  const first = reply.split('\n').find((l) => l.trim());
  assert.match(first, /could mean more than one thing/, 'the clarification leads the reply');
  assert.match(first, /marine mammal/, 'it names the sense the run chose');
});
