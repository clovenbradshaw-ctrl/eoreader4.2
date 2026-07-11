// The page target — a GENERIC element tree → a whole page, with NO hardcoded section
// templates and NO hardcoded look (src/organs/code/page.js).
//
// Two properties this pins, both answers to "how without hardcoding":
//   1. one renderer walks ANY tree of El{tag,text,html,attrs,children} → HTML — a hero is
//      a <header> because the TREE says so, not because the organ has a Hero template;
//   2. styling is INJECTED (opts.css) and foraged from the web (foragePageCss), so the
//      organ ships no look — the page's appearance is a real, fetched design system.
// And the interactive island (a Widget node) is still read back through the organ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composePage, composePageAndVerify, foragePageCss, PAGE_CSS_SOURCES } from '../src/organs/code/page.js';

const TREE = `
site : Page
site.title = "Demo"
site.root = "root"
root : El
root.tag = "main"
root.children = "head, list"
head : El
head.tag = "header"
head.children = "title"
title : El
title.tag = "h1"
title.text = "Hello <world>"
list : El
list.tag = "ul"
list.children = "a, b"
a : El
a.tag = "li"
a.text = "one"
b : El
b.tag = "li"
b.text = "two"`;

test('the generic renderer walks an arbitrary tree — no per-kind templates', () => {
  const { html, holons } = composePage(TREE, { css: '' });
  assert.ok(/<h1[^>]*>Hello &lt;world&gt;<\/h1>/.test(html), 'nesting + escaping from the tree');
  assert.ok(/<ul[^>]*><li[^>]*>one<\/li><li[^>]*>two<\/li><\/ul>/.test(html), 'a list is a <ul> because the tree says so');
  assert.ok(html.includes('<title>Demo</title>'));
  // every element is holon-addressed — the address IS the selector
  assert.deepEqual(holons.map((h) => h.path), ['root', 'root.head', 'root.head.title', 'root.list', 'root.list.a', 'root.list.b']);
  assert.ok(html.includes('data-h="root.head.title"'), 'the h1 carries its holon address');
});

test('attributes, ids, classes, raw html, and void tags all render generically', () => {
  const { html } = composePage(`
p : Page
p.root = "x"
x : El
x.tag = "section"
x.id = "sec"
x.class = "wrap big"
x.attr.data-role = "panel"
x.children = "img, raw"
img : El
img.tag = "img"
img.attr.src = "a.png"
raw : El
raw.tag = "div"
raw.html = "<b>bold</b> & <i>it</i>"`, { css: '' });
  assert.ok(html.includes('<section id="sec" class="wrap big" data-role="panel"'), 'attrs render');
  assert.ok(html.includes('<img src="a.png"') && !html.includes('</img>'), 'a void tag has no close');
  assert.ok(html.includes('<b>bold</b> & <i>it</i>'), 'raw html passes through unescaped');
});

test('holon-addressed edits hit any face: style layers, content mutates the node', () => {
  const styled = composePage(TREE, { css: '', edits: [{ holon: 'root.head.title', decls: { color: 'red' } }] });
  assert.ok(styled.html.includes('[data-h="root.head.title"] { color: red }'), 'a style edit is a rule keyed on the holon address');
  const content = composePage(TREE, { css: '', edits: [{ holon: 'root.head.title', face: 'text', value: 'Changed' }] });
  assert.ok(/<h1[^>]*>Changed<\/h1>/.test(content.html), 'a content edit at the same address mutates that node');
  const byClass = composePage(TREE, { css: '', edits: [{ tag: 'li', decls: { 'font-weight': 'bold' } }] });
  assert.ok(byClass.html.includes('[data-h-tag="li"] { font-weight: bold }'), 'a tag edit targets the holon class');
});

test('styling is injected, not hardcoded — the organ ships no look', () => {
  const withCss = composePage(TREE, { css: 'body{color:hotpink}' }).html;
  assert.ok(withCss.includes('body{color:hotpink}'), 'the injected sheet is the look');
  const bare = composePage(TREE, {}).html;
  // only a neutral reset is built in; no colors, fonts, or layout of our own
  assert.ok(!/color:|font-family|grid-template/.test(bare.replace('*{box-sizing:border-box}', '')), 'no baked-in look');
});

test('foragePageCss fetches a real framework (injected fetcher — offline in tests)', async () => {
  const fakeFetch = async (url) => `/* fetched ${url} */ body{max-width:70ch}`;
  const { css, source } = await foragePageCss(fakeFetch, 'pico');
  assert.equal(source, PAGE_CSS_SOURCES.pico);
  assert.ok(css.includes('max-width:70ch'));
  const page = composePage(TREE, { css }).html;
  assert.ok(page.includes('max-width:70ch'), 'the foraged sheet styles the page');
});

test('an embedded Widget island is read back through the organ', () => {
  const good = composePageAndVerify(`
site : Page
site.root = "root"
root : El
root.tag = "main"
root.children = "w"
w : Widget
w.state = "n: 0"
w.template = "<button data-on='click:inc'>+{{n}}</button>"
inc : Handler
inc.body = "state.n += 1;"
inc -> w : handlerOf`, { css: '' });
  assert.ok(good.ok, good.findings.map((f) => f.law).join(', '));
  assert.ok(good.widgets.includes('w') && good.html.includes('id="w_w"'), 'the island mounts');
  assert.ok(good.html.includes('data-on=\'click:inc\''), 'the widget behavior is inlined');

  // a page whose island binds a dead button is rejected — the checkpoint reaches inside
  const bad = composePageAndVerify(`
site : Page
site.root = "root"
root : El
root.tag = "main"
root.children = "w"
w : Widget
w.state = "n: 0"
w.template = "<button data-on='click:missing'>x</button>"`, { css: '' });
  assert.equal(bad.ok, false);
  assert.ok(bad.findings.some((f) => f.law === 'unbound-handler'));
});
