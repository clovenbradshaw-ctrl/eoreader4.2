import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unitSpans, anchorFor, resolveAnchor, canon, spanHashOf } from '../src/rooms/reader/anchor.js';
import { segmentSentences } from '../src/perceiver/parse/index.js';
import { webContentHash } from '../src/organs/ingest/websource.js';

// The anchor's one subtlety: sentences are NOT verbatim slices of the raw text — the segmenter
// collapses whitespace and folds soft wraps — so spans are recovered under whitespace
// equivalence. These tests pin that recovery on exactly the transforms the segmenter applies.

test('unitSpans — verbatim prose maps back exactly', () => {
  const text = 'The creature spoke. Frankenstein listened in horror. The ice held.';
  const units = segmentSentences(text);
  assert.equal(units.length, 3);
  const spans = unitSpans(text, units);
  units.forEach((u, i) => {
    assert.ok(spans[i], `unit ${i} recovered`);
    assert.equal(text.slice(spans[i][0], spans[i][1]), u);
  });
});

test('unitSpans — soft-wrapped lines (Gutenberg style) recover despite the fold to spaces', () => {
  const text = 'It was on a dreary night of November\nthat I beheld the accomplishment\nof my toils. With an anxiety that\nalmost amounted to agony, I collected.';
  const units = segmentSentences(text);
  assert.equal(units.length, 2);
  assert.ok(units[0].includes('accomplishment of my toils'));   // folded to one line
  const spans = unitSpans(text, units);
  assert.ok(spans[0] && spans[1]);
  // The raw slice differs from the unit only by whitespace — canon-equal, and starts/ends aligned.
  assert.equal(canon(text.slice(spans[0][0], spans[0][1])), canon(units[0]));
  assert.ok(text.slice(spans[0][0]).startsWith('It was on a dreary'));
  assert.ok(text.slice(0, spans[1][1]).endsWith('I collected.'));
});

test('unitSpans — CRLF, runs of spaces, and paragraph breaks', () => {
  const text = 'First   sentence  here.\r\n\r\nSecond    paragraph sentence.\r\nStill the second   paragraph.';
  const units = segmentSentences(text);
  const spans = unitSpans(text, units);
  units.forEach((u, i) => {
    assert.ok(spans[i], `unit ${i} recovered`);
    assert.equal(canon(text.slice(spans[i][0], spans[i][1])), canon(u));
  });
});

test('unitSpans — a repeated sentence lands in reading order, and a failed unit does not derail the rest', () => {
  const text = 'The bell rang. The bell rang. Silence followed.';
  const units = ['The bell rang.', 'NOT IN THE TEXT AT ALL — INVENTED.', 'The bell rang.', 'Silence followed.'];
  const spans = unitSpans(text, units);
  assert.ok(spans[0] && spans[2] && spans[3]);
  assert.equal(spans[1], null);
  assert.ok(spans[2][0] > spans[0][0], 'second occurrence, not the first again');
  assert.equal(text.slice(spans[3][0], spans[3][1]), 'Silence followed.');
});

const mkSrc = (text, over = {}) => ({ sn: 'S1', docId: 'doc-test01', sha: webContentHash(text), text, ...over });

test('anchorFor from a unit index — exact span, embedded quote, span hash', () => {
  const text = 'Alpha begins the tale. Beta carries it onward. Gamma ends it.';
  const src = mkSrc(text);
  const doc = { sentences: segmentSentences(text) };
  const a = anchorFor({ src, doc, unit: 1 });
  assert.ok(a);
  assert.equal(a.sn, 'S1');
  assert.equal(a.sourceSha, src.sha);
  assert.equal(a.unit, 1);
  assert.equal(text.slice(a.charSpan[0], a.charSpan[1]), 'Beta carries it onward.');
  assert.equal(a.text, 'Beta carries it onward.');
  assert.equal(a.spanHash, spanHashOf('Beta carries it onward.'));
});

test('anchorFor from a bare quote — located whitespace-equivalently', () => {
  const text = 'One thing.\nAnd then the long\nwrapped middle passage.\nLast thing.';
  const src = mkSrc(text);
  const a = anchorFor({ src, quote: 'And then the long wrapped middle passage.' });
  assert.ok(a && a.charSpan);
  assert.equal(canon(text.slice(a.charSpan[0], a.charSpan[1])), canon('And then the long wrapped middle passage.'));
});

test('resolveAnchor — exact when the source is byte-identical', () => {
  const text = 'Alpha begins. Beta continues. Gamma concludes.';
  const src = mkSrc(text);
  const doc = { sentences: segmentSentences(text) };
  const a = anchorFor({ src, doc, unit: 2 });
  const r = resolveAnchor(a, src);
  assert.equal(r.status, 'exact');
  assert.equal(r.text, 'Gamma concludes.');
  assert.deepEqual(r.charSpan, a.charSpan);
  assert.equal(r.jump.sn, 'S1');
});

test('resolveAnchor — relocated when the source changed but the words survive', () => {
  const text = 'Alpha begins. Beta continues. Gamma concludes.';
  const src = mkSrc(text);
  const doc = { sentences: segmentSentences(text) };
  const a = anchorFor({ src, doc, unit: 1 });
  const edited = 'A NEW PREFACE WAS ADDED.\n\nAlpha begins. Beta continues. Gamma concludes.';
  const r = resolveAnchor(a, mkSrc(edited));
  assert.equal(r.status, 'relocated');
  assert.equal(edited.slice(r.charSpan[0], r.charSpan[1]), 'Beta continues.');
});

test('resolveAnchor — relocated across a re-wrap (same words, new line breaks)', () => {
  const text = 'The long sentence that will be wrapped differently after a refetch of the page.';
  const src = mkSrc(text);
  const doc = { sentences: segmentSentences(text) };
  const a = anchorFor({ src, doc, unit: 0 });
  const rewrapped = 'The long sentence that\nwill be wrapped differently\nafter a refetch of the page.';
  const r = resolveAnchor(a, mkSrc(rewrapped));
  assert.equal(r.status, 'relocated');   // canon-equal ⇒ span hash still verifies
  assert.equal(canon(rewrapped.slice(r.charSpan[0], r.charSpan[1])), canon(a.text));
});

test('resolveAnchor — moved when the words are gone, and when the source is gone', () => {
  const text = 'Alpha begins. Beta continues.';
  const src = mkSrc(text);
  const doc = { sentences: segmentSentences(text) };
  const a = anchorFor({ src, doc, unit: 0 });
  const gone = resolveAnchor(a, mkSrc('Entirely different words now occupy this source.'));
  assert.equal(gone.status, 'moved');
  assert.equal(gone.reason, 'text-gone');
  assert.equal(gone.text, 'Alpha begins.');          // the embedded quote still testifies
  const noSrc = resolveAnchor(a, null);
  assert.equal(noSrc.status, 'moved');
  assert.equal(noSrc.reason, 'source-gone');
  assert.equal(noSrc.jump.text, 'Alpha begins.');
});

test('resolveAnchor — never silently rebinds: a same-sha stale span falls down the ladder, not through it', () => {
  const text = 'Alpha begins. Beta continues. Gamma concludes.';
  const src = mkSrc(text);
  const doc = { sentences: segmentSentences(text) };
  const a = anchorFor({ src, doc, unit: 1 });
  // Forge an anchor whose charSpan drifted but whose sha claims the same source: the slice no
  // longer hashes true, so the exact rung must refuse and the quote re-locates honestly.
  const forged = { ...a, charSpan: [0, 13] };
  const r = resolveAnchor(forged, src);
  assert.equal(r.status, 'relocated');
  assert.equal(text.slice(r.charSpan[0], r.charSpan[1]), 'Beta continues.');
});
