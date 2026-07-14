// EO: NUL(Void → Void, Tending) — the durable pending-ingest/transcription registry (pure)
// ingest-jobs.js — a small, PURE reducer over the list of in-flight ingest/transcription work,
// so that work can survive a reload EVEN MID-WAY. The reader records a source only when a fetch
// (a URL, a web search), a file import, or a transcription has FINISHED — so a refresh in the
// middle of one used to lose it with no trace it was ever attempted. This registry is the trace:
// a job is opened the moment the work begins, rides the session snapshot (small plain JSON, off
// the underscore-stripped derived fields), and is dropped when the work lands. On the next boot
// the app walks the still-open jobs and RESUMES them (idempotently — a URL re-fetch or a re-decode
// dedups against what already landed by content hash).
//
// This module holds only the state math — the shape of a job, and the append/patch/drop/select
// reducers over the list. The app (app.js) owns the side-effects (OPFS byte stashing, re-fetch,
// re-transcribe) and the persistence; keeping the reducers pure is what lets tests pin the
// lifecycle without a browser. Every function is pure and non-throwing.

// The kinds of work a job can stand for. `url`/`search` re-run from a tiny spec (the URL / query);
// `file` re-runs from bytes stashed in OPFS at open time (rebuilt into a File); `transcribe` re-runs
// from the audio bytes already kept for playback (audio-store), keyed by the source it belongs to.
export const JOB_KINDS = Object.freeze(['url', 'search', 'file', 'transcribe']);

// How many times a job may be RESUMED across reloads before it is abandoned. A job that always
// crashes (a dead URL, a corrupt file) must not resurrect itself on every boot forever; three
// attempts is enough to ride out a transient network/CPU fault without looping on a permanent one.
export const MAX_JOB_ATTEMPTS = 3;

// Terminal states — a job here needs no resume and is normally dropped from the list. Kept as a
// guard for the case where a drop's debounced persist didn't flush before the reload.
const TERMINAL = Object.freeze(['done', 'skipped', 'stopped']);

// A job's stable IDENTITY — so opening the same work twice REPLACES rather than duplicates, and a
// resume can find the job for a source/URL without threading an id around. Deterministic (no clock),
// so the same work always maps to the same key across sessions.
export const jobKey = (job) => {
  if (!job) return '';
  switch (job.kind) {
    case 'url':        return `url:${job.url || ''}`;
    case 'search':     return `search:${job.topicId || job.query || ''}`;
    case 'file':       return `file:${job.sha || job.opfsKey || job.name || ''}`;
    case 'transcribe': return `transcribe:${job.sn || ''}`;
    default:           return `${job.kind}:${job.id || ''}`;
  }
};

// makeJob(fields) → a normalized job. `id` IS its identity key (so patch/drop and upsert all agree),
// status opens at `running` (the work is starting now), attempts at 0. Callers pass the kind, the
// spec fields (url / query / sha / sn …), and the topic/workspace the source should file into.
export const makeJob = (fields = {}) => {
  const job = { status: 'running', attempts: 0, ...fields };
  job.id = jobKey(job);
  return job;
};

// upsertJob(jobs, job) → the list with `job` added, or replaced in place if a job of the same
// identity already exists (starting the same fetch/transcription again does not stack a duplicate).
export const upsertJob = (jobs, job) => {
  const id = job && job.id ? job.id : jobKey(job);
  const out = (jobs || []).filter((j) => j.id !== id);
  out.push({ ...job, id });
  return out;
};

// patchJob(jobs, id, patch) → the list with the matching job shallow-merged (status/attempts/…).
export const patchJob = (jobs, id, patch) =>
  (jobs || []).map((j) => (j.id === id ? { ...j, ...patch } : j));

// dropJob(jobs, id) → the list without the matching job (work landed, or abandoned).
export const dropJob = (jobs, id) => (jobs || []).filter((j) => j.id !== id);

// resumableJobs(jobs) → the jobs a boot should re-run: still open (not terminal) and under the
// attempt cap. A `stopped` job (the user hit Stop) is intentionally NOT resumed; an `error` job is
// (up to the cap) so a transient network/CPU fault rides out. Pure — the app decides HOW to resume.
export const resumableJobs = (jobs) =>
  (jobs || []).filter((j) => j && !TERMINAL.includes(j.status) && (j.attempts || 0) < MAX_JOB_ATTEMPTS);
