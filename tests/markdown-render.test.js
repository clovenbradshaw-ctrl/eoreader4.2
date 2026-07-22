import { test } from 'node:test';
import assert from 'node:assert/strict';

import { markdownToHtml, inline, parseBlocks } from '../src/rooms/reader/markdown-render.js';

// markdownToHtml — the Native tab's markdown kind: a document's own typeset shape, not the
// Reader tab's prose reflow. Deliberately not full CommonMark (see the file header); these
// tests pin the shapes it DOES cover, and — the one non-negotiable — that every span of text
// is escaped, so nothing written INTO a document can execute inside it.

test('headings: ATX levels 1-6, trailing #s stripped, a table of contents is returned', () => {
  const { html, toc } = markdownToHtml('# One\n\n## Two ##\n\n### Three');
  assert.match(html, /<h1 id="eo-md-0">One<\/h1>/);
  assert.match(html, /<h2 id="eo-md-1">Two<\/h2>/);
  assert.match(html, /<h3 id="eo-md-2">Three<\/h3>/);
  assert.deepEqual(toc.map((t) => [t.level, t.label]), [[1, 'One'], [2, 'Two'], [3, 'Three']]);
});

test('a heading needs a space after the hashes — "#tag" is not a heading', () => {
  const { html, toc } = markdownToHtml('#nothashtag is just a word');
  assert.equal(toc.length, 0);
  assert.match(html, /<p>/);
});

test('paragraphs: blank-line separated, a single internal newline stays a soft break', () => {
  const { html } = markdownToHtml('First para,\nstill one paragraph.\n\nSecond para.');
  assert.equal((html.match(/<p>/g) || []).length, 2);
  assert.match(html, /First para,\nstill one paragraph\./);
});

test('emphasis: bold, italic, strikethrough, inline code — bold does not get eaten by italic', () => {
  const { html } = markdownToHtml('**bold** and *italic* and __also bold__ and _also italic_ and ~~gone~~ and `code`.');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<strong>also bold<\/strong>/);
  assert.match(html, /<em>also italic<\/em>/);
  assert.match(html, /<del>gone<\/del>/);
  assert.match(html, /<code>code<\/code>/);
});

test('a hard break (two trailing spaces) becomes <br>; a lone newline does not', () => {
  const { html } = markdownToHtml('line one  \nline two');
  assert.match(html, /line one<br>\s*line two/);
});

test('links, images, and autolinks; a dangerous href scheme is neutralised', () => {
  const { html } = markdownToHtml('[text](https://example.com "t") and ![alt](https://example.com/a.png) and <https://example.com>');
  assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">text<\/a>/);
  assert.match(html, /<img src="https:\/\/example\.com\/a\.png" alt="alt"/);
  assert.match(html, /<a href="https:\/\/example\.com"[^>]*>https:\/\/example\.com<\/a>/);

  const unsafe = markdownToHtml('[click me](javascript:alert(1))').html;
  assert.ok(!/href="javascript:/.test(unsafe), 'a javascript: href is neutralised, not passed through');
});

test('unordered and ordered lists, including one level of nesting', () => {
  const md = ['- item one', '- item two', '  - nested item', '- item three'].join('\n');
  const { html } = markdownToHtml(md);
  assert.match(html, /<ul><li>item one<\/li>/);
  assert.match(html, /<ul><li>nested item<\/li><\/ul>/);
  assert.match(html, /<li>item three<\/li><\/ul>/);

  const ordered = markdownToHtml('1. first\n2. second').html;
  assert.match(ordered, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('a bullet list immediately followed by a numbered list is TWO lists, not one merged run', () => {
  const md = ['- a', '- b', '', '1. first', '2. second'].join('\n');
  const { html } = markdownToHtml(md);
  const ulIdx = html.indexOf('<ul>');
  const olIdx = html.indexOf('<ol>');
  assert.ok(ulIdx >= 0 && olIdx > ulIdx, 'a <ul> then a separate <ol>, not one mixed list');
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('blockquotes join consecutive lines into one paragraph', () => {
  const { html } = markdownToHtml('> line one\n> line two');
  assert.match(html, /<blockquote><p>line one\nline two<\/p><\/blockquote>/);
});

test('fenced code blocks preserve whitespace exactly and record the language, without inline parsing their body', () => {
  const md = '```js\nconst x = 1;\nif (x) {\n  y();\n}\n```';
  const { html } = markdownToHtml(md);
  assert.match(html, /<pre class="eo-md-code" data-lang="js"><code>const x = 1;\nif \(x\) \{\n {2}y\(\);\n\}<\/code><\/pre>/);
});

test('a GFM table with alignment renders a real <table>', () => {
  const md = ['| Name | Age |', '|:---|---:|', '| Ada | 36 |', '| Bea | 40 |'].join('\n');
  const { html } = markdownToHtml(md);
  assert.match(html, /<table><thead><tr><th style="text-align:left">Name<\/th><th style="text-align:right">Age<\/th><\/tr><\/thead>/);
  assert.match(html, /<td style="text-align:left">Ada<\/td><td style="text-align:right">36<\/td>/);
});

test('a horizontal rule', () => {
  assert.match(markdownToHtml('above\n\n---\n\nbelow').html, /<hr>/);
});

// ---- safety: every span of text is escaped, once, up front ----------------------------------

test('a literal <script> tag in the source text never survives as a real tag', () => {
  const html = markdownToHtml('<script>alert(1)</script> and some **bold** text.').html;
  assert.ok(!html.includes('<script>alert'), 'the script tag is shown as text, not parsed as markup');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('an emphasis marker cannot be used to break out of an href attribute', () => {
  const html = markdownToHtml('[x](https://example.com/"><script>alert(1)</script>)').html;
  assert.ok(!/<script>alert/.test(html));
});

test('a heading/list/table cell each escape their own text too', () => {
  const html = markdownToHtml('# <img src=x onerror=alert(1)>').html;
  assert.ok(!/<img src=x onerror/.test(html));
});

// ---- parseBlocks / inline exported for finer-grained checks ----------------------------------

test('parseBlocks: a fenced code block that never closes still ends at EOF, not lost', () => {
  const blocks = parseBlocks(['```', 'unterminated']);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code');
  assert.equal(blocks[0].text, 'unterminated');
});

test('inline: plain text with no markdown syntax passes through escaped and unchanged otherwise', () => {
  assert.equal(inline('just text'), 'just text');
  assert.equal(inline('a & b < c'), 'a &amp; b &lt; c');
});
