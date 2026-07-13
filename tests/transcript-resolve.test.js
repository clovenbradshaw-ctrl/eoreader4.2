import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestAudio, acousticSignal, resolveTranscript } from '../src/organs/in/index.js';
import { projectGraph } from '../src/core/index.js';
import { toProcessTrace } from '../src/rooms/reader/transcript-export.js';

// A graph-aware, self-editing transcript. organs/in/audio.js lands a speech model's
// reading as-is; hear.js gives it a second pass that reads the signal from the noise on
// every word span, then folds a name heard more than one way onto the hearing it was
// most sure of — the edit landing on the same append-only log, nothing unwritten.

// A transcript where one referent is misheard once: "Darcy" three times, clearly, and
// "Marcy" once, at low confidence. The near-spelling IS the same person, mis-transcribed.
const misheard = () => ({
  name: 'clip',
  duration: 9,
  witness: 'whisper-base · test',
  utterances: [
    { start: 0, end: 2, words: [
      { text: 'Darcy', start: 0.0, end: 0.5, conf: 0.95 },
      { text: 'spoke', start: 0.6, end: 1.0, conf: 0.9 },
      { text: 'to',    start: 1.1, end: 1.2, conf: 0.9 },
      { text: 'Elizabeth', start: 1.3, end: 1.9, conf: 0.9 },
    ] },
    { start: 2.5, end: 3.5, words: [
      { text: 'Darcy', start: 2.5, end: 3.0, conf: 0.92 },
      { text: 'left',  start: 3.1, end: 3.4, conf: 0.9 },
    ] },
    { start: 5.0, end: 6.2, words: [
      { text: 'Marcy',    start: 5.0, end: 5.5, conf: 0.28 },   // the mishearing
      { text: 'returned', start: 5.6, end: 6.1, conf: 0.9 },
    ] },
    { start: 7.5, end: 8.6, words: [
      { text: 'Darcy',  start: 7.5, end: 8.0, conf: 0.9 },
      { text: 'smiled', start: 8.1, end: 8.5, conf: 0.9 },
    ] },
  ],
});

test('resolveTranscript folds a misheard name onto its most-confident hearing', () => {
  const doc = ingestAudio(misheard());
  const r = doc.resolve();

  assert.equal(r.edits, 1, 'exactly the one Marcy mention is re-heard');
  assert.equal(r.clusters.length, 1);
  assert.deepEqual(r.clusters[0].sort(), ['darcy', 'marcy']);
  assert.equal(r.revisions[0].from, 'Marcy');
  assert.equal(r.revisions[0].to, 'Darcy');

  // The visible transcript now reads the confident surface, with a trail of what it was.
  const marcyTok = doc.tokens.find(t => Math.abs(t.start - 5.0) < 1e-6);
  assert.equal(marcyTok.text, 'Darcy');
  assert.equal(marcyTok.norm, 'darcy');
  assert.equal(marcyTok.revisedFrom, 'Marcy');
});

test('the edit lands on the append-only stream — SEG retract, re-INS, SYN·REC merge', () => {
  const doc = ingestAudio(misheard());
  const before = doc.log.length;
  doc.resolve();
  const events = doc.log.snapshot();

  // Nothing was unwritten — the log only grew.
  assert.ok(doc.log.length > before);

  // The shaky hearing was retracted (a SEG, referencing a real prior INS seq).
  const retract = events.find(e => e.op === 'SEG' && e.kind === 'retract');
  assert.ok(retract, 'a retraction was appended');
  const retracted = events.find(e => e.seq === retract.refSeq);
  assert.equal(retracted.op, 'INS');
  assert.equal(retracted.label, 'Marcy');

  // The confident surface was re-minted, the referents merged, the rule recorded.
  assert.ok(events.some(e => e.op === 'INS' && e.kind === 'reheard' && e.id === 'darcy' && e.label === 'Darcy'));
  assert.ok(events.some(e => e.op === 'SYN' && e.kind === 'merge' && e.from === 'marcy' && e.to === 'darcy'));
  assert.ok(events.some(e => e.op === 'REC' && e.kind === 'unify' && e.token === 'marcy' && e.expansion === 'darcy'));
  assert.ok(events.some(e => e.op === 'DEF' && e.key === 'revisedFrom' && e.value === 'Marcy'));
});

test('the projection folds the two surfaces to one referent under the winning label', () => {
  const doc = ingestAudio(misheard());
  doc.resolve();
  const g = projectGraph(doc.log);
  // marcy resolves to the darcy referent; only one figure remains for the two surfaces.
  assert.equal(g.representative('marcy'), g.representative('darcy'));
  const darcy = g.entities.get(g.representative('darcy'));
  assert.equal(darcy.label, 'Darcy');
  // Elizabeth stays her own figure — a distinct name is never swallowed.
  assert.notEqual(g.representative('elizabeth'), g.representative('darcy'));
});

test('the reprojected views (sentences, units, utterances) carry the confident surface', () => {
  const doc = ingestAudio(misheard());
  doc.resolve();
  assert.equal(doc.sentences[2], 'Darcy returned');
  assert.match(doc.units[2], /^Darcy returned/);
  assert.equal(doc.utterances[2].words[0].text, 'Darcy');
});

test('resolution is idempotent — a second pass finds nothing left to resolve', () => {
  const doc = ingestAudio(misheard());
  doc.resolve();
  const len = doc.log.length;
  const r2 = doc.resolve();
  assert.equal(r2.edits, 0);
  assert.equal(doc.log.length, len, 'no further edits appended');
});

test('golden-inert: a transcript of distinct names is left byte-identical', () => {
  const doc = ingestAudio({
    name: 'clean', duration: 4, witness: 'w',
    utterances: [
      { start: 0, end: 2, words: [
        { text: 'Darcy',   start: 0.0, end: 0.5, conf: 0.95 },
        { text: 'met',     start: 0.6, end: 0.9, conf: 0.9 },
        { text: 'Bingley', start: 1.0, end: 1.6, conf: 0.95 },
      ] },
    ],
  });
  const len = doc.log.length;
  const r = doc.resolve();
  assert.equal(r.edits, 0);
  assert.deepEqual(r.revisions, []);
  assert.equal(doc.log.length, len);
  assert.equal(doc.tokens[0].text, 'Darcy');
  assert.equal(doc.tokens[2].text, 'Bingley');
});

test('the process trace surfaces the self-edit as an auditable rewrite', () => {
  const doc = ingestAudio(misheard());
  doc.resolve();
  const md = toProcessTrace(doc);
  assert.match(md, /re-heard/i);
  assert.match(md, /“Marcy” ⇒ \*\*Darcy\*\*/);
});

// ── acoustic signal-from-noise, straight from the waveform ─────────────────────

test('acousticSignal reads a loud span as signal and a silent span as noise', () => {
  const SR = 16000, dur = 2;
  const mono = new Float32Array(SR * dur);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.001;                 // room tone everywhere
  for (let i = Math.floor(0.5 * SR); i < Math.floor(0.8 * SR); i++)      // one loud spoken span
    mono[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / SR);

  const [loud, quiet] = acousticSignal(mono, SR, [
    { start: 0.55, end: 0.75 },   // inside the loud region
    { start: 1.2,  end: 1.5 },    // room tone only
  ]);

  assert.equal(loud.signal, true);
  assert.ok(loud.acous > 0.8, `loud acous ${loud.acous} should be high`);
  assert.ok(loud.snr > 20, `loud snr ${loud.snr} dB should tower over the room`);

  assert.equal(quiet.signal, false);
  assert.ok(quiet.acous < 0.1, `quiet acous ${quiet.acous} should be near zero`);
});

test('the WAVEFORM decides the election — the loud hearing wins even at equal model confidence', () => {
  // Two spellings, each heard twice, equal model confidence — the tie is broken by which
  // was heard more clearly (acoustic signal, the waveform witness). "Darcy" is loud,
  // "Darsy" barely caught. Names sit in argument position so the reader admits both.
  const doc = ingestAudio({
    name: 'tie', duration: 8, witness: 'w',
    utterances: [
      { start: 0, end: 1.4, words: [
        { text: 'Darcy',  start: 0.0, end: 0.5, conf: 0.8, acous: 0.95 },
        { text: 'arrived', start: 0.6, end: 1.1, conf: 0.9, acous: 0.9 } ] },
      { start: 2, end: 3.4, words: [
        { text: 'Darsy',  start: 2.0, end: 2.5, conf: 0.8, acous: 0.10 },
        { text: 'arrived', start: 2.6, end: 3.1, conf: 0.9, acous: 0.9 } ] },
      { start: 4, end: 5.4, words: [
        { text: 'Darcy',  start: 4.0, end: 4.5, conf: 0.8, acous: 0.92 },
        { text: 'waved',   start: 4.6, end: 5.1, conf: 0.9, acous: 0.9 } ] },
      { start: 6, end: 7.4, words: [
        { text: 'Darsy',  start: 6.0, end: 6.5, conf: 0.8, acous: 0.12 },
        { text: 'waved',   start: 6.6, end: 7.1, conf: 0.9, acous: 0.9 } ] },
    ],
  });
  const r = doc.resolve();
  assert.ok(r.edits >= 1);
  assert.ok(r.revisions.every(x => x.to === 'Darcy'), 'the loud spelling wins the election');
  assert.equal(doc.log.snapshot().some(e => e.op === 'DEF' && e.key === 'acous'), true);
});

test('a heard bond couples BELOW authored certainty — lower belief than text', () => {
  const doc = ingestAudio(misheard());
  // Every reading-line CON the ear lays carries a sub-unit coupling (the witness ceiling),
  // never the coupling 1 an authored, name-resolved text bond gets.
  const cons = doc.log.snapshot().filter(e => e.op === 'CON');
  assert.ok(cons.length > 0);
  assert.ok(cons.every(e => typeof e.w === 'number' && e.w > 0 && e.w <= 0.6),
    'a transcription bond is believed at or below the witness cap (0.6), never at 1');
});
