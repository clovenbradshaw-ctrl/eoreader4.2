// EO: SIG·SEG·INS(Void → Field,Entity, Binding,Clearing,Making) — YouTube library — video transcripts
// A YouTube video's captions as a groundable source — the SPOKEN track, read as timestamped prose.
// (docs/web-search.md "The library sources")
//
// No media pipeline touched — no yt-dlp, no whisper, no download. YouTube ships every video's
// captions as JSON reachable through the video's own watch page: the page embeds
// `ytInitialPlayerResponse`, whose `captions.playerCaptionsTracklistRenderer.captionTracks[]`
// names each available track's `baseUrl`; that URL, with `&fmt=json3` appended, returns the cues
// themselves — timestamped, structured, no XML to parse. Two GET fetches, both through the SAME
// proxy chain every other web source travels (client.fetchUrl) — no POST, no InnerTube API key,
// no client spoofing, nothing bundled. A track with `kind:'asr'` is auto-generated (YouTube's own
// speech recognition); a track without it is human-uploaded, preferred when both exist.

import { admitWebSource } from './websource.js';

// ── Reference shapes — the ways a user (or a hop) holds a video ────────────────────────────────
export const youtubeWatchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

// youtubeIdOf(ref) → the 11-char video id from a watch/share/shorts/embed/live URL, or a bare id.
export const youtubeIdOf = (ref) => {
  const s = String(ref || '').trim();
  const m =
    /youtu\.be\/([\w-]{11})/i.exec(s) ||
    /youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)([\w-]{11})/i.exec(s) ||
    /^([\w-]{11})$/.exec(s);
  return m ? m[1] : null;
};

// ── The watch page → the caption track list ────────────────────────────────────────────────────
// parsePlayerResponse(html) → the `ytInitialPlayerResponse` object embedded in the watch page, or
// null. A regex alone cannot bound a nested JSON literal reliably, so once the assignment is
// located the object is walked brace-by-brace (respecting quoted strings and escapes) to find its
// true close, then parsed.
export const parsePlayerResponse = (html) => {
  const s = String(html || '');
  const at = s.search(/ytInitialPlayerResponse\s*=\s*\{/);
  if (at < 0) return null;
  const start = s.indexOf('{', at);
  let depth = 0, inStr = false, quote = '', esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } }
    }
  }
  return null;
};

// captionTracksOf(playerResponse) → the raw track list, or [] when the video carries no captions
// (or captions are region/age gated out of the response entirely).
export const captionTracksOf = (playerResponse) =>
  playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

// pickCaptionTrack(tracks, lang) → the best track for the requested language: an exact-language
// HUMAN-uploaded track first (kind !== 'asr'), then that exact language auto-generated, then the
// same language FAMILY (an "en" ask matching an "en-US" track and back), then simply the first
// track offered — a video with only Spanish captions still reads, just not in English. Null when
// there are none.
export const pickCaptionTrack = (tracks, lang = 'en') => {
  const list = tracks || [];
  if (!list.length) return null;
  const want = String(lang || 'en').toLowerCase();
  const base = want.split('-')[0];
  const codeOf = (t) => String(t.languageCode || '').toLowerCase();
  const sameLang = (t) => codeOf(t) === want;
  const sameFamily = (t) => codeOf(t).split('-')[0] === base;
  return list.find((t) => sameLang(t) && t.kind !== 'asr')
    || list.find((t) => sameLang(t))
    || list.find((t) => sameFamily(t) && t.kind !== 'asr')
    || list.find((t) => sameFamily(t))
    || list[0];
};

// captionTrackUrl(track) → the track's baseUrl asking for the structured json3 payload (never the
// default XML), whether or not the baseUrl already carries a query string. Null without a track.
export const captionTrackUrl = (track) => {
  const base = track?.baseUrl;
  if (!base) return null;
  return base + (base.includes('?') ? '&' : '?') + 'fmt=json3';
};

// ── The cues themselves ─────────────────────────────────────────────────────────────────────────
// parseJson3Captions(json) → cues [{ start, dur, text }] in seconds, empty/whitespace-only events
// dropped. `json` may be the already-parsed object or its raw text (a fetch's body arrives as
// text). Never throws — a malformed payload yields [].
export const parseJson3Captions = (json) => {
  let j = json;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch { return []; } }
  return (j?.events || [])
    .filter((e) => Array.isArray(e?.segs))
    .map((e) => ({
      start: (e.tStartMs || 0) / 1000,
      dur: (e.dDurationMs || 0) / 1000,
      text: e.segs.map((seg) => seg.utf8 || '').join('').replace(/\s+/g, ' ').trim(),
    }))
    .filter((c) => c.text);
};

// ── Cues → prose ────────────────────────────────────────────────────────────────────────────────
// A gap this long (seconds) between one cue's end and the next's start reads as a new thought —
// start a fresh paragraph, so a wall of one-line captions still reads as prose.
const PARA_GAP = 4;
const stamp = (secs) => {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? `${h}:` : '') + `${mm}:${String(r).padStart(2, '0')}`;
};

// cuesToProse(cues) → the transcript as timestamped paragraphs: "[MM:SS] …said…", one paragraph
// per run of cues with no long silence between them. Plain text, so it drops straight into the
// same parse/admit path any other web source travels — the timestamps ride as legible, citable
// anchors back into the video rather than a structure the reader would need new code to show.
export const cuesToProse = (cues) => {
  const paras = [];
  let cur = null, lastEnd = null;
  for (const c of cues || []) {
    if (!cur || (lastEnd != null && c.start - lastEnd >= PARA_GAP)) {
      cur = { start: c.start, words: [] };
      paras.push(cur);
    }
    cur.words.push(c.text);
    lastEnd = c.start + (c.dur || 0);
  }
  return paras.map((p) => `[${stamp(p.start)}] ${p.words.join(' ')}`).join('\n\n');
};

// The watch page's <title> — "Video Title - YouTube" — stripped of the site suffix. Only the last
// resort: the player response's own videoDetails.title is preferred when present.
const titleFromHtml = (html) =>
  (/<title[^>]*>([^<]*)<\/title>/i.exec(String(html || ''))?.[1] || '')
    .replace(/\s*-\s*YouTube\s*$/i, '').trim();

const nowIso = () => { try { return new Date().toISOString(); } catch { return null; } };

// fetchYoutubeTranscript(ref, opts) → { doc, record, cues, videoId, track } | null — the
// DELIBERATE "read this video's captions" path. Two GET fetches through the SAME client every
// other web source uses: the watch page (for the caption track list), then the chosen track's
// json3 payload (the cues). Null when the id doesn't resolve, or the page carries no captions
// block (a video with auto-captions off and none uploaded genuinely has no track to read — no
// retry spent on that, it will never resolve). A track that DOES exist but answers with an empty
// body (YouTube's caption endpoint does this intermittently for a proxied, non-browser fetch even
// off a freshly-signed URL) is worth one retry off an entirely fresh watch-page session before
// giving up — most of these clear on the second try.
export const fetchYoutubeTranscript = async (ref, {
  client, store = null, rawStore = null, fetched_at = nowIso(), lang = 'en', hangGuard = 2_000_000, retries = 1,
} = {}) => {
  const videoId = youtubeIdOf(ref);
  if (!videoId || !client) return null;
  const url = youtubeWatchUrl(videoId);
  const html = (await client.fetchUrl(url)).text;
  const player = parsePlayerResponse(html);
  const tracks = captionTracksOf(player);
  if (!tracks.length) return null;
  const track = pickCaptionTrack(tracks, lang);
  const trackUrl = captionTrackUrl(track);
  if (!trackUrl) return null;
  const cues = parseJson3Captions((await client.fetchUrl(trackUrl)).text);
  if (!cues.length) {
    if (retries > 0) return fetchYoutubeTranscript(ref, { client, store, rawStore, fetched_at, lang, hangGuard, retries: retries - 1 });
    return null;
  }

  const details = player?.videoDetails || {};
  const title = details.title || titleFromHtml(html) || `YouTube video ${videoId}`;
  const author = details.author ? ` — ${details.author}` : '';
  const text = `${title}${author}\n${url}\n\n${cuesToProse(cues)}`;

  const payload = {
    url, title, text, excerpt: details.shortDescription || null,
    retrieval_query: String(ref), engine: 'web:youtube', fetched_at,
  };
  const admitted = store ? store.admit(payload, { hangGuard }) : admitWebSource(payload, { hangGuard });
  if (admitted?.doc) {
    // The raw cues ride the doc as additive metadata (same posture as doc.web) — a citation into
    // the transcript can recover the exact [start, start+dur] span to replay, without a second fetch.
    admitted.doc.captions = { videoId, lang: track.languageCode || null, auto: track.kind === 'asr', cues };
  }
  if (rawStore && admitted?.record?.content_hash) {
    try { await rawStore.put(admitted.record.content_hash, text, { url, title, fetched_at }); }
    catch { /* never block admission */ }
  }
  return { ...admitted, cues, videoId, track };
};
