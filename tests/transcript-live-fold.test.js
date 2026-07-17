import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installTranscript } from '../src/rooms/reader/app/transcript.js';

// A source's text is the acoustic pre-transcription placeholder (organs/in/acoustic.js —
// "An audio clip of…", "## What the waveform is") the instant it is decoded, and only becomes
// the real transcript once transcription FINISHES (applyTranscript). Every surface that reads
// src.text — the Reader, the source's Contents/structure listing, search — kept showing that
// placeholder for the ENTIRE length of a long transcription even while real words were already
// being heard and streamed onto `_asr`. runTranscription's onPartial now folds the words heard
// SO FAR into src.text (throttled, via the same wordsToText projection the finished transcript
// uses), so the real, most-useful holonic layer — actual spoken text — surfaces as soon as there
// is any of it, not only once the job completes.
//
// installTranscript is exercised directly (rather than through the full createReaderApp), with a
// minimal hand-built appCtx, so the test is a focused unit test of this one seam.
const makeCtx = () => {
  const ctx = {
    state: { auditReadings: false },
    emit: () => {},
    logIt: () => {},
    persist: () => {},
    deepReaders: new Map(),
    beginJob: () => 'job-1',
    settleJob: () => {},
    docFor: () => ({ log: null }),
    audioMetaOf: () => null,
    recomposeVideoDoc: () => {},
  };
  installTranscript(ctx);
  return ctx;
};

const acousticPlaceholder = () => ({
  sn: 'S1', reg: 'S-0001', kind: 'audio', title: 'City council meeting', docId: 'doc-1',
  text: '# City council meeting\n\nAn audio clip of **12:00.0** (720.0s), decoded to mono 16,000 Hz — read here as sound before a word of it is transcribed.\n\n## What the waveform is\n- **Duration:** 12:00.0 (720.0s)',
  sha: 'placeholder-sha', bytes: 200, audioEvents: [],
});

test('a live partial transcript folds real spoken words into src.text as they land', () => {
  const ctx = makeCtx();
  const src = acousticPlaceholder();
  const placeholderText = src.text;

  let capturedPartial = null;
  const fakeTranscribe = ({ onPartial }) => {
    capturedPartial = onPartial;
    onPartial({
      pct: 40,
      text: 'Hello and welcome to the meeting',
      words: [
        { text: 'Hello', start: 0.0, end: 0.3 },
        { text: 'and', start: 0.35, end: 0.5 },
        { text: 'welcome', start: 0.55, end: 0.9 },
        { text: 'to', start: 0.95, end: 1.05 },
        { text: 'the', start: 1.1, end: 1.2 },
        { text: 'meeting', start: 1.25, end: 1.6 },
      ],
    });
    return new Promise(() => {}); // still running — never resolves in this test
  };

  // runTranscription's synchronous prefix (up to its first internal await) runs the fake
  // transcribe() call and, inside it, onPartial — so by the time this call returns, the fold-in
  // has already happened. The run itself is left permanently pending, which is fine: nothing
  // awaits it and a dangling promise holds no timers/handles open.
  ctx.runTranscription(src, fakeTranscribe, {});
  assert.ok(capturedPartial, 'the fake transcribe wired onPartial');

  assert.notEqual(src.text, placeholderText, 'the acoustic placeholder is replaced once real words land');
  assert.equal(src.text, 'Hello and welcome to the meeting', 'the real spoken text is projected the same way the finished transcript is');
  assert.notEqual(src.sha, 'placeholder-sha', 'the content hash moves with the real text');
  assert.equal(src._doc, null, 'the stale cached parse of the placeholder is dropped');
});

test('a source with no live words yet keeps its acoustic placeholder untouched', () => {
  const ctx = makeCtx();
  const src = acousticPlaceholder();
  const placeholderText = src.text;

  const fakeTranscribe = ({ onPartial }) => {
    onPartial({ pct: 5, text: '' }); // no words yet — just a percentage tick
    return new Promise(() => {});
  };

  ctx.runTranscription(src, fakeTranscribe, {});
  assert.equal(src.text, placeholderText, 'nothing to fold in yet, so the placeholder stands');
});
