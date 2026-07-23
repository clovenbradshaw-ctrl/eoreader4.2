import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderKindOf, isNativelyRenderable, looksLikeHtml, looksLikeXml, looksLikeMarkdown, RENDER_KINDS } from '../src/rooms/reader/doc-kind.js';

// renderKindOf — the Native tab's first question: given a source, what native shape should
// it render as? A tagged kind (xml/json/table/markdown/code) always wins; a url-less source with
// no such tag falls back to sniffing its text; a url-bearing source never sniffs (its Native
// tab renders from a fresh fetch instead — loadPage/nativePageHtml, untouched by this module).

test('RENDER_KINDS lists the six real kinds plus the always-safe text fallback', () => {
  assert.deepEqual([...RENDER_KINDS], ['html', 'xml', 'markdown', 'json', 'table', 'code', 'text']);
});

test('a tagged kind wins outright, regardless of what the text looks like', () => {
  assert.equal(renderKindOf({ kind: 'xml', text: 'not actually xml prose' }), 'xml');
  assert.equal(renderKindOf({ kind: 'json', text: 'not actually json prose' }), 'json');
  assert.equal(renderKindOf({ kind: 'table', text: 'col: val' }), 'table');
  assert.equal(renderKindOf({ kind: 'dataset', text: 'col: val' }), 'table');
  assert.equal(renderKindOf({ kind: 'markdown', text: 'plain sentence.' }), 'markdown');
  assert.equal(renderKindOf({ kind: 'code', text: 'plain sentence.' }), 'code');
});

test('a url-bearing source is never sniffed — its Native tab renders from a fresh fetch instead', () => {
  assert.equal(renderKindOf({ kind: 'web', url: 'https://example.com', text: '<html><body>hi</body></html>' }), 'text');
  assert.equal(renderKindOf({ kind: 'web', url: 'https://example.com', text: '# Heading\n\n- one\n- two' }), 'text');
});

test('a url-less source with no tag sniffs its own text for HTML', () => {
  assert.equal(renderKindOf({ text: '<!doctype html><html><body><p>hi</p></body></html>' }), 'html');
  assert.equal(renderKindOf({ text: '<table><tr><td>a</td></tr></table>' }), 'html');
});

test('a url-less TEI/XML source is caught BEFORE the HTML sniff, even though its tags collide', () => {
  // div/p/body/title are all real HTML tag names too — this is exactly the misfire the xml
  // check exists to head off (a TEI document reads as one run-on paragraph through an HTML parser).
  const tei = '<?xml version="1.0"?>\n<TEI.2><teiHeader><fileDesc><titleStmt><title>A Title</title></titleStmt></fileDesc></teiHeader><text><body><div1 n="1"><p>Some text.</p></div1></body></text></TEI.2>';
  assert.equal(renderKindOf({ text: tei }), 'xml');
  assert.equal(renderKindOf({ text: '<!DOCTYPE TEI.2 SYSTEM "tei2.dtd"><TEI.2><text><body><p>x</p></body></text></TEI.2>' }), 'xml');
  assert.equal(renderKindOf({ text: '<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title></channel></rss>' }), 'xml');
});

test('a bare HTML5 document is never mistaken for XML', () => {
  assert.equal(renderKindOf({ text: '<!doctype html><html><body><div>hi</div></body></html>' }), 'html');
});

test('a url-less source with no tag sniffs its own text for markdown', () => {
  assert.equal(renderKindOf({ text: '# Title\n\nSome **bold** text and a [link](https://x.com).' }), 'markdown');
  assert.equal(renderKindOf({ text: '- one\n- two\n- three\n\n```js\ncode();\n```' }), 'markdown');
});

test('one stray markdown-ish character in ordinary prose is not enough to call it markdown', () => {
  // a single asterisk, no other markdown signal — this is prose, not markdown.
  assert.equal(renderKindOf({ text: 'The total came to *roughly* forty dollars, give or take.' }), 'text');
});

test('plain prose with no HTML or markdown signal falls back to text', () => {
  assert.equal(renderKindOf({ text: 'Just an ordinary paragraph of plain prose, nothing more.' }), 'text');
  assert.equal(renderKindOf({}), 'text');
});

test('isNativelyRenderable mirrors renderKindOf !== text', () => {
  assert.equal(isNativelyRenderable({ kind: 'markdown', text: 'x' }), true);
  assert.equal(isNativelyRenderable({ kind: 'json', text: 'x' }), true);
  assert.equal(isNativelyRenderable({ text: 'plain prose, nothing special about it at all.' }), false);
});

test('looksLikeHtml / looksLikeXml / looksLikeMarkdown are exported and agree with renderKindOf', () => {
  assert.equal(looksLikeHtml('<div>x</div>'), true);
  assert.equal(looksLikeHtml('no markup here'), false);
  assert.equal(looksLikeXml('<?xml version="1.0"?><root/>'), true);
  assert.equal(looksLikeXml('<div>x</div>'), false);
  assert.equal(looksLikeMarkdown('# h\n\n**b** and _i_ and a [link](u) and > quote'), true);
  assert.equal(looksLikeMarkdown('no markdown here at all'), false);
});
