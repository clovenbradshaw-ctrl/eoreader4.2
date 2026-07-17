// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// transcript export — the files a listener keeps (transcript-export.js)
import { projectGraph } from '../../../core/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { emitEot } from '../../../organs/ingest/index.js';
import { projectTranscript, REDACTION_MARK } from '../transcript-edit.js';
import { buildFormat, FORMATS as TRANSCRIPT_FORMATS, hasTranscript } from '../transcript-export.js';
import { nowMs, bytesOf } from './util.js';

export const installTranscript = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── transcript export — the files a listener keeps (transcript-export.js) ─────────────────────
  // Assemble the doc the renderers read. Prefer the LIVE organ doc (richest — utterances, speakers,
  // the diarization trail, the raw operator log the process-trace walks) when it is present and the
  // transcript hasn't been edited; otherwise REBUILD it from the persisted substrate (src.words +
  // audioEvents + speakers), so an export works after a reload AND reflects any edits/redactions.
  const buildTranscriptDoc = (src) => {
    if (src._doc && src._doc.transcribed && Array.isArray(src._doc.tokens) && src._doc.tokens.length
        && !(Array.isArray(src.audioEvents) && src.audioEvents.length)) return src._doc;
    const base = Array.isArray(src.words) ? src.words : [];
    const proj = projectTranscript(base, src.audioEvents || []);
    const tokens = base.map((w, i) => {
      const p = proj.words[i] || {};
      // A redacted word must never leave in ANY export — mask its surface everywhere (subtitles,
      // JSON, prose), the way the plain-text projection already does for chat/grounding.
      return {
        text: p.redacted ? REDACTION_MARK : (p.text ?? w.text), start: w.start, end: w.end, unitIdx: 0,
        speaker: Number.isInteger(w.speaker) ? w.speaker : null,
        conf: w.conf ?? null, acous: w.acous ?? null, snr: w.snr ?? null, redacted: !!p.redacted,
      };
    });
    return {
      docId: src.docId || src.reg, modality: 'audio',
      duration: (src.audioMeta && src.audioMeta.duration) || 0, witness: null,
      tokens, speakers: Array.isArray(src.speakers) ? src.speakers : [],
      diarizeWitnesses: Array.isArray(src.diarizeWitnesses) ? src.diarizeWitnesses : [],
      analysis: src.audioMeta || null, coverage: src.coverage || null,
    };
  };

  // transcriptExport(sn, formatId) → { text, ext, mime, filename } for the surface to Blob-download,
  // or null when the source has no transcript / the format id is unknown.
  const transcriptExport = (snId, formatId) => {
    const src = appCtx.sourceBySn(snId);
    if (!src) return null;
    return buildFormat(buildTranscriptDoc(src), formatId, src.title || src.reg);
  };
  // The export menu the surface renders for a source: the available formats, whether this source has
  // a transcript to export at all, and its speaker roster (so the panel can show WHO was found).
  const transcriptFormats = (snId) => {
    const src = snId != null ? appCtx.sourceBySn(snId) : null;
    const doc = src ? buildTranscriptDoc(src) : null;
    return {
      formats: TRANSCRIPT_FORMATS.map((f) => ({ id: f.id, label: f.label, ext: f.ext })),
      has: doc ? hasTranscript(doc) : false,
      speakers: (src && Array.isArray(src.speakers)) ? src.speakers : [],
    };
  };

  // The transcription status, kept in two twinned places. `_asr` (underscore) is the RICH LIVE
  // object the surface reads — state, pct, the streaming `partial` tail and the timed partial
  // `words` — and is stripped from the snapshot (serialize() drops underscore fields).
  // `src.transcription` is its DURABLE twin that DOES ride the snapshot: state + pct + reason, and
  // — while a clip is mid-transcription — the heard-so-far `words`/`partial` too, written throttled
  // by the streamer below so a reload shows the partial transcript AT ONCE and never loses it. This
  // setter keeps state/pct/reason in lockstep while PRESERVING any partial parked on the twin (a
  // plain `{state,pct,reason}` reset would wipe it on every partial); on restore, `_asr` is re-seeded
  // from `transcription`, and applyTranscript clears the partial once the final transcript lands.
  const setAsr = (src, patch) => {
    if (!src) return;
    src._asr = { ...(src._asr || {}), ...patch };
    src.transcription = { ...(src.transcription || {}), state: src._asr.state, pct: src._asr.pct || 0, reason: src._asr.reason || null };
  };

  // Fold a landed transcript back into an audio source that was already recorded from its
  // acoustic reading: the words become the source's text, the word-level organ doc (with its
  // timings, witness and carried-forward waveform/holons) becomes its reading, and the derived
  // caches are dropped so the reader re-reads the transcript rather than the placeholder.
  const applyTranscript = (src, text, doc, coverage) => {
    const body = String(text || '').trim();
    if (!body || !doc) return;
    src.text = body;
    src.bytes = bytesOf(body);
    src.sha = webContentHash(body);
    src._doc = doc;
    src._eot = null;
    appCtx.deepReaders.delete(src.docId);
    // The interactive transcript's persisted substrate: the heard words with their timings become
    // the immutable baseline, and an empty append-only edit log. Both ride the snapshot (small
    // plain JSON), so the Listen surface — click-to-seek, karaoke, edits, redactions — survives a
    // reload without the session-only `_doc`. audioMeta keeps the waveform + stats drawable too.
    // Each word also keeps WHO said it (speaker) and the waveform witnesses (conf/acous/snr), so the
    // transcript can be read, coloured and EXPORTED by speaker + acoustics after a reload too — the
    // rounded numbers a "full processing" JSON needs, small enough to ride the snapshot.
    const numOr = (x, dp) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(dp) : undefined;
    src.words = (doc.tokens || []).map((t) => {
      const w = { text: t.text, start: t.start, end: t.end };
      if (Number.isInteger(t.speaker)) w.speaker = t.speaker;
      const conf = numOr(t.conf, 3); if (conf !== undefined) w.conf = conf;
      const acous = numOr(t.acous, 3); if (acous !== undefined) w.acous = acous;
      const snr = numOr(t.snr, 2); if (snr !== undefined) w.snr = snr;
      return w;
    });
    // WHO is speaking — the roster of voices the diarization separated (voices.js), each with its
    // measured pitch/formants, and the auditable trail of merge/keep decisions that produced it.
    src.speakers = Array.isArray(doc.speakers) ? doc.speakers : [];
    if (Array.isArray(doc.diarizeWitnesses)) src.diarizeWitnesses = doc.diarizeWitnesses;
    if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
    src.audioMeta = appCtx.audioMetaOf(src) || src.audioMeta || null;
    try { src.entCount = projectGraph(doc.log).entities?.size || 0; } catch { /* keep prior */ }
    if (coverage) src.coverage = coverage;
    setAsr(src, { state: 'done', pct: 100, partial: '' });
    // The final transcript is now the baseline (src.words) — drop the durable partial twin the
    // streamer kept for reload-safety, so it neither lingers in the snapshot nor re-seeds a stale
    // in-progress view on the next boot.
    if (src.transcription) { delete src.transcription.words; delete src.transcription.partial; }
    if (src._asr) src._asr.words = null;
    // VIDEO — the words are one SENSE; the picture (motion + born entities, applyVisualReading) is the
    // other. Keep BOTH: recompose the reading as the composite of the motion doc and this transcript,
    // the picture leading and the words beneath it. src.words/audioMeta (set above) still drive the
    // Listen surface unchanged — only the reading graph + text compose. A pure-audio source has no
    // _motionDoc and keeps the transcript reading exactly as before.
    if (src._motionDoc) { src._transcriptDoc = doc; src._transcriptText = body; appCtx.recomposeVideoDoc(src); }
    logIt('record', `Transcribed ${src.reg} — ${body.length.toLocaleString()} chars`, src.reg);
    setTimeout(() => {
      try { const d = appCtx.docFor(src); logIt('eot', `Encoded ${src.reg} into EoT — ${d?.log ? emitEot(d.log).lines.length : 0} propositions`, src.reg); }
      catch { /* the record already stands */ }
    }, 0);
    appCtx.persist(); emit('sources');
  };

  // Promote the heard-so-far PARTIAL transcript to the source's baseline (src.words + text), so a
  // transcription that will not reach completion still keeps what it heard instead of losing it:
  //   • the user hit Stop (a stopped job is never resumed), or
  //   • a resume after a reload cannot get the original audio back to finish decoding (it was too
  //     large to have kept offline, was evicted, or this browser has no OPFS).
  // Reads the live partial (`_asr.words`) if present, else the durable twin (`transcription.words`)
  // the streamer persisted. No-op when nothing was heard yet, or a real transcript already landed.
  const keepPartialTranscript = (src) => {
    if (!src || (Array.isArray(src.words) && src.words.length)) return false;
    const live = src._asr && Array.isArray(src._asr.words) && src._asr.words.length ? src._asr.words : null;
    const twin = src.transcription && Array.isArray(src.transcription.words) && src.transcription.words.length ? src.transcription.words : null;
    const partial = live || twin;
    if (!partial) return false;
    src.words = partial.map((w) => ({ text: w.text, start: w.start, end: w.end }));
    if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
    const body = (projectTranscript(src.words, src.audioEvents).text || '').trim();
    if (body) {
      // VIDEO — keep the picture reading (motion doc) and hang the partial words beneath it, rather
      // than dropping to a prose re-read that would lose the motion graph. Pure-audio drops _doc so
      // the transcript re-reads lazily from text, exactly as before.
      if (src._motionDoc) { src._transcriptDoc = null; src._transcriptText = body; appCtx.recomposeVideoDoc(src); }
      else {
        src.text = body; src.bytes = bytesOf(body); src.sha = webContentHash(body);
        src._doc = null; src._eot = null; appCtx.deepReaders.delete(src.docId);
        try { src.entCount = projectGraph(appCtx.docFor(src).log).entities?.size || 0; } catch { /* keep prior */ }
      }
    }
    if (src.transcription) { delete src.transcription.words; delete src.transcription.partial; }
    if (src._asr) src._asr.words = null;
    return true;
  };

  // Run a transcription thunk against an already-recorded audio source: stream partials into the
  // live ASR state + repaint, fold the finished transcript in, and close the durable transcribe job.
  // Shared by the first import AND by a resume after a reload (there the thunk comes from a fresh
  // import of the same OPFS bytes). Idempotent — applyTranscript rewrites by content hash, and the
  // job is keyed by the source, so a resume finds and closes the same job.
  const runTranscription = async (src, transcribe, { signal, progress } = {}) => {
    const jid = appCtx.beginJob({ kind: 'transcribe', sn: src.sn });   // idempotent (keyed by sn); carries attempts
    setAsr(src, { state: 'running' });
    emit('sources');
    const paint = (label) => { try { progress && progress({ kind: 'file', label }); } catch { /* pill is best-effort */ } };
    paint('Transcribing the signal…');
    let lastPaint = 0, lastPartialSave = 0;
    try {
      const res = await transcribe({
        signal,
        twoWitness: !!state.auditReadings,
        onPartial: (p) => {
          paint(`Transcribing… ${p.pct != null ? p.pct + '%' : ''}`);
          setAsr(src, { pct: p.pct || 0, partial: String(p.text || '').slice(-2000) });
          // The live transcript stream — the timed words heard so far, for the Listen surface's
          // scrubber to draw as they land (a session-only tail on `_asr`).
          if (Array.isArray(p.words)) src._asr.words = p.words;
          const now = nowMs();
          // Copy the heard-so-far words onto the DURABLE transcription twin (throttled) and persist,
          // so a reload mid-transcription shows them at once and NEVER loses them — the `_asr` stream
          // above is session-only (serialize() strips underscore fields), and before this nothing
          // persisted during a run. The words are cumulative, so each save carries the whole
          // transcript-so-far; applyTranscript clears it the moment the final transcript lands.
          if (Array.isArray(p.words) && p.words.length && now - lastPartialSave > 4000) {
            lastPartialSave = now;
            src.transcription = { ...(src.transcription || {}), state: src._asr.state, pct: src._asr.pct || 0,
              words: p.words.map((w) => ({ text: w.text, start: w.start, end: w.end })), partial: String(p.text || '').slice(-2000) };
            // Fold the words heard SO FAR into the source's readable text, on the SAME projection the
            // finished transcript uses (transcript-edit.js wordsToText). Without this, every surface
            // that reads src.text — Reader, the source's Contents/structure listing, Facing, search —
            // keeps showing the pre-transcription acoustic placeholder (organs/in/acoustic.js: "Signal
            // 52 — 0:45.8–0:46.4…") for the ENTIRE length of a long transcription, while the real words
            // are heard but stranded on `_asr`. Folding them in here means the reader gets the real,
            // most-useful holonic layer — actual spoken text — the moment there is any to show, not
            // only once the job fully completes.
            const body = (projectTranscript(p.words, src.audioEvents || []).text || '').trim();
            if (body) {
              if (src._motionDoc) { src._transcriptDoc = null; src._transcriptText = body; appCtx.recomposeVideoDoc(src); }
              else {
                src.text = body; src.bytes = bytesOf(body); src.sha = webContentHash(body);
                src._doc = null; src._eot = null; appCtx.deepReaders.delete(src.docId);
              }
            }
            appCtx.persist();
          }
          // Repaint the media panel's live transcript at most a few times a second.
          if (now - lastPaint > 350) { lastPaint = now; emit('sources'); }
        },
      });
      if (res && res.empty) {
        setAsr(src, { state: 'skipped', reason: 'no speech found in the signal', pct: 100, partial: '' });
        if (src.transcription) { delete src.transcription.words; delete src.transcription.partial; }
        if (src._asr) src._asr.words = null;
        appCtx.settleJob(jid, 'skipped'); appCtx.persist(); emit('sources');
      } else if (res && res.doc) {
        applyTranscript(src, res.text, res.doc, res.coverage);   // sets _asr done, clears partial, persists
        appCtx.settleJob(jid, 'done');
      } else {
        appCtx.settleJob(jid, 'done');   // the run finished with nothing to fold; don't resume it again
      }
    } catch (e) {
      if (signal && signal.aborted) {
        // The user stopped it. Keep the transcript heard so far as the baseline rather than discard
        // it (a stopped job is never resumed), so Stop TRIMS the work instead of throwing it away.
        const kept = keepPartialTranscript(src);
        setAsr(src, { state: 'stopped', pct: (src._asr && src._asr.pct) || 0, partial: '', reason: kept ? 'stopped — kept the transcript heard so far' : null });
        appCtx.settleJob(jid, 'stopped');
      } else {
        setAsr(src, { state: 'error', reason: String(e?.message || e).slice(0, 90) });
        appCtx.settleJob(jid, 'error', String(e?.message || e).slice(0, 90));
        logIt('skip', `Transcription failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`);
      }
      appCtx.persist(); emit('sources');
    }
  };

  Object.assign(appCtx, { keepPartialTranscript, runTranscription, setAsr, transcriptExport, transcriptFormats });
};
