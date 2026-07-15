import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { perspectiveOf } from '../src/perceiver/perspective.js';
import { claimsFromDoc, parseFold } from '../src/perceiver/figure-fold.js';
import { transmissionFloor, traceTransmission } from '../src/perceiver/idea-transmission.js';

// IDEA TRANSMISSION — watch a claim change hands. A claim first voiced by one figure that a
// later figure voices too is an idea propagating through the cast; where the later voice inverts
// it, the idea mutated as it spread. This pins the model-free floor, the ≥2-voice rule, the flip
// (mutation) detection, and the learned lift that clusters paraphrases into one idea.

// Timed claim streams (what the app builds from figure-fold, one claim per quote, time-stamped to
// the document sentence): Reyes says it first; Delgado echoes it; Vega inverts it.
const streams = [
  { label: 'Reyes', claims: [
    { docIdx: 2, claim: { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' } },
    { docIdx: 3, claim: { type: 'is-a', subject: 'Fusus', value: 'a surveillance tool' } },
  ] },
  { label: 'Delgado', claims: [
    { docIdx: 7, claim: { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' } },
  ] },
  { label: 'Vega', claims: [
    { docIdx: 9, claim: { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city', polarity: '-' } },
  ] },
];

test('an idea carried by two voices traces origin → hops, in document time', () => {
  const { ideas, metric } = transmissionFloor(streams);
  assert.equal(metric.basis, 'lexical');
  const watched = ideas.find((i) => /watches the city/.test(i.text));
  assert.ok(watched, 'the "watches the city" idea is a transmission');
  assert.equal(watched.origin.label, 'Reyes');           // earliest voice
  assert.equal(watched.origin.docIdx, 2);
  assert.equal(watched.speakers, 3);                     // Reyes → Delgado → Vega
  assert.equal(watched.hops[0].label, 'Delgado');
  assert.equal(watched.hops[0].relation, 'echoed');      // same sign
  assert.equal(watched.hops[1].label, 'Vega');
  assert.equal(watched.hops[1].relation, 'flipped');     // Vega inverts it — a mutation
  assert.match(watched.hops[1].text, /does not watches the city/);
});

test('a claim only one voice makes is not a transmission', () => {
  const { ideas } = transmissionFloor(streams);
  assert.ok(!ideas.some((i) => /surveillance tool/.test(i.text)), 'Reyes alone → no transmission');
  assert.equal(transmissionFloor([streams[0]]).ideas.length, 0, 'one speaker → nothing circulates');
});

test('the mutation count is reported', () => {
  const { metric } = transmissionFloor(streams);
  assert.equal(metric.mutations, 1);                     // Vega's flip
});

// A stub MEANING embedder: paraphrases of "watch the city" map to one axis; polarity is carried
// separately (the parser's, not spelling's). Stands in for MiniLM so the lift is testable.
const stub = {
  measuresMeaning: true,
  embed: async (text) => {
    const v = [0, 0, 0, 0];
    v[/watch|monitor|surveil/.test(text) ? 0 : /legal|lawful/.test(text) ? 1 : /safe|protect/.test(text) ? 2 : 3] = 1;
    return v;
  },
};

test('the learned lift clusters a paraphrased echo into the same idea', async () => {
  const para = [
    { label: 'Reyes', claims: [{ docIdx: 1, claim: { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' } }] },
    { label: 'Ito', claims: [{ docIdx: 5, claim: { type: 'link', subject: 'Fusus', via: 'monitors', object: 'the streets' } }] },
  ];
  assert.equal(transmissionFloor(para).ideas.length, 0, 'the floor sees two unrelated clauses');

  const lifted = await traceTransmission(para, { embedder: stub, minSim: 0.5 });
  assert.equal(lifted.metric.basis, 'meaning');
  assert.equal(lifted.ideas.length, 1, 'meaning traces the paraphrase as one idea');
  assert.equal(lifted.ideas[0].origin.label, 'Reyes');
  assert.equal(lifted.ideas[0].hops[0].label, 'Ito');
});

test('end to end from real prose: figure-fold time-stamps claims per quote', () => {
  // Two speakers, the second echoing the first — built the way the app does it: parse each of a
  // figure's quotes and tag its claims with that quote's document sentence index.
  const SCENE = 'Reyes and Ford met to discuss the budget. Reyes said, "Fusus watches the city." The council listened in silence for a while. Weeks later, Ford came around to the same view. Ford said, "Fusus watches the city."';
  const doc = parseText(SCENE);
  const speech = doc.conventions?.isAttributionVerb;
  const streamFor = (label) => {
    const p = perspectiveOf(doc, [doc.admission.idOf(label)].filter(Boolean), { isSpeech: speech });
    const claims = [];
    for (const q of p.quotes) {
      const qd = parseFold(q.text, label);
      for (const c of claimsFromDoc(qd)) claims.push({ docIdx: q.idx, claim: c });
    }
    return { label, claims };
  };
  const { ideas } = transmissionFloor([streamFor('Reyes'), streamFor('Ford')]);
  const watched = ideas.find((i) => /watches (the )?city/.test(i.text));
  assert.ok(watched, 'the shared claim traces as a transmission from real prose');
  assert.equal(watched.origin.label, 'Reyes');           // Reyes speaks earlier in the document
  assert.equal(watched.hops[0].label, 'Ford');
});
