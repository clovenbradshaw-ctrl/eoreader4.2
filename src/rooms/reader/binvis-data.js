// EO: SIG(Field → Lens, Tending) — the byte-structure surface's data seam (reader-room glue)
// The one impure step docs/binvis-surface.md §1 names: getting a loaded source's BYTES for the
// modality-blind surface, and — for the meaning-keyed significance layer — its per-byte SIGNAL.
// The pure surface (src/surfaces/binvis) knows only bytes and reads no Reading; this module is
// the storey allowed to reach the record (app.sourceOriginalExport, app.eotFor). Split out of
// binvis-surface.js so the launcher/mount DOM stays a separate holon from the data acquisition.

const MAX_BYTES = 6 * 1024 * 1024;   // read at most 6 MB — past that we sample the head and say so
export { MAX_BYTES };

// Pull a source's bytes: original bytes when kept (PDF/audio/video), else the live in-tab clip,
// else the admitted text as UTF-8. `media` flags a media source so empty reads as "its clip is
// gone", not "empty file". A zero-length Uint8Array is truthy, so every step guards on length —
// else an evicted/partial clip shadows the transcript fallback (the "0 B over audio" bug).
const nonEmpty = (a) => !!a && a.length > 0;

export const bytesOfSource = async (app, sn) => {
  const src = (app && app.sourceBySn) ? app.sourceBySn(sn) : null;
  const media = !!(src && (src.audioRef || src.pdfRef || src.kind === 'audio' || src.kind === 'video' || (src._media && src._media.url)));
  let bytes = null, kind = 'none';
  const asText = (t) => { if (!bytes && typeof t === 'string' && t.length) { bytes = new TextEncoder().encode(t); kind = 'text'; } };

  try {
    const orig = await app.sourceOriginalExport(sn);
    if (orig && nonEmpty(orig.bytes)) { bytes = orig.bytes instanceof Uint8Array ? orig.bytes : new Uint8Array(orig.bytes); kind = 'original'; }
    else if (orig) asText(orig.text);
  } catch { /* fall through to the live blob / registry text */ }

  // A media source whose persisted bytes are gone may still be loaded in THIS tab as a blob:
  // URL — the very bytes the player reads. Recover them so what's playing stays visible.
  if (!bytes && src && src._media && src._media.url && typeof fetch === 'function') {
    try {
      const buf = await fetch(src._media.url).then((r) => r.arrayBuffer());
      if (buf && buf.byteLength) { bytes = new Uint8Array(buf); kind = 'original'; }
    } catch { /* the blob URL died with a prior tab — nothing to recover */ }
  }
  asText(src && src.text);   // last resort: a transcript, a page's admitted text

  bytes = bytes || new Uint8Array(0);
  const total = bytes.length;
  const truncated = total > MAX_BYTES;
  if (truncated) bytes = bytes.subarray(0, MAX_BYTES);
  return { bytes, truncated, total, kind, media };
};

// readingSignificance — the SIGNIFICANCE layer's per-byte signal for a source. This is the one
// binvis layer keyed to MEANING, so it lives here (the reader room), never in the modality-blind
// surface: the surface would have to read a Reading to build it, and the Void/Entity boundary the
// spec draws forbids that. The layer keys to the reading's own turning points, which are positions
// in the ADMITTED TEXT — so it visualises the text bytes (the units the reading read, in order),
// not a PDF/audio container's raw bytes, and the unit→byte span is therefore EXACT (no lossy remap
// from a normalised sentence back to a source offset). Returns { bytes, signal, units, turns,
// truncated } — a Uint8Array and a Float32Array of equal length, aligned byte-for-byte — or null
// when the source has no reading with unit text yet.
export const readingSignificance = (app, sn) => {
  let eot = null;
  try { eot = app && app.eotFor ? app.eotFor(sn) : null; } catch { eot = null; }
  if (!eot || !Array.isArray(eot.unitText) || !eot.unitText.length) return null;
  const units = eot.unitText.map((u) => (u == null ? '' : String(u)));
  const U = units.length;
  const turns = Array.isArray(eot.turns) ? eot.turns : [];

  // Per-unit significance from the turning points: the belief channel (max of the surprisal /
  // Δbelief bits, matching the Overview waveform's beliefOf), normalised to the sharpest turn.
  // A small triangular spread lets a turn light a legible band rather than one razor-thin unit.
  const mag = (t) => Math.max(t.bayesBits || 0, t.surprisalBits || 0);
  const peak = turns.reduce((m, t) => Math.max(m, mag(t)), 0) || 1;
  const perUnit = new Float32Array(U);
  const spread = Math.max(1, Math.round(U / 160));
  for (const t of turns) {
    const c = t.idx;
    if (c == null || c < 0 || c >= U) continue;
    const v = mag(t) / peak;
    for (let d = -spread; d <= spread; d++) {
      const i = c + d;
      if (i < 0 || i >= U) continue;
      const w = v * (1 - Math.abs(d) / (spread + 1));
      if (w > perUnit[i]) perUnit[i] = w;
    }
  }

  // Encode the units in reading order, a newline between them, tracking each unit's exact byte
  // span. Stop before MAX_BYTES so a whole book stays bounded, exactly like bytesOfSource.
  const enc = new TextEncoder();
  const SEP = enc.encode('\n');
  const chunks = [];
  const spans = [];
  let total = 0;
  let truncated = false;
  for (let u = 0; u < U; u++) {
    const b = enc.encode(units[u]);
    if (total + b.length > MAX_BYTES) { truncated = true; break; }
    const start = total;
    chunks.push(b); total += b.length;
    spans.push({ start, end: total, u });
    if (u < U - 1) {
      if (total + SEP.length > MAX_BYTES) { truncated = true; break; }
      chunks.push(SEP); total += SEP.length;   // separators carry no unit's significance (they stay flat)
    }
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { bytes.set(c, off); off += c.length; }
  const signal = new Float32Array(total);
  for (const sp of spans) { const v = perUnit[sp.u]; for (let i = sp.start; i < sp.end; i++) signal[i] = v; }
  return { bytes, signal, units: U, turns: turns.length, truncated };
};
