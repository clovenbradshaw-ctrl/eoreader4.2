import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildLines, renderToContainer } from '../src/surfaces/rawtext/index.js';
import { rawTextOfSource } from '../src/rooms/reader/rawtext-data.js';
import { mountRawText } from '../src/rooms/reader/rawtext-surface.js';

// The raw-text surface — a source's own text, line-numbered, uninterpreted. Three layers,
// mirroring the binvis test split: buildLines (pure), rawTextOfSource (the data seam, a fake
// `app`), and mountRawText (the mounted surface, a minimal hand-rolled DOM stub — the same
// idiom tests/research-review-surface.test.js and tests/waveform-render.test.js use, not
// jsdom).

// ---- buildLines — pure ------------------------------------------------------------------

test('buildLines: splits on newlines (any line ending), reports the true total', () => {
  const r = buildLines('a\nb\r\nc\rd');
  assert.deepEqual(r.lines, ['a', 'b', 'c', 'd']);
  assert.equal(r.total, 4);
  assert.equal(r.truncated, false);
});

test('buildLines: empty text is one empty line, not zero lines', () => {
  const r = buildLines('');
  assert.deepEqual(r.lines, ['']);
  assert.equal(r.total, 1);
});

test('buildLines: truncates past maxLines and says so', () => {
  const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  const r = buildLines(text, { maxLines: 10 });
  assert.equal(r.lines.length, 10);
  assert.equal(r.total, 10);
  assert.equal(r.truncated, true);
});

test('buildLines: truncates past maxChars before splitting, and says so', () => {
  const text = 'x'.repeat(1000);
  const r = buildLines(text, { maxChars: 100 });
  assert.equal(r.lines.join('').length, 100);
  assert.equal(r.truncated, true);
});

// ---- rawTextOfSource — the data seam, a fake app -----------------------------------------

const fakeApp = (source, origResult) => ({
  sourceBySn: () => source,
  sourceOriginalExport: async () => origResult,
});

test('rawTextOfSource: a plain text source reads straight through', async () => {
  const r = await rawTextOfSource(fakeApp({ kind: 'text', text: 'hello' }, { text: 'hello' }), 1);
  assert.equal(r.text, 'hello');
  assert.equal(r.media, false);
});

test('rawTextOfSource: a PDF/audio/video source is flagged media, never decoded into garbage', async () => {
  const r1 = await rawTextOfSource(fakeApp({ kind: 'pdf', pdfRef: {} }, { bytes: new Uint8Array([1, 2]) }), 1);
  assert.equal(r1.media, true);
  assert.equal(r1.text, '');
  const r2 = await rawTextOfSource(fakeApp({ kind: 'audio', audioRef: {} }, { text: 'transcript' }), 1);
  assert.equal(r2.media, true, 'media by kind, even though sourceOriginalExport carries text');
});

test('rawTextOfSource: falls back to the live registry text when sourceOriginalExport is thin/throws', async () => {
  const src = { kind: 'markdown', text: '# fallback text' };
  const thrown = { sourceBySn: () => src, sourceOriginalExport: async () => { throw new Error('boom'); } };
  const r1 = await rawTextOfSource(thrown, 1);
  assert.equal(r1.text, '# fallback text');

  const r2 = await rawTextOfSource(fakeApp(src, { text: '' }), 1);
  assert.equal(r2.text, '# fallback text', 'an empty original export falls back to source.text');
});

test('rawTextOfSource: no source at all yields empty, non-media text', async () => {
  const app = { sourceBySn: () => null, sourceOriginalExport: async () => null };
  const r = await rawTextOfSource(app, 1);
  assert.equal(r.text, '');
  assert.equal(r.media, false);
});

// ---- the mounted surface — a minimal hand-rolled DOM stub --------------------------------

const makeEl = (tag, doc) => {
  const e = {
    tagName: String(tag).toUpperCase(), _children: [], ownerDocument: doc,
    className: '', textContent: '',
    appendChild(child) {
      if (child && child._isFragment) { for (const c of child._children) this._children.push(c); child._children = []; }
      else this._children.push(child);
      return child;
    },
  };
  Object.defineProperty(e, 'innerHTML', { get: () => '', set: (v) => { if (v === '') e._children = []; } });
  return e;
};
const makeFakeDoc = () => {
  const byId = new Map();
  const doc = {
    createElement: (tag) => makeEl(tag, doc),
    createDocumentFragment: () => ({ _isFragment: true, _children: [], appendChild(c) { this._children.push(c); } }),
    getElementById: (id) => byId.get(id) || null,
    head: { appendChild: (el) => { if (el.id) byId.set(el.id, el); } },
  };
  return doc;
};
const flatten = (node) => {
  const out = [node];
  for (const c of node._children || []) out.push(...flatten(c));
  return out;
};
const textsOf = (root, cls) => flatten(root).filter((n) => n.className === cls).map((n) => n.textContent);

test('renderToContainer: one row per line, a number gutter + the literal text (never HTML)', () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  const handle = renderToContainer('first\n<b>not html</b>\nthird', host);
  assert.equal(handle.lines, 3);
  assert.equal(handle.truncated, false);
  assert.deepEqual(textsOf(host, 'eo-rawtext__no'), ['1', '2', '3']);
  assert.deepEqual(textsOf(host, 'eo-rawtext__src'), ['first', '<b>not html</b>', 'third']);
});

test('renderToContainer: destroy clears the host', () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  const handle = renderToContainer('a\nb', host);
  assert.ok(host._children.length > 0);
  handle.destroy();
  assert.equal(host._children.length, 0);
});

// mountRawText — a fake `app` shaped like binvis-surface.js's own tests expect: state.sources,
// sourceBySn, sourceOriginalExport, subscribe.
const fakeMountApp = (sources) => {
  const bySn = new Map(sources.map((s) => [s.sn, s]));
  return {
    state: { sources },
    sourceBySn: (sn) => bySn.get(sn) || null,
    sourceOriginalExport: async (sn) => { const s = bySn.get(sn); return s ? { text: s.text } : null; },
    subscribe: () => () => {},
  };
};

test('mountRawText: no sources at all → an honest empty state', async () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  mountRawText(host, { app: fakeMountApp([]) });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(flatten(host).some((n) => n.className === 'eo-rawtext__empty'));
});

test('mountRawText: renders the active source’s text, line-numbered', async () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  const app = fakeMountApp([{ sn: 1, kind: 'markdown', text: 'line one\nline two' }]);
  mountRawText(host, { app, sn: 1 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(textsOf(host, 'eo-rawtext__src'), ['line one', 'line two']);
});

test('mountRawText: a media (pdf/audio/video) source shows the honest media empty state, not garbage text', async () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  const app = fakeMountApp([{ sn: 1, kind: 'pdf', pdfRef: {}, text: '' }]);
  mountRawText(host, { app, sn: 1 });
  await new Promise((r) => setTimeout(r, 0));
  const empty = flatten(host).find((n) => n.className === 'eo-rawtext__empty');
  assert.ok(empty);
  assert.match(empty.textContent, /media\/binary format/);
});

test('mountRawText: show(sn) re-scopes to a different source without a fresh mount', async () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  const app = fakeMountApp([
    { sn: 1, kind: 'text', text: 'first source text' },
    { sn: 2, kind: 'text', text: 'second source text' },
  ]);
  const handle = mountRawText(host, { app, sn: 1 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(textsOf(host, 'eo-rawtext__src'), ['first source text']);
  handle.show(2);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(textsOf(host, 'eo-rawtext__src'), ['second source text']);
});

test('mountRawText: destroy clears the host', async () => {
  const doc = makeFakeDoc();
  const host = doc.createElement('div');
  const app = fakeMountApp([{ sn: 1, kind: 'text', text: 'x' }]);
  const handle = mountRawText(host, { app, sn: 1 });
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(host._children.length > 0);
  handle.destroy();
  assert.equal(host._children.length, 0);
});
