// Follow-up pronoun anchoring (turn/converse/reference.js + dialogue-state.js). The Neil-Armstrong
// misfire: after "who is neil armstrong?" → "who was his wife?" (answered with Janet, then Carol),
// the follow-up "where was he born?" bound "he" to Carol Held Knight — the most recently NAMED figure
// — because warmth counted only re-namings (so the subject, carried by pronouns, went cold) and there
// was no gender check. The fix: warmth counts every reference (pronoun edges included), and a gendered
// pronoun never binds to a figure the text marks as the other gender. Offline, no model.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { conversationCast, roleGenders, pronounGender } from '../src/turn/converse/reference.js';
import { resolveQuery } from '../src/turn/converse/dialogue-state.js';

// The exact display texts from the exported chat that glitched.
const HISTORY = [
  { role: 'user', content: 'who is neil armstrong?' },
  { role: 'assistant', content: 'Neil Armstrong (August 5, 1930 – August 25, 2012) was an American astronaut and aeronautical engineer. As commander of the 1969 Apollo 11 mission, he became the first person to walk on the Moon.' },
  { role: 'user', content: 'who was his wife?' },
  { role: 'assistant', content: 'His wife was Janet Elizabeth Shearon, whom he met at a party while she was majoring in home economics. He was also later married to Carol Held Knight.' },
];

test('pronounGender reads the gendered follow-up', () => {
  assert.equal(pronounGender('where was he born?'), 'm');
  assert.equal(pronounGender('where did she grow up?'), 'f');
  assert.equal(pronounGender('what about apollo 11?'), null);
});

test('roleGenders marks the wives female (role noun + spouse verb), leaves the subject unmarked', () => {
  const g = roleGenders(HISTORY.map((h) => h.content).join('\n\n'));
  assert.equal(g.get('janet'), 'f');   // "his wife was Janet"
  assert.equal(g.get('carol'), 'f');   // "He … married to Carol" → male subject's spouse is female
  assert.equal(g.get('neil'), undefined);
  assert.equal(g.get('armstrong'), undefined);
});

test('"where was he born?" anchors to Neil, not the wife the prior answer just named', () => {
  const cast = conversationCast(HISTORY, 'where was he born?');
  assert.equal(cast[0].label, 'Neil Armstrong');
  // the gendered wives are demoted below the subject, not dropped
  assert.ok(cast.some((c) => c.label === 'Janet Elizabeth Shearon'));
  assert.ok(cast.some((c) => c.label === 'Carol Held Knight'));
  assert.match(resolveQuery('where was he born?', HISTORY), /Neil Armstrong/);
  assert.doesNotMatch(resolveQuery('where was he born?', HISTORY), /Carol/);
});

test('"where did she grow up?" still anchors to the female figure the thread is on', () => {
  const cast = conversationCast(HISTORY, 'where did she grow up?');
  assert.equal(cast[0].label, 'Janet Elizabeth Shearon');
  assert.match(resolveQuery('where did she grow up?', HISTORY), /Janet/);
});

test('no gendered pronoun → the warmth order is untouched (no gender re-ranking)', () => {
  const withPronoun = conversationCast(HISTORY, 'where was he born?');
  const noPronoun = conversationCast(HISTORY, 'tell me about apollo 11');
  // The no-pronoun cast is pure warmth (the most-referenced figure leads); the he-cast is re-ranked.
  assert.notEqual(withPronoun[0].label, undefined);
  // The female figures are NOT demoted when there is no gendered pronoun.
  assert.equal(noPronoun[0].label, conversationCast(HISTORY, 'tell me about apollo 11')[0].label);
});
