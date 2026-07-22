// EO: SIG(Field -> Lens, Tending) — the raw-text surface's data seam (reader-room glue)
// The one impure step the raw-text surface needs: a loaded source's own TEXT, exactly as
// stored. Mirrors binvis-data.js's bytesOfSource split (pure surface / impure seam), but
// simpler — the raw-text view only ever wants a string, never bytes, so it reads
// `app.sourceOriginalExport` for its `.text` result and never touches `.bytes`. A media
// source (PDF/audio/video) carries no meaningful text here — its bytes are a binary
// container, not something to line-number — so it is flagged rather than decoded into
// garbage; the Structure tab is where its bytes belong, Listen/PDF where its native form is.

export const rawTextOfSource = async (app, sn) => {
  const src = (app && app.sourceBySn) ? app.sourceBySn(sn) : null;
  const media = !!(src && (src.audioRef || src.pdfRef || src.kind === 'audio' || src.kind === 'video' || (src._media && src._media.url)));
  if (media) return { text: '', media: true };

  let text = '';
  try {
    const orig = (app && app.sourceOriginalExport) ? await app.sourceOriginalExport(sn) : null;
    if (orig && typeof orig.text === 'string' && orig.text) text = orig.text;
  } catch { /* fall through to the live registry text */ }
  if (!text && src && typeof src.text === 'string') text = src.text;
  return { text, media: false };
};
