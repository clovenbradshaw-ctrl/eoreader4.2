import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  youtubeIdOf, youtubeWatchUrl, parsePlayerResponse, captionTracksOf, pickCaptionTrack,
  captionTrackUrl, parseJson3Captions, cuesToProse, fetchYoutubeTranscript,
} from '../src/organs/ingest/youtube.js';

// youtubeIdOf — every shape a user (or a hop) holds a video by.
test('youtubeIdOf: recognises watch, short, shorts, embed, live URLs and a bare id', () => {
  assert.equal(youtubeIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=30s'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('https://youtu.be/dQw4w9WgXcQ?t=10'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeIdOf('not a video'), null);
  assert.equal(youtubeIdOf(''), null);
  assert.equal(youtubeWatchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

// parsePlayerResponse — the brace-walker must find the TRUE end of the embedded JSON, not stop at
// the first '}' a naive regex would (nested objects, and braces inside quoted string values).
const playerResponseHtml = (obj, trailing = ';var ytInitialData = {};') =>
  `<html><head><script>var ytInitialPlayerResponse = ${JSON.stringify(obj)}${trailing}</script></head></html>`;

test('parsePlayerResponse: recovers the embedded object past nested braces and brace-like string content', () => {
  const obj = {
    videoDetails: { title: 'A {weird} title, with "quotes" and \\backslashes', author: 'Someone' },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [
      { baseUrl: 'https://example.com/tt?a=1', languageCode: 'en', kind: 'asr' },
    ] } },
  };
  const parsed = parsePlayerResponse(playerResponseHtml(obj));
  assert.equal(parsed.videoDetails.title, obj.videoDetails.title);
  assert.equal(captionTracksOf(parsed).length, 1);
});

test('parsePlayerResponse: null when the marker is absent, or the JSON is truncated', () => {
  assert.equal(parsePlayerResponse('<html>no player response here</html>'), null);
  assert.equal(parsePlayerResponse(''), null);
  assert.equal(parsePlayerResponse('var ytInitialPlayerResponse = {"a": 1'), null);
});

test('captionTracksOf: [] for a response with no captions block (captions disabled)', () => {
  assert.deepEqual(captionTracksOf({}), []);
  assert.deepEqual(captionTracksOf(null), []);
  assert.deepEqual(captionTracksOf({ captions: {} }), []);
});

// pickCaptionTrack — human-uploaded beats auto-generated (asr) in the same language; language
// family falls back sanely; a video with only OTHER languages still yields something.
const TRACKS = [
  { baseUrl: 'u/es', languageCode: 'es', kind: undefined, name: { simpleText: 'Spanish' } },
  { baseUrl: 'u/en-asr', languageCode: 'en', kind: 'asr', name: { simpleText: 'English (auto)' } },
  { baseUrl: 'u/en-US', languageCode: 'en-US', kind: undefined, name: { simpleText: 'English (US)' } },
];

test('pickCaptionTrack: prefers an exact-language human track over auto-generated', () => {
  const t = pickCaptionTrack([TRACKS[1], { ...TRACKS[1], kind: undefined, baseUrl: 'u/en-human' }], 'en');
  assert.equal(t.baseUrl, 'u/en-human');
});

test('pickCaptionTrack: an exact-language auto-generated track still beats a same-FAMILY human one', () => {
  // Exact language wins before family is even considered — 'en' (asr) over 'en-US' (human).
  const t = pickCaptionTrack(TRACKS, 'en');
  assert.equal(t.baseUrl, 'u/en-asr');
});

test('pickCaptionTrack: falls back to same language FAMILY when no exact match at all', () => {
  const t = pickCaptionTrack([TRACKS[0], TRACKS[2]], 'en');   // es, en-US — no exact 'en'
  assert.equal(t.baseUrl, 'u/en-US');
});

test('pickCaptionTrack: falls back to auto-generated in the exact language when no human track exists', () => {
  const t = pickCaptionTrack([TRACKS[0], TRACKS[1]], 'en');
  assert.equal(t.baseUrl, 'u/en-asr');
});

test('pickCaptionTrack: falls back to whatever is offered when the language is absent entirely', () => {
  const t = pickCaptionTrack([TRACKS[0]], 'en');
  assert.equal(t.baseUrl, 'u/es');
  assert.equal(pickCaptionTrack([], 'en'), null);
  assert.equal(pickCaptionTrack(null, 'en'), null);
});

test('captionTrackUrl: appends fmt=json3, respecting an existing query string', () => {
  assert.equal(captionTrackUrl({ baseUrl: 'https://example.com/tt' }), 'https://example.com/tt?fmt=json3');
  assert.equal(captionTrackUrl({ baseUrl: 'https://example.com/tt?lang=en' }), 'https://example.com/tt?lang=en&fmt=json3');
  assert.equal(captionTrackUrl({}), null);
  assert.equal(captionTrackUrl(null), null);
});

// parseJson3Captions / cuesToProse — the cue → prose pipeline.
const JSON3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'Hello' }, { utf8: ' there' }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: 'general' }, { utf8: ' kenobi' }] },
    { tStartMs: 12000, dDurationMs: 2000, segs: [{ utf8: 'A new thought' }] },   // >4s gap → new paragraph
    { tStartMs: 14000, dDurationMs: 1000, segs: [{ utf8: '   ' }] },            // blank → dropped
    { segs: undefined },                                                        // malformed → dropped
  ],
};

test('parseJson3Captions: cues in seconds, blank/malformed events dropped; accepts raw text too', () => {
  const cues = parseJson3Captions(JSON3);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues[0], { start: 0, dur: 2, text: 'Hello there' });
  assert.equal(cues[2].start, 12);
  assert.deepEqual(parseJson3Captions(JSON.stringify(JSON3)), cues);
  assert.deepEqual(parseJson3Captions('not json'), []);
  assert.deepEqual(parseJson3Captions(null), []);
});

test('cuesToProse: groups cues into timestamped paragraphs on a long silence', () => {
  const cues = parseJson3Captions(JSON3);
  const prose = cuesToProse(cues);
  assert.equal(prose, '[0:00] Hello there general kenobi\n\n[0:12] A new thought');
});

// fetchYoutubeTranscript — the end-to-end path against a fake client (no network).
const fakePlayer = (tracks, details = { title: 'My Video', author: 'A Channel' }) => ({
  videoDetails: details,
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
});

const fakeClient = (player, json3 = JSON3) => ({
  fetchUrl: async (url) => {
    if (/\/watch\?v=/.test(url)) return { url, text: playerResponseHtml(player), ok: true, status: 200 };
    if (/fmt=json3/.test(url)) return { url, text: JSON.stringify(json3), ok: true, status: 200 };
    return { url, text: '', ok: true, status: 200 };
  },
});

test('fetchYoutubeTranscript: admits the transcript as a web source with cues attached', async () => {
  const player = fakePlayer([{ baseUrl: 'https://example.com/tt', languageCode: 'en', kind: undefined }]);
  const result = await fetchYoutubeTranscript('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { client: fakeClient(player) });
  assert.ok(result);
  assert.equal(result.videoId, 'dQw4w9WgXcQ');
  assert.equal(result.record.title, 'My Video');
  assert.equal(result.record.engine, 'web:youtube');
  assert.match(result.doc.text, /My Video — A Channel/);
  assert.match(result.doc.text, /\[0:00\] Hello there general kenobi/);
  assert.equal(result.doc.captions.videoId, 'dQw4w9WgXcQ');
  assert.equal(result.doc.captions.auto, false);
  assert.equal(result.cues.length, 3);
});

test('fetchYoutubeTranscript: null for a non-video ref, a missing client, or a video with no captions', async () => {
  assert.equal(await fetchYoutubeTranscript('not a video', { client: fakeClient(fakePlayer([])) }), null);
  assert.equal(await fetchYoutubeTranscript('dQw4w9WgXcQ', { client: null }), null);
  const noCaptions = fakeClient(fakePlayer([]));
  assert.equal(await fetchYoutubeTranscript('dQw4w9WgXcQ', { client: noCaptions }), null);
});

test('fetchYoutubeTranscript: falls back to the <title> tag and marks an auto-generated track', async () => {
  const player = { captions: { playerCaptionsTracklistRenderer: { captionTracks: [
    { baseUrl: 'https://example.com/tt', languageCode: 'en', kind: 'asr' },
  ] } } };   // no videoDetails at all
  const client = {
    fetchUrl: async (url) => {
      if (/\/watch\?v=/.test(url)) {
        return { url, text: `<html><head><title>Fallback Title - YouTube</title></head><body>${playerResponseHtml(player).replace('<html><head>', '').replace('</head></html>', '')}</body></html>`, ok: true, status: 200 };
      }
      return { url, text: JSON.stringify(JSON3), ok: true, status: 200 };
    },
  };
  const result = await fetchYoutubeTranscript('dQw4w9WgXcQ', { client });
  assert.equal(result.record.title, 'Fallback Title');
  assert.equal(result.doc.captions.auto, true);
});
