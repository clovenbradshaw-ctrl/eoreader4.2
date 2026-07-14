import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { stages } from '../src/turn/stages.js';
import { runTurn } from '../src/turn/pipeline.js';
import { querySubjectTerms } from '../src/surfer/retrieve/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createModel } from '../src/model/interface.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import '../src/model/echo.js';   // registers the deterministic, network-free 'echo' backend

// The observed failure (audit export "New topic 8"): "whats the news today?" over an NPR
// homepage retrieved only the site title (nav chrome) and a bare "news" nav label — the
// single lexical contact — and the talker, shown a stray word, answered "I didn't find any
// specific news" while every actual story went unread. A broad, colloquial ask must read the
// document's STRUCTURE, not the one token that happened to match.

// Reconstructed from the real audit's reading.spans (idx 0/1/3/4/5/7 verbatim), with two
// actual headlines the extraction also carried — the content the old path never surfaced.
const NPR = [
  'NPR - Breaking News, Analysis, Music, Arts & Podcasts Top stories in the U.S. and world news, politics, health, science, business, music, arts and culture.',
  'Nonprofit journalism with a mission.',
  'A federal appeals court paused the new asylum policy while the case proceeds.',
  'From across the NPR Network',
  'Life Kit: Tools to help you get it together',
  'Short Wave podcast: Revealing the science behind everyday mysteries',
  'Congress returns this week to negotiate the spending bill before the deadline.',
  'news',
  'Fresh Air: interviews with authors, actors and newsmakers.',
  'Explore more from NPR: Music, Culture, Podcasts and Programs.',
].join('\n');

const nprDoc = () => parseText(NPR, { docId: 'S-0003', genderCoref: true });
const embedder = createHashEmbedder();

// A minimal turn context for the retrieve stage — the fields route/expect/converse would set.
const ctxFor = (doc, question, extra = {}) => ({
  doc, question, history: [], embedder, grounding: 'auto',
  grain: 'Figure', terrain: 'Entity', task: 'answer', ...extra,
});

test('querySubjectTerms: a broad ask names no subject; a pointed one keeps its terms', () => {
  assert.deepEqual(querySubjectTerms('whats the news today?'), [], 'news/today/whats are asking-words, not a subject');
  assert.deepEqual(querySubjectTerms('what is happening now?'), [], 'a pure recency demand names no subject');
  assert.deepEqual(querySubjectTerms('tell me about this'), [], 'a bare "tell me about this" names no subject');

  const rates = querySubjectTerms('why did the central bank hold rates?');
  assert.ok(rates.includes('central') && rates.includes('bank') && rates.includes('rates'),
    'a pointed question keeps its subject terms');
  // a content-demand word beside a real subject still leaves the subject standing
  assert.ok(querySubjectTerms('any news about the asylum policy?').includes('asylum'),
    '"news" drops out but "asylum policy" survives as the subject');
});

test('querySubjectTerms: "this audio file" names the SOURCE by its medium, not a subject', () => {
  // A media-object noun ('audio', 'video', 'recording', 'image', …) is the same deictic "this
  // ___" reference to the source as 'file'/'document'/'book' — never a content term. Without it,
  // "what is this audio file?" kept "audio" and point-retrieved on a word a transcript never
  // says, so the reader shrugged ("a podcast or a lecture recording") instead of reading its
  // skeleton (the real audit export "What is this audio file", 17-530.mp3).
  assert.deepEqual(querySubjectTerms('what is this audio file?'), [], 'audio + file are both source-object words');
  assert.deepEqual(querySubjectTerms('what is this recording about?'), [], 'a bare "what is this recording" names no subject');
  assert.deepEqual(querySubjectTerms('what is this video?'), []);
  assert.deepEqual(querySubjectTerms('what is this image?'), []);
  // a real subject beside the medium word still stands — content questions are untouched
  assert.deepEqual(querySubjectTerms('what does it say about audio codecs?'), ['codecs'],
    'the medium word drops out but "codecs" survives as the subject');
});

// A transcribed clip that OPENS by stating what it is (as an oral argument does), then carries
// the mid-argument content the real 17-530.mp3 export showed. modality 'audio' is what
// organs/in/audio.js stamps on a transcribed recording.
const ARGUMENT = [
  'We will hear argument first this morning in Case 17-530, Wisconsin Central Limited versus United States.',
  'This case is about whether stock options are money remuneration taxable under the Railroad Retirement Tax Act.',
  'Well, what about a bond, you have a savings bond?',
  'And what Congress did was it said we recognized.',
  'And I think if this court worked to compare the language that Congress chose to put in the railroad statute compared to what it put in FICA, which was enacted in the Great Depression.',
  'Well, Justice Ginsburg, the historical record shows that at the time of the Great Depression compensation was in money.',
].join('\n');

test('retrieve: "what is this audio file?" reads the transcript SKELETON, not a stray line', async () => {
  const doc = parseText(ARGUMENT, { docId: '17-530.mp3', genderCoref: true });
  doc.modality = 'audio';   // a transcribed recording keeps its medium (organs/in/audio.js)
  const out = await stages.retrieve(ctxFor(doc, 'what is this audio file?'));
  assert.equal(out.retrieval, 'structural', 'the identity question reads the structure, not "audio" as a term');
  const texts = out.spans.map((s) => s.text).join(' | ');
  assert.match(texts, /Case 17-530|Wisconsin Central|whether stock options/,
    'the opening that states what the recording is now reaches the talker');
});

test('retrieve: a broad ask over an incidental-contact page reads the STRUCTURE, not the stray word', async () => {
  const doc = nprDoc();
  const out = await stages.retrieve(ctxFor(doc, 'whats the news today?'));
  assert.equal(out.retrieval, 'structural', 'the structural fallback fired');
  assert.ok(out.spans.length >= 5, `the skeleton surfaces the document, not two chrome lines (got ${out.spans.length})`);
  const texts = out.spans.map((s) => s.text).join(' | ');
  assert.match(texts, /asylum policy|spending bill/, 'a real headline the keyword path scored 0 is now read');
  assert.ok(out.spans.every((s) => Number.isInteger(s.idx)), 'every fallback span carries a real, bindable index');
});

test('retrieve: a POINTED question that names a subject the page witnesses is untouched', async () => {
  const doc = nprDoc();
  const out = await stages.retrieve(ctxFor(doc, 'what did the appeals court decide about the asylum policy?'));
  assert.notEqual(out.retrieval, 'structural', 'a witnessed subject keeps the pointed retrieval');
  const texts = out.spans.map((s) => s.text).join(' | ');
  assert.match(texts, /asylum policy/, 'the pointed hit is the asylum-policy line');
});

test('retrieve: an honest absence is preserved — a subject the document lacks is not papered over', async () => {
  const doc = nprDoc();
  const out = await stages.retrieve(ctxFor(doc, 'what does it say about quantum teleportation?', { grounding: 'grounded' }));
  assert.notEqual(out.retrieval, 'structural', 'a named-but-absent subject does not trigger the skeleton');
  assert.equal(out.spans.length, 0, 'strict grounded mode keeps the empty set for the honest-absence answer');
});

test('end to end: auto mode never free-associates over a loaded doc — no contact answers the absence', async () => {
  const doc = nprDoc();
  // "dolphins" is a pointed subject the NPR page never mentions → zero lexical contact. The old auto
  // default flipped this to route 'chat' and let the model write a general-knowledge essay (the
  // observed "wild" → orca drift); the reader's promise is "answers only from your recorded sources".
  const r = await runTurn({
    question: 'tell me about dolphins',
    doc, model: createModel('echo'), embedder, auditLog: createAuditLog(), grounding: 'auto',
  });
  assert.equal(r.route, 'grounded', 'a doc-loaded no-contact turn stays grounded, not free chat');
  assert.equal((r.sources || []).length, 0, 'nothing is cited — there was no contact to cite');
  assert.match(r.answer, /does not say|doesn.t (say|cover)|nothing here|no .*information/i,
    `the answer is the typed absence, not a general-knowledge essay (got: ${r.answer})`);
  assert.ok(r.webProposal && r.webProposal.trigger === 'gap',
    'the unclosable gap is offered to the web (fetch real, recordable sources) rather than filled from memory');
});

test('end to end: free-form mode still answers from general knowledge (the escape hatch is intact)', async () => {
  const doc = nprDoc();
  const r = await runTurn({
    question: 'tell me about dolphins',
    doc, model: createModel('echo'), embedder, auditLog: createAuditLog(), grounding: 'free',
  });
  assert.equal(r.route, 'chat', 'free mode ignores the document and answers as chat, as asked');
});

test('end to end: the broad ask now engages the document instead of shrugging', async () => {
  const doc = nprDoc();
  const audit = createAuditLog({ capacity: 64 });
  const r = await runTurn({
    question: 'whats the news today?',
    doc, model: createModel('echo'), embedder, auditLog: audit, grounding: 'auto',
  });
  assert.equal(r.route, 'grounded', 'the turn stays grounded on the document');
  const retrieveStep = (r.turn.steps || []).find((s) => s.name === 'retrieve');
  assert.equal(retrieveStep?.data?.mode, 'structural', 'the audit records the structural read');
  assert.ok((retrieveStep?.data?.n || 0) >= 5, 'the talker is handed the document, not a fragment');
  // echo speaks the excerpts verbatim: the answer now carries real page content
  assert.match(r.answer, /NPR Network|spending bill|journalism|asylum/i,
    `the answer surfaces what the page holds (got: ${r.answer})`);
});
