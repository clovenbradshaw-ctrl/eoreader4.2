// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the PICTURE — a video's visual reading, folded onto the source beside its sound
import { parseText } from '../../../perceiver/parse/index.js';
import { projectGraph } from '../../../core/index.js';
import { webContentHash } from '../../../organs/ingest/index.js';
import { emitEot } from '../../../organs/ingest/index.js';
import { createCompositeDoc } from '../../../organs/in/index.js';
import { sha256Hex } from '../../archive/index.js';
import { bytesOf } from './util.js';

export const installPicture = (appCtx) => {
  const { emit, ledger, logIt, state } = appCtx;
  // ── the PICTURE — a video's visual reading, folded onto the source beside its sound ───────────────
  // A video is TWO senses of one clip: what was HEARD (the waveform → transcript, above) and what
  // MOVED (the picture → motion + born-rule entities, motion.js). recomposeVideoDoc keeps both: the
  // reading doc is the COMPOSITE of the motion doc and the transcript doc (createCompositeDoc — the
  // cross-modal fold docs/multimodal-eot-foundation.md describes), so "what moved" and "what was said"
  // share ONE record and one entity graph. With only the picture read (a silent clip — the common
  // case for a clip like this one), the motion doc stands alone as the reading (modality 'video').
  const recomposeVideoDoc = (src) => {
    const parts = [src._motionDoc, src._transcriptDoc].filter(Boolean);
    if (!parts.length) return;
    src._doc = parts.length === 1 ? parts[0] : createCompositeDoc(parts);
    src._eot = null;
    appCtx.deepReaders.delete(src.docId);
    const picture = ((src._motionDoc && src._motionDoc.text) || '').trim();
    const words = (src._transcriptText || '').trim();
    const text = picture && words ? `${picture}\n\n## Transcript\n\n${words}` : (picture || words);
    if (text) { src.text = text; src.bytes = bytesOf(text); src.sha = webContentHash(text); }
    try { src.entCount = projectGraph(appCtx.docFor(src).log).entities?.size || 0; } catch { /* keep prior */ }
  };

  // Fold a landed VISUAL reading (motion.js readVideo → doc) into a media source: stash the motion doc
  // and its drawable artefacts (session-only, underscore-led so serialize() strips them), then recompose
  // the reading so the picture leads and any transcript rides beneath it.
  const applyVisualReading = (src, motionDoc, artefacts, coverage) => {
    if (!src || !motionDoc) return;
    src._motionDoc = motionDoc;
    src._motion = artefacts || null;            // peaks/analysis/shots/tracks/entities for the surface
    recomposeVideoDoc(src);
    if (coverage) src.coverage = { ...(src.coverage || {}), video: coverage };
    const tn = (motionDoc.tracks || []).length;
    const sn = motionDoc.shots?.shotCount || 0;
    logIt('record', `Watched ${src.reg} — ${tn} moving thing${tn === 1 ? '' : 's'} (born rule), ${sn} shot${sn === 1 ? '' : 's'}`, src.reg);
    setTimeout(() => {
      try { const d = appCtx.docFor(src); logIt('eot', `Encoded ${src.reg} into EoT — ${d?.log ? emitEot(d.log).lines.length : 0} propositions`, src.reg); }
      catch { /* the record already stands */ }
    }, 0);
    appCtx.persist(); emit('sources');
  };

  // Run a `watch` thunk (import-file.js) against an already-recorded video source: extract frames,
  // read the picture as motion + born-rule entities, and fold it in. Model-free and re-derivable, so
  // it is best-effort — a failure leaves the source's sound reading standing, never unwound.
  const runWatch = async (src, watch, { signal, progress } = {}) => {
    const paint = (label) => { try { progress && progress({ kind: 'file', label }); } catch { /* pill is best-effort */ } };
    try {
      const res = await watch({ signal, onProgress: (label) => paint(String(label)) });
      if (res && res.empty) {
        if (res.coverage) logIt('skip', `No picture read for ${src.reg} — ${(res.coverage.dropped || []).join('; ')}`, src.reg);
        return;
      }
      if (res && res.doc) applyVisualReading(src, res.doc, res.artefacts, res.coverage);
    } catch (e) {
      if (signal && signal.aborted) throw e;
      logIt('skip', `Picture reading failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`);
    }
  };

  // Stash a file's original bytes to OPFS and open a durable `file` job, so a reload DURING the
  // import (fetch of the extractor libs, PDF/OCR read, audio decode — all before any source has
  // landed) can rebuild the File and re-run the import. Returns the job id, or null when the file
  // is too large to keep offline (the import still runs; it just won't survive a mid-way reload).
  // Best-effort — a stash fault never fails the import. Dropped (and the bytes deleted) once the
  // source lands (settleJob), so it never leaks OPFS beyond the life of the in-flight import.
  const beginFileJob = async (file) => {
    try {
      if (!file || file.size > appCtx.MEDIA_MAX_BYTES) {
        if (file) logIt('skip', `${file.name} too large to make reload-safe (${Math.round(file.size / 1048576)} MB) — re-drop it if you reload before it finishes`);
        return null;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha = await sha256Hex(bytes);
      await appCtx.ingestStore.putBytes(sha, bytes);
      return appCtx.beginJob({ kind: 'file', sha, name: file.name || 'file', mime: file.type || '' });
    } catch { return null; }
  };

  const ingestFile = (file, fileOpts = {}) => {
    const targetTopicId = fileOpts.topicId || state.activeTopicId;
    return appCtx.runCancellable({ kind: 'file', label: `Reading ${file.name}…` }, async (signal, progress) => {
      // Make the import reload-safe from the first byte: stash the file + open a durable job now,
      // before the (possibly slow) extractor even loads. Dropped the moment the source lands below.
      const fileJid = await beginFileJob(file);
      const settleFile = (status, reason) => { if (fileJid) appCtx.settleJob(fileJid, status, reason); };
      const { importAnyFile } = await import('../import-file.js');
      let got;
      try { got = await importAnyFile(file, { signal, onProgress: (msg) => progress({ kind: 'file', label: String(msg) }) }); }
      catch (e) { settleFile(signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90)); throw e; }

      // ── VIDEO with NO audio track — nothing to hear, but a PICTURE to read. ──
      // A clip like a ball on static has no sound at all, so there is no waveform to land from; the
      // reading IS the picture. Run the watch thunk, record the source from the motion doc (born-rule
      // entities + shots), mark that there is nothing to transcribe, and keep the bytes for playback
      // and a reload re-read. A video WITH audio takes the media branch below and folds its picture in
      // beside the transcript. Never refused: a decode with no audio used to fail the whole import.
      if (got.meta?.modality === 'video' && got.meta?.watch && !got.meta?.doc) {
        const res = await got.meta.watch({ signal, onProgress: (label) => progress({ kind: 'file', label: String(label) }) });
        if (!res || !res.doc) {
          settleFile(signal.aborted ? 'stopped' : 'error', ((res && res.coverage && res.coverage.dropped) || ['no picture could be read']).join('; '));
          return null;
        }
        const src = appCtx.addSource({ title: got.title || file.name, text: res.text, kind: 'audio', rights: 'local file', doc: res.doc, topicId: targetTopicId });
        settleFile('done');
        if (src) {
          src._media = got.meta.media ? { url: got.meta.media, kind: got.meta.mediaKind, isVideo: true } : null;
          src._motionDoc = res.doc;
          src._motion = res.artefacts || null;
          appCtx.setAsr(src, { state: 'skipped', reason: 'no audio track — nothing to transcribe', pct: 100, partial: '' });
          if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
          src.coverage = res.coverage || null;
          const ne = res.coverage?.entities ?? 0;
          logIt('record', `Watched ${src.reg} — ${ne} moving thing${ne === 1 ? '' : 's'} (born rule), ${res.coverage?.shots ?? 0} shot${(res.coverage?.shots ?? 0) === 1 ? '' : 's'}; no audio track`, src.reg);
          appCtx.persist(); emit('sources');
          appCtx.persistAudioBytes(src, file, got.meta.mediaKind);
          if (typeof fileOpts.onSource === 'function') { try { fileOpts.onSource(src); } catch { /* reveal is best-effort */ } }
        }
        return src;
      }

      // ── MEDIA — the source lands AT ONCE from its acoustic reading; transcription follows. ──
      // An audio/video import returns a full pre-transcription reading (waveform + basic
      // analysis + signal/noise nested holons) plus a deferred `transcribe` thunk. We record
      // the source immediately (so it shows up as a source, playable, with its visualization),
      // reveal it, THEN run transcription in the background — only if there was signal to hear.
      if (got.meta?.modality === 'audio' && got.meta?.doc) {
        const src = appCtx.addSource({ title: got.title || file.name, text: got.text, kind: 'audio', rights: 'local file', doc: got.meta.doc, topicId: targetTopicId });
        // The source has landed and persists on its own now — the pre-source decode window the file
        // job covered is over. The original bytes (audio store, below) + the transcribe job carry
        // reload-safety from here, so drop the file job and its stashed copy rather than double-keep.
        settleFile('done');
        if (src) {
          // The playback + visualization artefacts ride the source as underscore fields, so they
          // are session-only (never structure-cloned into the persisted snapshot; serialize()
          // strips anything underscore-led) and re-derive on a fresh import.
          src._media = got.meta.media ? { url: got.meta.media, kind: got.meta.mediaKind, isVideo: !!got.meta.isVideo } : null;
          src._wave = got.meta.waveform || null;
          src._analysis = got.meta.analysis || null;
          src._holons = got.meta.holons || null;
          appCtx.setAsr(src, got.meta.transcribable
            ? { state: 'pending', pct: 0, partial: '' }
            : { state: 'skipped', reason: 'no signal above the noise floor', pct: 0, partial: '' });
          // The waveform + stat reading, in a compact persisted form so the Listen surface still
          // draws them after a reload (the underscore artefacts above are stripped from the snapshot).
          src.audioMeta = appCtx.audioMetaOf(src);
          if (!Array.isArray(src.audioEvents)) src.audioEvents = [];
          const cov = got.meta.coverage;
          if (cov) { src.coverage = cov; logIt(cov.complete ? 'record' : 'skip', `Coverage — ${cov.transcribable ? '100% of ' + file.name + ' read as sound; transcribing signal' : (cov.dropped || []).join('; ')}`, src.reg); }
          // Open the durable transcribe job NOW — before the (slow) whisper load — so a reload during
          // the model download or the decode still resumes it. Keyed by the source (audio bytes below).
          if (got.meta.transcribable) appCtx.beginJob({ kind: 'transcribe', sn: src.sn });
          appCtx.persist(); emit('sources');
          // Keep the original bytes so playback + redaction — and a resumed transcription — survive a
          // reload: OPFS locally, plus an encrypted copy on Matrix media when signed in. Background.
          appCtx.persistAudioBytes(src, file, got.meta.mediaKind);
          if (typeof fileOpts.onSource === 'function') { try { fileOpts.onSource(src); } catch { /* reveal is best-effort */ } }

          // THE PICTURE first — a video's visual reading (motion + born-rule entities) is model-free
          // and fast, so it folds in before the (slow, model-loading) transcription runs. A pure-audio
          // import has no `watch` thunk and skips straight to the words.
          if (got.meta.watch) await runWatch(src, got.meta.watch, { signal, progress });

          // Transcription proper — streamed, resumable, job-tracked (runTranscription). If the tab
          // reloads part-way, the transcribe job + the OPFS audio bytes let resumeJobs pick it up.
          if (got.meta.transcribe) await appCtx.runTranscription(src, got.meta.transcribe, { signal, progress });
        }
        return src;
      }

      // ── IMAGE — the source lands AT ONCE showing the picture itself; reading it (the eyes, then
      // the scene) follows in the background. "The first experience of uploading anything should be
      // seeing it in its native form" — the same audio/video promise above, for a still picture:
      // fromImage already resolved with only the file facts (dimensions, size), so the source and
      // its picture are on the record before a single word of OCR or a scene caption exists.
      if (got.meta?.modality === 'image' && got.meta?.read) {
        const src = appCtx.addSource({ title: got.title || file.name, text: got.text, kind: 'image', rights: 'local file', doc: got.meta.doc, topicId: targetTopicId });
        settleFile('done');
        if (src) {
          src._media = got.meta.media ? { url: got.meta.media, kind: got.meta.mime || 'image' } : null;
          src.dimensions = got.meta.width && got.meta.height ? `${got.meta.width}×${got.meta.height}` : null;
          if (got.meta.coverage) src.coverage = got.meta.coverage;
          appCtx.setImageRead(src, { state: 'pending', pct: 0 });
          appCtx.persist(); emit('sources');
          // Keep the original bytes so the picture — and a resumed OCR/scene read — survive a
          // reload: OPFS locally (app/image.js). Background, off the critical path.
          appCtx.persistImageBytes(src, file);
          if (typeof fileOpts.onSource === 'function') { try { fileOpts.onSource(src); } catch { /* reveal is best-effort */ } }
          // Read what the picture SHOWS — the eyes, then (failing that) the scene — now that the
          // picture itself is already on the record. A failure here (or a Stop) leaves the source on
          // its file-facts placeholder text; the picture never depends on this succeeding.
          await appCtx.runImageReading(src, got.meta.read, { signal, progress });
        }
        return src;
      }

      const structured = ['table', 'json', 'binary', 'music', 'subtitle'].includes(got.meta?.modality) && got.meta?.doc;
      // The coverage receipt — proof that 100% of the file was processed, or the named account of
      // what could not be (import-file.js) — rides the source and the ledger, whichever path lands it.
      const cov = got.meta?.coverage;
      const recordCoverage = (src) => {
        if (!cov || !src) return;
        src.coverage = cov;
        if (cov.complete) logIt('record', `Coverage — 100% of ${file.name} processed`, src.reg);
        else logIt('skip', `Partial read of ${file.name} — ${(cov.dropped || []).join('; ')}`, src.reg);
        appCtx.persist();
      };

      // STRUCTURED — the ORGAN doc IS the reading: a table's cells, a JSON tree's leaves, a binary's
      // string runs, a MIDI score's note graph ARE its propositions, already three-faced events on
      // the log; re-parsing their rendered lines as prose would drop them. It is cheap and ready, so
      // the source lands WITH its doc in one step and its entity count shows at once.
      if (structured) {
        const src = appCtx.addSource({ title: got.title || file.name, text: got.text, kind: got.meta?.modality || 'file', rights: 'local file', doc: got.meta.doc, topicId: targetTopicId });
        settleFile('done');
        recordCoverage(src);
        // A caption's cues carry real timing, interpolated to word-level tokens — the same
        // src.words shape an ASR transcript lands on, so sync-reduce.js reads either uniformly.
        if (src && got.meta?.modality === 'subtitle' && Array.isArray(got.meta.words)) { src.words = got.meta.words; appCtx.persist(); }
        return src;
      }

      // PROSE (pdf, webpage, ocr, plain text) — land the source AT ONCE from its extracted text,
      // exactly the way an audio import lands from its acoustic reading, so it shows up in the
      // sources the instant it is imported: named, on the record, openable as a book (the reader
      // renders from src.text). `defer` tells addSource NOT to read it eagerly; the entity/relation
      // read then runs as a CHUNKED background pass (onProgress → yields between chunks) and
      // finishReading folds it in when it is done. So a 2,500-page document never makes the reader
      // wait to see its source, and never freezes the tab on one synchronous sweep — until the read
      // lands, the registry simply shows that source's entity count as an ellipsis.
      const src = appCtx.addSource({ title: got.title || file.name, text: got.text, kind: got.meta?.modality || 'file', rights: 'local file', defer: true, topicId: targetTopicId });
      // The source has landed and persists (src.text rides the snapshot); the pre-source extract
      // window the file job covered is over. Drop it — a reload re-derives the reading lazily.
      settleFile('done');
      recordCoverage(src);
      // A code file's language (import-file.js's CODE_LANG_BY_EXT) — read by the Native tab's
      // highlighter (code-highlight.js) and the Overview landing page's "Language" row.
      if (src && got.meta?.language) src.language = got.meta.language;
      // A PDF opens AS A PDF first — the real pages, not the reflowed book — so keep its original
      // bytes for that surface (the reader is one tab away). Best-effort, off the critical path:
      // fired, not awaited, so the (background) OCR read never waits on the OPFS write, and a fault
      // never fails the import — the reader book still stands.
      if (src && got.meta?.modality === 'pdf' && appCtx.persistPdfBytes) {
        try { appCtx.persistPdfBytes(src, file); } catch { /* the reader book still renders it */ }
      }
      if (src) {
        try {
          const doc = await parseText(got.text, {
            docId: src.docId,
            onProgress: (p) => {
              if (p && p.phase === 'parse' && p.total)
                progress({ kind: 'file', label: `Reading the text… ${p.done.toLocaleString()} / ${p.total.toLocaleString()} sentences` });
            },
          });
          appCtx.finishReading(src, doc);
        } catch (e) {
          // The reading failed — but the SOURCE stands (it landed above). Leave it on its text and
          // let docFor re-read it lazily the next time the reading is actually needed; a recorded
          // source is never unwound over a parse fault.
          logIt('skip', `Reading failed for ${src.reg} — ${String(e?.message || e).slice(0, 90)}`);
        }
      }
      return src;
    });
  };

  Object.assign(appCtx, { ingestFile, recomposeVideoDoc, runWatch });
};
