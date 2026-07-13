import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEOT, eotDoc }   from '../src/organs/ingest/eot.js';
import { emitEot, tuplesToEot } from '../src/organs/ingest/eot-emit.js';
import { ingestImage, ingestOcr, createCompositeDoc } from '../src/organs/in/index.js';
import { parseText }          from '../src/perceiver/parse/index.js';
import { reflectAnswer, senseOfModality } from '../src/enactor/ground/index.js';

// Multimodal synthesis over EOT — the foundation.
//
// A sense knows three things EOT used to throw away: WHERE it was read, WHICH sense it
// came through, and that two senses saw the same thing. These lock in the first two:
//   · the `^locus` trailer   — WHERE, as an opaque W3C Media Fragment, round-tripped
//   · the `sense` axis        — WHICH, mapped from the organ's modality
//   · the derivation fold     — a document read FROM another is not a second witness
//   · the cross-modal rung    — two senses holding one fact is stronger than two copies

// ── The `^locus` trailer ───────────────────────────────────────────────────────

test('^locus rides the trailer and round-trips through parse → emit → parse', () => {
  const src = [
    'smith : Person @perceiver ^"minutes.pdf#page=4&l=12"',
    'smith -> dfr-contract : signed @perceiver ^"council-0512.wav#t=182.4,188.1"',
    'region-3 : Person ^"scene.jpg#xywh=210,88,64,64"',
    'q3-total.value = 37800000 ^"ledger.xlsx#row=214&col=F"',
  ].join('\n');

  const { events, diagnostics } = parseEOT(src);
  assert.equal(diagnostics.length, 0, 'a quoted locus is not a malformed line');
  assert.equal(events[0].locus, 'minutes.pdf#page=4&l=12', 'the INS carries its page locus');
  assert.equal(events[1].locus, 'council-0512.wav#t=182.4,188.1', 'the CON carries its timecode');
  assert.equal(events[3].locus, 'ledger.xlsx#row=214&col=F', 'the DEF carries its cell address');

  const back = parseEOT(tuplesToEot(events).join('\n'));
  assert.deepEqual(back.events.map((e) => e.locus), events.map((e) => e.locus),
    'the locus survives the round trip through the surface');
});

test("a locus's `#` survives the comment stripper (it rides quoted), and a real comment still strips", () => {
  const { events } = parseEOT('x : Thing ^"a.pdf#page=2"   # this is a comment with a # in it');
  assert.equal(events.length, 1);
  assert.equal(events[0].locus, 'a.pdf#page=2', 'the fragment # is kept; the comment # is dropped');
});

test('a bare locus (no #, hand-written) also parses', () => {
  const { events } = parseEOT('x : Thing ^scene.jpg');
  assert.equal(events[0].locus, 'scene.jpg');
});

test('no locus → byte-identical surface (the trailer is emitted only when present)', () => {
  const without = emitEot(eotDoc('Anna -> Ben : trusted').log).text;
  assert.equal(without, 'Anna -> Ben : trusted', 'absent locus adds nothing to the line');
});

test('the live engine log carries the locus back out through emitEot', () => {
  const doc = eotDoc('Anna -> Ben : trusted ^"minutes.pdf#page=4"', { door: 'perceiver' });
  assert.match(emitEot(doc.log).text, /\^"minutes\.pdf#page=4"/);
});

// ── Organs mint loci — the address now survives serialization ───────────────────

test('the image organ mints a #xywh box locus on the region and the link', () => {
  const img = ingestImage({
    name: 'scene.jpg',
    regions: [{ label: 'person', bbox: [210, 88, 64, 64] }, { label: 'dog', bbox: [300, 300, 120, 80] }],
    relations: [{ from: 0, to: 1, kind: 'con', via: 'beside' }],
  });
  const ins = img.log.snapshot().find((e) => e.op === 'INS');
  assert.equal(ins.locus, 'scene.jpg#xywh=210,88,64,64', 'the region INS carries its box');
  const con = img.log.snapshot().find((e) => e.op === 'CON');
  assert.equal(con.locus, 'scene.jpg#xywh=210,88,64,64', 'the link is witnessed at the source box');
});

test('the box now SURVIVES serialization — the thing the old surface threw away', () => {
  // Probe 1: before, an image lowered to `person -> dog : beside` and the box was gone.
  const img = ingestImage({
    name: 'scene.jpg',
    regions: [{ label: 'person', bbox: [210, 88, 64, 64] }, { label: 'dog', bbox: [300, 300, 120, 80] }],
    relations: [{ from: 0, to: 1, kind: 'con', via: 'beside' }],
  });
  const recovered = parseEOT(emitEot(img.log).text).events.find((e) => e.op === 'CON');
  assert.equal(recovered.locus, 'scene.jpg#xywh=210,88,64,64',
    'the bbox is recoverable from the re-parsed surface — no in-process regions join needed');
});

test('assembleDocument mints a page/xywh/char locus, and OCR passes derivedFrom through', () => {
  const scan = ingestOcr({
    name: 'page.png', page: 3, derivedFrom: 'page.jpg',
    lines: [{ text: 'Anna trusted Ben.', bbox: { x0: 72, y0: 410, x1: 540, y1: 434 }, confidence: 96 }],
  });
  const ins = scan.log.snapshot().find((e) => e.op === 'INS');
  assert.match(ins.locus, /^page\.png#page=3&xywh=72,410,468,24&char=0,\d+$/,
    'page, box, and char range all ride the locus');
  assert.equal(scan.derivedFrom, 'page.jpg', 'the OCR declares the scan it was read from');
});

// ── The sense axis + the witness carries the evidence's address ─────────────────

test('senseOfModality maps organ modalities onto the doors of the world', () => {
  assert.equal(senseOfModality('image'), 'sight');
  assert.equal(senseOfModality('audio'), 'hearing');
  assert.equal(senseOfModality('table'), 'tabular');
  assert.equal(senseOfModality('code'), 'structural');
  assert.equal(senseOfModality('pdf'), 'text');
  assert.equal(senseOfModality(undefined), 'text', 'the prose door is the default');
});

test('a witness carries the locus AND the sense, so the UI can render the evidence itself', () => {
  const doc = eotDoc('Anna -> Ben : trusted ^"minutes.pdf#page=4&char=1840,1905"',
    { docId: 'minutes.pdf', door: 'perceiver' });
  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc });
  const row = r.eot.find((x) => x.kind === 'relation' && x.via === 'trusted');
  assert.equal(row.sources[0].locus, 'minutes.pdf#page=4&char=1840,1905');
  assert.equal(row.sources[0].sense, 'text');
});

// ── The derivation fold (overcount fix) and the cross-modal rung (undercount fix) ─

test('a recording and its own transcript are ONE origin, not two (derivation collapses)', () => {
  // Probe 2a: before, this pair reflected as `corroborated` with 2 origins — an overcount.
  const recording  = parseText('Anna trusted Ben.', { docId: 'council.wav' });
  recording.modality = 'audio';
  const transcript = parseText('Anna trusted Ben.', { docId: 'council.transcript.txt' });
  transcript.modality = 'text';
  transcript.derivedFrom = 'council.wav';            // read FROM the recording — no independent access

  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc: createCompositeDoc([recording, transcript]) });
  const row = r.eot.find((x) => x.kind === 'relation' && x.via === 'trusted');
  assert.equal(row.status, 'single-source', 'the transcript folds onto its recording root');
  assert.equal(row.origins, 1);
  assert.deepEqual(row.senses, ['hearing'], 'the root channel is the recording');
});

test('a PDF and an independent recording of the same act are CROSS-MODAL, not merely corroborated', () => {
  // Probe 2b: two channels that never touched, both holding the fact — the top rung.
  const pdf = parseText('Anna trusted Ben.', { docId: 'procurement.pdf' });
  pdf.modality = 'pdf';
  const audio = parseText('Anna trusted Ben.', { docId: 'council.wav' });
  audio.modality = 'audio';                          // independent — no derivedFrom

  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc: createCompositeDoc([pdf, audio]) });
  const row = r.eot.find((x) => x.kind === 'relation' && x.via === 'trusted');
  assert.equal(row.status, 'cross-modal', 'two independent roots through two senses');
  assert.equal(row.origins, 2);
  assert.deepEqual(new Set(row.senses), new Set(['text', 'hearing']));
  assert.equal(r.summary.crossModal, 1, 'the summary counts the cross-modal claim');
});

test('two documents in ONE sense still corroborate — cross-modal needs a second sense', () => {
  const a = parseText('Anna trusted Ben.', { docId: 'a.pdf' }); a.modality = 'pdf';
  const b = parseText('Anna trusted Ben.', { docId: 'b.pdf' }); b.modality = 'pdf';
  const r = reflectAnswer({ answer: 'Anna trusted Ben.', doc: createCompositeDoc([a, b]) });
  const row = r.eot.find((x) => x.kind === 'relation' && x.via === 'trusted');
  assert.equal(row.status, 'corroborated', 'two roots, one sense — corroborated, not cross-modal');
  assert.equal(r.summary.crossModal, 0);
});
