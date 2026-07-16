import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEntityAdmission } from '../src/perceiver/parse/entities.js';

// ENTITY ADMISSION READS TITLES, CASE, AND CONTRACTIONS FROM THE DOCUMENT'S OWN GRAVITY —
// no honorific list. A shared honorific is a MOON (massless as a bare figure, and it never
// fuses the planets it orbits); an ALL-CAPS cue folds onto its mixed-case referent; a
// contraction is not a possessive. These are the fixes the real-book census exposed.

// Feed the whole text at construction (so the moon/lowercase statistics are available), then
// observe sentence by sentence — the shape the pipeline uses.
const run = (text) => {
  const a = createEntityAdmission({ text });
  text.split(/(?<=[.!?])\s+/).forEach((s, i) => a.observe(s, i));
  return a;
};

test('a shared honorific is a moon: distinct people never collapse, and the bare title is not a figure', () => {
  const a = run('Prince Andrew spoke to Anna. Prince Vasili bowed. The prince left the room. '
    + 'Prince Andrew smiled again. Prince Vasili frowned once more.');
  assert.ok(a.isAdmitted('Prince Andrew') && a.isAdmitted('Prince Vasili'));
  assert.notEqual(a.idOf('Prince Andrew'), a.idOf('Prince Vasili'),
    'two princes are two people — "Prince" must not fuse them into one node');
  assert.equal(a.isAdmitted('Prince'), false, 'bare "Prince" is a moon, not a bare referent');
});

test('a title that names ONE person still folds the bare form onto that person (not a moon)', () => {
  // "Count" heads only Dracula here → a single planet → a given-name-style fold, not a moon.
  const a = run('Count Dracula met Jonathan. The Count smiled. Count Dracula spoke. The Count vanished.');
  assert.equal(a.idOf('Count'), a.idOf('Count Dracula'), 'the sole-planet title folds onto its person');
});

test('a given name folds into its full name across variants (not mistaken for a moon)', () => {
  // "Elvis Presley" and "Elvis Aaron Presley" are ONE person, so "Elvis" heads a single planet.
  const a = run('Elvis Presley sang. Elvis danced all night. Presley toured widely. Elvis Aaron Presley won.');
  assert.equal(a.idOf('Elvis'), a.idOf('Elvis Presley'), 'bare given name folds into the full name');
  assert.equal(a.isAdmitted('Prince'), false); // sanity: unrelated
});

test('a contraction is not a possessive — the stem never becomes an entity', () => {
  const a = run('Don’t go there. It isn’t fair. They aren’t ready. Water won’t hurt you.');
  for (const stem of ['Don', 'Isn', 'Aren']) assert.equal(a.isAdmitted(stem), false, `"${stem}" (from a contraction) is not an entity`);
});

test('a possessive still admits the possessor', () => {
  const a = run('Abram’s wife was there. The Russians’ army advanced.');
  assert.equal(a.isAdmitted('Abram'), true, "the ’s possessor is a referent");
});

test('an ALL-CAPS speaker cue folds onto its mixed-case referent', () => {
  const a = run('NORA enters the room. Nora sits down. NORA speaks to Helmer. Helmer nods slowly. HELMER leaves.');
  assert.equal(a.isAdmitted('NORA'), false, 'the shouted cue is not a separate figure');
  assert.equal(a.isAdmitted('Nora'), true);
  assert.equal(a.idOf('Nora'), 'nora');
});

test('a clause-opener capitalised by position does not mint a figure off one weak sighting', () => {
  // "Very" also appears lowercase ("very good") → orthographically unstable → a lone weak,
  // sentence-initial sighting is refused; a real, stable name in the same text still admits.
  const a = run('Very good news arrived. Gregor walked to the door. It was very quiet.');
  assert.equal(a.isAdmitted('Very'), false, 'a one-off clause-opener is not a figure');
  assert.equal(a.isAdmitted('Gregor'), true, 'a stable name (never seen lowercase) is unaffected');
});

test('a month abbreviation in a dateline is a temporal token, not a figure', () => {
  // Frankenstein's letters open "St. Petersburgh, Dec. 11th, 17—": the comma before and
  // the period after "Dec" read as a set-off vocative, so the gravity floor minted it as
  // the strongest "character" on record. The calendar register denies that gravity — the
  // abbreviation carries the same temporal signal as the full month name.
  const a = run('St. Petersburgh, Dec. 11th, 17—. I arrived here yesterday. '
    + 'To Mrs. Saville, England. Dec. 12th. Felix walked to the door.');
  assert.equal(a.isAdmitted('Dec'), false, 'a dateline month abbreviation is not a figure');
  assert.equal(a.isAdmitted('Felix'), true, 'a real name in the same text still admits');
});

test('an ALL-CAPS multi-word heading is refused', () => {
  const a = run('CONCERNING NEW PRINCIPALITIES WHICH ARE ACQUIRED. Cesare Borgia rose to power. Borgia acted.');
  assert.equal(a.isAdmitted('CONCERNING NEW PRINCIPALITIES WHICH ARE ACQUIRED'), false);
  assert.equal(a.isAdmitted('Cesare Borgia'), true, 'a real name beside the heading still admits');
});
