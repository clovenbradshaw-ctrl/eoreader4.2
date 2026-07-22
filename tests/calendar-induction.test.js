import { test } from 'node:test';
import assert from 'node:assert/strict';

import { induceCalendarTokens, createConventions } from '../src/core/conventions/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// CALENDAR EMERGENCE — the SEED calendar register omits the March-August family wholesale
// (ledger.js SEED_CALENDAR) because those words double as real given names (April, June,
// August…). A citation-heavy source ("Jan. 5, 2004") still needs the bare month denied
// admission gravity, so this document-local induction reads the numeral shape beside the
// token — no month-name list, and it never touches a document that uses the word as a name.

test('a capitalised token running mostly beside a day/year is induced as calendar', () => {
  const segs = [
    'The interview took place on Apr. 5, 2004.',
    'A second session followed on Apr. 12, 2004.',
    'He was reinterviewed on Apr. 20, 2004.',
    'The final debrief was held on Apr. 28, 2004.',
  ];
  const learned = induceCalendarTokens(segs).map((t) => t.token);
  assert.ok(learned.includes('apr'), 'a month abbreviation beside repeated dates is induced');
});

test('a token below the minimum count is not induced (one-off is not evidence)', () => {
  const segs = ['The meeting was on Nov. 5, 2004.'];
  const learned = induceCalendarTokens(segs, { minCount: 4 }).map((t) => t.token);
  assert.ok(!learned.includes('nov'), 'a single sighting never clears the count floor');
});

test('a capitalised name that never sits beside a date is NOT induced as calendar', () => {
  const segs = [
    'Casey walked into the room.', 'Casey spoke first.', 'Casey left early.',
    'Casey returned the next day.', 'Casey smiled.',
  ];
  const learned = induceCalendarTokens(segs).map((t) => t.token);
  assert.ok(!learned.includes('casey'), 'a name with no numeral company earns no calendar reading');
});

test('a name that ALSO recurs beside dates only teaches when the rate is high', () => {
  // "Casey" here sits beside a date twice and away from one three times — well under the
  // 0.5 rate floor, so the person reading survives; a document that is overwhelmingly
  // dated (the Apr. case above) clears it, this mixed one does not.
  const segs = [
    'Casey walked into the room.', 'Casey spoke first.', 'Casey left early.',
    'On Casey 5, 2004, the witness was recalled.', 'Casey 12, 2004 saw a second session.',
  ];
  const learned = induceCalendarTokens(segs).map((t) => t.token);
  assert.ok(!learned.includes('casey'), 'a mixed-use token under the rate floor stays a name');
});

test('end to end — a citation-heavy document denies the bare month admission, keeps the person', () => {
  // The real 9/11 Commission Report shape: one recurring named source (Jan Lodal, cited
  // twice) against a flood of footnote dates ("Jan. 5, 2004") that share his given name.
  const cites = Array.from({ length: 20 }, (_, i) =>
    `Allen Holmes interview (Jan. ${i + 1}, 2004).`).join(' ');
  const doc = parseText(
    `He took the paper to the chief deputy, Jan Lodal. Jan Lodal interview (Jan. 30, 2004). ${cites}`,
    { docId: 'cal-e2e' });
  assert.equal(doc.conventions.isCalendar('jan'), true, 'the document taught its own month');
  assert.equal(doc.admission.isAdmitted('Jan'), false, 'the bare citation month never admits');
  assert.ok(doc.admission.isAdmitted('Jan Lodal'), 'the real two-word name still admits');
  const id = doc.admission.idOf('Jan Lodal');
  const mass = new Set(doc.admission.mentions.get(id) || []).size;
  assert.ok(mass <= 2, `Jan Lodal's mass (${mass}) must not absorb the twenty bare-month citations`);
});

test('a document with no dates at all stays byte-identical (nothing induced, nothing denied)', () => {
  const c = createConventions();
  const learned = induceCalendarTokens(['The soldier walked home.', 'The soldier smiled again.']);
  assert.deepEqual(learned, []);
  assert.equal(c.isCalendar('soldier'), false);
});
