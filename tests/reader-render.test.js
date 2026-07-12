import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readerModel, readerHtml, buildReaderDoc, detectStructure,
  stripGutenbergMarkers, nativePageHtml, clampReadPrefs, READ_THEMES,
  classifyEotLine, facingReadingLines, EOT_ELEMENT_TYPES,
  entityKind, facingSegments, EOT_ENTITY_KINDS, EOT_ENTITY_KIND_ORDER,
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

// ── the merged Document layer: entity links + cited rule baked into the reader ────────────────
test('readerHtml bakes entity links + cited rule when the surface supplies a linker', () => {
  const m = readerModel({ text: 'Ada met Babbage in London.\n\nThey built an engine together over many years of work.' });
  const segsOf = (t) => {
    // A tiny stand-in for the app's linkifier: mark "Babbage" as an entity, the rest plain text.
    const out = []; let rest = String(t); const at = rest.indexOf('Babbage');
    if (at < 0) return [{ t: 'text', s: rest }];
    if (at > 0) out.push({ t: 'text', s: rest.slice(0, at) });
    out.push({ t: 'ent', s: 'Babbage', docId: 'd1', entId: 'e_babbage' });
    out.push({ t: 'text', s: rest.slice(at + 'Babbage'.length) });
    return out;
  };
  const isCited = (t) => t.includes('built an engine');
  const { html } = readerHtml(m, {}, { segsOf, isCited, linksOn: true });
  assert.ok(html.includes('<html class="eo-links-on">'), 'links start visible when linksOn');
  assert.ok(/<span class="eo-ent" data-doc="d1" data-ent="e_babbage">Babbage<\/span>/.test(html), 'entity wrapped as a clickable span carrying its ids');
  assert.ok(/<p class="eo-cited">/.test(html), 'the cited paragraph carries the gold-rule class');
  assert.ok(html.includes('.eo-links-on .eo-ent'), 'the links-on CSS gate is present');
});

test('readerHtml stays a clean book with no linker (links off, no spans)', () => {
  const m = readerModel({ text: 'Ada met Babbage in London.\n\nThey built an engine together over many years of work.' });
  const { html } = readerHtml(m, {});
  assert.ok(html.startsWith('<!doctype html><html>'), 'no links class baked when off');
  assert.ok(!html.includes('eo-ent"'), 'no entity spans without a linker');
  assert.ok(!/class="[^"]*eo-cited/.test(html), 'no cited paragraphs without an isCited probe');
});

test('readerHtml still escapes entity text inside the baked span', () => {
  const m = readerModel({ text: 'A <script> and more prose here.\n\nSecond paragraph to force blocks.' });
  const segsOf = (t) => [{ t: 'ent', s: t, docId: 'd"1', entId: '<e>' }];
  const { html } = readerHtml(m, {}, { segsOf, linksOn: false });
  assert.ok(!/<script>/.test(html.replace(/data-[^=]*="[^"]*"/g, '')), 'body script escaped even inside a span');
  assert.ok(html.includes('data-doc="d&quot;1"') && html.includes('data-ent="&lt;e&gt;"'), 'ids are attribute-escaped');
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

test('nativePageHtml promotes lazy images so they actually load without JS', () => {
  const raw = '<html><head></head><body>'
    + '<img src="data:image/gif;base64,placeholder" data-src="/real/hero.jpg" loading="lazy">'
    + '<img data-original="//cdn.example.com/photo.jpg" alt="no initial src">'
    + '<picture><source data-srcset="/real/wide.webp 1200w"><img data-src="/real/fallback.jpg"></picture>'
    + '</body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://example.com/article' });
  // the placeholder src is replaced by the real image, not left as the 1px stub
  assert.ok(out.includes('src="/real/hero.jpg"'), 'data-src promoted into src');
  assert.ok(!/src="data:image\/gif;base64,placeholder"/.test(out), 'placeholder src gone');
  // an <img> that carried no src at all gains one from data-original
  assert.ok(out.includes('src="//cdn.example.com/photo.jpg"'), 'data-original promoted, src added');
  // a <picture>'s <source> gets its real srcset, and the inner <img> its real src
  assert.ok(out.includes('srcset="/real/wide.webp 1200w"'), 'data-srcset promoted on <source>');
  assert.ok(out.includes('src="/real/fallback.jpg"'), 'inner <img> data-src promoted');
});

test('nativePageHtml keeps data-srcset from stealing data-src (prefix guard)', () => {
  // a tag with ONLY data-srcset must not have a bogus src invented from the data-src prefix
  const raw = '<html><body><img data-srcset="/a.jpg 1x, /b.jpg 2x" alt="x"></body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://example.com/' });
  assert.ok(out.includes('srcset="/a.jpg 1x, /b.jpg 2x"'), 'srcset promoted');
  assert.ok(!/\ssrc=/i.test(out), 'no phantom src attribute invented (srcset != src)');
});

test('nativePageHtml promotes a lazy image even when the placeholder src is an inline-SVG data-URI', () => {
  // A very common LQIP pattern: the placeholder in `src` is a data-URI SVG that contains a raw
  // ">" — a naive <img[^>]*> match would stop there and never see data-src. This must still work.
  const raw = '<html><body>'
    + '<img src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'2\' height=\'1\'></svg>"'
    + ' data-src="/real/photo.jpg" alt="x">'
    + '</body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://example.com/' });
  assert.ok(out.includes('src="/real/photo.jpg"'), 'data-src promoted past the "<svg …>" placeholder');
  assert.ok(!out.includes('width=\'2\''), 'the 2×1 placeholder SVG is replaced, not kept');
});

test('nativePageHtml unwraps <noscript> so the author no-JS fallback survives', () => {
  const raw = '<html><head></head><body>'
    + '<img data-src="/lazy.jpg">'
    + '<noscript><img src="/fallback.jpg" alt="real photo"></noscript>'
    + '</body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://example.com/' });
  // the fallback image inside <noscript> is revealed (old behaviour deleted it entirely)
  assert.ok(out.includes('src="/fallback.jpg"'), 'noscript fallback image kept');
  assert.ok(!/<noscript/i.test(out) && !/<\/noscript>/i.test(out), 'noscript wrapper unwrapped');
});

test('nativePageHtml re-bases: drops the page own <base> and injects the real URL + upgrade CSP', () => {
  const raw = '<html><head><base href="/"><title>T</title></head><body><p>Body</p></body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://news.example.com/2026/story' });
  assert.ok(!/<base href="\/"/.test(out), "page's own <base href=/> removed");
  assert.ok(out.includes('<base href="https://news.example.com/2026/story"'), 'our base injected');
  assert.ok(out.includes('upgrade-insecure-requests'), 'mixed content upgraded to https');
  assert.ok(out.includes('<title>T</title>'), 'the rest of the head is preserved');
});

test('nativePageHtml never lets a script survive as live (defence-in-depth), incl. inside noscript', () => {
  const raw = '<html><head></head><body>'
    + '<script>evil()</script>'
    + '<noscript><script>alsoEvil()</script><img src="/ok.jpg"></noscript>'
    + '</body></html>';
  const out = nativePageHtml(raw, { baseUrl: 'https://example.com/' });
  assert.ok(!/<script/i.test(out), 'no <script> tag remains after sanitize');
  assert.ok(out.includes('src="/ok.jpg"'), 'the noscript image still comes through');
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

// ── the facing page: colouring the THINGS, not only the operator ─────────────────────────────
test('entityKind buckets a token by its surface shape', () => {
  assert.equal(entityKind('Trump').key, 'proper');            // a capitalised name
  assert.equal(entityKind('Ankara').key, 'proper');
  assert.equal(entityKind('NATO').key, 'org');                // an acronym
  assert.equal(entityKind('Congress').key, 'org');            // an -org-suffix body
  assert.equal(entityKind('July').key, 'time');               // a month
  assert.equal(entityKind('AM ET').key, 'time');              // a clock/zone
  assert.equal(entityKind('30').key, 'quantity');             // a bare number
  assert.equal(entityKind('$4').key, 'quantity');
  assert.equal(entityKind('SAVE AMERICA ACT').key, 'work');   // ALL-CAPS multiword
  assert.equal(entityKind('"The Odyssey"').key, 'work');      // a quoted title
  assert.equal(entityKind('housing-act').key, 'term');        // a lowercased id
  assert.equal(entityKind('affordability').key, 'term');
  // every bucket resolves to a real palette colour
  for (const k of EOT_ENTITY_KIND_ORDER) assert.equal(typeof EOT_ENTITY_KINDS[k].color, 'string');
});

test('entityKind prefers a DECLARED type over the heuristic, with a stable colour', () => {
  const dt = new Map([['Trump', 'Person'], ['Housing', 'Policy']]);
  const a = entityKind('Trump', dt);
  assert.equal(a.key, 'is:Person');
  assert.equal(a.label, 'Person');
  assert.equal(entityKind('Trump', dt).color, a.color);        // deterministic
  // the declared colour never reuses a heuristic bucket's colour — no duplicate legend swatch
  const heur = new Set(EOT_ENTITY_KIND_ORDER.map((k) => EOT_ENTITY_KINDS[k].color));
  for (const t of ['Person', 'Place', 'Org', 'Event', 'Money', 'Policy', 'Widget', 'Claim'])
    assert.ok(!heur.has(entityKind(t, new Map([[t, t]])).color), `declared ${t} distinct from heuristics`);
});

test('facingSegments is lossless: the runs re-join to the raw line, every shape', () => {
  const shapes = [
    'widget : Gadget', 'widget -> gadget : becomes', 'Congress -> Trump : not-passes',
    'widget.color = "green"', 'widget.owner = nil', 'widget == gadget',
    'machine <- [gear, spring, dial]', 'day | morning', '!sig widget : Gizmo',
    '!eva widget.state -> ok', '# ── where the reading turned ──', '# reading — doc: 42 units',
    'Housing.cost = 30 @model:eot ~t12', '',
  ];
  for (const line of shapes) {
    const segs = facingSegments(line, classifyEotLine(line));
    assert.equal(segs.map((s) => s.s).join(''), line === '' ? ' ' : line, `lossless: ${JSON.stringify(line)}`);
  }
});

test('facingSegments colours the operator by element type and value-safely keeps a quoted value whole', () => {
  const dt = new Map([['Trump', 'Person']]);
  const segs = facingSegments('Housing -> Trump : affordability', 'link', dt);
  const op = segs.find((s) => s.role === 'op');
  assert.equal(op.s, ' -> ');
  assert.equal(op.color, EOT_ELEMENT_TYPES.link.color);        // the arrow carries the relation hue
  const trump = segs.find((s) => s.s === 'Trump');
  assert.equal(trump.role, 'ent');
  assert.equal(trump.kindKey, 'is:Person');                    // and Trump takes its declared kind
  // a quoted value that carries relational glyphs is never split
  const attr = facingSegments('note.text = "a -> b : see"', 'attr');
  assert.equal(attr.map((s) => s.s).join(''), 'note.text = "a -> b : see"');
  assert.equal(attr.find((s) => s.role === 'str').s, '"a -> b : see"');
});

test('facingReadingLines attaches per-token segs and a kind legend of the kinds present', () => {
  const eot = [
    'Trump : Person',
    'Housing -> Trump : affordability',
    'AM ET -> July : originally',
    'NATO -> Ankara : points',
  ].join('\n');
  const { lines, kindLegend } = facingReadingLines(eot);
  // every line carries a segs breakdown that rejoins to its raw text
  assert.ok(lines.every((l) => Array.isArray(l.segs) && l.segs.map((s) => s.s).join('') === l.s));
  const kinds = kindLegend.map((k) => k.kind);
  assert.ok(kinds.includes('time'), 'AM ET / July → time');
  assert.ok(kinds.includes('org'), 'NATO → org');
  assert.ok(kinds.includes('proper'), 'Housing / Ankara → name');
  // declared types come after the heuristic kinds in the legend
  assert.equal(kinds[kinds.length - 1], 'is:Person');
});

test('clampReadPrefs bounds size, line-height, width, theme and font', () => {
  const rp = clampReadPrefs({ fs: 99, lh: 9, w: 12345, theme: 'neon', font: 'comic' });
  assert.equal(rp.fs, 30);
  assert.equal(rp.lh, 2.2);
  assert.equal(rp.w, 720);
  assert.equal(rp.theme, 'light');
  assert.equal(rp.font, 'serif');
});
