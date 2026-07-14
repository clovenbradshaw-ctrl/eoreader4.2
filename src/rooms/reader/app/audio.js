// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// audio: original bytes + non-destructive transcript edits/redactions
import { projectGraph } from '../../../core/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { createAudioStore } from '../audio-store.js';
import { projectTranscript } from '../transcript-edit.js';
import { sha256Hex } from '../../archive/index.js';
import { nowMs, bytesOf } from './util.js';

export const installAudio = (appCtx) => {
  const { emit, logIt } = appCtx;
  // ── audio: original bytes + non-destructive transcript edits/redactions ─────────────────────
  // The original clip rests in OPFS (off the JSON snapshot), keyed by content hash, so an audio
  // source can still be PLAYED and its redactions re-synthesised after a reload — the blob: URL the
  // import made dies with the tab; these bytes do not. Signed into Matrix, a second ENCRYPTED copy
  // is deposited to Matrix media via the vault (window.EO.vault, content-addressed + deduped).
  const audioStore = createAudioStore();
  const MEDIA_MAX_BYTES = 120 * 1024 * 1024;   // above this, keep the clip session-only (don't flood OPFS)
  const vaultRef = () => { try { return (typeof window !== 'undefined' && window.EO && window.EO.vault) || null; } catch { return null; } };
  const matrixSignedIn = () => { try { const m = (typeof window !== 'undefined' && window.EO && window.EO.matrix); return !!(m && m.identity && m.identity() && m.identity().token); } catch { return false; } };

  // The compact acoustic reading that must survive a reload — the underscore artefacts
  // (_wave/_analysis/_holons) are stripped by serialize(), so a small subset rides the snapshot:
  // enough to redraw the waveform (peak amplitudes), tint signal vs noise (signal spans), and fill
  // the stat pills. Built from the live artefacts at import/transcription time.
  // Downsample the waveform peaks to a snapshot-friendly bar count (the media panel draws ≤200
  // bars anyway), taking the loudest amp per bucket so the shape is preserved.
  const compactPeaks = (wave, n = 200) => {
    const len = wave.length;
    if (!len) return [];
    const N = Math.min(n, len), per = len / N, out = [];
    for (let i = 0; i < N; i++) {
      const a = Math.floor(i * per), b = Math.max(a + 1, Math.floor((i + 1) * per));
      let amp = 0; for (let j = a; j < b && j < len; j++) amp = Math.max(amp, wave[j].amp || 0);
      out.push({ amp: +amp.toFixed(4) });
    }
    return out;
  };
  const audioMetaOf = (src) => {
    const an = src._analysis || null, h = src._holons || null, wave = src._wave || null;
    if (!an && !h && !wave) return src.audioMeta || null;
    const m = src.audioMeta || {};
    return {
      duration: (an && an.duration) || (h && h.root && h.root.dur) || m.duration || 0,
      peaks: Array.isArray(wave) ? compactPeaks(wave, 200) : (m.peaks || null),
      peakDb: an ? an.peakDb : (m.peakDb ?? null),
      rmsDb: an ? an.rmsDb : (m.rmsDb ?? null),
      dynamicRangeDb: an ? an.dynamicRangeDb : (m.dynamicRangeDb ?? null),
      silencePct: an ? an.silencePct : (m.silencePct ?? null),
      signalSeconds: h ? h.signalSeconds : (m.signalSeconds ?? null),
      signalSpans: h && Array.isArray(h.signalSpans) ? h.signalSpans.map((sp) => ({ start: sp.start, end: sp.end })) : (m.signalSpans || null),
    };
  };

  // Persist the original bytes for a freshly-imported audio/video source: OPFS locally, plus an
  // encrypted copy on Matrix media when signed in. Best-effort and off the critical path — a
  // failure just leaves the source playable for this session only.
  const persistAudioBytes = async (src, file, mediaKind) => {
    try {
      if (!file || file.size > MEDIA_MAX_BYTES) {
        if (file) logIt('skip', `${file.name} too large to keep offline (${Math.round(file.size / 1048576)} MB) — playable this session only`, src.reg);
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      const mime = file.type || (mediaKind === 'video' ? 'video/mp4' : 'audio/mpeg');
      src.audioRef = { opfs: sha, mime, size: bytes.length };
      await audioStore.putBytes(sha, bytes);
      appCtx.persist();
      if (matrixSignedIn() && vaultRef()) {
        vaultRef().save(bytes, { name: file.name, mime }).then((r) => {
          if (r && r.ok && r.block) { src.audioRef = { ...src.audioRef, mxc: r.block }; appCtx.persist(); logIt('record', `Encrypted ${src.reg} to Matrix media`, src.reg); }
        }).catch(() => { /* the cloud copy is best-effort */ });
      }
    } catch { /* persistence is best-effort; the session copy still plays */ }
  };

  // A playable URL for an audio source: the live blob if this session imported it, else rehydrated
  // from the persisted bytes (OPFS, or the encrypted Matrix copy) so playback + redaction work
  // after a reload. Cached back onto _media. Null when the bytes are gone (too large, or evicted).
  const playableUrl = async (src) => {
    if (!src) return null;
    if (src._media && src._media.url) return src._media.url;
    const bytes = await audioBytes(src);
    if (!bytes) return null;
    try {
      const ref = src.audioRef || {};
      const url = URL.createObjectURL(new Blob([bytes], { type: ref.mime || 'audio/mpeg' }));
      src._media = { url, kind: ref.mime || 'audio', isVideo: !!(ref.mime && ref.mime.startsWith('video/')) };
      emit('sources');
      return url;
    } catch { return null; }
  };

  // The raw persisted bytes for a source (for the redaction re-synthesis in the surface). Null when
  // nothing was kept. Prefers OPFS, falls back to the encrypted Matrix copy.
  const audioBytes = async (src) => {
    const ref = src && src.audioRef;
    if (!ref) return null;
    try { if (ref.opfs) { const b = await audioStore.getBytes(ref.opfs); if (b) return b; } } catch { /* fall through */ }
    if (ref.mxc && vaultRef()) { try { const r = await vaultRef().open(ref.mxc); if (r && r.ok) return r.bytes; } catch { /* offline */ } }
    return null;
  };

  // The chokepoint for a non-destructive transcript edit or redaction: the event lands on the
  // source's append-only `audioEvents` log, and the plain-text reading is RECOMPUTED from the
  // baseline words + the log (transcript-edit.projectTranscript) so chat, grounding and EoT all read
  // the edited/redacted transcript. Nothing is overwritten — the original rides in the event.
  const recordAudioEvent = (src, evt) => {
    if (!src || !evt || !evt.op) return null;
    if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
    const ev = { ...evt, ts: evt.ts || nowMs(), id: evt.id || `${evt.op}-${src.audioEvents.length}-${nowMs()}` };
    src.audioEvents.push(ev);
    const proj = projectTranscript(src.words || [], src.audioEvents);
    src.text = proj.text;
    src.bytes = bytesOf(src.text);
    src.sha = webContentHash(src.text);
    src._doc = null; src._eot = null;
    appCtx.deepReaders.delete(src.docId);
    try { src.entCount = projectGraph(appCtx.docFor(src).log).entities?.size || 0; } catch { /* keep prior */ }
    logIt('record', `${ev.op === 'REDACT' ? 'Redacted' : ev.op === 'RETRACT' ? 'Reverted' : 'Edited'} ${src.reg} transcript`, src.reg);
    appCtx.persist(); emit('sources');
    return ev;
  };

  Object.assign(appCtx, { MEDIA_MAX_BYTES, audioBytes, audioMetaOf, persistAudioBytes, playableUrl, recordAudioEvent });
};
