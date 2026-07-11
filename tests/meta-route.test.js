import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  metaRoute, phaticDrive, speechCurrents, defaultBases,
  ROUTE_ALPHABET, ROUTE_EXEMPLARS, modelClarifyGate, clarifyDemandOf,
} from '../src/turn/meta-route.js';
import { answerSmalltalk } from '../src/enactor/answer/index.js';

// The demand gate (docs/response-demand.md): a `phatic` direction added to the route measurement
// so a light social turn — "Good morning", "thanks" — settles to PHATIC and short-circuits to a
// warm line instead of forcing the planner. All measurement is on METACOGNITION speech (the model
// describing the turn), the same grain every other basis in meta-route.js measures.

// A read of a plainly social turn. The metacognition re-speaks a greeting the way a small model
// naturally would; the phatic basis is built from just this register.
const GREETING = 'They are just greeting me with a friendly hello — a social pleasantry, they want a warm word back, nothing to look up.';
const THANKS   = 'They are thanking me, a small acknowledgement and a nod; there is no task here, nothing to research or compose.';
// A real question that lives in the reading.
const GROUND   = 'They are asking a factual question about the loaded document; the answer sits in the reading and I should quote the passage that holds it.';
// "hey, how do you get to Waterloo Street?" — a greeting token, but the substance is directions
// the reading cannot hold: it must route OUTWARD, not settle phatic (the worked contrast in the doc).
const STREET   = 'They want directions to a place, how to get to a street; that has to be found out in the wider world, searched for outside the reading.';

test('a phatic read settles the route to PHATIC on a fresh turn', () => {
  const r = metaRoute(GREETING, null);
  assert.equal(r.verdict, 'PHATIC');
  assert.equal(r.route, 'phatic');
  assert.ok(r.phaticDrive > 0, `phaticDrive should fire, got ${r.phaticDrive}`);
});

test('an acknowledgement (thanks) is phatic too', () => {
  const r = metaRoute(THANKS, null);
  assert.equal(r.verdict, 'PHATIC');
  assert.ok(r.phaticDrive > 0);
});

test('a grounding read is NOT phatic — the null gates it out', () => {
  const r = metaRoute(GROUND, null);
  assert.notEqual(r.verdict, 'PHATIC');
  assert.equal(r.phaticDrive, 0, `a doc-question must not clear the phatic null, got ${r.phaticDrive}`);
});

test('Good morning vs Waterloo Street: a directions ask routes outward, never phatic', () => {
  const r = metaRoute(STREET, null);
  assert.notEqual(r.verdict, 'PHATIC');            // not a pleasantry
  assert.equal(r.verdict, 'GROUND');               // research maps to GROUND for routeStance
  assert.equal(r.route, 'research');               // the world has to answer
  assert.equal(r.phaticDrive, 0);
  assert.ok(r.researchDrive > 0, 'the outward gap should fire');
});

test('the fold keeps a mid-thread acknowledgement on continuation, not phatic', () => {
  // A passing "hello" WHILE a compose thread is live. The incumbent carries its REST potential and
  // the continue current, so it out-competes the phatic current through the same lateral inhibition
  // that keeps continuation the default — no special-casing, just the relaxation given one more
  // direction to settle over.
  const fold = { stance: 'compose', stanceDesc: 'composing a poem' };
  const r = metaRoute('They are just saying a quick friendly hello in passing while we keep working on the same poem.', fold);
  assert.equal(r.verdict, 'COMPOSE');
  assert.equal(r.route, 'compose');
});

test('phatic is a real direction in the alphabet, verdict-mapped', () => {
  assert.ok(ROUTE_ALPHABET.includes('phatic'));
  assert.ok(Object.prototype.hasOwnProperty.call(ROUTE_EXEMPLARS, 'phatic'));
});

test('self-recovery: each direction clears its OWN crosstalk null (the CI separation guard)', () => {
  // Every basis must recognise its own exemplar speech above chance — a vocabulary collision that
  // buried a direction under another's null would fail here instead of misrouting a user.
  for (const [dir, phrases] of Object.entries(ROUTE_EXEMPLARS)) {
    const { currents } = speechCurrents(phrases[0]);
    assert.ok((currents[dir] || 0) > 0, `${dir} failed to recover its own speech (current ${currents[dir]})`);
  }
});

test('cross-abstention: phatic and isolate hold each other apart', () => {
  // small-talk used to live in isolate's exemplars and misrouted a greeting into a whole
  // fresh-topic turn; the two are now separated structurally by the crosstalk null.
  const bases = defaultBases();
  const isolateNull = bases.route.get('isolate').null;
  const phaticNull  = bases.route.get('phatic').null;
  // isolate speech does not read as phatic, and phatic speech does not read as a fresh topic.
  assert.equal(phaticDrive(ROUTE_EXEMPLARS.isolate.join(' '), bases), 0);
  const { currents: isoFromPhatic } = speechCurrents(ROUTE_EXEMPLARS.phatic.join(' '), bases);
  assert.equal(isoFromPhatic.isolate || 0, 0, 'phatic speech must not fire the isolate current');
  assert.ok(isolateNull > 0 && phaticNull > 0);
});

// ── the caller floor (docs/response-demand.md rung 3): answerSmalltalk is now doc-aware ──

test('answerSmalltalk is doc-aware: it does not tell you to open a document when one is open', () => {
  const open = answerSmalltalk('Good morning', { hasDoc: true });
  assert.ok(open && open.route === 'smalltalk');
  assert.doesNotMatch(open.text, /open a document/i);

  const howru = answerSmalltalk('how are you?', { hasDoc: true });
  assert.ok(howru && howru.route === 'smalltalk');
});

test('answerSmalltalk stays byte-identical for existing callers (no hasDoc)', () => {
  // The default (no doc) path is unchanged, so tryMechanical and the no-docs branch behave exactly
  // as before.
  const greet = answerSmalltalk('Good morning');
  assert.ok(greet && greet.route === 'smalltalk');
  assert.match(greet.text, /open a document/i);
  // and a real question is still not smalltalk — the anchors keep "hi, who is Gregor?" out.
  assert.equal(answerSmalltalk('who is Gregor?'), null);
});

// ── modelClarifyGate: the decision to disambiguate is a MODEL response read with the physics ──
// The corpus sense gate (turn/sense.js) fires a choice question on any SPELLING collision — the bug
// that looped "Which dolphin — Miami Dolphins or Dolphins?" forever. This gate makes the DECISION a
// metacognition speech measured through the clarify Born physics: a clear ask reads `actionable` and
// is never questioned back; only a genuinely underspecified one clears `clarify`.

// The two metacognition reads the small model would speak — one clear, one genuinely ambiguous.
const CLEAR_READ = 'They are asking a straightforward factual question about which dolphin species is the smallest; the answer is a specific fact and the request is perfectly clear, so I can just answer it.';
const AMBIGUOUS_READ = 'Their request is ambiguous — dolphins could mean the marine animal or the football team, and only they can say which one they mean, so I would have to ask them to clarify before I can answer.';

test('the two metacognition reads land on opposite clarify verdicts (the physics floor)', () => {
  assert.equal(clarifyDemandOf(CLEAR_READ), 'actionable');
  assert.equal(clarifyDemandOf(AMBIGUOUS_READ), 'clarify');
});

test('modelClarifyGate abstains (never asks) with no model — the fallback contract', async () => {
  const off = await modelClarifyGate(null, {})('what is the smallest dolphin');
  assert.equal(off.clarify, false);
  assert.equal(off.demand, '');
});

test('modelClarifyGate does NOT ask when the model reads a clear ask as actionable', async () => {
  // "what is the smallest dolphin" over a football-heavy corpus: the corpus collides, but the model
  // knows the animal is meant, and the physics reads actionable → the gate refuses to question it.
  const model = { phrase: async () => CLEAR_READ };
  const g = await modelClarifyGate(model, {})('what is the smallest dolphin');
  assert.equal(g.demand, 'actionable');
  assert.equal(g.clarify, false);
});

test('modelClarifyGate asks only when the model reads the gap as the user\'s to close', async () => {
  const model = { phrase: async () => AMBIGUOUS_READ };
  const g = await modelClarifyGate(model, {})('tell me about dolphins');
  assert.equal(g.demand, 'clarify');
  assert.equal(g.clarify, true);
  assert.ok(g.drive > 0, 'the clarify current should be exposed for the trail');
});

test('modelClarifyGate is fail-soft: a throwing or empty-speech model abstains', async () => {
  const thrower = { phrase: async () => { throw new Error('cold'); } };
  assert.equal((await modelClarifyGate(thrower, {})('x')).clarify, false);
  const empty = { phrase: async () => '' };
  assert.equal((await modelClarifyGate(empty, {})('x')).clarify, false);
});
