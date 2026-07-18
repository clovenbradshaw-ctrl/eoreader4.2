// Nest extraction (perceiver/nest.js) and the full-power surf (surfer/rich-surf.js): a single
// file that is really MANY documents nested in one is re-presented as a COMPOSITE so the chorus
// surf can triage its parts, and richSurf is a SAFE drop-in for surfFold (identical on a
// single-source doc, source-triaging on a composite). Deterministic: no model, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { nestComposite, nestBoundaries } from '../src/perceiver/nest.js';
import { surfFold, richSurf } from '../src/surfer/index.js';
import { sourceRanges, keepSources } from '../src/surfer/multilevel.js';

// A synthetic "journal": three clearly distinct sub-documents, each with its own vocabulary and
// its own repeated template, run together into ONE file — the nesting the extractor must recover.
const SECTIONS = [
  { topic: 'lighthouse', lines: [
    'The lighthouse keeper trimmed the lamp each dusk.',
    'Storms battered the lighthouse through the long winter.',
    'The keeper logged every ship that passed the lighthouse.',
    'Fog rolled in and the lighthouse beam cut through it.',
    'The lighthouse stood on the rocky headland for a century.',
    'Sailors trusted the lighthouse to guide them home.',
  ] },
  { topic: 'orchard', lines: [
    'The orchard bloomed with apple and pear blossom in spring.',
    'Bees moved between the orchard rows all morning.',
    'The farmer pruned the orchard trees before the frost.',
    'A good orchard harvest filled the barn with fruit.',
    'The orchard soil was rich and well drained.',
    'Cider was pressed from the orchard apples each autumn.',
  ] },
  { topic: 'telescope', lines: [
    'The astronomer aligned the telescope with the north star.',
    'Through the telescope the rings of Saturn were sharp.',
    'The telescope mirror was ground to a fine parabola.',
    'On clear nights the telescope gathered ancient starlight.',
    'The telescope tracked the comet across the sky.',
    'A larger telescope would resolve fainter galaxies.',
  ] },
];
const JOURNAL = SECTIONS.map((s) => s.lines.join('\n')).join('\n');

test('nestComposite: a single file of nested documents becomes a composite of its parts', () => {
  const flat = parseText(JOURNAL, { docId: 'journal' });
  assert.equal(sourceRanges(flat).length, 1, 'ingested flat, it is one source');

  const comp = nestComposite(flat, { alpha: 0.3, minGap: 3 });
  const ranges = sourceRanges(comp);
  assert.ok(ranges.length >= 2, `the nesting is recovered into ${ranges.length} sources (>= 2)`);
  assert.ok(comp.isComposite, 'the result presents as a composite');
  // every unit carries a sub-source provenance (origin), so the axis is fully tiled
  const S = (comp.units || comp.sentences || []).length;
  for (let i = 0; i < S; i++) assert.ok(comp.origin(i)?.docId != null, `unit ${i} has a source`);
});

test('nestComposite: the sub-sources are named emergently from their own content', () => {
  const comp = nestComposite(parseText(JOURNAL, { docId: 'journal' }), { alpha: 0.3, minGap: 3 });
  const ids = sourceRanges(comp).map((r) => String(r.docId));
  const blob = ids.join(' ').toLowerCase();
  // the three topics' own words surface in the sub-source names (names from content, not ordinals)
  const hits = ['lighthouse', 'orchard', 'telescope'].filter((w) => blob.includes(w));
  assert.ok(hits.length >= 2, `sub-source names carry their topics (${ids.join(', ')})`);
});

test('the chorus keeps the on-topic sub-document and can drop the rest', () => {
  const comp = nestComposite(parseText(JOURNAL, { docId: 'journal' }), { alpha: 0.3, minGap: 3 });
  const ranges = sourceRanges(comp);
  const thread = new Map([['telescope', 1], ['astronomer', 1], ['saturn', 1]]);
  // anchor in the telescope section (the last third) so its source is the anchor's source
  const anchor = (comp.units || []).length - 2;
  const keep = keepSources(comp, thread, { anchor });
  // the most relevant source is a telescope one; the lighthouse/orchard sources rank below it
  const ranked = ranges.map((r) => ({ id: String(r.docId), rel: keep.relevance.get(r.docId) ?? 0 }))
    .sort((a, b) => b.rel - a.rel);
  assert.ok(/telescope|astronomer|saturn|starlight/.test(ranked[0].id.toLowerCase()),
    `the top-ranked source is the telescope document (${ranked[0].id})`);
});

test('a document with no internal nesting is returned unchanged', () => {
  const plain = parseText(SECTIONS[0].lines.join('\n'), { docId: 'one' });
  const out = nestComposite(plain, { alpha: 0.05, minGap: 3 });
  assert.equal(out, plain, 'one coherent document is not split');
});

test('richSurf is a byte-identical drop-in for surfFold on a single-source doc', () => {
  const doc = parseText(SECTIONS[2].lines.join('\n'), { docId: 'one' });
  for (const opts of [{ reach: 'adaptive' }, { reach: 'adaptive', thread: new Map([['telescope', 1]]) }, {}]) {
    const a = surfFold(doc, 0, opts);
    const b = richSurf(doc, 0, opts);
    assert.deepEqual(b.stops, a.stops, 'same stops');
    assert.equal(b.peak, a.peak, 'same peak');
  }
});

test('richSurf triages the sources of a composite (reads the on-topic one)', () => {
  const comp = nestComposite(parseText(JOURNAL, { docId: 'journal' }), { alpha: 0.3, minGap: 3 });
  const ranges = sourceRanges(comp);
  const telRange = ranges.find((r) => /telescope|astronomer|saturn|starlight/.test(String(r.docId).toLowerCase()));
  assert.ok(telRange, 'a telescope sub-source exists');
  const thread = new Map([['telescope', 1], ['saturn', 1], ['astronomer', 1]]);
  const surf = richSurf(comp, telRange.lo, { reach: 'adaptive', thread });
  // the peak lands in the telescope source's range — the chorus read the relevant sub-document
  assert.ok(surf.peak >= telRange.lo && surf.peak <= telRange.hi,
    `the peak (${surf.peak}) is inside the telescope source [${telRange.lo}, ${telRange.hi}]`);
});
