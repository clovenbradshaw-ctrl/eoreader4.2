// The 1:1 FORMATTING contract for the TEXT organ — every input sentence is held
// verbatim in the append-only log, so the log is a lossless, model-free formatting of
// the prose INTO the grammar (the same coverage the table/json/layout organs already
// meet: every cell/leaf/block lands). The extraction (INS/CON/DEF) rides ON TOP as a
// defeasible overlay and must add no graph structure of its own — formatting adds no
// information the input didn't carry. These tests pin the three halves of that:
//   (1) COVERAGE       — every sentence lands ≥1 event (no silent barren drop)
//   (2) RECONSTRUCTION — the held spans replay the input verbatim (the log is 1:1)
//   (3) INFO-NEUTRAL   — the retention layer adds no entity or edge to the projection
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText }    from '../src/perceiver/parse/pipeline.js';
import { projectGraph } from '../src/core/project.js';
import { emitEot }      from '../src/organs/ingest/eot-emit.js';

// A paragraph mixing extractable prose with deliberately BARREN sentences (no proper
// name, no relation a model-free reader can pull) — the silent case the layer closes.
const PARA = [
  'Ada Lovelace wrote the first algorithm.',
  'She worked with Charles Babbage on the Analytical Engine.',
  'Then everything changed.',                  // barren: no name, no admitted relation
  'The machine was never built.',
  'Nothing more was said.',                    // barren
].join(' ');

const heldByIdx = (doc) => {
  const m = new Map();
  for (const e of doc.log.snapshot()) if (e.op === 'NUL' && typeof e.text === 'string') m.set(e.sentIdx, e.text);
  return m;
};

test('coverage: every input sentence lands at least one event in the log', () => {
  const doc = parseText(PARA, { docId: 'cov' });
  const seen = new Set(doc.log.snapshot().map((e) => e.sentIdx).filter((i) => i != null));
  for (let i = 0; i < doc.sentences.length; i++)
    assert.ok(seen.has(i), `sentence ${i} ("${doc.sentences[i]}") has no event — a silent drop`);
});

test('coverage: a barren sentence is HELD (NUL span), never silently absent', () => {
  const doc = parseText(PARA, { docId: 'barren' });
  const held = heldByIdx(doc);
  const barrenIdx = doc.sentences.findIndex((s) => /Then everything changed/.test(s));
  assert.ok(barrenIdx >= 0, 'the barren sentence survived segmentation');
  assert.equal(held.get(barrenIdx), doc.sentences[barrenIdx], 'the barren line is held verbatim');
  const spans = doc.log.snapshot().filter((e) => e.op === 'NUL' && e.kind === 'span' && e.sentIdx === barrenIdx);
  assert.equal(spans.length, 1, 'held exactly once as a span — no double-hold');
});

test('reconstruction: the held spans replay the input verbatim — the log is 1:1', () => {
  const doc = parseText(PARA, { docId: 'recon' });
  const held = heldByIdx(doc);
  for (let i = 0; i < doc.sentences.length; i++)
    assert.equal(held.get(i), doc.sentences[i], `sentence ${i} reconstructs verbatim from the log alone`);
  const replay = [...doc.sentences.keys()].map((i) => held.get(i));
  assert.deepEqual(replay, doc.sentences, 'the ordered spans ARE the sentence sequence');
});

test('info-neutral: the retention layer adds no entity or edge to the projection', () => {
  const doc  = parseText(PARA, { docId: 'neutral' });
  const full = projectGraph(doc.log, {});
  // strip the retention spans and re-project — the graph must be byte-identical in shape.
  const bare    = doc.log.snapshot().filter((e) => !(e.op === 'NUL' && e.kind === 'span'));
  const fakeLog = { snapshot: () => bare, length: bare.length };
  const stripped = projectGraph(fakeLog, {});
  const nEnt = (g) => g.entities?.size ?? (Array.isArray(g.entities) ? g.entities.length : Object.keys(g.entities || {}).length);
  assert.equal(nEnt(full), nEnt(stripped), 'retention spans introduce no entity');
  assert.equal(full.edges.length, stripped.edges.length, 'retention spans introduce no edge');
  const ids = full.entities?.keys ? [...full.entities.keys()]
    : (Array.isArray(full.entities) ? full.entities.map((e) => e.id) : Object.keys(full.entities || {}));
  assert.ok(!ids.some((id) => String(id).startsWith('unit:')), 'a held span never appears as an entity');
});

test('surface: retention spans are reported as skipped, not dumped into the reading', () => {
  const doc = parseText(PARA, { docId: 'surface' });
  const { skipped } = emitEot(doc.log);
  assert.ok(skipped.some((s) => /retention span/.test(s.reason)),
    'the spans are honestly accounted as skipped from the reading surface, never silently dropped');
});
