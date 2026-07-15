import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { perspectiveOf } from '../src/perceiver/perspective.js';
import { answerFromPerspective, withinFold, foldEscape, foldSurface } from '../src/surfer/perspective-answer.js';

// PERSPECTIVE-CONDITIONED ANSWERING — answer a question as the record holds it from inside one
// figure's fold: not what is true, not what the document says, but what THIS figure's own words
// commit to. A mechanically bounded projection (never roleplay), gated by referential containment,
// that dwells in the void rather than fabricate when the figure's words are silent.

// A hand-built fold gives the gate tests exact control over the allowed vocabulary.
const reyes = {
  label: 'Reyes',
  quotes: [{ text: 'Fusus watches the city.' }, { text: 'Fusus is a surveillance tool.' }],
  fold: { figures: [], claims: [
    { type: 'link', subject: 'Fusus', via: 'watches', object: 'the city' },
    { type: 'is-a', subject: 'Fusus', value: 'a surveillance tool' },
  ] },
};
const delgado = {
  label: 'Delgado',
  quotes: [{ text: 'Fusus is a safety tool.' }],
  fold: { figures: [], claims: [{ type: 'is-a', subject: 'Fusus', value: 'a safety tool' }] },
};

test('answers from the figure\'s own claims, and the answer stays inside the fold', () => {
  const a = answerFromPerspective(reyes, 'is Fusus surveillance?');
  assert.equal(a.addressed, true);
  assert.equal(a.label, 'Reyes');
  assert.ok(/surveillance tool/.test(a.answer));
  assert.equal(a.contained, true, 'the answer introduces nothing the figure never said');
  assert.equal(withinFold(a.answer, reyes), true);
});

test('selection is by relevance — a term that hits one claim returns that claim, not the other', () => {
  const a = answerFromPerspective(reyes, 'does Fusus watch the city?');
  assert.ok(a.claims.some((c) => /watches the city/.test(c.text)), 'the watch claim is selected');
  const s = answerFromPerspective(reyes, 'is it surveillance?');
  assert.equal(s.claims.length, 1);
  assert.ok(/surveillance/.test(s.claims[0].text), 'only the surveillance claim is relevant');
});

test('the typed void — the figure\'s words don\'t address it, so nothing is asserted', () => {
  const a = answerFromPerspective(reyes, 'who won the election?');
  assert.equal(a.addressed, false);
  assert.equal(a.claims.length, 0);
  assert.match(a.answer, /don't address that/);
  // the void answer names the silence and asserts no claim about the world
  assert.equal(foldEscape(a.answer, reyes).names.length, 0);
});

test('the referential gate rejects an answer that steps outside the fold (adversarial)', () => {
  // a phrasing that injects a name the figure never used, and a number they never gave
  assert.equal(withinFold('Fusus is run by Interpol.', reyes), false);
  assert.ok(foldEscape('Fusus is run by Interpol.', reyes).names.includes('Interpol'));
  assert.equal(withinFold('Fusus cost 5000000 dollars.', reyes), false);
  assert.ok(foldEscape('Fusus cost 5000000 dollars.', reyes).numbers.includes('5000000'));
  // a phrasing that stays within the figure's own vocabulary passes
  assert.equal(withinFold('Reyes holds that Fusus watches the city.', reyes), true);
  assert.ok(foldSurface(reyes).includes('surveillance tool'));
});

test('two figures answer the SAME question from their own universes — divergence, not one truth', () => {
  const q = 'what kind of tool is Fusus?';
  const r = answerFromPerspective(reyes, q);
  const d = answerFromPerspective(delgado, q);
  assert.ok(/surveillance/.test(r.answer) && !/safety/.test(r.answer), 'Reyes: a surveillance tool');
  assert.ok(/safety/.test(d.answer) && !/surveillance/.test(d.answer), 'Delgado: a safety tool');
  assert.notEqual(r.answer, d.answer);
});

test('supporting quotes — the figure\'s verbatim words that touch the question — are cited', () => {
  const a = answerFromPerspective(reyes, 'is Fusus surveillance?');
  assert.ok(a.quotes.some((q) => /surveillance tool/.test(q)), 'the relevant quote is returned');
});

test('an empty question asks for specificity; an empty fold addresses nothing — never a throw', () => {
  assert.equal(answerFromPerspective(reyes, '').addressed, false);
  assert.equal(answerFromPerspective(reyes, '   ').addressed, false);
  const empty = answerFromPerspective({ label: 'Nobody', quotes: [], fold: { figures: [], claims: [] } }, 'anything?');
  assert.equal(empty.addressed, false);
  assert.equal(empty.claims.length, 0);
  assert.doesNotThrow(() => answerFromPerspective(null, null));
});

test('end to end from real prose: the answer is bounded by what the figure actually said', () => {
  const doc = parseText('Reyes and Delgado met. Reyes said, "Fusus watches the city." Reyes said, "Fusus is a surveillance tool." Delgado said, "Fusus is a safety tool."');
  const speech = doc.conventions?.isAttributionVerb;
  const p = perspectiveOf(doc, [doc.admission.idOf('Reyes')].filter(Boolean), { isSpeech: speech });
  const a = answerFromPerspective(p, 'what is Fusus?');
  assert.equal(a.addressed, true);
  assert.equal(a.contained, true);
  // Reyes never called it a safety tool — so his fold cannot answer with Delgado's characterization
  assert.ok(!/safety/.test(a.answer), 'the bound holds — no claim from another figure leaks in');
});
