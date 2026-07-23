import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importAnyFile, _imageFactsText } from '../src/rooms/reader/import-file.js';

// The kind/language a file import produces — completing a shape the source-viewer UI already
// carries (index.html's _sourceLandingVM 'Code file' case, the explorer's Code genre chip,
// registry.js's sourceContentType) but that nothing in the ingest router produced until now.
// Markdown and code need no browser/CDN extractor (read verbatim, same as plain text), so this
// runs under node — the same seam the browser drives.

const enc = new TextEncoder();
class FakeFile {
  constructor(text, name, type = '') {
    this._bytes = enc.encode(text);
    this.name = name; this.type = type; this.size = this._bytes.length;
  }
  async text() { return new TextDecoder().decode(this._bytes); }
  async arrayBuffer() { return this._bytes.buffer.slice(0); }
}

test('a .md file is tagged modality:markdown, not folded into plain text', async () => {
  const got = await importAnyFile(new FakeFile('# Title\n\nSome **bold** text.', 'notes.md'));
  assert.equal(got.meta.modality, 'markdown');
  assert.equal(got.text, '# Title\n\nSome **bold** text.', 'read verbatim — no extraction, no reflow');
  assert.equal(got.meta.coverage.complete, true);
});

test('.markdown is the same modality as .md', async () => {
  const got = await importAnyFile(new FakeFile('# Title', 'notes.markdown'));
  assert.equal(got.meta.modality, 'markdown');
});

test('a .txt/.log/.rst file is still plain text — markdown did not swallow the whole TEXT_EXT list', async () => {
  for (const ext of ['txt', 'log', 'rst', 'text']) {
    const got = await importAnyFile(new FakeFile('plain notes', `f.${ext}`));
    assert.equal(got.meta.modality, 'text', `.${ext} stays plain text`);
  }
});

test('a recognised source-code extension is tagged modality:code with its language', async () => {
  const cases = [
    ['app.js', 'javascript'], ['app.mjs', 'javascript'], ['app.jsx', 'javascript'],
    ['app.ts', 'typescript'], ['app.tsx', 'typescript'],
    ['script.py', 'python'], ['lib.rb', 'ruby'], ['main.go', 'go'], ['lib.rs', 'rust'],
    ['App.java', 'java'], ['main.c', 'c'], ['header.h', 'c'], ['main.cpp', 'cpp'],
    ['Program.cs', 'csharp'], ['index.php', 'php'], ['run.sh', 'shell'], ['run.bash', 'shell'],
    ['query.sql', 'sql'], ['styles.css', 'css'], ['styles.scss', 'css'], ['config.yml', 'yaml'], ['config.yaml', 'yaml'],
  ];
  for (const [name, lang] of cases) {
    const got = await importAnyFile(new FakeFile('some source text', name));
    assert.equal(got.meta.modality, 'code', `${name} is tagged code`);
    assert.equal(got.meta.language, lang, `${name} carries language ${lang}`);
  }
});

test('code is read verbatim — no organ call, no reflow, same coverage shape as plain text', async () => {
  const src = 'function add(a, b) {\n  return a + b;\n}\n';
  const got = await importAnyFile(new FakeFile(src, 'add.js'));
  assert.equal(got.text, src);
  assert.equal(got.meta.coverage.complete, true);
  assert.equal(got.meta.coverage.chars, src.length);
});

test('a .json file still takes the JSON organ path, not the new code branch', async () => {
  const got = await importAnyFile(new FakeFile(JSON.stringify({ a: 1 }), 'data.json'));
  assert.equal(got.meta.modality, 'json');
  assert.ok(!('language' in got.meta), 'json sources carry no language tag');
});

test('a .xml file takes the XML organ path, read by its own tag structure — not the HTML branch', async () => {
  const xml = '<?xml version="1.0"?><TEI.2><teiHeader><fileDesc><titleStmt><title>A Title</title>' +
    '<author>An Author</author></titleStmt></fileDesc></teiHeader><text><body><div1 n="1"><p>Body text.</p></div1></body></text></TEI.2>';
  const got = await importAnyFile(new FakeFile(xml, 'source.xml'));
  assert.equal(got.meta.modality, 'xml');
  assert.equal(got.title, 'A Title');
  assert.equal(got.meta.coverage.isTei, true);
  assert.equal(got.meta.coverage.complete, true);
  assert.match(got.text, /Body text\./);
  assert.ok(!got.text.includes('<p>'), 'no raw markup leaks into the reading');
});

test('an .xml file whose header leans on a custom (external-DTD) entity still ingests, honestly noting the gap', async () => {
  const xml = '<?xml version="1.0"?>\n<!DOCTYPE TEI.2 SYSTEM "tei2.dtd" [\n<!ENTITY funder "The Foo Foundation">\n]>\n' +
    '<TEI.2><teiHeader><fileDesc><titleStmt><title>T</title>&unresolved.custom;</titleStmt></fileDesc></teiHeader>' +
    '<text><body><div1 n="1"><p>Text.</p></div1></body></text></TEI.2>';
  const got = await importAnyFile(new FakeFile(xml, 'legacy.xml'));
  assert.equal(got.meta.modality, 'xml');
  assert.equal(got.meta.coverage.complete, true, 'an unresolved header entity is a documented quirk, not a failed read');
  assert.equal(got.meta.coverage.dropped.length, 1);
  assert.match(got.meta.coverage.dropped[0], /unresolved\.custom/);
});

test('.xhtml stays on the HTML path, not the new XML branch — it is meant to render as HTML', async () => {
  const got = await importAnyFile(new FakeFile('<html><body><p>hi</p></body></html>', 'page.xhtml', 'application/xhtml+xml'));
  assert.notEqual(got.meta.modality, 'xml');
});

test('an unrecognised extension still falls through to the universal text/binary path, unchanged', async () => {
  const got = await importAnyFile(new FakeFile('plain content', 'file.xyz123'));
  assert.equal(got.meta.modality, 'text', 'decodes as text via the last-resort branch');
});

// An image lands with only file facts — no eyes, no model — so the source can appear before a
// single word of OCR or a scene caption exists (app/picture.js's ingestFile, app/image.js).
test('an image file resolves at once with file facts, a deferred read, and a kept media URL', async () => {
  const got = await importAnyFile(new FakeFile('not really pixels, just bytes', 'photo.png', 'image/png'));
  assert.equal(got.meta.modality, 'image');
  assert.ok(got.text.startsWith('photo — an image'), 'the placeholder names the file, not blank');
  assert.equal(typeof got.meta.read, 'function', 'the eyes/scene reading is deferred, not run eagerly');
  assert.ok(got.meta.doc, 'a minimal doc lands with it (assembleDocument), so addSource never needs an empty body');
  assert.equal(got.meta.coverage.complete, false, 'the coverage receipt is honest that recognition hasn’t run yet');
});

test('_imageFactsText: names the file and, when known, its dimensions and size', () => {
  assert.equal(_imageFactsText('photo', 0, 0, 0), 'photo — an image.');
  assert.equal(_imageFactsText('photo', 1920, 1080, 512), 'photo — an image (1920×1080, 512 B).');
  assert.equal(_imageFactsText('photo', 0, 0, 2 * 1024 * 1024), 'photo — an image (2.0 MB).');
});
