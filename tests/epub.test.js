import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseContainerPath, parseOpf, resolvePath, epubTextFromEntries,
} from '../src/organs/ingest/epub.js';

// A minimal but structurally real EPUB: container.xml points at OEBPS/content.opf, whose manifest
// lists a cover stylesheet (skipped — not HTML), two chapter files, and an NCX (skipped — not
// spine-linear HTML); a coverpage-wrapper is marked linear="no" and must be excluded from the
// read even though it IS a manifest+spine entry.
const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF_XML = `<?xml version="1.0"?>
<package xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
    <dc:title>A Test Book</dc:title>
    <dc:creator>Ann Author</dc:creator>
  </metadata>
  <manifest>
    <item id="cover-wrap" href="wrap.html" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="text/chapter1.html" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/chapter2.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover-wrap" linear="no"/>
    <itemref idref="ch1" linear="yes"/>
    <itemref idref="ch2" linear="yes"/>
  </spine>
</package>`;

test('parseContainerPath: reads the OPF location out of META-INF/container.xml', () => {
  assert.equal(parseContainerPath(CONTAINER_XML), 'OEBPS/content.opf');
  assert.equal(parseContainerPath('not xml'), null);
});

test('resolvePath: a manifest href resolves against the OPF\'s OWN directory, not the archive root', () => {
  assert.equal(resolvePath('OEBPS/content.opf', 'text/chapter1.html'), 'OEBPS/text/chapter1.html');
  assert.equal(resolvePath('OEBPS/content.opf', '../cover.jpg'), 'cover.jpg');
  assert.equal(resolvePath('content.opf', 'chapter1.html'), 'chapter1.html');
});

test('parseOpf: title/creator, spine in order, linear="no" and non-HTML items excluded', () => {
  const { title, creator, spineHrefs } = parseOpf(OPF_XML, 'OEBPS/content.opf');
  assert.equal(title, 'A Test Book');
  assert.equal(creator, 'Ann Author');
  assert.deepEqual(spineHrefs, ['OEBPS/text/chapter1.html', 'OEBPS/text/chapter2.html']);
});

test('epubTextFromEntries: reads chapters in spine order, reduced to prose', () => {
  const entries = {
    'META-INF/container.xml': CONTAINER_XML,
    'OEBPS/content.opf': OPF_XML,
    'OEBPS/text/chapter1.html': '<html><body><h1>One</h1><p>First chapter prose.</p></body></html>',
    'OEBPS/text/chapter2.html': '<html><body><h1>Two</h1><p>Second chapter prose.</p></body></html>',
    'OEBPS/wrap.html': '<html><body>cover wrapper — never read (linear="no")</body></html>',
  };
  const { text, title, creator } = epubTextFromEntries(entries);
  assert.equal(title, 'A Test Book');
  assert.equal(creator, 'Ann Author');
  assert.match(text, /First chapter prose\./);
  assert.match(text, /Second chapter prose\./);
  assert.ok(text.indexOf('First chapter') < text.indexOf('Second chapter'), 'chapters read in spine order');
  assert.doesNotMatch(text, /cover wrapper/, 'a linear="no" itemref is never read');
});

test('epubTextFromEntries: entries as raw bytes (the real fflate shape) decode the same as strings', () => {
  const enc = new TextEncoder();
  const entries = {
    'META-INF/container.xml': enc.encode(CONTAINER_XML),
    'OEBPS/content.opf': enc.encode(OPF_XML),
    'OEBPS/text/chapter1.html': enc.encode('<p>Byte-encoded chapter one.</p>'),
    'OEBPS/text/chapter2.html': enc.encode('<p>Byte-encoded chapter two.</p>'),
  };
  const { text } = epubTextFromEntries(entries);
  assert.match(text, /Byte-encoded chapter one\./);
  assert.match(text, /Byte-encoded chapter two\./);
});

test('epubTextFromEntries: no container.xml → empty text, never throws', () => {
  assert.deepEqual(epubTextFromEntries({}), { text: '', title: '', creator: '' });
  assert.deepEqual(epubTextFromEntries({ 'some/other/file.txt': 'x' }), { text: '', title: '', creator: '' });
});

test('epubTextFromEntries: a case-different container.xml entry name is still found', () => {
  const entries = {
    'meta-inf/CONTAINER.XML': CONTAINER_XML,
    'OEBPS/content.opf': OPF_XML,
    'OEBPS/text/chapter1.html': '<p>Chapter one.</p>',
    'OEBPS/text/chapter2.html': '<p>Chapter two.</p>',
  };
  const { text } = epubTextFromEntries(entries);
  assert.match(text, /Chapter one\./);
});
