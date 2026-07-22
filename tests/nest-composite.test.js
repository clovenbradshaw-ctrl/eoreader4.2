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
import { projectGraph } from '../src/core/index.js';

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

// A chaptered "novel": three sections with their OWN vocabulary (so the boundary detector
// finds the same nesting it finds in the journal), but ONE figure — Corin Vale — named
// identically in the first and last section, the way a protagonist recurs across chapters.
const NOVEL_SECTIONS = [
  { lines: [
    'Corin Vale mended the lighthouse lamp at dusk.',
    'The keeper Corin Vale logged every ship that passed.',
    'Storms battered the lighthouse through the long winter.',
    'Corin Vale trimmed the wick and watched the dark water.',
    'Fog rolled in and the lighthouse beam cut through it.',
    'Sailors trusted the lighthouse to guide them home.',
  ] },
  { lines: [
    'The orchard bloomed with apple and pear blossom in spring.',
    'Bees moved between the orchard rows all morning.',
    'The farmer pruned the orchard trees before the frost.',
    'A good orchard harvest filled the barn with fruit.',
    'The orchard soil was rich and well drained.',
    'Cider was pressed from the orchard apples each autumn.',
  ] },
  { lines: [
    'Corin Vale sailed north with the spring tide.',
    'The astronomer aligned the telescope with the north star.',
    'Corin Vale had not seen the lighthouse in a year.',
    'Through the telescope the rings of Saturn were sharp.',
    'Corin Vale remembered the keeper\'s lamp at dusk.',
    'On clear nights the telescope gathered ancient starlight.',
  ] },
];
const NOVEL = NOVEL_SECTIONS.map((s) => s.lines.join('\n')).join('\n');

test('nestComposite: crossDocSyn defaults ON — a figure named identically in two nested parts is proposed as ONE referent', () => {
  const flat = parseText(NOVEL, { docId: 'novel' });
  const comp = nestComposite(flat, { alpha: 0.3, minGap: 3 });
  const ranges = sourceRanges(comp);
  assert.ok(ranges.length >= 2, `the novel nests into ${ranges.length} sections`);
  // Corin Vale's two nested mentions (section 1 and section 3) must appear in DIFFERENT
  // sections for this to be a real cross-doc test, not a within-doc coincidence.
  const corinSections = ranges.filter((r) =>
    NOVEL.split('\n').slice(r.lo, r.hi + 1).some((l) => l.includes('Corin Vale')));
  assert.ok(corinSections.length >= 2, 'Corin Vale is named in more than one nested section');
  // The cross-doc SYN pass (createCompositeDoc's default) proposes a merge for the SAME
  // label across those sections — the fix that keeps a chaptered work's protagonist one
  // referent after nesting, not fragmented per chapter (createCompositeDoc({crossDocSyn:false})
  // would leave this list empty).
  const events = comp.log.snapshot();
  const corinMerges = events.filter((e) => e.op === 'SYN' && e.crossDoc && e.label === 'Corin Vale');
  assert.ok(corinMerges.length > 0, 'a cross-doc merge is proposed for the recurring figure');
  const spans2Sections = corinMerges.some((e) => e.from.split('␟')[0] !== e.to.split('␟')[0]);
  assert.ok(spans2Sections, 'the merge spans two distinct nested sections, not a within-section duplicate');
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

// ── grain (perceiver/parse/grain.js: figure / kind / setting) survives nesting ──────────────────
//
// grain is a company-distribution judgment — it needs a referent's FULL sighting history to read
// cleanly (docs/grain.js's own comment: a bare "Geneva" oblique in 30 book-wide sightings reads
// as a clean setting; the 2-3 sightings any ONE re-parsed chapter carries are too thin). Each
// nested part above is re-parsed from its own slice alone, so per-part grainRead mostly abstains
// on split evidence, and — worse — projectGraph's union-find merge keeps only the FIRST-SEEN
// constituent's props when several parts' ids collapse onto one referent, so whichever thin
// per-part guess happened to land first is what would survive. nestComposite carries the WHOLE,
// unsegmented read's verdicts (computed once, over every sighting together) onto the composite's
// own id for that label — this is what that reseat buys back.
//
// "Dunmere" is named obliquely twice in the opening section and twice again in the closing one —
// 4 sightings book-wide, comfortably past readGrain's floor (count >= 3) for a setting verdict —
// but NEVER 3 in any ONE nested part, so no per-part re-parse can grade it at all standing alone.
const GRAIN_NOVEL_SECTIONS = [
  { lines: [
    'Corin Vale mended the lighthouse lamp at dusk.',
    'The keeper Corin Vale logged every ship that passed.',
    'Storms battered the lighthouse through the long winter.',
    'Corin Vale trimmed the wick and watched the dark water.',
    'Sailors spoke of the voyage to Dunmere.',
    'The ship set out from Dunmere.',
  ] },
  { lines: [
    'The orchard bloomed with apple and pear blossom in spring.',
    'Bees moved between the orchard rows all morning.',
    'The farmer pruned the orchard trees before the frost.',
    'A good orchard harvest filled the barn with fruit.',
    'The orchard soil was rich and well drained.',
    'Cider was pressed from the orchard apples each autumn.',
  ] },
  { lines: [
    'Corin Vale sailed north with the spring tide.',
    'The astronomer aligned the telescope with the north star.',
    'Corin Vale had not seen the lighthouse in a year.',
    'Through the telescope the rings of Saturn were sharp.',
    'A merchant ship put in at Dunmere.',
    'Grain was carried south from Dunmere.',
  ] },
];
const GRAIN_NOVEL = GRAIN_NOVEL_SECTIONS.map((s) => s.lines.join('\n')).join('\n');

test('nestComposite carries the whole read\'s grain onto the composite — a figure grades a figure', () => {
  const flat = parseText(GRAIN_NOVEL, { docId: 'gnovel' });
  const comp = nestComposite(flat, { alpha: 0.3, minGap: 3 });
  assert.ok(comp.isComposite, 'the novel nests');
  const g = projectGraph(comp.log);
  const rep = g.representative || ((x) => x);
  const id = comp.admission.idOf('Corin Vale');
  assert.ok(id != null, 'Corin Vale is admitted in the composite');
  assert.equal(g.entities.get(rep(id))?.props?.grain, 'figure', 'the recurring agent still grades a figure');
});

test('nestComposite carries the whole read\'s grain onto the composite — a setting too thin in any ONE part still grades a setting', () => {
  const flat = parseText(GRAIN_NOVEL, { docId: 'gnovel' });
  // Confirm the premise: the WHOLE, unsegmented read has enough evidence to grade Dunmere at all.
  const flatGrain = flat.log.snapshot().find((e) => e.op === 'DEF' && e.key === 'grain' && e.id === 'dunmere');
  assert.equal(flatGrain?.value, 'setting', 'the whole book reads Dunmere as a setting');

  const comp = nestComposite(flat, { alpha: 0.3, minGap: 3 });
  assert.ok(comp.isComposite, 'the novel nests');
  const ranges = sourceRanges(comp);
  assert.ok(ranges.length >= 3, `nests into ${ranges.length} parts — Dunmere\'s 2 book-end mentions land in separate parts`);

  const g = projectGraph(comp.log);
  const rep = g.representative || ((x) => x);
  const id = comp.admission.idOf('Dunmere');
  assert.ok(id != null, 'Dunmere is admitted in the composite');
  assert.equal(g.entities.get(rep(id))?.props?.grain, 'setting',
    'carried from the whole read — no single nested part alone ever saw 3 sightings to grade it');
});
