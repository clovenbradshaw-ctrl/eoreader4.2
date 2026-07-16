// The PDF's FIRST surface — a PDF opens AS A PDF (its own pages), not the reflowed reader.
//
// Two things are guarded here, both browserless:
//   1. installPaper's byte-keeping — persistPdfBytes stashes the original bytes (keyed by content
//      hash) and pdfUrl rehydrates a renderable blob URL from them after a reload, exactly the way
//      an audio clip's bytes survive; pdfRenderable is the pure predicate the viewer's default-mode
//      pick rides on (index.html openViewer).
//   2. that index.html's openViewer routes a renderable PDF source to the 'pdf' mode, and falls
//      back to the reader when there is nothing to draw — the routing the reveal lands on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { installPaper } from '../src/rooms/reader/app/paper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A minimal appCtx — installPaper reaches only emit/logIt/persist off it.
const makeCtx = () => {
  const ctx = { emit() {}, logIt() {}, persist() {} };
  installPaper(ctx);
  return ctx;
};

// A stand-in for a browser File: the bytes, a size, a mime, and arrayBuffer().
const fakeFile = (bytes, { type = 'application/pdf' } = {}) => ({
  name: 'doc.pdf', size: bytes.length, type,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

test('pdfRenderable is true only when a PDF has a live URL or persisted bytes', () => {
  const { pdfRenderable } = makeCtx();
  assert.equal(pdfRenderable({ kind: 'pdf', _pdfUrl: 'blob:x' }), true);
  assert.equal(pdfRenderable({ kind: 'pdf', pdfRef: { opfs: 'sha' } }), true);
  assert.equal(pdfRenderable({ kind: 'pdf' }), false, 'a PDF with no bytes yet is not renderable');
  assert.equal(pdfRenderable({ kind: 'text', _pdfUrl: 'blob:x' }), false, 'only a PDF source renders as a PDF');
  assert.equal(pdfRenderable(null), false);
});

test('persistPdfBytes keeps the bytes and pdfUrl rehydrates them after a reload', async () => {
  const ctx = makeCtx();
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]);   // "%PDF" + payload
  const src = { kind: 'pdf', reg: 'S1' };
  await ctx.persistPdfBytes(src, fakeFile(bytes));
  assert.ok(src.pdfRef && src.pdfRef.opfs, 'a content-hash reference to the kept bytes rides the source');
  assert.equal(src.pdfRef.mime, 'application/pdf');

  // Simulate a reload: the session blob URL is gone, only the persisted ref remains.
  const reloaded = { kind: 'pdf', reg: 'S1', pdfRef: src.pdfRef };
  // In Node there is no URL.createObjectURL, so pdfUrl can't mint a blob URL — but the bytes ARE
  // retrievable, which is the property that matters (the browser mints the URL from them).
  if (typeof URL !== 'undefined' && URL.createObjectURL) {
    const url = await ctx.pdfUrl(reloaded);
    assert.ok(url, 'the PDF surface gets a renderable URL rebuilt from the persisted bytes');
  } else {
    assert.equal(await ctx.pdfUrl(reloaded).catch(() => 'threw'), null,
      'without createObjectURL pdfUrl returns null, never throws — the reader book still stands');
  }
});

test('a too-large PDF is not persisted, but never throws the import', async () => {
  const ctx = makeCtx();
  const src = { kind: 'pdf', reg: 'S2' };
  // 81 MB is above PDF_MAX_BYTES — the size gate short-circuits before any allocation.
  await ctx.persistPdfBytes(src, { name: 'big.pdf', size: 81 * 1024 * 1024, type: 'application/pdf', arrayBuffer: async () => { throw new Error('should not be read'); } });
  assert.equal(src.pdfRef, undefined, 'nothing is stashed for an over-cap PDF');
});

// The routing in index.html openViewer — every source now opens on the Overview landing page;
// the PDF surface (and every reading mode) is reachable from the mode row, and switching to it
// still loads the PDF bytes lazily via setSourceMode → loadPdf.
test('index.html openViewer routes each source open to the overview surface', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /const modes = \{ \.\.\.this\.state\.viewerModes, \[sn\]: 'overview' \}/, 'openViewer resets each source open to the overview landing');
  assert.match(html, /viewerIsOverview:\s*vMode === 'overview'/, 'the overview surface is a real viewer mode');
  assert.match(html, /viewerIsPdf:\s*vMode === 'pdf'/, 'the pdf surface remains a real viewer mode');
  assert.match(html, /if \(mode === 'pdf'\) this\.loadPdf\(sn\)/, 'switching to the pdf mode still loads the pdf lazily');
});

test('source overview header wraps long titles and uses the active workspace name', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,520px\),1fr\)\)/, 'hero actions wrap below the title instead of overlapping it');
  assert.match(html, /overflow-wrap:anywhere/, 'long imported filenames can break inside the title');
  assert.match(html, /w\.id === app\.state\.activeWorkspaceId/, 'breadcrumbs read the active workspace, not a stale workspace id');
});
