import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  jobKey, makeJob, upsertJob, patchJob, dropJob, resumableJobs, MAX_JOB_ATTEMPTS,
} from '../src/rooms/reader/ingest-jobs.js';

// The durable pending-ingest/transcription registry (ingest-jobs.js) — the state math that lets a
// fetch / file import / transcription survive a reload EVEN MID-WAY. A job is opened when the work
// begins and dropped when it lands; on the next boot the still-open jobs are resumed. These tests
// pin the reducers so the lifecycle is guaranteed without a browser.

test('jobKey is a stable identity per work item — same work maps to the same key', () => {
  assert.equal(jobKey({ kind: 'url', url: 'https://a.com' }), 'url:https://a.com');
  assert.equal(jobKey({ kind: 'transcribe', sn: 'S3' }), 'transcribe:S3');
  assert.equal(jobKey({ kind: 'file', sha: 'abc' }), 'file:abc');
  // a search keys on the topic it opened (each search topic is its own job), falling back to query
  assert.equal(jobKey({ kind: 'search', topicId: 't7', query: 'dolphins' }), 'search:t7');
  assert.equal(jobKey({ kind: 'search', query: 'dolphins' }), 'search:dolphins');
});

test('makeJob opens running, at zero attempts, with its identity as id', () => {
  const j = makeJob({ kind: 'url', url: 'https://a.com' });
  assert.equal(j.status, 'running');
  assert.equal(j.attempts, 0);
  assert.equal(j.id, 'url:https://a.com');
});

test('upsertJob REPLACES same-identity work rather than duplicating it', () => {
  let jobs = [];
  jobs = upsertJob(jobs, makeJob({ kind: 'url', url: 'https://a.com' }));
  jobs = upsertJob(jobs, makeJob({ kind: 'url', url: 'https://a.com' }));   // same url, started again
  jobs = upsertJob(jobs, makeJob({ kind: 'url', url: 'https://b.com' }));
  assert.equal(jobs.length, 2, 'the duplicate url collapsed onto one job');
  assert.deepEqual(jobs.map((j) => j.url).sort(), ['https://a.com', 'https://b.com']);
});

test('patchJob merges only the matching job; dropJob removes it', () => {
  let jobs = [makeJob({ kind: 'url', url: 'https://a.com' }), makeJob({ kind: 'url', url: 'https://b.com' })];
  jobs = patchJob(jobs, 'url:https://a.com', { status: 'error', attempts: 2 });
  assert.equal(jobs.find((j) => j.url === 'https://a.com').status, 'error');
  assert.equal(jobs.find((j) => j.url === 'https://a.com').attempts, 2);
  assert.equal(jobs.find((j) => j.url === 'https://b.com').status, 'running', 'the other job is untouched');
  jobs = dropJob(jobs, 'url:https://a.com');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, 'https://b.com');
});

test('resumableJobs keeps open work under the attempt cap — and drops the settled / stopped / capped', () => {
  const jobs = [
    makeJob({ kind: 'url', url: 'https://open.com' }),                                   // running → resume
    { ...makeJob({ kind: 'url', url: 'https://err.com' }), status: 'error', attempts: 1 }, // transient → resume
    { ...makeJob({ kind: 'url', url: 'https://done.com' }), status: 'done' },             // landed → no
    { ...makeJob({ kind: 'url', url: 'https://skip.com' }), status: 'skipped' },          // nothing to do → no
    { ...makeJob({ kind: 'url', url: 'https://stop.com' }), status: 'stopped' },          // user Stop → no
    { ...makeJob({ kind: 'url', url: 'https://dead.com' }), status: 'error', attempts: MAX_JOB_ATTEMPTS }, // capped → no
  ];
  const urls = resumableJobs(jobs).map((j) => j.url).sort();
  assert.deepEqual(urls, ['https://err.com', 'https://open.com'],
    'only the still-open, under-cap work is resumed — a Stop is respected, a permanent failure abandoned');
});

test('the reducers are pure — they never mutate the input array', () => {
  const jobs = [makeJob({ kind: 'url', url: 'https://a.com' })];
  const snapshot = JSON.stringify(jobs);
  upsertJob(jobs, makeJob({ kind: 'url', url: 'https://b.com' }));
  patchJob(jobs, 'url:https://a.com', { status: 'done' });
  dropJob(jobs, 'url:https://a.com');
  resumableJobs(jobs);
  assert.equal(JSON.stringify(jobs), snapshot, 'the original list is unchanged');
});
