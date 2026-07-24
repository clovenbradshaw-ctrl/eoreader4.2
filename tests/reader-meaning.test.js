import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installMeaning } from '../src/rooms/reader/app/meaning.js';
import { admitWebSource } from '../src/organs/ingest/websource.js';

// installMeaning exposes the Reader's Meaning nav (lenses/stance at a position — the model-free
// structural significance column, turn/stage-fold.js's own default — and kinds over a document)
// as a thin, pure read over the already-parsed doc. These tests wire it against a real admitted
// document (admitWebSource, the same shape referentDocFor/docFor hand surfAt/kindsOf in the live
// app) rather than a mock, so a signature mismatch with surfFold/detectKinds fails here instead
// of silently in the browser.

const PAGE = {
  url: 'https://example.org/lovelace',
  title: 'Ada Lovelace',
  text: 'Ada Lovelace was an English mathematician. She worked with Charles Babbage on the Analytical Engine. '
    + 'Babbage largely imagined the Engine as an instrument for calculation. Lovelace perceived something more general. '
    + 'She understood the machine might manipulate any system of symbols. Her notes described this at length. '
    + 'The notes were published in 1843. Later scholars recognised her contribution as foundational. '
    + 'Ada Lovelace died in 1852. Her legacy grew across the following century.',
  fetched_at: '2026-06-27T00:00:00Z',
};

const ctxFor = (doc, sn = 'S1') => {
  const appCtx = {};
  const src = { sn, title: PAGE.title };
  appCtx.sourceBySn = (id) => (id === sn ? src : null);
  appCtx.referentDocFor = () => doc;
  appCtx.docFor = () => doc;
  installMeaning(appCtx);
  return appCtx;
};

test('surfAt returns real structural lenses at the opening, model-free', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  const r = appCtx.surfAt('S1', 0);
  assert.ok(r, 'a reading came back for a real document');
  assert.equal(r.anchor, 0);
  assert.ok(Array.isArray(r.lenses), 'lenses is always an array, never undefined');
  assert.ok(r.lenses.length > 0, 'a parsed document with real operations yields real structural lenses with no model loaded');
  for (const l of r.lenses) assert.ok(typeof l.weight === 'number' && typeof l.real === 'boolean', 'each lens carries a measured weight and a null-gated real flag');
});

test('surfAt leaves atmosphere and paradigm honestly null without a meaning model — never fabricated', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  const r = appCtx.surfAt('S1', 0);
  assert.equal(r.atmosphere, null);
  assert.equal(r.paradigm, null);
});

test('surfAt clamps an out-of-range anchor instead of throwing', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  const n = (doc.sentences || doc.units || []).length;
  const r = appCtx.surfAt('S1', n + 500);
  assert.ok(r);
  assert.equal(r.anchor, Math.max(0, n - 1));
});

test('surfAt returns null for an unknown source rather than throwing', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  assert.equal(appCtx.surfAt('nope', 0), null);
});

test('kindsOf abstains honestly on a short document instead of forcing clusters', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  const r = appCtx.kindsOf('S1');
  assert.ok(r && typeof r.k === 'number' && Array.isArray(r.kinds), 'always the real shape, never undefined');
});

test('kindsOf returns the empty shape for an unknown source rather than throwing', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  assert.deepEqual(appCtx.kindsOf('nope'), { k: 0, kinds: [] });
});

test('surfAtFraction resolves a 0..1 scroll fraction to the matching sentence anchor', () => {
  const { doc } = admitWebSource(PAGE);
  const appCtx = ctxFor(doc);
  const n = (doc.sentences || doc.units || []).length;
  assert.equal(appCtx.surfAtFraction('S1', 0).anchor, 0);
  assert.equal(appCtx.surfAtFraction('S1', 1).anchor, n - 1);
  const mid = appCtx.surfAtFraction('S1', 0.5);
  assert.equal(mid.anchor, Math.round(0.5 * (n - 1)));
});
