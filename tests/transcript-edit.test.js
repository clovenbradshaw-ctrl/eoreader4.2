import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectTranscript, wordsToText, REDACTION_MARK } from '../src/rooms/reader/transcript-edit.js';

// The transcript the Listen surface shows is a pure fold of an immutable heard baseline plus an
// append-only edit log. These assert the fold: an edit applies but keeps the original, a redaction
// hides words and spans, and a RETRACT undoes either — nothing is ever destroyed.

const base = () => ([
  { text: 'I', start: 0.0, end: 0.1 },
  { text: 'saw', start: 0.2, end: 0.4 },
  { text: 'Marcy', start: 0.5, end: 0.9 },
  { text: 'today', start: 1.0, end: 1.4 },
]);

test('with no events the transcript is the baseline', () => {
  const { words, text, redactions } = projectTranscript(base(), []);
  assert.equal(words.length, 4);
  assert.equal(text, 'I saw Marcy today');
  assert.deepEqual(redactions, []);
  assert.ok(!words.some((w) => w.edited || w.redacted));
});

test('EDIT applies and keeps the original recoverable', () => {
  const events = [{ op: 'EDIT', id: 'e1', idx: 2, from: 'Marcy', to: 'Darcy', ts: 1 }];
  const { words, text } = projectTranscript(base(), events);
  assert.equal(words[2].text, 'Darcy');
  assert.equal(words[2].edited, true);
  assert.equal(words[2].origText, 'Marcy');   // original preserved
  assert.equal(text, 'I saw Darcy today');
});

test('RETRACT of an EDIT restores the original word', () => {
  const events = [
    { op: 'EDIT', id: 'e1', idx: 2, from: 'Marcy', to: 'Darcy', ts: 1 },
    { op: 'RETRACT', id: 'r1', ref: 'e1', ts: 2 },
  ];
  const { words, text } = projectTranscript(base(), events);
  assert.equal(words[2].text, 'Marcy');
  assert.ok(!words[2].edited);
  assert.equal(text, 'I saw Marcy today');
});

test('REDACT hides overlapping words and emits an active span', () => {
  const events = [{ op: 'REDACT', id: 'x1', start: 0.45, end: 0.95, mode: 'silence', ts: 1 }];
  const { words, text, redactions } = projectTranscript(base(), events);
  assert.equal(words[2].redacted, true);        // "Marcy" overlaps [0.45,0.95]
  assert.ok(!words[1].redacted && !words[3].redacted);
  assert.equal(text, `I saw ${REDACTION_MARK} today`);
  assert.deepEqual(redactions, [{ id: 'x1', start: 0.45, end: 0.95, mode: 'silence' }]);
});

test('RETRACT of a REDACT un-hides the words', () => {
  const events = [
    { op: 'REDACT', id: 'x1', start: 0.45, end: 0.95, mode: 'beep', ts: 1 },
    { op: 'RETRACT', id: 'r1', ref: 'x1', ts: 2 },
  ];
  const { words, text, redactions } = projectTranscript(base(), events);
  assert.ok(!words[2].redacted);
  assert.equal(text, 'I saw Marcy today');
  assert.deepEqual(redactions, []);
});

test('a beep redaction is carried through as its mode', () => {
  const events = [{ op: 'REDACT', id: 'x1', start: 0.45, end: 0.95, mode: 'beep', ts: 1 }];
  const { redactions } = projectTranscript(base(), events);
  assert.equal(redactions[0].mode, 'beep');
});

test('wordsToText breaks paragraphs on a >=0.9s gap', () => {
  const words = [
    { text: 'end', start: 0.0, end: 0.4 },
    { text: 'Then', start: 1.5, end: 1.8 },   // 1.1s gap → new paragraph
    { text: 'more', start: 1.9, end: 2.2 },
  ];
  assert.equal(wordsToText(words), 'end\n\nThen more');
});

test('projectTranscript never mutates its inputs', () => {
  const b = base();
  const events = [{ op: 'EDIT', id: 'e1', idx: 0, from: 'I', to: 'We', ts: 1 }];
  projectTranscript(b, events);
  assert.equal(b[0].text, 'I');   // baseline untouched
});
