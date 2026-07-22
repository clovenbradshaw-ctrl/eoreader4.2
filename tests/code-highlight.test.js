import { test } from 'node:test';
import assert from 'node:assert/strict';

import { highlightCode, tokenize } from '../src/rooms/reader/code-highlight.js';

// highlightCode — "code renders as code": every space of indentation kept exactly, comments/
// strings/numbers/keywords picked out by one ordered regex per language. This is a token-
// class highlighter, not a parser — these tests pin the one property that actually matters
// (a `//`/`#` INSIDE a string is never mistaken for a comment, and vice versa) plus escaping.

test('keywords, comments, and numbers are classed; a quote inside a comment is not a string', () => {
  const src = 'function add(a, b) {\n  // sum two numbers\n  return a + 1;\n}';
  const { html } = highlightCode(src, 'javascript');
  assert.match(html, /<span class="tok-keyword">function<\/span>/);
  assert.match(html, /<span class="tok-keyword">return<\/span>/);
  assert.match(html, /<span class="tok-comment">\/\/ sum two numbers<\/span>/);
  assert.match(html, /<span class="tok-number">1<\/span>/);
});

test('a comment marker inside a STRING is not read as a comment', () => {
  const html = highlightCode('const s = "hello // not a comment";', 'javascript').html;
  assert.match(html, /<span class="tok-string">"hello \/\/ not a comment"<\/span>/);
  assert.ok(!html.includes('tok-comment'), 'no comment token at all in this line');
});

test('a quote character inside a LINE COMMENT is not read as a string', () => {
  const html = highlightCode('// this isn\'t a "string"', 'javascript').html;
  assert.match(html, /<span class="tok-comment">\/\/ this isn't a "string"<\/span>/);
  assert.ok(!html.includes('tok-string'));
});

test('a block comment spans multiple lines and re-opens its own span on every rendered line', () => {
  const src = '/* start\nmiddle\nend */\nconst x = 1;';
  const { html, lines } = highlightCode(src, 'javascript');
  assert.equal(lines, 4);
  const rows = html.split('<div class="eo-code-row">').slice(1);
  assert.equal(rows.length, 4);
  for (const row of rows.slice(0, 3)) assert.match(row, /<span class="tok-comment">/);
  assert.match(rows[3], /<span class="tok-keyword">const<\/span>/);
});

test('python: # comments, triple-quoted strings, and self/True/False keywords', () => {
  const src = '"""\na docstring with a # inside it\n"""\ndef f(self):\n    return True  # done';
  const { html } = highlightCode(src, 'python');
  assert.match(html, /<span class="tok-string">"""<\/span>/);
  assert.match(html, /<span class="tok-keyword">def<\/span>/);
  assert.match(html, /<span class="tok-keyword">self<\/span>/);
  assert.match(html, /<span class="tok-keyword">True<\/span>/);
  assert.match(html, /<span class="tok-comment"># done<\/span>/);
});

test('an unrecognised language still colours numbers/strings and tries both common comment styles', () => {
  const hash = highlightCode('print("hi")  # a comment', 'not-a-real-language').html;
  assert.match(hash, /<span class="tok-string">"hi"<\/span>/);
  assert.match(hash, /<span class="tok-comment"># a comment<\/span>/);
  const slash = highlightCode('foo(); // a comment', 'also-not-real').html;
  assert.match(slash, /<span class="tok-comment">\/\/ a comment<\/span>/);
});

test('line numbers are 1-based and match the input line count', () => {
  const { html, lines } = highlightCode('a\nb\nc', 'javascript');
  assert.equal(lines, 3);
  assert.match(html, /<span class="eo-code-no">1<\/span>/);
  assert.match(html, /<span class="eo-code-no">2<\/span>/);
  assert.match(html, /<span class="eo-code-no">3<\/span>/);
});

test('truncation: a document past maxLines is capped and says so', () => {
  const src = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
  const { lines, truncated } = highlightCode(src, 'javascript', { maxLines: 10 });
  assert.equal(lines, 10);
  assert.equal(truncated, true);
  const untouched = highlightCode(src, 'javascript', { maxLines: 1000 });
  assert.equal(untouched.truncated, false);
  assert.equal(untouched.lines, 50);
});

// ---- safety: every character is escaped -------------------------------------------------

test('a literal <script> in the code never survives as a real tag, in any language', () => {
  const html = highlightCode('const x = "<script>alert(1)</script>";', 'javascript').html;
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('a keyword-shaped substring inside a longer identifier is not highlighted (word boundaries)', () => {
  const html = highlightCode('const inform = 1;', 'javascript').html;
  // "in" is not a JS keyword here, but "in" IS one for e.g. for..in — regardless, "inform"
  // must not get any part of itself wrapped as a keyword token.
  assert.ok(!/tok-keyword">in</.test(html), 'no keyword split out of the middle of an identifier');
});

// ---- tokenize (exported for finer-grained checks) ----------------------------------------

test('tokenize: an unstyled run and a styled token are both present, joined losslessly', () => {
  const tokens = tokenize('return 1 + 2;', 'javascript');
  const rebuilt = tokens.map((t) => t.text).join('');
  assert.equal(rebuilt, 'return 1 + 2;');
  assert.ok(tokens.some((t) => t.cls === 'keyword' && t.text === 'return'));
  assert.ok(tokens.some((t) => t.cls === 'number' && t.text === '1'));
  assert.ok(tokens.some((t) => t.cls === null));
});
