import { test } from 'node:test';
import assert from 'node:assert/strict';

import { importAnyFile } from '../src/rooms/reader/import-file.js';

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

test('an unrecognised extension still falls through to the universal text/binary path, unchanged', async () => {
  const got = await importAnyFile(new FakeFile('plain content', 'file.xyz123'));
  assert.equal(got.meta.modality, 'text', 'decodes as text via the last-resort branch');
});
