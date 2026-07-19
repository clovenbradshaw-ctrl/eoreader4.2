// EO: INS(Field → Entity, Making) — subtitle/caption ingest (SRT/VTT)
// A subtitle file is a SCORE for the sync feature to read the same way organs/in/music.js
// reads a MIDI score: a timed sequence, cue by cue, no ASR needed because the timing is
// already given. Until this module, the repo could only EXPORT SRT/VTT (transcript-export.js)
// — importing an actual .srt/.vtt file landed as an untimed text blob. This is what makes
// "sync a subtitle file against a video" real: the cues become `src.words`-shaped tokens
// (the same shape app/transcript.js produces from ASR), so organs/in/sync-reduce.js can
// treat an ASR transcript and an imported caption file identically.

import { assembleDocument } from './document.js';

// "01:02:03,456" / "1:02:03.456" / "02:03.456" (VTT allows omitting hours) → seconds.
const parseTimestamp = (s) => {
  const m = String(s || '').trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return null;
  const [, h, mm, ss, ms] = m;
  return (h ? Number(h) : 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, '0')) / 1000;
};

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();

// Both SRT and VTT are, underneath their header/index differences, blocks separated by a
// blank line, each carrying one line with a `-->` timing pair and one or more text lines
// after it. One parser reads both; parseSrt/parseVtt are named entry points for callers that
// already know which they have (import-file.js sniffs the extension), but do the same read.
const parseCueBlocks = (text) => {
  const cues = [];
  const blocks = String(text || '').replace(/\r\n/g, '\n').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length);
    const timingIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingIdx < 0) continue;   // WEBVTT header, NOTE block, a bare cue index — not a cue
    const [rawStart, rawEnd] = lines[timingIdx].split('-->');
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd);
    if (start == null || end == null || end <= start) continue;
    const body = stripTags(lines.slice(timingIdx + 1).join(' '));
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues;
};

export const parseSrt = (text) => parseCueBlocks(text);
export const parseVtt = (text) => parseCueBlocks(text);

// Distribute each cue's text across its [start,end] window proportional to word length —
// the same interpolation import-file.js's _whisperUtterances uses for a whisper chunk, so a
// caption's words get a plausible per-word clock even though only the CUE, not the word, was
// ever actually timed. → src.words-shaped tokens: {text, start, end}.
export const cuesToWords = (cues) => {
  const words = [];
  for (const c of cues || []) {
    const ws = String(c.text || '').split(' ').filter(Boolean);
    if (!ws.length) continue;
    const dur = Math.max(0.001, c.end - c.start);
    const tot = ws.reduce((s, w) => s + w.length, 0) || 1;
    let t = c.start;
    for (const w of ws) {
      const d = dur * (w.length / tot);
      words.push({ text: w, start: t, end: t + d });
      t += d;
    }
  }
  return words;
};

// The organ doc — one block per cue (kind:'cue', its timing kept as `ref`), so a subtitle
// source gets the same structured-doc treatment (entity count, addressable spans) every
// other modality gets, via the same shared assembler `fromBinary`/`fromMidi` already use.
export const ingestSubtitle = ({ name, cues, metadata = {} }) => {
  const blocks = (cues || []).map((c) => ({ text: c.text, kind: 'cue', ref: { start: c.start, end: c.end } }));
  return assembleDocument({ name, modality: 'subtitle', blocks, metadata, extra: { cues: cues || [] } });
};
