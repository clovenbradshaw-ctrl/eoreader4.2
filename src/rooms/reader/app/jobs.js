// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// durable pending work — the ingest/transcription job registry (ingest-jobs.js)
import { createAudioStore } from '../audio-store.js';
import { makeJob, upsertJob, patchJob, dropJob, MAX_JOB_ATTEMPTS } from '../ingest-jobs.js';
import { nowMs } from './util.js';

export const installJobs = (appCtx) => {
  const { logIt, state } = appCtx;
  // ── durable pending work — the ingest/transcription job registry (ingest-jobs.js) ────────────
  // A job is opened when a long ingest/transcription BEGINS and dropped when it lands, so the list
  // that rides the snapshot is exactly the work still in flight. On boot, resumeJobs() re-runs it.
  // The bytes a `file` job needs to re-import rest in their own OPFS store (keyed by content hash),
  // separate from the audio store, so a resume can rebuild the original File after a reload.
  const ingestStore = createAudioStore({ dir: 'eoreader-ingest' });
  // beginJob(fields) → the job's id. Opens (or replaces) the job and persists at once, so even an
  // immediate reload finds it. Files under the topic/workspace active NOW so a resume records there.
  // Re-opening the SAME work (same identity key, e.g. resuming) carries the existing resume count
  // forward — so a job that keeps getting interrupted still marches toward the attempt cap.
  const beginJob = (fields) => {
    const job = makeJob({ topicId: state.activeTopicId, workspaceId: state.activeWorkspaceId, at: nowMs(), ...fields });
    const existing = state.jobs.find((j) => j.id === job.id);
    if (existing) job.attempts = existing.attempts || 0;
    state.jobs = upsertJob(state.jobs, job);
    appCtx.persist();
    return job.id;
  };
  // settleJob(id, status, reason) — close a job. A terminal outcome (done / skipped / stopped) drops
  // it (and, for a `file` job, deletes the bytes it stashed for a possible resume). An `error` is
  // KEPT so the next boot can resume it — up to the attempt cap (incremented per resume, below), past
  // which it is abandoned and logged so a permanently-broken job can't resurrect itself forever.
  const settleJob = (id, status, reason = null) => {
    const job = state.jobs.find((j) => j.id === id);
    if (!job) return;
    if (status === 'error' && (job.attempts || 0) < MAX_JOB_ATTEMPTS) {
      state.jobs = patchJob(state.jobs, id, { status: 'error', reason });
    } else {
      if (status === 'error') logIt('skip', `Gave up resuming ${job.kind} after ${job.attempts} tr${job.attempts === 1 ? 'y' : 'ies'}${reason ? ` — ${reason}` : ''}`);
      state.jobs = dropJob(state.jobs, id);
      if (job.kind === 'file' && job.sha) ingestStore.remove(job.sha).catch(() => {});
    }
    appCtx.persist();
  };

  Object.assign(appCtx, { beginJob, ingestStore, settleJob });
};
