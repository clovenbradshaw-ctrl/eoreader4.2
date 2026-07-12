import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  queryTerms,
  refusalAtom,
  answerabilityGate,
  followUpOffer,
  classifyWantedType,
} from '../src/weave/longgen/answerable.js';

// The refusal atom shows the spans the corpus DOES hold when it cannot answer. The
// snippets were cut at a flat 80 chars from the head, which (a) severed the very clause
// that bore on the ask and (b) left "…." at the seam and danglers like "1977,…". These
// pin the three disciplines the trim now keeps: centred, bounded, clean.

// The worked case from the export: "what is the tallest house?" against a corpus that
// holds the tallest house OF CARDS and a list of tallest BUILDINGS — no definition.
const HELD = [
  { idx: 52, score: 0.667, text: "World's tallest house of cards Berg first broke the world record for the world's tallest house of free-standing playing cards in 1992 at the age of seventeen, with a tower fourteen and a half feet (4.4 meters) tall." },
  { idx: 897, score: 0.667, text: "BHP House was the city's tallest for a few years, and remains one of the few heritage-registered skyscrapers in Melbourne." },
  { idx: 898, score: 0.667, text: "Slightly taller, the Optus Centre was completed in 1975, and then in 1977, Nauru House became the tallest building in Melbourne, at a height of 182 metres (597 ft)." },
];

test('queryTerms keeps content words, drops stopwords, is caps-independent and de-duped', () => {
  assert.deepEqual(queryTerms('what is the tallest house?'), ['tallest', 'house']);
  assert.deepEqual(queryTerms(''), []);
  // leading question word + article dropped; a repeat is not emitted twice
  assert.deepEqual(queryTerms('How tall is the tallest tower?'), ['tall', 'tallest', 'tower']);
});

test('refusalAtom centres a held span on the ask instead of its lead-in', () => {
  const focus = queryTerms('what is the tallest house?');
  const { text } = refusalAtom('no-definition', HELD, [], focus);
  // the Optus span's peak clause is now shown...
  assert.match(text, /Nauru House became the tallest building in Melbourne/);
  // ...and its useless lead-in ("…completed in 1975, and then in 1977,…") is gone
  assert.doesNotMatch(text, /Optus Centre was completed in 1975, and then in 1977,/);
});

test('refusalAtom leaves no "…." seam and no dangling clause punctuation', () => {
  const focus = queryTerms('what is the tallest house?');
  const { text } = refusalAtom('no-definition', HELD, [], focus);
  assert.doesNotMatch(text, /…\./, 'ellipsis immediately followed by a full stop');
  assert.doesNotMatch(text, /[,;:]…/, 'a comma/semicolon/colon left dangling before the mark');
});

test('refusalAtom keeps the relevant head when it is already in the window (no needless shift)', () => {
  const focus = queryTerms('what is the tallest house?');
  const { text } = refusalAtom('no-definition', HELD, [], focus);
  // Berg's first "tallest house of cards" sits in the head window — it stays shown
  assert.match(text, /World's tallest house of cards Berg first broke/);
});

test('refusalAtom does not truncate a span that already fits, and cites its sources', () => {
  const held = [{ idx: 7, score: 1, text: 'Short held line.' }];
  const atom = refusalAtom('no-ground', held, [], []);
  assert.match(atom.text, /They do hold: Short held line\.$/);
  assert.doesNotMatch(atom.text, /…/);
  assert.deepEqual(atom.sources, [7]);
});

test('refusalAtom with no focus still truncates cleanly (mark, not "….")', () => {
  const held = [{ idx: 1, score: 1, text: 'A single long unbroken clause that keeps going well past the eighty character display window without any sentence stop at all' }];
  const { text } = refusalAtom('no-ground', held, [], []);
  assert.match(text, /…$/, 'a cut span ends on the ellipsis');
  assert.doesNotMatch(text, /…\./);
});

test('answerabilityGate threads the question focus all the way into the refusal', () => {
  const gate = answerabilityGate({ question: 'what is the tallest house?', ground: HELD });
  assert.equal(gate.licensed, false);
  assert.equal(gate.reason, 'no-definition');
  // proof the focus flowed through the gate: the centred clause is in the refusal text
  assert.match(gate.refusal.text, /Nauru House became the tallest building in Melbourne/);
  assert.doesNotMatch(gate.refusal.text, /…\./);
});

// The reported failure: "What is the capital of France?" against web ground that plainly
// holds "…is Paris" came back "The sources do not contain a definition. They do hold: …"
// with guillotined "…" fragments — because EVERY "what is …" opener was typed as a
// `definition`, and the narrow defining-verb test then refused a ground that answers with
// "…is Paris" rather than a dictionary "X is a …". A factual attribute lookup is a `fact`,
// which the gate licenses; the walk runs and the answer (Paris) is given, not refused.
test('classifyWantedType: "what is the X of Y" is a fact lookup, not a definition', () => {
  assert.equal(classifyWantedType('What is the capital of France?'), 'fact');
  assert.equal(classifyWantedType('What is the capital city of France?'), 'fact');
  assert.equal(classifyWantedType('What is the population of Japan?'), 'fact');
  assert.equal(classifyWantedType("What is France's capital?"), 'fact');
  assert.equal(classifyWantedType('What is her name?'), 'fact');
});

test('classifyWantedType: a genuine "what is a X" / define / mean stays a definition', () => {
  assert.equal(classifyWantedType('What is a black hole?'), 'definition');
  assert.equal(classifyWantedType('What is entropy?'), 'definition');
  assert.equal(classifyWantedType('define recursion'), 'definition');
  assert.equal(classifyWantedType('What does ephemeral mean?'), 'definition');
  // the worked refusal case above must keep typing as a definition
  assert.equal(classifyWantedType('what is the tallest house?'), 'definition');
});

test('answerabilityGate LICENSES "what is the capital of France?" when the ground holds it', () => {
  const ground = [
    { idx: 0, score: 0.9, text: 'Its capital, largest city and main cultural and economic centre is Paris.' },
    { idx: 1, score: 0.4, text: 'The oldest traces of archaic humans in what is now France date from 1.8 million years ago.' },
  ];
  const gate = answerabilityGate({ question: 'What is the capital city of France?', ground });
  assert.equal(gate.licensed, true, 'the walk runs — a supplied answer must not be refused');
  assert.equal(gate.refusal, null, 'no "sources do not contain a definition. They do hold: …" atom');
});

test('followUpOffer has the same clean seam (no "…." after a trimmed topic)', () => {
  const ground = [
    { idx: 3, score: 0.9, text: 'A developable region with plenty of uncovered mass and enough content to support a further walk without confabulating anything.' },
  ];
  const offer = followUpOffer(ground, new Set());
  assert.match(offer, /^I can go deeper on: /);
  assert.doesNotMatch(offer, /…\./);
});
