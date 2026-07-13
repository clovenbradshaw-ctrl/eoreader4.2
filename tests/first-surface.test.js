// The import reveal's surface router (first-surface.js) — which surface a freshly
// imported source opens FIRST, per the organ that read it. Pure, so the browserless CI
// guards the routing the index.html reveal (_revealImport) rides on.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstSurfaceKind, STRUCTURED_MODALITIES } from '../src/rooms/reader/first-surface.js';

test('prose with a causal claim read opens the causal DAG', () => {
  for (const modality of ['text', 'pdf', 'webpage', 'ocr', 'image', 'audio', 'web', 'file']) {
    assert.equal(firstSurfaceKind({ modality, causalEdges: 3, entities: 12 }), 'causal', modality);
  }
});

test('prose with no causal claim falls back to the entity web', () => {
  assert.equal(firstSurfaceKind({ modality: 'text', causalEdges: 0, entities: 5 }), 'entity');
  assert.equal(firstSurfaceKind({ modality: 'audio', causalEdges: 0, entities: 1 }), 'entity');
});

test('prose with nothing read yet still opens the DAG — its reading-flow cursor renders for any sentences', () => {
  assert.equal(firstSurfaceKind({ modality: 'text', causalEdges: 0, entities: 0 }), 'causal');
});

test('structured modalities open the entity web, never the causal cursor', () => {
  for (const modality of STRUCTURED_MODALITIES) {
    assert.equal(firstSurfaceKind({ modality, causalEdges: 2, entities: 9 }), 'entity', modality);
  }
});

test('a structured source that raised no entities opens no overlay — the source tab is the reveal', () => {
  assert.equal(firstSurfaceKind({ modality: 'binary', causalEdges: 0, entities: 0 }), null);
});

test('defaults are safe: no args reads as prose', () => {
  assert.equal(firstSurfaceKind(), 'causal');
  assert.equal(firstSurfaceKind({}), 'causal');
});
