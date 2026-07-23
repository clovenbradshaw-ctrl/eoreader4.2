// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). Installed after
// registry.js/paper.js/audio.js so the appCtx bindings a download reads (sourceBySn,
// pdfBytes, audioBytes) are all in place by the time a source is actually downloaded.
// source-original: the ORIGINAL-format download
import { safeSourceName } from '../source-export.js';

export const installSourceOriginal = (appCtx) => {
  // The file/bytes as ingested — distinct from every edited/parsed/interpreted projection
  // registry.js's sourceExport folds into JSON/JSONL. A PDF stays a PDF, a clip stays audio or
  // video, an upload stays its own picture (all three rest in OPFS off the JSON snapshot, keyed
  // by content hash — paper.js/audio.js/image.js); every other kind (web, GitHub, Gutenberg,
  // plain text, tables…) keeps only its admitted text, so that text — untouched since ingest,
  // EO's append-only log records edits as events on top of it, never in place — IS the original
  // for those kinds. Async: a byte read may hit OPFS.
  const sourceOriginalExport = async (snId) => {
    const source = appCtx.sourceBySn(snId);
    if (!source) return null;
    const safe = safeSourceName(source.title || source.sn, source);
    if (source.pdfRef) {
      const bytes = await appCtx.pdfBytes?.(source);
      if (bytes) return { bytes, ext: 'pdf', mime: source.pdfRef.mime || 'application/pdf', filename: `${safe}.original.pdf` };
    }
    if (source.audioRef) {
      const bytes = await appCtx.audioBytes?.(source);
      if (bytes) {
        const mime = source.audioRef.mime || 'audio/mpeg';
        const ext = mime.split('/')[1]?.split(';')[0] || (mime.startsWith('video') ? 'mp4' : 'mp3');
        return { bytes, ext, mime, filename: `${safe}.original.${ext}` };
      }
    }
    if (source.imageRef) {
      const bytes = await appCtx.imageBytes?.(source);
      if (bytes) {
        const mime = source.imageRef.mime || 'image/*';
        const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
        return { bytes, ext, mime, filename: `${safe}.original.${ext}` };
      }
    }
    const ext = source.kind === 'json' ? 'json' : 'txt';
    return { text: String(source.text || ''), ext, mime: ext === 'json' ? 'application/json' : 'text/plain', filename: `${safe}.original.${ext}` };
  };

  Object.assign(appCtx, { sourceOriginalExport });
};
