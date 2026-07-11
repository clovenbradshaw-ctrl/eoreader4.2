import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readerModel, readerHtml, buildReaderDoc, detectStructure,
  stripGutenbergMarkers, nativePageHtml, clampReadPrefs, READ_THEMES,
  classifyEotLine, facingReadingLines, EOT_ELEMENT_TYPES,
} from '../src/rooms/reader/reader-render.js';

// A Project-Gutenberg-shaped book: license header, labeled front matter, the START/END markers,
// three roman-numeral chapters, and paragraphs hard-wrapped at ~40 cols with a blank line between
// them. The chapter thresholds are tuned to be SPARSE (a real book is thousands of lines, chapters
// a fraction of a percent), so the fixture is full-length: 3 chapters × 20 paragraphs.
const wrap = (s) => s.replace(/(.{1,42})(\s+|$)/g, '$1\n').trim();
const para = (n) => wrap(`This is paragraph number ${n}. The widget woke from troubled dreams `
  + `to find itself transformed into a gleaming gadget, and it considered the matter at length `
  + `before rolling over to think about breakfast, which it could no longer eat, being a gadget.`);
const chapter = (label) => label + '\n\n\n' + Array.from({ length: 20 }, (_, k) => para(k + 1)).join('\n\n');
const PG_BOOK = `The Project Gutenberg eBook of Widgets

This eBook is for the use of anyone anywhere in the United States and
most other parts of the world at no cost and with almost no restrictions
whatsoever.

Title: Widgets

Author: Ada Test

Release date: August 17, 2005 [eBook #9999]

*** START OF THE PROJECT GUTENBERG EBOOK WIDGETS ***

${chapter('I')}

${chapter('II')}

${chapter('III')}

*** END OF THE PROJECT GUTENBERG EBOOK WIDGETS ***

This footer is the Project Gutenberg License and must not appear in the reading.`;

test('stripGutenbergMarkers removes the license header and footer', () => {
  const t = stripGutenbergMarkers(PG_BOOK);
  assert.ok(!/START OF THE PROJECT GUTENBERG/i.test(t), 'START marker gone');
  assert.ok(!/END OF THE PROJECT GUTENBERG/i.test(t), 'END marker gone');
  assert.ok(!/Project Gutenberg License/i.test(t), 'footer license gone');
  assert.ok(/gleaming gadget/.test(t), 'body kept');
});

test('readerModel lifts title/author front matter and reflows hard wraps', () => {
  const m = readerModel({ text: PG_BOOK, title: '' });
  assert.equal(m.title, 'Widgets');
  assert.equal(m.author, 'Ada Test');
  // The front-matter lines must not survive as body paragraphs.
  assert.ok(!m.paras.some((p) => /^Title:/i.test(p)), 'Title: line not a paragraph');
  assert.ok(!m.paras.some((p) => /eBook for the use|no cost/i.test(p)), 'license not a paragraph');
  // A hard-wrapped paragraph is rejoined into ONE flowing block (not one line per wrap).
  const first = m.paras.find((p) => /widget woke from troubled dreams/.test(p));
  assert.ok(first, 'the opening paragraph is present');
  assert.ok(/gleaming gadget, and it considered/.test(first), 'hard wraps rejoined into prose');
  assert.ok(!/\n/.test(first), 'no newline left inside a reflowed paragraph');
});

test('detectStructure finds the recurring roman-numeral chapters', () => {
  const m = readerModel({ text: PG_BOOK });
  // Three chapters (I, II, III) — a real recurring numbered form.
  assert.ok(m.sections.length >= 3, `expected >=3 chapters, got ${m.sections.length}`);
  assert.deepEqual(m.sections.map((s) => s.label).slice(0, 3), ['I', 'II', 'III']);
});

test('detectStructure invents no chapters for a plain web article', () => {
  const article = 'The mayor announced a new budget today.\n\n'
    + 'Residents welcomed the plan but questioned the funding.\n\n'
    + 'A vote is expected next week after public comment.';
  const m = readerModel({ text: article, title: 'Budget news', domain: 'example.com' });
  assert.equal(m.sections.length, 0, 'prose with no heading form has no TOC');
  assert.equal(m.paras.length, 3);
});

test('readerHtml renders a themed book with a title, chapters, TOC and a drop cap', () => {
  const m = readerModel({ text: PG_BOOK });
  const { html, toc } = readerHtml(m, { theme: 'sepia', font: 'serif' });
  assert.ok(html.startsWith('<!doctype html>'), 'a full document');
  assert.ok(html.includes(READ_THEMES.sepia.bg), 'sepia paper baked into :root');
  assert.ok(html.includes('<h1 class="eo-title">Widgets</h1>'), 'title heading');
  assert.ok(/<h2 class="eo-chap"[^>]*id="eo-ch-0"/.test(html), 'first chapter is an anchored heading');
  assert.ok(html.includes('eo-first'), 'a drop-cap opening paragraph');
  assert.ok(toc.length >= 2 && toc[0].id === 'eo-ch-0', 'toc anchors line up');
});

test('readerHtml escapes source text (no HTML injection from a page body)', () => {
  const { html } = buildReaderDoc({ text: 'A <script>alert(1)</script> and <b>bold</b> paragraph.\n\nSecond paragraph here to force blocks.' });
  assert.ok(!/<script>alert/.test(html), 'script from the body is escaped, not live');
  assert.ok(html.includes('&lt;script&gt;'), 'angle brackets escaped');
});

test('readerHtml keeps verse/one-column text verbatim via pre-wrap', () => {
  // No blank lines → a single wrapped column → pre-wrap keeps every line break.
  const poem = 'Roses are red\nViolets are blue\nGutenberg books\nRender for you';
  const m = readerModel({ text: poem, title: 'Poem' });
  assert.equal(m.preRaw != null, true, 'no-blank-line text becomes preRaw');
  const { html } = readerHtml(m, {});
  assert.ok(html.includes('<pre class="eo-raw">'), 'rendered as pre-wrap');
  assert.ok(html.includes('Violets are blue'), 'lines preserved');
});

test('nativePageHtml sanitizes scripts and injects a base href', () => {
  const raw = '<html><head><title>Live</title></head><body><script>evil()</script><p>Hello <img src="/a.png"></p></body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://example.com/page' });
  assert.ok(!/<script>evil/.test(out), 'script stripped');
  assert.ok(out.includes('<base href="https://example.com/page"'), 'base injected so relative assets resolve');
  assert.ok(out.includes('name="referrer" content="no-referrer"'), 'referrer suppressed');
  assert.ok(out.includes('Hello'), 'page content preserved');
});

test('nativePageHtml reflows a plain-text URL instead of dumping raw', () => {
  const txt = 'First paragraph of a plain text file that is quite long.\n\nSecond paragraph follows the blank line.';
  const out = nativePageHtml(txt, { baseUrl: 'https://example.com/book.txt' });
  assert.ok(out.startsWith('<!doctype html>'), 'rendered through the reader');
  assert.ok(out.includes('eo-book'), 'themed book shell');
});

// ── the facing page: classify every EoT surface line by its element type ────────────────────
test('classifyEotLine recognises each EoT element type by shape', () => {
  assert.equal(classifyEotLine('widget : Gadget'), 'type');
  assert.equal(classifyEotLine('widget -> gadget : becomes'), 'link');
  assert.equal(classifyEotLine('widget -> gadget : not-becomes'), 'link');
  assert.equal(classifyEotLine('widget.color = "green"'), 'attr');
  assert.equal(classifyEotLine('widget.owner = nil'), 'absence');
  assert.equal(classifyEotLine('widget == gadget'), 'identity');
  assert.equal(classifyEotLine('machine <- [gear, spring, dial]'), 'compose');
  assert.equal(classifyEotLine('day | morning'), 'segment');
  assert.equal(classifyEotLine('!sig widget : Gizmo'), 'sig');
  assert.equal(classifyEotLine('!clm widget : Claim'), 'sig');
  assert.equal(classifyEotLine('!eva widget.state -> ok'), 'eva');
  assert.equal(classifyEotLine('!rec topic {a,b} => {c}'), 'rec');
  assert.equal(classifyEotLine('# ── where the reading turned ──'), 'rule');
  assert.equal(classifyEotLine('# reading — doc: 42 units'), 'note');
  assert.equal(classifyEotLine(''), 'blank');
  assert.equal(classifyEotLine('   '), 'blank');
});

test('classifyEotLine is value-safe: an assignment whose value contains -> or : stays an attribute', () => {
  // The value literal carries relational glyphs, but the line is a DEF, not a relation — the
  // assignment form is tested before the relational form so the value never steals the type.
  assert.equal(classifyEotLine('note.text = "a -> b : see below"'), 'attr');
  assert.equal(classifyEotLine('note.text = "morning | evening"'), 'attr');
});

test('every classifyEotLine key resolves to a palette entry with a colour', () => {
  const kinds = ['type', 'link', 'attr', 'absence', 'identity', 'compose', 'segment', 'sig', 'eva', 'rec', 'rule', 'note', 'blank'];
  for (const k of kinds) {
    assert.ok(EOT_ELEMENT_TYPES[k], `palette has ${k}`);
    assert.ok(typeof EOT_ELEMENT_TYPES[k].color === 'string', `${k} has a colour`);
  }
});

test('facingReadingLines lays out a reading with numbered, coloured lines and a legend', () => {
  const eot = [
    '# reading — doc: 3 units, turned at 1 point',
    '',
    '# ── what it takes to exist and connect ──',
    'widget : Gadget',
    'widget -> gadget : becomes',
    'widget.color = "green"',
  ].join('\n');
  const { lines, legend, truncated, total } = facingReadingLines(eot);
  assert.equal(total, 6);
  assert.equal(truncated, false);
  assert.equal(lines.length, 6);
  // Gutter numbers are 1-based and every line carries a colour.
  assert.equal(lines[0].n, 1);
  assert.ok(lines.every((l) => typeof l.color === 'string'));
  // The blank line keeps its height (rendered as a single space, not empty).
  assert.equal(lines[1].kind, 'blank');
  assert.equal(lines[1].s, ' ');
  // Distinct element types present, ordered structure-first, no blank in the legend.
  assert.deepEqual(legend.map((e) => e.kind), ['type', 'link', 'attr', 'rule', 'note']);
});

test('facingReadingLines caps long readings honestly', () => {
  const eot = Array.from({ length: 50 }, (_, i) => `w${i} : Gadget`).join('\n');
  const { lines, truncated, more, total } = facingReadingLines(eot, { max: 10 });
  assert.equal(lines.length, 10);
  assert.equal(total, 50);
  assert.equal(truncated, true);
  assert.equal(more, 40);
});

test('clampReadPrefs bounds size, line-height, width, theme and font', () => {
  const rp = clampReadPrefs({ fs: 99, lh: 9, w: 12345, theme: 'neon', font: 'comic' });
  assert.equal(rp.fs, 30);
  assert.equal(rp.lh, 2.2);
  assert.equal(rp.w, 720);
  assert.equal(rp.theme, 'light');
  assert.equal(rp.font, 'serif');
});
