// Probes for "Multimodal synthesis over EOT" — cheap, read-only, falsifiable.
// Run: node probes/multimodal-eot.mjs
//
// These execute against the REAL code paths (the organ barrel, the EOT ingester/
// emitter, the reflection loop). They print a report; they assert nothing. The point
// is to see, on the actual spine, what a sense knows that EOT throws away.
//
// Against the FOUNDATION (this branch) the gap is closed — the "Predicted" lines below
// describe the pre-foundation state (git main); the numbers this prints are the after:
//   1a  ^locus present: true;  1b  the box survives compositing (no rebased mis-resolve)
//   2a  recording + its transcript → single-source (1 origin, the derivation collapsed)
//   2b  PDF + independent recording → cross-modal (senses [text, hearing])
// The regression guard is tests/multimodal-eot.test.js; this stays a runnable narrative.

import { ingestImage, createCompositeDoc } from '../src/organs/in/index.js';
import { parseText }   from '../src/perceiver/parse/index.js';
import { reflectAnswer } from '../src/enactor/ground/index.js';
import { emitEot }     from '../src/organs/ingest/eot-emit.js';
import { parseEOT }    from '../src/organs/ingest/eot.js';

const h  = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);
const kv = (k, v) => console.log(`  ${k.padEnd(42)} ${v}`);

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 1 — is the locus lost?
//   Predicted: zero bbox recoverable through serialization OR through the composite
//   region lookup; the witness's "evidence" is the label string, not the box.
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 1 — is the locus lost?');

const img = ingestImage({
  name: 'scene.jpg', width: 640, height: 480,
  regions: [
    { label: 'person', bbox: [210, 88, 64, 64], score: 0.94 },
    { label: 'dog',    bbox: [300, 300, 120, 80], score: 0.81 },
  ],
  relations: [{ from: 0, to: 1, kind: 'con', via: 'beside' }],
});

// 1a — through serialization: emitEot → parseEOT, then look for any box.
const surface = emitEot(img.log).text;
console.log('\n  EOT surface the image lowers to:');
surface.split('\n').forEach((l) => console.log('    | ' + l));
const back = parseEOT(surface);
const locusOnEvent = back.events.some((e) => e.locus != null);
const boxInJson    = back.events.some((e) => /\b\d{2,},\s*\d{2,}\b|xywh|bbox/.test(JSON.stringify(e)));
kv('1a  ^locus present on any re-parsed event?', locusOnEvent);
kv('1a  any bbox recoverable from the surface?', boxInJson);

// 1c — the witness's evidence is the pseudo-sentence, i.e. the label string.
kv('1c  img.sentences[0] (the "evidence")', JSON.stringify(img.sentences[0]));
kv('1c  the actual box lives off to the side', JSON.stringify(img.regions[0].bbox));

// 1b — through the composite: sentIdx is re-based, regions lookup mis-resolves.
const notes = parseText('The council met on Tuesday.', { docId: 'notes.txt' });
const comp  = createCompositeDoc([notes, img]);
const personIns = comp.log.snapshot().find((e) => e.op === 'INS' && String(e.label).toLowerCase() === 'person');
kv('1b  composite carries a .regions map?', Object.prototype.hasOwnProperty.call(comp, 'regions'));
kv('1b  person INS sentIdx in the composite', personIns?.sentIdx);
kv('1b  img.regions[thatSentIdx].label (rebased)', JSON.stringify(img.regions[personIns?.sentIdx]?.label ?? null));
kv('1b  …but the person box is at index', 0);

// ───────────────────────────────────────────────────────────────────────────────
// PROBE 2 — how badly is corroboration overcounted, and is cross-modal invisible?
//   Structural reproduction (no audio/WARC binaries in the repo): two documents that
//   share content, one DERIVED from the other, exercise the exact origin fold reflect
//   runs. A transcript is not a second witness to the room; a PDF + an independent
//   recording of the same event ARE two channels — and there is no rung for that.
// ───────────────────────────────────────────────────────────────────────────────
h('PROBE 2 — corroboration: overcount (derivation) and the missing cross-modal rung');

const CLAIM = 'Anna trusted Ben.';               // parser-friendly (proper-noun object), as the reflect tests use
const relRow = (r) => r.eot.find((x) => x.kind === 'relation' && x.via === 'trusted');

// (a) overcount: a recording and its own transcript — two docIds, one channel.
const recording  = parseText(CLAIM, { docId: 'council-0512.wav' });
recording.modality = 'audio';
const transcript = parseText(CLAIM, { docId: 'council-0512.transcript.txt' });
transcript.modality = 'text';
transcript.derivedFrom = 'council-0512.wav';     // read FROM the recording — no independent access
const derivedPair = reflectAnswer({ answer: CLAIM, doc: createCompositeDoc([recording, transcript]) });
const dr = relRow(derivedPair);
kv('2a  recording + its transcript → status', dr?.status);
kv('2a  …counted origins', dr?.origins);
kv('2a  (senses on the row, if any)', JSON.stringify(dr?.senses ?? '—'));

// (b) undercount: a procurement PDF and an independent council recording of the same act.
const pdf   = parseText(CLAIM, { docId: 'procurement.pdf' });
pdf.modality = 'pdf';
const audio = parseText(CLAIM, { docId: 'council-0512.wav' });
audio.modality = 'audio';                          // independent channel — no derivedFrom
const twoChannels = reflectAnswer({ answer: CLAIM, doc: createCompositeDoc([pdf, audio]) });
const tc = relRow(twoChannels);
kv('2b  PDF + independent recording → status', tc?.status);
kv('2b  …counted origins', tc?.origins);
kv('2b  (senses on the row, if any)', JSON.stringify(tc?.senses ?? '—'));

h('done.');
