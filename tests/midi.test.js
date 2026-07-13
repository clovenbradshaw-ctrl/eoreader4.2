// The MIDI reader (src/rooms/reader/midi.js) and the score summary (import-file.js) —
// a MIDI file is a SCORE, read into timed notes and raised by the music organ. Pure, so
// the browserless CI drives it against hand-built Standard MIDI File bytes.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMidi, midiNoteName, gmInstrumentName } from '../src/rooms/reader/midi.js';
import { _midiSummary } from '../src/rooms/reader/import-file.js';
import { ingestMusic } from '../src/organs/in/music.js';

// A minimal SMF-0: 96 ticks/quarter, 120 BPM, named "Test", C4 then E4 (a quarter each).
const HEADER = [
  0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, // MThd, len 6
  0x00, 0x00,                                     // format 0
  0x00, 0x01,                                     // 1 track
  0x00, 0x60,                                     // 96 ticks/quarter
];
const TRACK_BODY = [
  0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,       // set tempo 500000 µs/qn = 120 BPM
  0x00, 0xff, 0x03, 0x04, 0x54, 0x65, 0x73, 0x74, // track name "Test"
  0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08, // time signature 4/4
  0x00, 0xc0, 0x00,                               // program change 0 → Acoustic Grand Piano
  0x00, 0x90, 0x3c, 0x64,                         // note on  C4 (60) vel 100 at tick 0
  0x60, 0x80, 0x3c, 0x40,                         // note off C4 at tick 96
  0x00, 0x90, 0x40, 0x64,                         // note on  E4 (64) at tick 96
  0x60, 0x80, 0x40, 0x40,                         // note off E4 at tick 192
  0x00, 0xff, 0x2f, 0x00,                         // end of track
];
const smf = () => Uint8Array.from([
  ...HEADER,
  0x4d, 0x54, 0x72, 0x6b,                         // MTrk
  (TRACK_BODY.length >>> 24) & 0xff, (TRACK_BODY.length >>> 16) & 0xff,
  (TRACK_BODY.length >>> 8) & 0xff, TRACK_BODY.length & 0xff,
  ...TRACK_BODY,
]);

test('midiNoteName: MIDI numbers name their scientific pitch, round-tripping the octave', () => {
  assert.equal(midiNoteName(60), 'C4');    // middle C
  assert.equal(midiNoteName(69), 'A4');    // A440
  assert.equal(midiNoteName(0), 'C-1');
  assert.equal(midiNoteName(61), 'C#4');
});

test('gmInstrumentName: General MIDI program numbers name their instrument', () => {
  assert.equal(gmInstrumentName(0), 'Acoustic Grand Piano');
  assert.equal(gmInstrumentName(40), 'Violin');
  assert.equal(gmInstrumentName(56), 'Trumpet');
});

test('parseMidi: header, tempo, meter, and every note on the wall clock', () => {
  const m = parseMidi(smf());
  assert.equal(m.format, 0);
  assert.equal(m.trackCount, 1);
  assert.equal(m.ppq, 96);
  assert.equal(m.name, 'Test');
  assert.equal(m.tempos[0].bpm, 120);
  assert.deepEqual([m.timeSignatures[0].numerator, m.timeSignatures[0].denominator], [4, 4]);
  assert.equal(m.notes.length, 2, 'both notes paired their note-off');
  assert.equal(m.notes[0].name, 'C4');
  assert.equal(m.notes[1].name, 'E4');
  // 96 ticks/quarter at 120 BPM ⇒ a quarter note is 0.5s.
  assert.ok(Math.abs(m.notes[0].start - 0) < 1e-6, 'C4 begins at 0s');
  assert.ok(Math.abs(m.notes[0].dur - 0.5) < 1e-6, 'C4 lasts a quarter (0.5s)');
  assert.ok(Math.abs(m.notes[1].start - 0.5) < 1e-6, 'E4 begins after the quarter');
  assert.ok(Math.abs(m.durationSec - 1.0) < 1e-6, 'the piece is one second long');
  assert.equal(m.tracks[0].instrument, 'Acoustic Grand Piano', 'the program change names the instrument');
  assert.equal(m.hangingNotes, 0, 'no note left sounding');
});

test('parseMidi: a note-on with velocity 0 counts as its note-off (running status too)', () => {
  const body = [
    0x00, 0x90, 0x3c, 0x64,   // note on C4
    0x30, 0x3c, 0x00,         // running status: C4 vel 0 = note off at tick 48
    0x00, 0xff, 0x2f, 0x00,
  ];
  const bytes = Uint8Array.from([
    ...HEADER,
    0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, body.length, ...body,
  ]);
  const m = parseMidi(bytes);
  assert.equal(m.notes.length, 1);
  assert.equal(m.hangingNotes, 0, 'the velocity-0 note-on closed the note');
  assert.ok(Math.abs(m.notes[0].dur - 0.25) < 1e-6, 'closed at tick 48 = an eighth = 0.25s');
});

test('parseMidi: a truncated tail is a warning, not a throw — notes read so far survive', () => {
  const bytes = smf().subarray(0, smf().length - 3);   // lop off the end-of-track
  const m = parseMidi(bytes);
  assert.ok(m.notes.length >= 1, 'the notes before the truncation still land');
});

test('parseMidi: rejects a non-MIDI file loudly', () => {
  assert.throws(() => parseMidi(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])), /not a Standard MIDI File/);
});

test('_midiSummary: the reading names what the file is, who plays, and what it plays', () => {
  const summary = _midiSummary(parseMidi(smf()), 'song');
  assert.match(summary, /# Test/);
  assert.match(summary, /120 BPM/);
  assert.match(summary, /4\/4/);
  assert.match(summary, /2 notes/);
  assert.match(summary, /Acoustic Grand Piano/);
  assert.match(summary, /C4 E4/, 'the opening line is legible as note names');
});

test('ingestMusic: a decoded MIDI note sequence raises pitch-class entities and keeps its clock', () => {
  const m = parseMidi(smf());
  const doc = ingestMusic({ name: 'midi', notes: m.notes });
  const ins = doc.log.snapshot().filter((e) => e.op === 'INS');
  assert.deepEqual(ins.map((e) => e.label), ['C', 'E'], 'each note lands as its pitch class');
  const con = doc.log.snapshot().find((e) => e.op === 'CON');
  assert.equal(con.via, 'up4', 'C→E is a major third up');
  assert.ok(doc.sequence[0].start != null, 'the note keeps its onset time');
  assert.ok(doc.sequence[0].dur != null, 'and its duration');
});

test('ingestMusic: still accepts bare note-name strings (the older callers)', () => {
  const doc = ingestMusic({ name: 'names', notes: ['C4', 'E4', 'G4'] });
  assert.deepEqual(doc.sentences, ['C', 'E', 'G']);
});
