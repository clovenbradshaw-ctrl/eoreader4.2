// TIER 2 — Conservation and provenance (docs/parse-conformance-spec.md).
// "This is the tier that makes 'accountable loss' falsifiable rather than
// aspirational... it should be the second thing tested." Partition law (#6) and
// slice fidelity (#8) are the two tests the spec says never come off the gate —
// run here across 100% of the fixture corpus, every commit.
//
// HONEST SEAM (see tests/conformance/README.md "Known gaps" for the full
// accounting): the text perceiver carries no native byte-offset map — units are
// bare strings (src/perceiver/parse/sentences.js), and the omnimodal Reading's
// `resolve(span)` answers with `{ sentIdx, preview }`, not a byte range
// (src/perceiver/text/waveform.js). This file tests the strongest TRUE
// invariant available today: tests/conformance/harness/offsets.js recovers each
// unit's byte span by exploiting the one normalization the engine actually
// performs (whitespace collapse — see segmentSentences), and partition/slice
// fidelity are asserted against that recovery. Where recovery itself fails
// (`ok:false`), that IS a finding — it means some unit's text is not a
// subsequence of the source, which is exactly the class of bug #8 exists to
// catch — not something this file second-guesses or filters away.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listFixtures, loadFixture } from './conformance/harness/fixtures.js';
import { readWithSeed, buildReading } from './conformance/harness/read.js';
import { validateReading } from '../src/perceiver/contract.js';
import {
  deriveUnitOffsets, charOffsetToByteOffset, contentCharCount,
} from './conformance/harness/offsets.js';

const ALL_FIXTURES = listFixtures();

// Parse + recover offsets ONCE per fixture, shared across every test below —
// Tier 2 runs on the full corpus on every commit (spec, "Running it"), and
// Frankenstein alone is ~3,300 units; re-parsing it on every test would make
// the fast gate slow for no reason.
const _cache = new Map();
const loaded = async (row) => {
  if (_cache.has(row.id)) return _cache.get(row.id);
  const f = loadFixture(row.id);
  const doc = await readWithSeed(f.bytes, {});
  const offs = deriveUnitOffsets(f.text, doc.sentences);
  const entry = { f, doc, offs };
  _cache.set(row.id, entry);
  return entry;
};

// ── #6 — Partition law ────────────────────────────────────────────────────────
// The recovered byte intervals of every unit, in reading order, are gapless of
// CONTENT (a gap between two units may contain only whitespace — the paragraph
// break / sentence-boundary punctuation-adjacent space the splitter consumed),
// non-overlapping, and in [0, len). Run on every fixture; this test never comes
// off the gate (spec, Tier 2 set-down criterion).
test('Tier2 #6: partition law — recovered unit spans are ordered, non-overlapping, in-range, and gaps carry no content', async () => {
  for (const row of ALL_FIXTURES) {
    const { f, doc, offs } = await loaded(row);
    const text = f.text;

    assert.equal(offs.length, doc.sentences.length, `${row.id}: one offset per unit`);
    for (const o of offs) assert.ok(o.ok, `${row.id}: a unit's text could not be relocated in its source — offset recovery failed (${JSON.stringify(o)})`);

    let cursor = 0;
    for (let i = 0; i < offs.length; i++) {
      const { start, end } = offs[i];
      assert.ok(start >= 0 && end <= text.length, `${row.id} unit ${i}: span [${start},${end}) out of [0,${text.length})`);
      assert.ok(start >= cursor, `${row.id} unit ${i}: span starts before the previous unit ended (overlap)`);
      assert.ok(end >= start, `${row.id} unit ${i}: end before start`);
      const gap = text.slice(cursor, start);
      assert.equal(contentCharCount(gap), 0, `${row.id}: the gap before unit ${i} ("${gap.slice(0, 40)}") carries non-whitespace content — accountable-loss violation`);
      cursor = end;
    }
    const trailingGap = text.slice(cursor);
    assert.equal(contentCharCount(trailingGap), 0, `${row.id}: trailing text after the last unit carries content`);

    // Total content-character conservation, computed independently of the
    // gap-by-gap walk above (a second, whole-document cross-check).
    const totalInUnits = doc.sentences.reduce((n, s) => n + contentCharCount(s), 0);
    assert.equal(totalInUnits, contentCharCount(text), `${row.id}: Σ content chars in units != total content chars in source`);
  }
});

// ── #7 — Typed discard totality ──────────────────────────────────────────────
// Every unit produces exactly one NUL retention/discard record (src/perceiver/
// parse/pipeline.js processSentence: frame-bracketed and chrome lines are HELD
// (kind:'chrome', optionally via:'frame'); every other line is retained
// verbatim (kind:'span')). The enum is asserted closed — a kind or `via` this
// suite has not seen before fails loudly rather than silently passing through.
const CLOSED_NUL_KINDS = new Set(['span', 'chrome']);
const CLOSED_NUL_VIA = new Set(['frame']);

test('Tier2 #7: typed discard totality — one NUL record per unit, kind/via drawn from a closed enum', async () => {
  for (const row of ALL_FIXTURES) {
    const { doc } = await loaded(row);
    const nul = doc.log.snapshot().filter((e) => e.op === 'NUL');
    const bySent = new Map();
    for (const e of nul) {
      assert.ok(e.sentIdx != null, `${row.id}: a NUL record with no sentIdx`);
      assert.ok(e.kind != null, `${row.id}: a NUL record with a null type — typed discard requires a non-null type`);
      assert.ok(CLOSED_NUL_KINDS.has(e.kind), `${row.id}: unrecognized NUL kind "${e.kind}" — the enum is no longer closed, update CLOSED_NUL_KINDS deliberately`);
      if (e.via != null) assert.ok(CLOSED_NUL_VIA.has(e.via), `${row.id}: unrecognized NUL via "${e.via}"`);
      bySent.set(e.sentIdx, (bySent.get(e.sentIdx) || 0) + 1);
    }
    assert.equal(bySent.size, doc.sentences.length, `${row.id}: every unit index must have a NUL record`);
    for (const [sentIdx, count] of bySent) assert.equal(count, 1, `${row.id} unit ${sentIdx}: expected exactly one NUL record, found ${count}`);
  }
});

// ── #8 — Slice fidelity (byte-for-byte) ────────────────────────────────────────────
// Convert the recovered char offsets to true UTF-8 byte offsets and slice the
// RAW BYTES (not the decoded string) — proving the recovered span addresses the
// same bytes the fixture is pinned by sha256, not an artifact of JS string
// indexing. After collapsing whitespace runs the same way segmentSentences does
// (the one normalization in play — see file header), the byte-sliced text must
// equal the unit exactly.
const collapseWs = (s) => s.replace(/\s+/g, ' ').trim();

test('Tier2 #8: slice fidelity — byte-sliced spans reproduce unit text exactly (mod. whitespace collapse)', async () => {
  const MAX_PER_DOC = 500;   // spec's own sampling cap
  for (const row of ALL_FIXTURES) {
    const { f, doc, offs } = await loaded(row);
    const text = f.text;
    const n = Math.min(MAX_PER_DOC, doc.sentences.length);
    for (let i = 0; i < n; i++) {
      const { start, end, ok } = offs[i];
      if (!ok) continue;   // already a failure under #6; do not double-report here
      const byteStart = charOffsetToByteOffset(text, start);
      const byteEnd = charOffsetToByteOffset(text, end);
      const sliceBytes = f.bytes.subarray(byteStart, byteEnd);
      const sliced = collapseWs(Buffer.from(sliceBytes).toString('utf8'));
      assert.equal(sliced, collapseWs(doc.sentences[i]),
        `${row.id} unit ${i}: byte slice [${byteStart},${byteEnd}) != unit text`);
    }
  }
});

// ── #9 — Offset survival through normalization (adapted) ────────────────
// HONEST SEAM: the engine exposes no togglable dehyphenation / ligature-
// expansion / curly-quote-folding passes to compare against — whitespace
// collapse (inside segmentSentences) is the ONLY normalization in the pipeline
// today (grepped createParser's options list; see README). This test is the
// honest version of #9: feed the SAME logical document through several
// superficial whitespace re-formattings (extra spaces/tabs, CRLF line endings,
// a trailing newline added) and assert offset recovery still succeeds and the
// partition law still holds — i.e. the one normalization step that exists
// really does carry an invertible offset map, not just usually.
test('Tier2 #9: offset survival through whitespace re-formatting (the one normalization this pipeline performs)', async () => {
  const base = loadFixture('muni-council-minutes-01').text;
  let spaceCount = 0;
  const variants = {
    'extra spaces/tabs': base.replace(/ /g, () => (((spaceCount++) % 7 === 0) ? '  \t ' : ' ')),
    'CRLF line endings': base.replace(/\n/g, '\r\n'),
    'trailing newline added': base + '\n\n\n',
    'trailing newline removed': base.replace(/\s+$/, ''),
  };
  for (const [label, text] of Object.entries(variants)) {
    const doc = await readWithSeed(text, {});
    const offs = deriveUnitOffsets(text, doc.sentences);
    assert.ok(offs.every((o) => o.ok), `${label}: offset recovery failed on at least one unit`);
    let cursor = 0;
    for (const { start, end } of offs) {
      assert.ok(start >= cursor, `${label}: overlapping spans after re-formatting`);
      assert.equal(contentCharCount(text.slice(cursor, start)), 0, `${label}: a re-formatted gap gained content`);
      cursor = end;
    }
  }
});

// ── #10 — Trace coverage == 1 at parse depth ────────────────────────
// Every referent resolves to at least one unit (a non-empty mention list), every
// sighting resolves to a valid unit index, and — reusing the shared substrate
// schema's own validator (src/perceiver/contract.js validateReading, which
// checks exactly this for segments/sightings/referents) — the omnimodal Reading
// built from the same doc has no orphaned segment, sighting, or referent either.
test('Tier2 #10: trace coverage == 1 — every referent/sighting/segment resolves to a unit; every unit resolves to a byte range', async () => {
  for (const row of ALL_FIXTURES) {
    const { f, doc, offs } = await loaded(row);

    // Every unit resolves to a byte range (offset recovery succeeds for all).
    assert.ok(offs.every((o) => o.ok), `${row.id}: not every unit resolves to a byte range`);

    // Every admitted referent has at least one mention (a unit it resolves to).
    for (const [label, id] of doc.admission.admitted) {
      const mentions = doc.admission.mentions.get(id) || [];
      assert.ok(mentions.length > 0, `${row.id}: referent "${label}" (${id}) has no mentions — an orphaned referent`);
      for (const sentIdx of mentions) {
        assert.ok(sentIdx >= 0 && sentIdx < doc.sentences.length, `${row.id}: referent "${label}" has a mention at out-of-range sentIdx ${sentIdx}`);
      }
    }

    // The omnimodal Reading's own no-orphans validator (sightings resolve to a
    // referent AND a unit; segments resolve to a unit range).
    const reading = await buildReading(doc);
    const { ok, errors } = validateReading(reading);
    assert.ok(ok, `${row.id}: buildTextReading output failed validateReading — ${JSON.stringify(errors)}`);
  }
});
