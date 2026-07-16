// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// paper: a PDF's ORIGINAL bytes, kept so it renders AS A PDF (its own pages) first
import { createAudioStore } from '../audio-store.js';
import { sha256Hex } from '../../archive/index.js';

export const installPaper = (appCtx) => {
  const { emit, logIt } = appCtx;
  // ── paper: a PDF's original bytes, kept so its FIRST surface is the pages themselves ──────────
  // A PDF opens as a PDF — the real pages, fonts and figures the file carries — not the reflowed
  // reader book (that is one tab away). The browser's own PDF viewer draws those pages from a blob:
  // URL, which needs the original bytes; the URL the import makes dies with the tab, so the bytes
  // rest in OPFS (keyed by content hash, off the JSON snapshot) exactly the way an audio clip's do,
  // and the PDF surface is rebuilt from them after a reload. A content-addressed byte store — the
  // same primitive the audio clips and the ingest-resume bytes use — in its own directory so a PDF
  // eviction never touches audio or page bytes.
  const paperStore = createAudioStore({ dir: 'eoreader-paper' });
  const PDF_MAX_BYTES = 80 * 1024 * 1024;   // above this, keep the PDF session-only (don't flood OPFS)

  // Persist a freshly-imported PDF's original bytes so it renders as a PDF after a reload. The blob:
  // URL is handed to the surface AT ONCE (synchronously, before any await) so the very first render
  // already draws the pages; the OPFS write follows in the background. Best-effort and off the
  // critical path — a failure just leaves the PDF viewable for this session only.
  const persistPdfBytes = async (src, file) => {
    if (!src || !file) return;
    try { if (typeof URL !== 'undefined' && URL.createObjectURL) { src._pdfUrl = URL.createObjectURL(file); emit('sources'); } } catch { /* the reader book still stands */ }
    try {
      if (file.size > PDF_MAX_BYTES) {
        logIt('skip', `${file.name} too large to keep offline (${Math.round(file.size / 1048576)} MB) — viewable as a PDF this session only`, src.reg);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      src.pdfRef = { opfs: sha, mime: file.type || 'application/pdf', size: bytes.length };
      await paperStore.putBytes(sha, bytes);
      appCtx.persist();
    } catch { /* the session blob URL still renders it */ }
  };

  // A renderable object URL for a PDF source: the live blob if this session imported it, else
  // rehydrated from the persisted bytes so the PDF surface still draws after a reload. Cached back
  // onto _pdfUrl (and an 'sources' emit re-renders the viewer). Null when nothing was kept (the PDF
  // was too large to persist and this is a fresh session, or the bytes were evicted).
  const pdfUrl = async (src) => {
    if (!src) return null;
    if (src._pdfUrl) return src._pdfUrl;
    const ref = src.pdfRef;
    if (!ref || !ref.opfs) return null;
    try {
      const bytes = await paperStore.getBytes(ref.opfs);
      if (!bytes) return null;
      const url = URL.createObjectURL(new Blob([bytes], { type: ref.mime || 'application/pdf' }));
      src._pdfUrl = url;
      emit('sources');
      return url;
    } catch { return null; }
  };

  // Can this source render as a PDF at all — a live blob this session, or bytes to rehydrate?
  const pdfRenderable = (src) => !!(src && src.kind === 'pdf' && (src._pdfUrl || (src.pdfRef && src.pdfRef.opfs)));

  Object.assign(appCtx, { persistPdfBytes, pdfUrl, pdfRenderable });
};
