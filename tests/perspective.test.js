import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { perspectiveOf, scanQuotes } from '../src/perceiver/perspective.js';

// A figure's PERSPECTIVE (docs: entity-perspective/voice). When an admitted referent is a
// person or an agent, it is not only a thing the reading is about — it is itself a reader,
// a fold with its own lens. This proves the keep end to end over real parsed prose, with
// NO model: the figure's verbatim quotes, its speech acts, and — the point — the little
// universe its own words instantiate, read by turning the parser back on its quotes.

// A worked scene: a councilmember who speaks, a chief who speaks, and a platform that does
// not. The quotes carry claims OF THEIR OWN (Fusus is a tool; Fusus watches the city) that
// are the speaker's fold, distinct from what the surrounding document asserts.
const SCENE = [
  'Councilmember Reyes questioned the budget.',
  'Reyes asked, "is this surveillance, and who paid for it?"',
  'Reyes said, "Fusus is a surveillance tool that watches the city."',
  '"Fusus records nothing," the chief replied.',
  'Reyes told the council that the vendor was hidden.',
  'Fusus is a platform. Fusus was bought by the city.',
].join(' ');

test('scanQuotes reads both quote forms and resolves the speaker to an admitted id', () => {
  const doc = parseText(SCENE);
  // speaker-first: Reyes said, "…"
  const first = scanQuotes('Reyes said, "Fusus is a surveillance tool."', { admission: doc.admission });
  assert.equal(first.length, 1);
  assert.equal(first[0].form, 'speaker-first');
  assert.equal(first[0].speakerLabel, 'Reyes');
  assert.equal(first[0].speakerId, doc.admission.idOf('Reyes'));
  assert.match(first[0].quote, /Fusus is a surveillance tool/);

  // quote-first: "…," Delgado replied.  (a capitalised but unadmitted speaker → quote stands,
  // attributed by label, id null — the scanner names who spoke even when the graph hasn't met them)
  const second = scanQuotes('"Fusus records nothing," Delgado replied.', { admission: doc.admission });
  assert.equal(second.length, 1);
  assert.equal(second[0].form, 'quote-first');
  assert.equal(second[0].quote, 'Fusus records nothing');
  assert.equal(second[0].speakerLabel, 'Delgado');
  assert.equal(second[0].speakerId, null);

  // a lowercase common-noun speaker ("the chief") is not a NAME — the quote is still read,
  // but with no speaker (fail toward silence, the admission discipline)
  const third = scanQuotes('"Fusus records nothing," the chief replied.', { admission: doc.admission });
  assert.equal(third.length, 1);
  assert.equal(third[0].speakerLabel, null);

  // a single-quoted possessive is NOT a quotation (no manufactured quotes from "the city's")
  assert.equal(scanQuotes("the city's platform recorded nothing").length, 0);
});

test('a speaking figure reads as an agent, carries its verbatim quotes, and keeps them in reading order', () => {
  const doc = parseText(SCENE);
  const reyes = doc.admission.idOf('Reyes');
  const p = perspectiveOf(doc, [reyes]);

  assert.equal(p.isAgent, true);
  assert.equal(p.signals.speaksQuotes, true);
  assert.equal(p.signals.speechSource, true);   // "Reyes told the council …" is a SIG speech edge

  // every quote is attributed to Reyes and traced to a sentence index, in reading order
  assert.ok(p.quotes.length >= 2, 'Reyes has at least two quotes');
  assert.ok(p.quotes.some((q) => /who paid for it/.test(q.text)), 'the budget question is kept');
  assert.ok(p.quotes.some((q) => /surveillance tool/.test(q.text)), 'the surveillance-tool line is kept');
  for (let i = 1; i < p.quotes.length; i++) assert.ok(p.quotes[i].idx >= p.quotes[i - 1].idx);

  // the chief's line was NOT attributed to Reyes
  assert.ok(!p.quotes.some((q) => /records nothing/.test(q.text)), "the chief's line is not Reyes's");
});

test('the universe from the figure\'s fold — quotes re-read as their own document', () => {
  const doc = parseText(SCENE);
  const p = perspectiveOf(doc, [doc.admission.idOf('Reyes')]);

  // the figures the figure's OWN words invoke
  assert.ok(p.fold.figures.some((f) => f.label === 'Fusus'), 'Reyes names Fusus in their fold');

  // the claims the figure's OWN words assert — an IS-A the surrounding document never makes
  // ("Fusus is a surveillance tool" is Reyes's telling; the document calls it "a platform")
  const isA = p.fold.claims.find((c) => c.type === 'is-a' && c.subject === 'Fusus');
  assert.ok(isA, 'Reyes asserts what Fusus IS');
  assert.match(isA.value, /surveillance tool/);

  // the document's own reading disagrees — Fusus is "a platform" there, proving the fold is
  // the SPEAKER's universe, not a copy of the document's
  const docDefs = doc.log.snapshot().filter((e) => e.op === 'DEF' && e.key === 'predicate'
    && e.id === doc.admission.idOf('Fusus'));
  assert.ok(docDefs.some((e) => /platform/.test(e.value)), 'the document calls Fusus a platform');
});

test('the figure\'s speech acts in the document graph are its attributions', () => {
  const doc = parseText(SCENE);
  const p = perspectiveOf(doc, [doc.admission.idOf('Reyes')]);
  // "Reyes told the council …" — a SIG speech out-edge whose verb is a speech verb
  const told = p.attributions.find((a) => a.via === 'told');
  assert.ok(told, 'Reyes told someone');
  assert.equal(told.label.toLowerCase(), 'council');
});

test('a non-speaking referent (a platform) is not an agent and has no voice', () => {
  const doc = parseText(SCENE);
  const p = perspectiveOf(doc, [doc.admission.idOf('Fusus')]);
  assert.equal(p.isAgent, false);
  assert.equal(p.quotes.length, 0);
  assert.equal(p.attributions.length, 0);
  assert.deepEqual(p.fold.figures, []);
});

test('a birth-year person-key is agent gravity on its own (a named figure that never speaks)', () => {
  // No quotes, no speech edges — but "(born 1961)" is the functional person-key admission
  // harvests, and that alone is enough for the figure to read as a person.
  const doc = parseText('Chris Carter (born 1961) created the series. The series ran for years.');
  const id = doc.admission.idOf('Chris Carter');
  const p = perspectiveOf(doc, [id]);
  assert.equal(p.signals.personKey, true);
  assert.equal(p.isAgent, true);
});

test('empty / missing focus degrades to an inert perspective, never throws', () => {
  const doc = parseText(SCENE);
  assert.equal(perspectiveOf(doc, []).isAgent, false);
  assert.equal(perspectiveOf(null, ['x']).isAgent, false);
  assert.deepEqual(perspectiveOf(doc, ['no-such-id']).quotes, []);
});
