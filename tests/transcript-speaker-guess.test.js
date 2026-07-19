import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestAudio, guessSpeakerNames } from '../src/organs/in/index.js';

test('guessSpeakerNames labels diarized voices from self-introductions', () => {
  const utterances = [
    { speaker: 0, start: 0, end: 1, words: [{ text: "I'm" }, { text: 'Maya' }] },
    { speaker: 1, start: 2, end: 3, words: [{ text: 'Sam' }, { text: 'speaking' }] },
  ];
  const speakers = guessSpeakerNames(utterances, [{ id: 0, label: 'Speaker 1' }, { id: 1, label: 'Speaker 2' }]);
  assert.equal(speakers[0].guess, 'Maya');
  assert.equal(speakers[0].label, 'Maya (Speaker 1)');
  assert.equal(speakers[1].guess, 'Sam');
  assert.equal(speakers[1].label, 'Sam (Speaker 2)');
});

test('guessSpeakerNames creates a minimal roster when only word speakers are present', () => {
  const speakers = guessSpeakerNames([{ speaker: 2, words: [{ text: 'this' }, { text: 'is' }, { text: 'Nora' }] }], []);
  assert.equal(speakers.length, 1);
  assert.equal(speakers[0].id, 2);
  assert.equal(speakers[0].label, 'Nora (Speaker 3)');
});

test('ingestAudio carries speaker name guesses into the transcript doc', () => {
  const doc = ingestAudio({
    name: 'call', duration: 4, witness: 'test',
    speakers: [{ id: 0, label: 'Speaker 1' }],
    utterances: [
      { speaker: 0, start: 0, end: 2, words: [
        { text: 'my', start: 0, end: 0.1, speaker: 0 },
        { text: 'name', start: 0.1, end: 0.2, speaker: 0 },
        { text: 'is', start: 0.2, end: 0.3, speaker: 0 },
        { text: 'Riley', start: 0.3, end: 0.6, speaker: 0 },
      ] },
    ],
  });
  assert.equal(doc.speakers[0].guess, 'Riley');
  assert.equal(doc.speakers[0].label, 'Riley (Speaker 1)');
});
