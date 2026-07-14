import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';
import { makeJob } from '../src/rooms/reader/ingest-jobs.js';

// Ingestion and transcription must survive a refresh — EVEN MID-WAY. The reader records a source
// only when a fetch / file import / transcription has FINISHED, so a reload in the middle used to
// lose the work with no trace. The durable job registry is the trace: a job opens when the work
// begins, rides the session snapshot, and is resumed on the next boot. These tests drive the real
// session controller through the browser-free paths of that lifecycle.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a fresh session has no pending jobs, and a paste needs none (it lands at once)', async () => {
  const app = await freshApp();
  assert.deepEqual(app.jobs(), [], 'nothing pending on a clean boot');
  app.ingestText('Gregor woke to find himself changed. The family gathered at the door.', 'Kafka');
  assert.equal(app.topicSources().length, 1, 'the paste is recorded immediately');
  assert.deepEqual(app.jobs(), [], 'an instant ingest opens no durable job — there is no mid-way to survive');
});

test('a completed file import opens a job and settles it — nothing is left pending', async () => {
  const app = await freshApp();
  const file = new File(['The quick brown fox reads the whole file. Nothing is dropped.'], 'note.txt', { type: 'text/plain' });
  const src = await app.ingestFile(file);
  assert.ok(src && src.sn, 'the file landed as a source');
  assert.deepEqual(app.jobs(), [], 'the file job was dropped once the source landed — no leak');
});

test('resumeJobs reconciles a transcription stranded by a reload and drives it to a terminal state', async () => {
  const app = await freshApp();
  // A source recorded from its acoustic reading, left mid-transcription when the tab closed: its
  // durable status says `running`, its bytes are referenced — but in this (browser-free) run the
  // bytes are not actually present, so the resume must resolve it honestly rather than hang.
  app.state.sources.push({
    sn: 'S1', reg: 'S-0001', kind: 'audio', title: 'clip', text: 'clip', sha: 'x', bytes: 4,
    docId: 'doc-x', audioRef: { opfs: 'missing', mime: 'audio/mpeg' },
    transcription: { state: 'running', pct: 40, reason: null },
  });
  assert.deepEqual(app.jobs(), [], 'no job entry survived — reconciliation must re-open one');

  await app.resumeJobs();

  assert.deepEqual(app.jobs(), [], 'the reconciled transcribe job was resolved and dropped');
  const src = app.sourceBySn('S1');
  assert.equal(src._asr.state, 'error', 'a resume with no recoverable audio ends in a stated error, not a silent hang');
  assert.match(src._asr.reason || '', /audio/i, 'the reason names the missing audio');
  assert.equal(src.transcription.state, 'error', 'the durable twin is updated in lockstep');
});

test('a finished transcription is NOT re-run — reconciliation leaves it alone', async () => {
  const app = await freshApp();
  app.state.sources.push({
    sn: 'S2', reg: 'S-0002', kind: 'audio', title: 'done clip', text: 'hello world', sha: 'y', bytes: 11,
    docId: 'doc-y', audioRef: { opfs: 'z', mime: 'audio/mpeg' }, words: [{ text: 'hello', start: 0, end: 1 }],
    transcription: { state: 'done', pct: 100, reason: null },
  });
  await app.resumeJobs();
  assert.deepEqual(app.jobs(), [], 'a completed transcription opens no resume job');
  assert.equal(app.sourceBySn('S2')._asr, undefined, 'and its live state is left untouched');
});

test('a reload mid-transcription KEEPS the partial transcript when the audio cannot be recovered', async () => {
  const app = await freshApp();
  // A clip left mid-transcription: as the transcript streamed, the heard-so-far words were persisted
  // onto the durable twin (transcription.words) so a refresh can't lose them. But in this browser-free
  // run the original bytes are gone, so the resume cannot finish decoding — it must PROMOTE the partial
  // to the source's baseline rather than drop it on the floor with a bare "audio unavailable" error.
  app.state.sources.push({
    sn: 'S9', reg: 'S-0009', kind: 'audio', title: 'talk', text: 'talk', sha: 'w', bytes: 4,
    docId: 'doc-w', audioRef: { opfs: 'missing', mime: 'audio/mpeg' }, audioEvents: [],
    transcription: { state: 'running', pct: 55, reason: null,
      words: [{ text: 'the', start: 0, end: 0.3 }, { text: 'meeting', start: 0.3, end: 0.9 }, { text: 'began', start: 0.9, end: 1.4 }] },
  });

  await app.resumeJobs();

  const src = app.sourceBySn('S9');
  assert.equal((src.words || []).length, 3, 'the heard-so-far words became the transcript baseline');
  assert.match(src.text, /the meeting began/i, 'and its text reads the partial transcript');
  assert.equal(src._asr.state, 'stopped', 'the state says it stopped short — not a bare error that reads as "nothing"');
  assert.match(src._asr.reason || '', /re-import/i, 'the reason tells the user how to finish it');
  assert.equal(src.transcription.words, undefined, 'the partial twin is cleared once promoted — it does not linger or re-seed');
  assert.deepEqual(app.jobs(), [], 'the transcribe job is resolved, not looping');
});

test('a resume that cannot proceed (file bytes gone) is closed, not retried forever', async () => {
  const app = await freshApp();
  // A file job whose stashed bytes are absent (evicted, or a Node run with no OPFS): the resume must
  // recognize it cannot proceed and close the job rather than loop.
  app.state.jobs = [makeJob({ kind: 'file', sha: 'not-stored', name: 'gone.txt', mime: 'text/plain' })];
  await app.resumeJobs();
  assert.deepEqual(app.jobs(), [], 'the unrecoverable file job was dropped');
});
