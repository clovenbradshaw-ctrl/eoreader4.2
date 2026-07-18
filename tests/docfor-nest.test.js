// docFor (rooms/reader/app/registry.js) is the one lazy entrance every reader shares — chat
// retrieval, the surf, grounding, summaries. This proves the wiring: nestComposite runs
// automatically on ingest, a genuinely nested source presents as a multi-source composite to
// every consumer, a short/simple source is untouched, and a figure recurring across the
// nested parts stays ONE referent (the crossDocSyn fix) rather than fragmenting per part.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { sourceRanges } from '../src/surfer/multilevel.js';

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// Three sections, their OWN vocabulary, long enough to clear docFor's nesting floor
// (minGap: 20 → each section needs 20+ sentences to stand on its own); ONE figure — Rhea
// Voss — named identically in the first and third section, as a recurring protagonist would
// be. Lines VARY by index (not a repeated cycle) — a boundary is a surprise SPIKE, and a
// literal repeat is unsurprising the second time, which would erase the very signal nestComposite
// reads to find the cut.
const numbered = (n, verbs) => Array.from({ length: n }, (_, i) => verbs(i));
const SOURCE = [
  ...numbered(22, (i) => `Rhea Voss charted reach ${i} of the northern strait through drifting ice on watch ${i}.`),
  ...numbered(22, (i) => `The vineyard's terrace ${i} held frost past the equinox and the workers pruned row ${i}.`),
  ...numbered(22, (i) => `Rhea Voss walked reach ${i} of the strait a decade later and named landmark ${i} again.`),
].join('\n');

test('docFor nests a genuinely multi-part source into a composite', async () => {
  const app = await freshApp();
  const src = app.ingestText(SOURCE, 'Three Logs');
  const doc = app.docFor(src.sn);
  const ranges = sourceRanges(doc);
  assert.ok(ranges.length >= 2, `docFor's doc presents as ${ranges.length} source(s) — nesting recovered`);
  assert.ok(doc.isComposite, 'the cached doc is a composite');
});

test('docFor keeps a recurring figure ONE referent across the nested parts', async () => {
  const app = await freshApp();
  const src = app.ingestText(SOURCE, 'Three Logs');
  const doc = app.docFor(src.sn);
  const events = doc.log.snapshot();
  const rheaMerges = events.filter((e) => e.op === 'SYN' && e.crossDoc && e.label === 'Rhea Voss');
  assert.ok(rheaMerges.length > 0, 'a cross-doc identity merge is proposed for the recurring figure');
  const spansTwoParts = rheaMerges.some((e) => e.from.split('␟')[0] !== e.to.split('␟')[0]);
  assert.ok(spansTwoParts, 'the merge unifies mentions from two DIFFERENT nested sections');
});

test('docFor leaves a short, single-threaded source untouched', async () => {
  const app = await freshApp();
  const src = app.ingestText('A short note about a walk in the park.', 'Note');
  const doc = app.docFor(src.sn);
  assert.equal(sourceRanges(doc).length, 1, 'nothing to nest — one source');
  assert.ok(!doc.isComposite, 'not wrapped as a composite');
});

test('docFor caches the doc on the source — repeat calls do not re-nest', async () => {
  const app = await freshApp();
  const src = app.ingestText(SOURCE, 'Three Logs');
  const first = app.docFor(src.sn);
  const second = app.docFor(src.sn);
  assert.equal(first, second, 'the same cached doc comes back');
});
