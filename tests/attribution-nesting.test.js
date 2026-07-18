import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { perspectiveOf } from '../src/perceiver/perspective.js';
import {
  nestFrames, attributionChains, innermostBearer, attributionNesting, relaysOfPerspective,
} from '../src/perceiver/attribution-nesting.js';

// THE ATTRIBUTION NEST (docs: who is speaking, through whose mouth). A voice rarely reaches the
// page bare — it arrives wrapped in the tellings that relayed it. This proves the Russian
// nest-doll end to end with NO model: each attribution frame, the recursion into its content,
// the outward-in lens chain, the cut where the stack would cycle, and the wiring back into a
// figure's perspective. Pure and deterministic — the bound is arithmetic, not a prompt.

// A small helper: flatten a nest to "bearer:mode" lines, depth-first, for terse assertions.
const flat = (nodes, out = []) => { for (const n of nodes) { out.push(`${n.bearer ?? '∅'}:${n.mode}${n.cycle ? '(cyc)' : ''}`); flat(n.inner, out); } return out; };

test('the matryoshka — a novel that quotes research that quotes people', () => {
  const nest = nestFrames('The novel says that the study found that the villagers said the river was rising.');
  // Two shells resolve here: the novel relays the study. The innermost "villagers said" has no
  // complementizer and no name, so the read stops there rather than inventing a third bearer.
  assert.deepEqual(flat(nest), ['The novel:report', 'the study:report']);   // surface case preserved
  assert.equal(nest[0].bearer, 'The novel');
  assert.equal(nest[0].inner[0].bearer, 'the study');
  // the innermost bearer is whose perspective the claim is finally presented FROM
  assert.equal(innermostBearer(nest), 'the study');
});

test('a deep stack mixing citation, attribution, reported speech, and a direct quote', () => {
  // A citation wraps an attribution wraps a report wraps a verbatim quote — four lenses, one claim.
  const nest = nestFrames('According to Reyes, the study reports that "the vendor lied," quoted in Jones.');
  const chains = attributionChains(nest);
  assert.equal(chains.length, 1);
  const chain = chains[0].map((s) => `${s.bearer ?? '∅'}:${s.mode}`);
  assert.deepEqual(chain, ['Jones:cite', 'Reyes:attribution', 'the study:report', '∅:quote']);
  // outermost is the teller (who RELAYS), innermost is the asserter (whose voice it is)
  assert.equal(chains[0][0].mode, 'cite');
  assert.equal(chains[0][chains[0].length - 1].mode, 'quote');
});

test('the recursion CUTS where the stack would cycle — novels → research → novels', () => {
  const nest = nestFrames('The novel argues that research shows that the novel claims that people lie.');
  // novel → research → novel(repeat): the third shell is the SAME bearer as the first, so it is
  // marked a cycle and NOT descended — the loop is cut at its first repeat, never chased.
  const lines = flat(nest);
  assert.deepEqual(lines, ['The novel:report', 'research:report', 'the novel:report(cyc)']);
  // find the cyclic node and prove it stopped (no inner, though "people lie" sat inside it)
  const cyc = nest[0].inner[0].inner[0];
  assert.equal(cyc.cycle, true);
  assert.deepEqual(cyc.inner, []);
});

test('reported speech vs. a bare capitalised subject — the verb makes the frame', () => {
  // "Smith argued that …" is a report frame; "Smith walked home." is not (walked is no report verb).
  assert.equal(nestFrames('Smith argued that the plan failed.').length, 1);
  assert.equal(nestFrames('Smith argued that the plan failed.')[0].mode, 'report');
  assert.equal(nestFrames('Smith walked home.').length, 0);
});

test('a narrative citation carries its year; a parenthetical citation pins the claim to a source', () => {
  const narr = nestFrames('Smith (2019) argued that surveillance harms trust.');
  assert.equal(narr[0].bearer, 'Smith');
  assert.equal(narr[0].year, '2019');
  assert.equal(narr[0].mode, 'report');            // the year is stepped over; the that-clause governs

  const paren = nestFrames('The river is rising fast (Smith, 2019).');
  assert.equal(paren[0].mode, 'cite');
  assert.equal(paren[0].bearer, 'Smith');
  assert.equal(paren[0].year, '2019');
  assert.match(paren[0].content, /river is rising/);
});

test('an anonymous relay keeps a NULL bearer — it fails toward silence, never invents a source', () => {
  const nest = nestFrames('It is said that the mayor approved the budget.');
  assert.equal(nest.length, 1);
  assert.equal(nest[0].bearer, null);
  assert.equal(nest[0].mode, 'report');
  assert.match(nest[0].content, /mayor approved/);
});

test('a proper-name bearer keeps its case so it can resolve to an admitted referent', () => {
  const doc = parseText('Reyes questioned the budget. Reyes argued that the vendor was hidden.');
  const nz = attributionNesting(doc);
  const framed = nz.sentences.find((s) => /vendor/.test(s.text));
  assert.ok(framed, 'the reported-speech sentence is framed');
  const frame = framed.nested[0];
  assert.equal(frame.bearer, 'Reyes');             // case preserved
  assert.equal(frame.bearerId, doc.admission.idOf('Reyes'));   // and resolved to the referent id
});

test('the document read summarises the weave — depth, relayed sentences, modes', () => {
  const doc = parseText([
    'The report notes that the study found that surveillance spread.',   // 2-deep report stack
    'The sky was blue.',                                                  // no frame
    'It is said that the vendor lied.',                                   // anonymous relay
  ].join(' '));
  const nz = attributionNesting(doc);
  assert.ok(nz.summary.framed >= 2, 'at least the two attributed sentences are framed');
  assert.ok(nz.summary.maxDepth >= 2, 'the report→study stack is two lenses deep');
  assert.ok(nz.summary.relayed >= 1, 'at least one sentence is relayed, not told plain');
  assert.ok(nz.summary.modes.report >= 2);
});

test('a figure\'s perspective is DEEPENED — the shells inside their own voice', () => {
  const doc = parseText([
    'Reyes questioned the budget.',
    'Reyes said, "the vendor report found that the cameras watch the city."',
  ].join(' '));
  const persp = perspectiveOf(doc, [doc.admission.idOf('Reyes')]);
  const relay = relaysOfPerspective(persp, { admission: doc.admission });
  // Inside Reyes's OWN words there is another voice — a report Reyes is relaying, not asserting.
  assert.ok(relay.relays.length >= 1, 'Reyes relays at least one inner voice');
  assert.equal(relay.relays[0].mode, 'report');
  // and the per-quote nest carries the same matryoshka on the single utterance
  assert.ok(relay.byQuote.some((q) => q.nested.length && /vendor|report|camera/.test(q.text)));
});

test('empty / degenerate inputs never throw and read as no attribution', () => {
  assert.deepEqual(nestFrames(''), []);
  assert.deepEqual(nestFrames('   '), []);
  assert.deepEqual(nestFrames('Plain prose with no attribution at all.'), []);
  assert.deepEqual(attributionChains([]), []);
  assert.equal(innermostBearer([]), null);
  assert.deepEqual(relaysOfPerspective(null).relays, []);
  const nz = attributionNesting(null);
  assert.equal(nz.units, 0);
  assert.deepEqual(nz.sentences, []);
});
