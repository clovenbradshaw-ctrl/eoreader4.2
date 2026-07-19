// Ingestion coverage — when a file is ingested, 100% of its content is processed.
//
// Every organ must land EVERY unit of its source on the spine (no silently dropped
// cells, rows, sheets, pages, blocks, or bytes), and every ingested doc — text or any
// other modality — must encode into EoT: the lazy `doc.reading()` renders the whole
// log as canonical EoT lines, uncapped by default, with any explicit cap reported
// (over-max), never silent. These tests pin both halves of that contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ingestTable }      from '../src/organs/in/table.js';
import { ingestJson }       from '../src/organs/in/json.js';
import { ingestPdf }        from '../src/organs/in/pdf.js';
import { ingestWebpage }    from '../src/organs/in/webpage.js';
import { ingestAudio }      from '../src/organs/in/audio.js';
import { assembleDocument } from '../src/organs/in/document.js';
import { emitEot }          from '../src/organs/ingest/eot-emit.js';
import { readIngest }       from '../src/organs/ingest/read.js';
import { importAnyFile, _tableFromGrid, _keepExtract, _printableRuns } from '../src/rooms/reader/import-file.js';

// ── the table organ: every cell of every row lands ─────────────────────────────

test('table: a row wider than the header keeps its overflow cells', () => {
  const doc = ingestTable({ name: 't', columns: ['a', 'b'], rows: [['1', '2', '3', '4']] });
  assert.equal(doc.columns.length, 4, 'the header widens to the raggedest row');
  assert.ok(doc.sentences[0].includes('3') && doc.sentences[0].includes('4'), 'overflow cells reach the readable line');
  const defs = doc.log.snapshot().filter((e) => e.op === 'DEF');
  assert.equal(defs.length, 4, 'every cell is a DEF fact');
});

test('table: object-row keys are unioned across ALL rows, not read off row 0', () => {
  const doc = ingestTable({ name: 't', rows: [{ a: '1' }, { a: '2', later: 'kept' }] });
  assert.ok(doc.columns.includes('later'), 'a field first seen on a later row still gets a column');
  assert.ok(doc.sentences[1].includes('kept'), 'its value reaches the readable line');
});

test('table: Papaparse __parsed_extra overflow cells are content, not noise', () => {
  const doc = ingestTable({ name: 't', columns: ['a'], rows: [{ a: '1', __parsed_extra: ['x', 'y'] }] });
  assert.ok(doc.sentences[0].includes('x') && doc.sentences[0].includes('y'), 'extras land');
  assert.equal(doc.log.snapshot().filter((e) => e.op === 'DEF').length, 3, 'all three cells are DEF facts');
});

test('table: duplicate headers cannot overwrite one another', () => {
  const doc = ingestTable({ name: 't', columns: ['Name', 'name'], rows: [['first', 'second']] });
  const defs = doc.log.snapshot().filter((e) => e.op === 'DEF');
  assert.equal(defs.length, 2, 'both colliding columns keep their cells');
  assert.deepEqual(defs.map((d) => d.value).sort(), ['first', 'second']);
});

// ── the json organ: every leaf lands, even past the depth cap ──────────────────

test('json: every leaf lands; a subtree past the depth cap is frozen, not dropped', () => {
  // A chain 205 deep — past DEPTH_CAP (200) — carrying a marker value at its tip.
  let deep = { marker: 'buried-treasure' };
  for (let i = 0; i < 205; i++) deep = { next: deep };
  const doc = ingestJson({ name: 'j', data: { shallow: 'seen', deep } });
  assert.ok(doc.sentences.some((s) => s.includes('seen')));
  assert.ok(doc.sentences.some((s) => s.includes('buried-treasure')), 'the over-cap subtree is stringified, content intact');
});

// ── the layout spine: char ranges reconstruct the whole text ───────────────────

test('assembleDocument: the spans tile the reconstructed text — nothing missing', () => {
  const blocks = [
    { text: 'Title here', kind: 'heading', level: 1 },
    { text: 'First paragraph of the body.', kind: 'paragraph' },
    { text: 'Second paragraph, longer, with more to say.', kind: 'paragraph' },
  ];
  const doc = assembleDocument({ name: 'd', blocks });
  for (const s of doc.spans) assert.equal(doc.text.slice(s.charStart, s.charEnd), s.text, 'every span addresses its own text');
  assert.equal(doc.sentences.length, blocks.length, 'every block lands');
});

test('pdf: every page contributes its lines; a multi-page doc loses nothing', () => {
  const item = (str, y) => ({ str, transform: [1, 0, 0, 10, 50, y], width: 100, height: 10 });
  const pages = [
    { pageNumber: 1, width: 600, height: 800, items: [item('Page one line', 700)] },
    { pageNumber: 2, width: 600, height: 800, items: [item('Page two line', 700)] },
  ];
  const doc = ingestPdf({ name: 'p', pages });
  assert.ok(doc.text.includes('Page one line') && doc.text.includes('Page two line'));
  assert.equal(doc.pageCount, 2);
});

test('pdf: when pdf.js is unavailable, import records the PDF bytes instead of failing', async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff]);
  const file = {
    name: 'blocked.pdf',
    type: 'application/pdf',
    size: bytes.length,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
  };
  const got = await importAnyFile(file, { onProgress() {} });
  assert.equal(got.meta.modality, 'pdf', 'the source still lands as a PDF so its original page surface can keep the bytes');
  assert.equal(got.meta.extraction, 'binary-fallback', 'the fallback is explicit for the coverage receipt');
  assert.equal(got.meta.coverage.complete, false, 'coverage is honest that text extraction did not run');
  assert.ok(got.meta.coverage.dropped.some((d) => d.includes('PDF text extraction unavailable')));
  assert.ok(got.text.includes('%PDF-1.7') || got.text.includes('binary file'), 'the byte-level floor is readable');
});

test('webpage: every markdown block lands — headings, lists, quotes, code, tables', () => {
  const md = '# Head\n\npara one\n\n- item a\n- item b\n\n> quoted\n\n```\ncode line\n```\n\n| c1 | c2 |\n| -- | -- |\n| v1 | v2 |\n';
  const doc = ingestWebpage({ name: 'w', markdown: md });
  for (const piece of ['Head', 'para one', 'item a', 'item b', 'quoted', 'code line', 'v1 · v2'])
    assert.ok(doc.text.includes(piece), `block content "${piece}" lands`);
});

// ── every source encodes into EoT — text or otherwise ──────────────────────────

test('every modality carries the EoT read: table, json, audio, layout docs', () => {
  const docs = [
    ingestTable({ name: 't', columns: ['who', 'what'], rows: [['Ada', 'wrote'], ['Alan', 'proved']] }),
    ingestJson({ name: 'j', data: { a: { b: 'c' } } }),
    ingestAudio({ name: 'a', duration: 2, utterances: [{ start: 0, end: 1, words: [{ text: 'hello', start: 0, end: 0.5 }, { text: 'world', start: 0.5, end: 1 }] }] }),
    assembleDocument({ name: 'd', blocks: [{ text: 'One block of prose.', kind: 'paragraph' }] }),
  ];
  for (const doc of docs) {
    assert.equal(typeof doc.reading, 'function', `${doc.modality}: doc.reading is attached`);
    const r = doc.reading();
    assert.ok(r.text.length > 0, `${doc.modality}: the EoT read renders`);
    assert.ok(Array.isArray(r.structure.lines), `${doc.modality}: the structure layer exists`);
    const jsonl = doc.readingJsonl();
    assert.ok(jsonl.split('\n').every((line) => JSON.parse(line)), `${doc.modality}: readingJsonl is valid JSONL`);
  }
});

test('the default EoT read is UNCAPPED — a long log renders every event', () => {
  const rows = Array.from({ length: 300 }, (_, i) => [`name-${i}`, `value-${i}`]);
  const doc = ingestTable({ name: 'big', columns: ['k', 'v'], rows });
  const r = readIngest(doc);
  // 300 rows × 2 DEF cells each = 600 DEF lines at minimum — far past the old 400 cap.
  assert.ok(r.structure.lines.length >= 600, `all events render (got ${r.structure.lines.length})`);
  assert.ok(!r.structure.skipped.some((s) => s.reason === 'over-max'), 'nothing withheld by a cap');
});

test('an explicit cap truncates HONESTLY — over-max events are reported, and the render says so', () => {
  const rows = Array.from({ length: 50 }, (_, i) => [`n-${i}`]);
  const doc = ingestTable({ name: 'capped', columns: ['k'], rows });
  const r = readIngest(doc, { max: 10 });
  assert.equal(r.structure.lines.length, 10);
  assert.ok(r.structure.skipped.filter((s) => s.reason === 'over-max').length > 0, 'the withheld events are accounted');
  assert.ok(r.text.includes('capped render'), 'the rendered reading names its own truncation');
});

test('emitEot: events past max are skipped with a reason, never silently dropped', () => {
  const events = Array.from({ length: 8 }, (_, i) => ({ op: 'INS', id: `e${i}`, label: `E${i}`, seq: i }))
    .concat(Array.from({ length: 8 }, (_, i) => ({ op: 'DEF', id: `e${i}`, key: 'k', value: `v${i}`, seq: 8 + i })));
  const out = emitEot(events, { max: 3 });
  assert.equal(out.lines.length, 3);
  const overMax = out.skipped.filter((s) => s.reason === 'over-max');
  assert.ok(overMax.length >= 5, 'every event past the cap is in the skipped account');
});

// ── the import router's pure helpers ────────────────────────────────────────────

test('_tableFromGrid: row 0 is the header, the rest are rows', () => {
  const { columns, rows } = _tableFromGrid([['a', 'b'], ['1', '2'], ['3', '4', '5']]);
  assert.deepEqual(columns, ['a', 'b']);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].length, 3, 'a ragged row is passed through intact for the organ to widen over');
});

test('_keepExtract: a Readability sliver is rejected, a majority extraction kept', () => {
  assert.equal(_keepExtract(900, 1000), true, 'kept 90% — use the extraction');
  assert.equal(_keepExtract(100, 1000), false, 'kept 10% — fall back to the full body');
  assert.equal(_keepExtract(0, 0), true, 'an empty page has nothing to lose');
});

test('_printableRuns: sweeps every byte, returns every printable run with offsets', () => {
  const bytes = new Uint8Array([0, 1, 72, 101, 108, 108, 111, 0, 0, 87, 111, 114, 108, 100, 33, 255, 65, 66]);
  const runs = _printableRuns(bytes);
  assert.deepEqual(runs.map((r) => r.text), ['Hello', 'World!'], 'runs ≥4 chars are kept, the 2-char tail is below min');
  assert.equal(bytes[runs[0].start], 72, 'offsets address back into the bytes');
  assert.equal(runs[1].end, 15);
});
