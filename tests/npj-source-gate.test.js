import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streamParagraphs } from '../src/weave/write/paragraphs.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { witnessesForProps } from '../src/enactor/ground/reflect.js';
import { archonReview } from '../src/enactor/ground/archon.js';
import { runTurn } from '../src/turn/pipeline.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';

// NPJ-strict span-anchored generation (docs/archon-source-gate.md). Under the Grounded chip the
// answer is sourced AS it streams: at each period the finished sentence is handed to the ARCHON,
// which admits it only if every proposition it asserts is grounded in the document AND corroborated
// by ≥2 distinct witnessing spans. An unsourceable sentence is dropped before it is forwarded, so
// it never streams and never lands in the draft. Off (auto/free) the writer is byte-identical.

// A model scripted to stream a canned answer word-by-word (so the boundary gate closes sentences
// against real token arrival), and to return the whole text for the draw-then-emit fallback.
const scriptedModel = (text) => ({
  id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
  phrase: async (_messages, { onToken } = {}) => {
    for (const w of String(text).split(/(\s+)/)) onToken?.(w);
    return text;
  },
});
const messages = [{ role: 'user', content: 'q' }];

// ── The gate, with an injected archon (deterministic, no document needed) ─────────────────────

test('gate: an unsourceable sentence is dropped and never streamed (streamed === draft)', async () => {
  // admit a sentence iff it mentions "grounded"; give admitted sentences two witnessing citations.
  const archon = (s) => ({ sourced: /grounded/.test(s), citations: ['s1', 's4'] });
  let streamed = '';
  const res = await streamParagraphs({
    model: scriptedModel('This part is grounded in the memo. This part is fabricated and unsourceable.'),
    messages, onToken: (t) => { streamed += t; }, maxParagraphs: 1, archon, groundStrict: true,
  });
  assert.ok(res, 'a draft was realised');
  assert.match(res.draft, /grounded in the memo/, 'the sourced sentence ships');
  assert.doesNotMatch(res.draft, /fabricated/, 'the unsourceable sentence does not ship');
  assert.doesNotMatch(streamed, /fabricated/, 'and was never streamed');
  assert.equal(streamed, res.draft, 'the emitted stream is byte-identical to the draft');
  assert.deepEqual(res.dropped, ['This part is fabricated and unsourceable.']);
  assert.equal(res.sourced.length, 1, 'one admitted sentence');
  assert.deepEqual(res.sourced[0].citations, ['s1', 's4'], 'it carries its witnessing citations');
});

test('gate: strict OFF ships both sentences (opt-in / byte-parity)', async () => {
  const archon = (s) => ({ sourced: /grounded/.test(s), citations: ['s1'] });
  let streamed = '';
  const res = await streamParagraphs({
    model: scriptedModel('This part is grounded. This part is fabricated.'),
    messages, onToken: (t) => { streamed += t; }, maxParagraphs: 1, archon, groundStrict: false,
  });
  assert.match(res.draft, /fabricated/, 'strict off → the archon is never consulted, the sentence ships');
  assert.equal(streamed, res.draft, 'streamed === draft on the non-strict path too');
});

test('gate: a paragraph the archon empties realises no draft, and does not fall through', async () => {
  const archon = () => ({ sourced: false, citations: [] });
  let streamed = '';
  const res = await streamParagraphs({
    model: scriptedModel('Nothing here sources. Nor does this.'),
    messages, onToken: (t) => { streamed += t; }, maxParagraphs: 1, archon, groundStrict: true,
  });
  assert.equal(res.draft, '', 'every sentence refused → empty draft (not null), carrying the refusals');
  assert.equal(streamed, '', 'nothing was streamed');
  assert.equal(res.dropped.length, 2, 'both refusals are recorded for the audit');
});

// ── The witness bar (a real parsed document) ──────────────────────────────────────────────────

test('witnessesForProps + archonReview: ≥2 distinct witnessing spans are required', () => {
  // "anna trusted ben" is asserted in TWO sentences (active + passive — order-insensitive coref);
  // "ben trusted carol" in ONE.
  const doc = parseText('Anna trusted Ben. Ben was trusted by Anna. Ben trusted Carol.', { docId: 'S-1' });
  const wit = witnessesForProps(doc, [
    { subj: 'anna', via: 'trusted', obj: 'ben' },
    { subj: 'ben', via: 'trusted', obj: 'carol' },
  ]);
  assert.equal(wit[0].spans, 2, 'anna→ben witnessed by two spans');
  assert.equal(wit[1].spans, 1, 'ben→carol witnessed by one');

  const keep = archonReview('Anna trusted Ben.', { doc, minWitnesses: 2 });
  assert.equal(keep.sourced, true, 'two witnesses → admitted');
  assert.deepEqual(keep.citations, ['s0', 's1'], 'and cited to both witnessing spans');

  assert.equal(archonReview('Ben trusted Carol.', { doc, minWitnesses: 2 }).sourced, false,
    'a single-witness claim is refused');
  assert.equal(archonReview('Ben founded Acme.', { doc, minWitnesses: 2 }).sourced, false,
    'a fabricated claim (grounded in nothing) is refused');
});

test('witnessesForProps: a lifted claim is witnessed by the spans that literally carry it', () => {
  // The graph keys the relation on "Project Atlas"; the claim says "Atlas". Meaning-matching alone
  // would count zero witnesses for a claim whose words are plainly on the page (twice). The surface
  // (verbatim) pass rescues it — both lines that contain "atlas … ships … march" witness it.
  const doc = parseText('Project Atlas ships in March. Marketing reconfirmed that Atlas ships in March. Priya manages the Atlas team.', { docId: 'S-2' });
  const [w] = witnessesForProps(doc, [{ subj: 'atlas', via: 'ships', obj: 'march' }]);
  assert.equal(w.spans, 2, 'the lifted claim is witnessed by both lines that carry its words');
  assert.deepEqual(w.spanIdxs, [0, 1]);

  const keep = archonReview('Atlas ships in March.', { doc, minWitnesses: 2 });
  assert.equal(keep.sourced, true, 'so the archon admits it');
  assert.deepEqual(keep.citations, ['s0', 's1']);
  // the once-stated fact is still refused.
  assert.equal(archonReview('Priya manages the Atlas team.', { doc, minWitnesses: 2 }).sourced, false);
});

// ── The memo test, end to end through runTurn ─────────────────────────────────────────────────

const MEMO = 'Anna trusted Ben. Ben was trusted by Anna according to the report. Ben trusted Carol.';
const stubModel = (reply) => ({
  id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
  async phrase() { return reply; },   // ignores onToken → draw-then-emit, gated whole at the close
});

test('runTurn (Grounded): each written sentence sources to ≥2 spans or is dropped', async () => {
  const doc = parseText(MEMO, { docId: 'S-memo' });
  let streamed = '';
  const r = await runTurn({
    question: 'Who did Anna trust?', doc,
    model: stubModel('Anna trusted Ben. Ben founded Acme in Berlin.'),
    embedder: createHashEmbedder(), auditLog: createAuditLog({ capacity: 64 }),
    grounding: 'grounded', stream: true, onToken: (t) => { streamed += t; },
  });
  assert.match(r.answer, /Anna trusted Ben\.\[s\d+\]\[s\d+\]/, 'the corroborated sentence ships with ≥2 citations');
  assert.doesNotMatch(r.answer, /Acme/, 'the unsourceable sentence did not ship');
  assert.doesNotMatch(streamed, /Acme/, 'and was never streamed');
  assert.ok((r.flags || []).some((f) => f.id === 'ground-dropped'), 'the drop is surfaced as an honest, non-refusing flag');
});

test('runTurn (auto): byte-parity — the same fabricated sentence ships (strict is opt-in)', async () => {
  const doc = parseText(MEMO, { docId: 'S-memo' });
  const r = await runTurn({
    question: 'Who did Anna trust?', doc,
    model: stubModel('Anna trusted Ben. Ben founded Acme in Berlin.'),
    embedder: createHashEmbedder(), auditLog: createAuditLog({ capacity: 64 }),
    grounding: 'auto', stream: true, onToken: () => {},
  });
  assert.match(r.answer, /Acme/, 'auto mode ships the unsourced sentence — only the Grounded chip arms the archon');
});
