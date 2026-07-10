// The citation binder binds a claim to the passage it SHARES A REFERENT with, born from signal
// vs noise — not by clearing a fixed slice of lexical overlap. This pins the dolphins regression:
// a claim naming a specific figure (orca / bottlenose) the source names must CITE even though few
// of its words are the passage's, while a claim that shares only the ubiquitous subject
// ("dolphins") plus a coincidental word must NOT — even when its bare lexical overlap is higher.

import { test } from 'node:test';
import assert from 'node:assert';
import { bindCitations } from '../src/enactor/ground/bind.js';

// A page about dolphins: the subject is named in every retrieved passage (so it discriminates
// nothing), while `orca` and `bottlenose` each live in exactly one passage (so they discriminate).
const spans = [
  { idx: 0, text: 'Dolphins are kept in captivity within dolphinariums for research and conservation.' },
  { idx: 1, text: 'Dolphins range in sizes from the small Maui to the orca, the apex predator.' },
  { idx: 2, text: 'Some dolphins can leap nine metres and swim at great speed.' },
  { idx: 3, text: 'The most common dolphins in captivity are the bottlenose.' },
];

const doc = {
  sentences: spans.map((s) => s.text),
  mentions: new Map([
    ['dolphins', [0, 1, 2, 3]],   // the subject — in every span → idfRef 0, pure noise
    ['orca', [1]],                // specific — one span → signal
    ['bottlenose', [3]],          // specific — one span → signal
  ]),
  admission: { labelOf: (id) => id },
};
const cursor = 1;

const bindOne = (claim, opts) => bindCitations(claim, spans, opts)[0];

test('a claim naming a specific shared figure is BORN as a citation, even with thin word overlap', () => {
  const b = bindOne('These species also include both the bottlenose and the orca among others.', { doc, cursor });
  assert.ok(b.citation, 'the bottlenose/orca claim cites — it names figures the source names');
  assert.ok(['s1', 's3'].includes(b.citation), `cites the orca or bottlenose passage, got ${b.citation}`);
});

test('a claim that shares only the ubiquitous subject does NOT cite, even at higher lexical overlap', () => {
  const b = bindOne('Dolphins are highly social and often live together in large pods.', { doc, cursor });
  assert.equal(b.citation, null, 'the pods claim rides uncited — it shares no discriminating figure');
  assert.ok(b.score > 0, 'but it made lexical contact (score > 0), so it flags-and-rides, never "from nowhere"');
});

test('a near-verbatim claim still cites on the surface lift alone', () => {
  const b = bindOne('Dolphins range in sizes from the small Maui to the orca, the apex predator.', { doc, cursor });
  assert.equal(b.citation, 's1', 'the verbatim line cites its passage');
});

test('the referent reading is what rescues the figure claim — without a doc it stays uncited', () => {
  const withDoc = bindOne('These species also include both the bottlenose and the orca among others.', { doc, cursor });
  const noDoc   = bindOne('These species also include both the bottlenose and the orca among others.', {});
  assert.ok(withDoc.citation, 'with the reading, the figure claim cites');
  assert.equal(noDoc.citation, null, 'without a doc the old lexical bar is unmet — the fix is the referent reading, not a lower threshold');
});

test('no-doc binding is unchanged: a verbatim claim still cites through the lexical fallback', () => {
  const b = bindOne('Dolphins range in sizes from the small Maui to the orca, the apex predator.', {});
  assert.equal(b.citation, 's1', 'the fallback still lifts a verbatim match');
});
