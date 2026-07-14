import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isFullDocument, splitSource, assembleDocument, runnableSrcdoc, consoleLineOf, CONSOLE_SHIM,
} from '../src/rooms/render/facing.js';

// The facing renderer's fold: what you write (HTML · CSS · JS) → one runnable document, with a
// console shim so the right pane can report what the code DID. Each test fails if the assembly
// loses a pane, double-wraps a full document, or drops the diagnostics channel.

test('facing: isFullDocument recognizes a whole page, not a fragment', () => {
  assert.equal(isFullDocument('<!doctype html><html><body>hi</body></html>'), true);
  assert.equal(isFullDocument('<html lang="en"><head></head><body></body></html>'), true);
  assert.equal(isFullDocument('<head><title>x</title></head><body>y</body>'), true);
  assert.equal(isFullDocument('<div>just a fragment</div>'), false);
  assert.equal(isFullDocument('body { color: red }'), false);
});

test('facing: splitSource carves by content, filename as a hint', () => {
  assert.equal(splitSource('<!doctype html><html></html>').mode, 'document');
  assert.equal(splitSource('const x = 1;', 'a.js').mode, 'js');
  assert.equal(splitSource('.btn { color: red }', 'a.css').mode, 'css');
  assert.equal(splitSource('.btn { color: red }').mode, 'css');           // bare CSS detected without an ext
  assert.equal(splitSource('body { margin: 0 }\na { color: blue }').mode, 'css');
  // JS with an object literal is NOT mistaken for CSS (no extension) — it falls to a safe default
  assert.notEqual(splitSource('const conf = { a: 1, b: 2 };\nrun(conf);').mode, 'css');
  assert.notEqual(splitSource('const x = { color: 1 }').mode, 'css');
  assert.equal(splitSource('<button>Hi</button>').mode, 'html');          // a fragment is HTML
  const doc = splitSource('<html><body>x</body></html>');
  assert.equal(doc.html, '<html><body>x</body></html>');
  assert.equal(doc.js, '');
});

test('facing: a full document is injected, never double-wrapped', () => {
  const out = assembleDocument({ html: '<!doctype html><html><head><title>T</title></head><body><h1>Hi</h1></body></html>' });
  // exactly one doctype — the doc was not wrapped in a second page
  assert.equal((out.match(/<!doctype/gi) || []).length, 1);
  assert.match(out, /<h1>Hi<\/h1>/);
  assert.match(out, /eo-render-console/);          // the shim landed in <head>
  // the shim precedes the title (injected right after <head>)
  assert.ok(out.indexOf('eo-render-console') < out.indexOf('<title>T</title>'));
});

test('facing: a fragment + css + js are welded into one well-formed page', () => {
  const out = assembleDocument({ html: '<button id="b">Hi</button>', css: '#b{color:red}', js: "document.getElementById('b').textContent='Bye'" });
  assert.match(out, /^<!doctype html>/);
  assert.match(out, /<button id="b">Hi<\/button>/);
  assert.match(out, /#b\{color:red\}/);
  assert.match(out, /textContent='Bye'/);
  // the js sits before </body>, after the body content
  assert.ok(out.indexOf('<button') < out.indexOf('textContent'));
  assert.ok(out.indexOf('textContent') < out.indexOf('</body>'));
});

test('facing: withConsole:false yields a clean export (no shim)', () => {
  const out = assembleDocument({ html: '<p>clean</p>' }, { withConsole: false });
  assert.doesNotMatch(out, /eo-render-console/);
  assert.match(out, /<p>clean<\/p>/);
});

test('facing: full-document css/js panes inject at head and before </body>', () => {
  const out = assembleDocument({ html: '<html><head></head><body><main></main></body></html>', css: 'main{padding:8px}', js: 'console.log("hi")' });
  assert.match(out, /main\{padding:8px\}/);
  assert.ok(out.indexOf('console.log("hi")') < out.indexOf('</body>'));
});

test('facing: runnableSrcdoc accepts a triple or a raw string', () => {
  assert.match(runnableSrcdoc({ html: '<p>x</p>' }), /<p>x<\/p>/);
  assert.match(runnableSrcdoc('<!doctype html><html><body>whole</body></html>'), /whole/);
  assert.equal((runnableSrcdoc('<!doctype html><html></html>').match(/<!doctype/gi) || []).length, 1);
});

test('facing: the console shim mirrors console + errors to the parent', () => {
  assert.match(CONSOLE_SHIM, /addEventListener\('error'/);
  assert.match(CONSOLE_SHIM, /unhandledrejection/);
  assert.match(CONSOLE_SHIM, /postMessage/);
  // it is a single, self-contained <script> element (one open, one close)
  assert.equal((CONSOLE_SHIM.match(/<script>/g) || []).length, 1);
  assert.equal((CONSOLE_SHIM.match(/<\/script>/g) || []).length, 1);
  assert.ok(CONSOLE_SHIM.trim().startsWith('<script>') && CONSOLE_SHIM.trim().endsWith('</script>'));
});

test('facing: consoleLineOf normalizes shim posts and ignores foreign messages', () => {
  assert.deepEqual(consoleLineOf({ source: 'eo-render-console', level: 'error', text: 'boom' }), { level: 'error', text: 'boom' });
  assert.deepEqual(consoleLineOf({ source: 'eo-render-console', level: 'weird', text: 'x' }), { level: 'log', text: 'x' });
  assert.equal(consoleLineOf({ source: 'other', level: 'log', text: 'x' }), null);
  assert.equal(consoleLineOf(null), null);
});
