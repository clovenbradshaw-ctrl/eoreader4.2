import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderNativeKindHtml } from '../src/rooms/reader/native-render.js';

// renderNativeKindHtml — the Native tab's one entrance: given a source (+ its structured doc,
// when it has one), route to the ONE rendering that shows it as the kind of thing it actually
// is, and never show less than the Reader tab's own prose reflow would.

test('markdown: dispatches to the typeset renderer, wrapped in a full HTML document', () => {
  const r = renderNativeKindHtml({ source: { kind: 'markdown', text: '# Title\n\nSome **bold** text.' } });
  assert.equal(r.kind, 'markdown');
  assert.match(r.html, /^<!doctype html>/);
  assert.match(r.html, /class="eo-md"/);
  assert.match(r.html, /<h1 id="eo-md-0">Title<\/h1>/);
  assert.deepEqual(r.toc, [{ id: 'eo-md-0', label: 'Title', level: 1 }]);
});

test('code: dispatches to the highlighter with the source’s own language', () => {
  const r = renderNativeKindHtml({ source: { kind: 'code', language: 'python', text: 'def f(x):\n    return x  # comment' } });
  assert.equal(r.kind, 'code');
  assert.match(r.html, /tok-keyword">def</);
  assert.match(r.html, /tok-comment"># comment</);
});

test('json: reads the structured doc’s real data, not source.text', () => {
  const r = renderNativeKindHtml({
    source: { kind: 'json', text: 'this is the flattened sentence reading, not the tree' },
    doc: { modality: 'json', data: { a: 1, b: [2, 3] } },
  });
  assert.equal(r.kind, 'json');
  assert.match(r.html, /tok-number">1</);
  assert.ok(!r.html.includes('flattened sentence reading'), 'never falls back to the sentence text once the real tree is there');
});

test('json: falls back to the prose reflow when no structured doc is available yet', () => {
  const r = renderNativeKindHtml({ source: { kind: 'json', text: 'path: value. another: thing.' } });
  assert.equal(r.kind, 'text', 'no doc.data to render as JSON — degrade to the reflow, never blank');
  assert.match(r.html, /path: value/);
});

test('table: reads the structured doc’s real columns/records', () => {
  const r = renderNativeKindHtml({
    source: { kind: 'table', text: 'col: val' },
    doc: { modality: 'table', columns: ['A'], keys: ['a'], records: [{ index: 0, cells: { a: 'x' } }] },
  });
  assert.equal(r.kind, 'table');
  assert.match(r.html, /<table/);
  assert.match(r.html, /<td>x<\/td>/);
});

test('table: falls back to the prose reflow when the doc isn’t table-shaped', () => {
  const r = renderNativeKindHtml({ source: { kind: 'table', text: 'col: val' }, doc: { modality: 'json', data: {} } });
  assert.equal(r.kind, 'text');
});

test('xml: reads the structured doc’s tei metadata card + body blocks, not the flattened text', () => {
  const doc = {
    modality: 'xml', isTei: true, tei: { title: 'Elements', authors: ['Euclid'], editors: [], respStmts: [], funder: [], availability: [], revisions: [] },
    spans: [
      { kind: 'title', text: 'Elements' },
      { kind: 'frontmatter', text: 'by Euclid' },
      { kind: 'label', text: '1' },
      { kind: 'paragraph', text: 'A point is that which has no part.' },
    ],
  };
  const r = renderNativeKindHtml({ source: { kind: 'xml', text: 'sentence reading, not the tree' }, doc });
  assert.equal(r.kind, 'xml');
  assert.match(r.html, /<h1 class="eo-xml-title">Elements<\/h1>/);
  assert.match(r.html, /Author/);
  assert.match(r.html, /A point is that which has no part\./);
  assert.ok(!r.html.includes('by Euclid'), 'the frontmatter block is not duplicated in the body once the metadata card shows it');
});

test('xml: with no structured doc yet, parses source.text fresh rather than falling back to plain reflow', () => {
  const xml = '<?xml version="1.0"?><TEI.2><teiHeader><fileDesc><titleStmt><title>A Title</title></titleStmt></fileDesc></teiHeader><text><body><div1 n="1"><p>Body text.</p></div1></body></text></TEI.2>';
  const r = renderNativeKindHtml({ source: { kind: 'xml', text: xml } });
  assert.equal(r.kind, 'xml');
  assert.match(r.html, /Body text\./);
  assert.ok(!r.html.includes('<div1'), 'the raw tag never leaks through — everything is escaped prose');
});

test('html (sniffed, no url): sanitized via the same pass a fetched page gets', () => {
  const r = renderNativeKindHtml({ source: { text: '<html><body><script>alert(1)</script><p>hi</p></body></html>' } });
  assert.equal(r.kind, 'html');
  assert.ok(!r.html.includes('<script>alert'));
  assert.match(r.html, /<p>hi<\/p>/);
});

test('a url-bearing source is never dispatched here for its rendering — desktop refetches it', () => {
  // renderKindOf treats a url-bearing source as 'text' (loadPage/nativePageHtml owns it instead);
  // this dispatch must still degrade gracefully rather than mis-render it if ever called anyway.
  const r = renderNativeKindHtml({ source: { kind: 'web', url: 'https://example.com', text: 'plain prose reflow please' } });
  assert.equal(r.kind, 'text');
});

test('plain text: the same prose reflow the Reader tab already produces', () => {
  const r = renderNativeKindHtml({ source: { kind: 'text', text: 'Just an ordinary paragraph of prose, nothing more to it.' } });
  assert.equal(r.kind, 'text');
  assert.match(r.html, /Just an ordinary paragraph/);
});

test('never throws on a missing/empty source', () => {
  assert.doesNotThrow(() => renderNativeKindHtml({}));
  assert.doesNotThrow(() => renderNativeKindHtml());
});
