// The reading goldens — a curated corpus of real, diverse documents (tests/goldens/),
// pinned by bytes (sha256) and by the reader's own reading of them.
//
// WHY a separate corpus (not the conformance manifest): the conformance fast gate
// (tests/conformance-tier2-*.test.js) parses EVERY manifest fixture on every commit.
// These goldens are real-world texts rather than synthetic ones, so they live in
// their own corpus with their own manifest, out of that gate. Kept deliberately
// SMALL — targeted excerpts and short complete works, not whole novels — so every
// golden here reads in well under a second.
//
// WHAT this guards:
//   • integrity   — the golden bytes still hash to what the manifest recorded, so a
//                   silent edit (which would invalidate any baseline built on it)
//                   fails loudly here instead of drifting.
//   • the read    — the reader still ingests each text without throwing, and its
//                   reading (sentence / clause / unnamed-referent counts) is still
//                   exactly what the manifest captured. If these move and you meant
//                   it, regenerate: `node tests/goldens/generate-manifest.mjs`.
//   • partition   — every sentence the reader emits can be relocated in the source
//                   text, in order and in range (the Tier 2 accountability property,
//                   here applied to real, non-English, and OCR'd scientific text).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingestText } from '../src/organs/in/text.js';
import { deriveUnitOffsets, contentCharCount } from './conformance/harness/offsets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDENS_DIR = path.join(HERE, 'goldens');
const manifest = JSON.parse(readFileSync(path.join(GOLDENS_DIR, 'manifest.json'), 'utf8'));

const bytesOf = (row) => readFileSync(path.join(GOLDENS_DIR, row.path));

test('goldens: manifest is non-empty and every row is fully described', () => {
  assert.ok(manifest.goldens.length >= 7, 'expected at least the 7 seeded goldens');
  for (const row of manifest.goldens) {
    for (const field of ['id', 'path', 'title', 'author', 'language', 'sha256', 'bytes', 'reading', 'source', 'license']) {
      assert.ok(row[field] != null && row[field] !== '', `${row.id}: manifest row is missing "${field}"`);
    }
  }
});

for (const row of manifest.goldens) {
  test(`golden integrity: ${row.id} — bytes match the manifest sha256/size`, () => {
    const bytes = bytesOf(row);
    assert.equal(bytes.length, row.bytes, `${row.id}: byte size drifted from the manifest`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256, row.sha256,
      `${row.id}: sha256 drifted — a golden was edited without regenerating the manifest ` +
      `(node tests/goldens/generate-manifest.mjs), or the manifest is stale.`);
  });
}

for (const row of manifest.goldens) {
  test(`golden read: ${row.id} — reader ingests it and the reading matches the captured baseline`, async () => {
    const text = bytesOf(row).toString('utf8');
    const doc = await ingestText(text, {});
    const len = (x) => (Array.isArray(x) ? x.length : 0);

    assert.ok(len(doc.sentences) > 0, `${row.id}: reader produced no sentences`);
    assert.equal(len(doc.sentences), row.reading.sentences,
      `${row.id}: sentence count moved (${len(doc.sentences)} vs manifest ${row.reading.sentences}) — ` +
      `if intentional, regenerate with node tests/goldens/generate-manifest.mjs`);
    assert.equal(len(doc.clauses), row.reading.clauses, `${row.id}: clause count moved`);
    assert.equal(len(doc.unnamedReferentBodies), row.reading.unnamedReferents, `${row.id}: unnamed-referent count moved`);

    // Partition law: every unit relocates in the source, ordered, non-overlapping,
    // in range, and the gaps between units carry no non-whitespace content.
    const offs = deriveUnitOffsets(text, doc.sentences);
    assert.equal(offs.length, doc.sentences.length, `${row.id}: one offset per unit`);
    let cursor = 0;
    for (let i = 0; i < offs.length; i++) {
      const o = offs[i];
      assert.ok(o.ok, `${row.id}: unit ${i} could not be relocated in its source text`);
      assert.ok(o.start >= 0 && o.end <= text.length, `${row.id}: unit ${i} span [${o.start},${o.end}) out of range`);
      assert.ok(o.start >= cursor, `${row.id}: unit ${i} overlaps the previous unit`);
      assert.ok(o.end >= o.start, `${row.id}: unit ${i} ends before it starts`);
      assert.equal(contentCharCount(text.slice(cursor, o.start)), 0,
        `${row.id}: the gap before unit ${i} carries non-whitespace content (accountable-loss violation)`);
      cursor = o.end;
    }
  });
}
