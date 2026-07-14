// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// resume — pick back up the ingest/transcription in flight when the tab last closed
import { makeJob, upsertJob, patchJob, resumableJobs } from '../ingest-jobs.js';
import { nowMs } from './util.js';

export const installResume = (appCtx) => {
  const { emit, logIt, state } = appCtx;
  // ── resume — pick back up the ingest/transcription in flight when the tab last closed ─────────
  // Re-run a resumed AUDIO TRANSCRIPTION from the original bytes kept for playback: rebuild a File
  // from the OPFS/vault copy, re-read it (waveform + the transcribe thunk), and run the thunk. The
  // whole thing is idempotent — the source already exists, applyTranscript rewrites by content hash,
  // and the transcribe job is keyed by the source. Wrapped in runCancellable so Stop cancels it.
  const resumeTranscribe = (job) =>
    appCtx.runCancellable({ kind: 'file', label: 'Resuming transcription…' }, async (signal, progress) => {
      const src = appCtx.sourceBySn(job.sn);
      // The source is gone (removed after the reload was queued) — nothing to transcribe.
      if (!src) { appCtx.settleJob(job.id, 'done'); return; }
      // Already finished (a completed run whose job-drop didn't flush before the reload) — close it.
      if (src.transcription && ['done', 'skipped'].includes(src.transcription.state) && (src.words || []).length) { appCtx.settleJob(job.id, 'done'); return; }
      const bytes = await appCtx.audioBytes(src);
      if (!bytes) {
        // The original audio is gone (too large to have kept offline, evicted, or no OPFS), so a
        // full re-transcribe is impossible. If a partial transcript was streamed before the reload,
        // KEEP it as the baseline rather than lose it; otherwise state the audio is gone honestly.
        const kept = appCtx.keepPartialTranscript(src);
        appCtx.setAsr(src, kept
          ? { state: 'stopped', pct: (src.transcription && src.transcription.pct) || 0, partial: '', reason: 'kept the partial transcript — re-import the audio to finish it' }
          : { state: 'error', pct: 0, partial: '', reason: 'original audio unavailable — re-import to transcribe' });
        appCtx.settleJob(job.id, 'done'); appCtx.persist(); emit('sources'); return;
      }
      const ref = src.audioRef || {};
      const file = new File([bytes], src.title || 'clip', { type: ref.mime || 'audio/mpeg' });
      const { importAnyFile } = await import('../import-file.js');
      const got = await importAnyFile(file, { signal, onProgress: (msg) => progress({ kind: 'file', label: String(msg) }) });
      // Re-hydrate the session-only visualization artefacts too, so the Listen surface is whole again.
      if (got.meta) { src._wave = got.meta.waveform || src._wave; src._analysis = got.meta.analysis || src._analysis; src._holons = got.meta.holons || src._holons; }
      // Re-derive the picture reading (motion + born entities) after a reload — model-free, so it just
      // re-runs; the composite then re-forms with the resumed transcript.
      if (got.meta?.watch) await appCtx.runWatch(src, got.meta.watch, { signal, progress });
      if (got.meta?.transcribe) await appCtx.runTranscription(src, got.meta.transcribe, { signal, progress });
      else { appCtx.setAsr(src, { state: 'skipped', reason: 'no signal above the noise floor', pct: 100, partial: '' }); appCtx.settleJob(job.id, 'skipped'); appCtx.persist(); emit('sources'); }
    });

  // Re-run a resumed WEB SEARCH into the topic it originally opened (not a fresh one), topping up
  // whatever landed before the reload. If that topic is gone, the job is done.
  const resumeSearch = (job) => {
    const t = appCtx.topicById(job.topicId);
    if (!t) { appCtx.settleJob(job.id, 'done'); return Promise.resolve(); }
    return appCtx.runCancellable({ kind: 'search', label: `Resuming search — ${job.query}` }, async (signal) => {
      const jid = appCtx.beginJob({ kind: 'search', query: job.query, k: job.k, topicId: t.id });
      try {
        const { count } = await appCtx.fillSearchTopic(t, job.query, job.k || 3, signal);
        appCtx.settleJob(jid, 'done');
        if (count) { appCtx.persist(); emit('topics'); emit('sources'); }
      } catch (e) { appCtx.settleJob(jid, signal.aborted ? 'stopped' : 'error', String(e?.message || e).slice(0, 90)); }
    });
  };

  // Re-run a resumed FILE import from the bytes stashed at open time (rebuilt into a File). ingestFile
  // re-opens the same file job (dedup by content hash keeps a source that already landed a no-op).
  const resumeFile = async (job) => {
    const bytes = await appCtx.ingestStore.getBytes(job.sha);
    if (!bytes) { appCtx.settleJob(job.id, 'done'); return; }   // bytes evicted / never stashed — can't resume
    await appCtx.ingestFile(new File([bytes], job.name || 'file', { type: job.mime || '' })).catch(() => { /* ingestFile settles its own job */ });
  };

  // resumeOne — dispatch one job to its resumer. Sets the active topic to where the work belongs so
  // the resumed source files there. url/file re-run the public path (which manages its own job);
  // search/transcribe use the dedicated resumers above.
  const resumeOne = async (job) => {
    if (job.topicId && appCtx.topicById(job.topicId) && job.topicId !== state.activeTopicId) appCtx.setTopic(job.topicId);
    switch (job.kind) {
      case 'url':        await appCtx.ingestUrl(job.url).catch(() => { /* ingestUrl settles its own job */ }); break;
      case 'search':     await resumeSearch(job); break;
      case 'file':       await resumeFile(job); break;
      case 'transcribe': await resumeTranscribe(job); break;
      default:           appCtx.settleJob(job.id, 'done');
    }
  };

  // resumeJobs — on boot, walk the still-open jobs and re-run each in turn. Every resume counts as an
  // attempt (so a job that keeps crashing — or keeps getting interrupted — marches to the cap rather
  // than looping forever). Sequential on purpose: the ops share one Stop signal and one whisper
  // engine, so running them one at a time keeps the reload's recovery legible and cancellable.
  const resumeJobs = async () => {
    // Reconcile: any audio source left mid-transcription — its durable status still `pending` or
    // `running` — that has its bytes but no open transcribe job, re-open one. This makes a resume
    // robust even if the jobs list itself was lost. A `done`/`skipped` status is finished; an `error`
    // is left to its own persisted job (which carries the attempt cap) so a permanently-failing clip
    // is not re-queued from scratch on every boot.
    for (const s of state.sources) {
      const st = s.transcription && s.transcription.state;
      if ((st === 'pending' || st === 'running') && s.audioRef && !state.jobs.some((j) => j.kind === 'transcribe' && j.sn === s.sn)) {
        state.jobs = upsertJob(state.jobs, makeJob({ kind: 'transcribe', sn: s.sn, at: nowMs() }));
      }
    }
    const pending = resumableJobs(state.jobs);
    if (!pending.length) return;
    logIt('open', `Resuming ${pending.length} interrupted task${pending.length === 1 ? '' : 's'} from before the reload`);
    for (const job of pending) {
      state.jobs = patchJob(state.jobs, job.id, { attempts: (job.attempts || 0) + 1, status: 'running' });
      appCtx.persist();
      try { await resumeOne(job); }
      catch (e) { appCtx.settleJob(job.id, 'error', String(e?.message || e).slice(0, 90)); }
    }
  };

  Object.assign(appCtx, { resumeJobs });
};
