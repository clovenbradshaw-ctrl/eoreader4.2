// siteTerrainAt used to default `recurrent` to a fixed `false` — meaning Kind/Network/
// Paradigm (the Pattern-grain terrains) were unreachable from any real call site, since
// nothing supplied `true` either (verified: every caller in src/ omits the option). This
// pins the fix — recurrent is now COMPUTED from the log by default — against real parses,
// not fixtures, so a regression shows up as a real terrain flipping back.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { siteTerrainAt } from '../src/surfer/index.js';

test('a DEF held only once is a Lens; the same entity re-characterized is a Paradigm', () => {
  const once = parseText('Napoleon was a hero of the Revolution, Pierre thought.', { docId: 'once', lang: 'en' });
  assert.equal(siteTerrainAt(once, 0), 'Lens');

  const twice = parseText(
    'Napoleon was a hero of the Revolution, Pierre thought. Napoleon was a tyrant, Pierre later believed.',
    { docId: 'twice', lang: 'en' },
  );
  assert.equal(siteTerrainAt(twice, 0), 'Paradigm');
  assert.equal(siteTerrainAt(twice, 1), 'Paradigm');
});

test('a bond mentioned once is a Link; the same pair bonded again elsewhere is a Network', () => {
  const once = parseText('Pierre visited Napoleon in 1805.', { docId: 'once', lang: 'en' });
  assert.equal(siteTerrainAt(once, 0), 'Link');

  const twice = parseText(
    'Pierre visited Napoleon in 1805. Pierre visited Napoleon again in 1812.',
    { docId: 'twice', lang: 'en' },
  );
  assert.equal(siteTerrainAt(twice, 0), 'Network');
  assert.equal(siteTerrainAt(twice, 1), 'Network');
});

test('Structure recurrence outranks a co-occurring bookkeeping DEF at the same locus', () => {
  // The parser's own grain-cue DEF (key:'grain') can land on the same sentence as a CON —
  // siteTerrain picks Structure domain first when CON is present (terrain.js's own domain
  // order), so recurrenceAt must resolve the SAME domain, not silently answer for
  // Interpretation and return false because there is no predicate-DEF to recur.
  const doc = parseText(
    'Pierre visited Napoleon in 1805. Pierre visited Napoleon again in 1812.',
    { docId: 'precedence', lang: 'en' },
  );
  const log = doc.log.snapshot();
  const opsAt0 = new Set(log.filter((e) => e.sentIdx === 0).map((e) => e.op));
  assert.ok(opsAt0.has('CON') && opsAt0.has('DEF'), 'fixture must actually co-locate CON and a bookkeeping DEF, or this test proves nothing');
  assert.equal(siteTerrainAt(doc, 0), 'Network');
});

test('an explicit recurrent/thin override still wins over the computed read', () => {
  const doc = parseText('Napoleon was a hero of the Revolution, Pierre thought.', { docId: 'override', lang: 'en' });
  assert.equal(siteTerrainAt(doc, 0, { recurrent: true }), 'Paradigm');
  assert.equal(siteTerrainAt(doc, 0, { recurrent: false }), 'Lens');
});

test('a relation-type string recurring across DIFFERENT pairs does not, by itself, read as Network', () => {
  // Regression guard for the first (reverted) design: matching on relType/via text rather
  // than on the resolved (src,tgt) pair. "admired" repeating across three unrelated couples
  // is not a topology — and on real prose the naive SVO reader sometimes emits a bare
  // pronoun ("i"/"you") as relType, which must not manufacture a Network out of noise.
  const doc = parseText(
    'Pierre admired Napoleon. Andrew admired Kutuzov. The soldiers admired their general.',
    { docId: 'diff-pairs', lang: 'en' },
  );
  assert.equal(siteTerrainAt(doc, 0), 'Link');
});
