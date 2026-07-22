import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { nestComposite } from '../src/perceiver/nest.js';

// A COMPOSITE SOURCE'S FIGURES OPEN IN THE PER-SOURCE GRAPH (SOLAR) TAB.
//
// A single file that is really many nested documents is read as a COMPOSITE (perceiver/nest.js).
// Its reading carries a JOINED docId — its members' ids run together, "…#1 + …#2 + …"
// (organs/in/composite.js) — never the source's own docId. topicTieredData / tieredData mint
// every figure ref against that reading, so the ref's docId is the joined id.
//
// The per-source Graph tab centres ONE of the source's figures and draws the solar surface from
// tieredData(ref.docId, ref.entId). That routes through resolveDoc → entityProfile. resolveDoc used
// to match ONLY a source's own docId, so a composite's joined docId resolved to nothing:
// entityProfile came back null, tieredData yielded zero nodes, and the tab fell to the red
// "Nothing to place in orbit yet for that figure — pick another." — every figure the same, since
// they all share the one unresolvable docId. resolveDoc now also matches the already-built reading's
// own docId (src._doc), so a composite source's figures resolve like any other.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

// A chaptered "file": three lexically distinct sections with a figure named across them, run into
// one document — exactly the nesting docFor recovers on a long multi-section source. Installed as
// the source's reading the way applyTranscript installs a clip's `_doc` (see entity-pivot-levels),
// so the composite (and its derived joined docId) is real without needing docFor's 40-unit floor.
const SECTIONS = [
  [ 'Corin Vale mended the lighthouse lamp at dusk.',
    'The keeper Corin Vale logged every ship that passed the lighthouse.',
    'Storms battered the lighthouse through the long winter.',
    'Corin Vale trimmed the wick and watched the dark water.',
    'Fog rolled in and the lighthouse beam cut through it.',
    'Sailors trusted the lighthouse to guide them home.' ],
  [ 'The orchard bloomed with apple and pear blossom in spring.',
    'Bees moved between the orchard rows all morning.',
    'The farmer pruned the orchard trees before the frost.',
    'A good orchard harvest filled the barn with fruit.',
    'The orchard soil was rich and well drained.',
    'Cider was pressed from the orchard apples each autumn.' ],
  [ 'Corin Vale sailed north with the spring tide.',
    'The astronomer aligned the telescope with the north star.',
    'Corin Vale had not seen the lighthouse in a year.',
    'Through the telescope the rings of Saturn were sharp.',
    'Corin Vale remembered the keeper lamp at dusk.',
    'On clear nights the telescope gathered ancient starlight.' ],
];
const FILE = SECTIONS.map((s) => s.join('\n')).join('\n');

const asComposite = (app, text, title) => {
  const src = app.ingestText(text, title);
  // Read the source as the composite it really is (minGap:3 for a compact fixture; the reader uses
  // minGap:20 on a genuinely long source). Parse under the SOURCE's own docId so the composite's
  // joined docId is derived from it, exactly as docFor builds it in the app.
  const comp = nestComposite(parseText(text, { docId: src.docId, unnamedReferents: true }),
    { alpha: 0.3, minGap: 3, unnamedReferents: true });
  src._doc = comp; src._nlDoc = null;
  return src;
};

test('a composite source nests into a reading whose docId is not the source\'s own', async () => {
  const app = await freshApp();
  const src = asComposite(app, FILE, 'chaptered-file');
  assert.ok(src._doc.isComposite, 'the multi-section file reads as a composite');
  assert.notEqual(src._doc.docId, src.docId, 'the composite reading carries a joined docId, not the source\'s own');
});

test('the composite source\'s figures carry the joined docId and still resolve to a profile', async () => {
  const app = await freshApp();
  const src = asComposite(app, FILE, 'chaptered-file');

  const data = app.topicTieredData([src]);
  const ents = (data.nodes || []).filter((n) => n.kind === 'entity' && n.ref);
  assert.ok(ents.length > 0, 'the composite source surfaces figures for the graph');

  // The refs are minted against the composite reading — their docId is the joined id, not src.docId.
  const joined = ents.filter((n) => n.ref.docId === src._doc.docId && n.ref.docId !== src.docId);
  assert.ok(joined.length > 0, 'the figures reference the composite reading\'s joined docId');

  // The fix: every such ref resolves to a real profile pointing back at the source. Before it,
  // resolveDoc found nothing for the joined docId and entityProfile returned null.
  for (const n of joined) {
    const prof = app.entityProfile(n.ref.docId, n.ref.entId);
    assert.ok(prof, `figure "${n.label}" resolves to a profile from its joined docId`);
    assert.equal(prof.sn, src.sn, 'the profile points back at the composite source');
  }
});

test('the per-source solar surface has bodies to place in orbit for a composite figure', async () => {
  const app = await freshApp();
  const src = asComposite(app, FILE, 'chaptered-file');

  const data = app.topicTieredData([src]);
  const ref = (data.nodes || []).find((n) => n.kind === 'entity' && n.ref && n.ref.docId === src._doc.docId)?.ref;
  assert.ok(ref, 'a composite figure is available to centre');

  // This is exactly what _drawSourceGraph feeds mountSolarSystem. Empty here is the red
  // "Nothing to place in orbit yet for that figure" state — the bug. It must be non-empty now.
  const ego = app.tieredData(ref.docId, ref.entId);
  assert.ok(ego.nodes && ego.nodes.length > 0,
    'tieredData yields the source + focus (+ bonds/claims) — a real orbit, not the empty chooser');
  assert.ok(ego.nodes.some((n) => n.kind === 'source'), 'the sun\'s own source sits at the centre of the descent');
});
