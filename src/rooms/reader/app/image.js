// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// image: an uploaded picture's ORIGINAL bytes, kept so its FIRST surface is the picture itself
import { projectGraph } from '../../../core/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { createAudioStore } from '../audio-store.js';
import { sha256Hex } from '../../archive/index.js';
import { bytesOf } from './util.js';

export const installImage = (appCtx) => {
  const { emit, logIt } = appCtx;
  // ── an image's original bytes, kept so it renders AS THE PICTURE first ──────────────────────
  // "The first experience of uploading anything should be seeing it in its native form" — an
  // uploaded image shows the picture itself the instant its file facts are known (import-file.js's
  // fromImage), before a single word of OCR or a scene caption exists. The blob: URL the import
  // makes dies with the tab, so the original bytes rest in OPFS too (keyed by content hash, the
  // same content-addressed primitive paper.js/audio.js use, in its own directory so an image
  // eviction never touches a PDF's or a clip's bytes) and the picture rebuilds from them on reload.
  const imageStore = createAudioStore({ dir: 'eoreader-images' });
  const IMAGE_MAX_BYTES = 40 * 1024 * 1024;   // above this, keep the picture session-only

  const persistImageBytes = async (src, file) => {
    if (!src || !file) return;
    try {
      if (file.size > IMAGE_MAX_BYTES) {
        logIt('skip', `${file.name} too large to keep offline (${Math.round(file.size / 1048576)} MB) — viewable this session only`, src.reg);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      src.imageRef = { opfs: sha, mime: file.type || 'image/*', size: bytes.length };
      await imageStore.putBytes(sha, bytes);
      appCtx.persist();
    } catch { /* the session blob URL still shows the picture */ }
  };

  // A showable URL for an image source: the live blob if this session imported it, else rehydrated
  // from the persisted bytes so the picture still renders after a reload. Cached back onto _media
  // — the same underscore field audio/video keep their playable URL on — and an 'sources' emit
  // repaints the viewer once it lands. Null when nothing was kept (too large, or evicted).
  const imageUrl = async (src) => {
    if (!src) return null;
    if (src._media && src._media.url) return src._media.url;
    const ref = src.imageRef;
    if (!ref || !ref.opfs) return null;
    try {
      const bytes = await imageStore.getBytes(ref.opfs);
      if (!bytes) return null;
      const url = URL.createObjectURL(new Blob([bytes], { type: ref.mime || 'image/*' }));
      src._media = { url, kind: ref.mime || 'image' };
      emit('sources');
      return url;
    } catch { return null; }
  };

  // The raw persisted image bytes — for the source's original-format download. Null when nothing
  // was kept (too large to persist, or the bytes were evicted).
  const imageBytes = async (src) => {
    const ref = src && src.imageRef;
    if (!ref || !ref.opfs) return null;
    try { return await imageStore.getBytes(ref.opfs); } catch { return null; }
  };

  // ── reading the picture: the eyes, then the scene, folded in AFTER the picture has landed ──────
  // The status twin every render reads (source-stage.js): pending until the background read
  // starts, running while the eyes/scene are at work, done/skipped/error once it settles. Mirrors
  // transcript.js's setAsr — state kept in one place, cheap enough to recompute on every patch.
  const setImageRead = (src, patch) => {
    if (!src) return;
    src.imageRead = { ...(src.imageRead || {}), ...patch };
  };

  // Fold the landed OCR/scene reading back into an image source that already shows its picture:
  // the recognised text (or scene narration) becomes the source's readable text, the organ doc
  // becomes its reading, and the derived caches drop so the reader re-reads the real content
  // instead of the file-facts placeholder fromImage first landed it with. `src.kind` stays
  // 'image' regardless of whether the eyes or the scene answered — the picture is still a
  // picture whether or not it happened to carry recognisable text.
  const applyImageReading = (src, { text, doc, coverage, witness } = {}) => {
    const body = String(text || '').trim();
    if (!body || !doc) return;
    src.text = body;
    src.bytes = bytesOf(body);
    src.sha = webContentHash(body);
    src._doc = doc;
    src._eot = null;
    appCtx.deepReaders.delete(src.docId);
    try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { /* keep prior */ }
    if (coverage) src.coverage = coverage;
    if (witness) src.witness = witness;
    setImageRead(src, { state: 'done', pct: 100 });
    logIt('record', `Read ${src.reg} — ${(doc.spans ? doc.spans.length : doc.regions?.length) || 0} ${doc.modality === 'ocr' ? 'line(s) of text' : 'region(s) of the scene'} recognised`, src.reg);
    appCtx.persist(); emit('sources');
  };

  // Run the deferred `read` thunk (import-file.js's fromImage) against an already-landed image
  // source: the eyes first, the scene when the eyes find nothing — exactly what fromImage used to
  // do BEFORE the source could appear at all. Best-effort, like the video watch thunk (picture.js):
  // a failure leaves the source on its file-facts placeholder text, never unwound.
  const runImageReading = async (src, read, { signal, progress } = {}) => {
    setImageRead(src, { state: 'running', pct: 0 });
    emit('sources');
    const paint = (label) => { try { progress && progress({ kind: 'file', label: String(label) }); } catch { /* pill is best-effort */ } };
    try {
      const res = await read({ signal, onProgress: paint });
      if (res && res.meta?.doc) { applyImageReading(src, { text: res.text, doc: res.meta.doc, coverage: res.meta.coverage, witness: res.meta.witness }); return; }
      setImageRead(src, { state: 'skipped', reason: 'nothing recognizable in the image', pct: 100 });
    } catch (e) {
      if (signal && signal.aborted) { setImageRead(src, { state: 'stopped', pct: (src.imageRead && src.imageRead.pct) || 0 }); appCtx.persist(); emit('sources'); return; }
      const msg = String(e?.message || e);
      if (/nothing recognizable/i.test(msg)) {
        // Neither eye found text, and the scene composed nothing describable — a legitimate
        // outcome (a blank wall, a swatch of colour), not a failure. The picture still stands.
        setImageRead(src, { state: 'skipped', reason: 'no text or recognizable scene found', pct: 100 });
        src.coverage = { complete: false, dropped: ['no text or recognizable scene found in the image'] };
        logIt('skip', `No text or scene recognized in ${src.reg} — the picture stands on its own`, src.reg);
      } else {
        setImageRead(src, { state: 'error', reason: msg.slice(0, 90) });
        logIt('skip', `Reading the picture failed for ${src.reg} — ${msg.slice(0, 90)}`);
      }
    }
    // Only reached by a path that hasn't already persisted+emitted (applyImageReading's success
    // path, and the aborted path above, both return early right after doing their own).
    appCtx.persist(); emit('sources');
  };

  Object.assign(appCtx, { persistImageBytes, imageBytes, imageUrl, setImageRead, applyImageReading, runImageReading });
};
