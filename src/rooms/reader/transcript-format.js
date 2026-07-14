// EO: SEG·SYN·NUL(Field → Network,Void, Dissecting,Composing,Clearing) — the transcript, read into shape
// transcript-format.js — the FORMATTING and STRUCTURE of a heard transcript, as pure functions.
//
// A speech model hands back a flat stream of timed WORDS — no case, no punctuation, no paragraphs,
// no chapters. That stream is the truth (the waveform witnessed it), but it is not yet READABLE.
// This module lays the reading on top, and it does so WITHOUT the model, the network, or the graph —
// the way reader-render.js reflows a Gutenberg .txt into a book. Three moves:
//
//   1. formatTranscript — best-effort prose: the reading's OWN silences become punctuation (a breath
//      ends a sentence, a shorter pause a clause), the first word of each sentence is capitalised, and
//      a long silence (or a change of voice) opens a new paragraph. Every added mark is DEFEASIBLE —
//      it is a reading of the pauses, not a claim — so the whole layer TOGGLES OFF to the raw stream,
//      and each display token keeps its `raw` surface and its word index so the interactive transcript
//      (click-to-seek, karaoke, edit) still lands on the exact word underneath.
//
//   2. detectTranscriptChapters — a transcript has no headings to recur (reader-render's structure
//      discovery needs them), so a chapter is found the way a topic SHIFTS: the content words on the
//      two sides of a silence stop overlapping (a lexical-cohesion valley, TextTiling's depth score),
//      reinforced where the silence itself is long. Each chapter takes a title from how it opens.
//
//   3. readThroughIndex — the boundary between what the ear has SETTLED (closed breath groups the
//      reader has folded) and the still-open tail it is mid-hearing. The surface greys the tail and
//      blackens the settled words, so you watch the reading catch up to the stream in real time.
//
// Pure, DOM-free, framework-free: every export takes the word list the organ keeps
// (organs/in/audio.js tokens, or the live `_asr.words`) — [{ text, start, end, speaker?, conf?, … }] —
// and returns plain data. The Node tests drive them directly; the Listen surface renders the result.

import { tok, isStop } from '../../perceiver/parse/index.js';

const isNum = (x) => typeof x === 'number' && isFinite(x);

// The silence thresholds, in seconds. PARA_GAP matches transcript-edit.js / organs/in/audio.js, so a
// paragraph here breaks where the organ already broke a breath group. The two below it are this
// module's own reading of the shorter pauses into sentence- and clause-ends.
export const PARA_GAP = 0.9;    // a breath — a new paragraph / thought
export const SENT_GAP = 0.5;    // a full stop's worth of silence
export const CLAUSE_GAP = 0.26; // a comma's worth of silence

// A word already carrying terminal punctuation (some models emit it) — don't double it.
const TERMINAL = /[.!?]["')\]]?$/;
const ANY_PUNCT_END = /[.!?,;:]["')\]]?$/;
const spk = (w) => (Number.isInteger(w?.speaker) ? w.speaker : null);

// The gap in seconds AFTER word i (to word i+1), or null when either clock is missing.
const gapAfter = (words, i) => {
  const a = words[i], b = words[i + 1];
  if (!a || !b || !isNum(a.end) || !isNum(b.start)) return null;
  return b.start - a.end;
};

// A breath-group boundary falls after word i when the silence is a full breath, or the next word is a
// DIFFERENT voice (a caption/paragraph never straddles two speakers — matches transcript-export.js).
const groupBreakAfter = (words, i) => {
  if (i >= words.length - 1) return true;
  const g = gapAfter(words, i);
  if (g != null && g >= PARA_GAP) return true;
  const sa = spk(words[i]), sb = spk(words[i + 1]);
  return sa != null && sb != null && sa !== sb;
};

// ── 1 · the breath groups — one thought each ─────────────────────────────────────
// segmentsOf(words) → [{ index, startIdx, endIdx, start, end, speaker }] — the stream cut into breath
// groups on a PARA_GAP silence or a change of voice. This is the SEG the reading and the formatter
// both fold on, so the paragraphs, the chapter windows and the segment layer all agree.
export const segmentsOf = (words = [], { gap = PARA_GAP } = {}) => {
  const segs = [];
  if (!Array.isArray(words) || !words.length) return segs;
  let cur = null;
  for (let i = 0; i < words.length; i++) {
    if (!cur) cur = { index: segs.length, startIdx: i, endIdx: i, start: words[i].start, end: words[i].end, speaker: spk(words[i]) };
    cur.endIdx = i;
    if (isNum(words[i].end)) cur.end = words[i].end;
    const g = gapAfter(words, i);
    const speakerBreak = (() => { const a = spk(words[i]), b = spk(words[i + 1]); return a != null && b != null && a !== b; })();
    if (i === words.length - 1 || (g != null && g >= gap) || speakerBreak) { segs.push(cur); cur = null; }
  }
  if (cur) segs.push(cur);
  return segs;
};

// ── 2 · read vs heard — the boundary the grey→black paint follows ─────────────────
// readThroughIndex(words, { complete }) → the index of the LAST word the reading has SETTLED: the last
// word of the last CLOSED breath group. Everything up to it has been folded (render it black); the
// still-open trailing group is mid-hearing (render it grey). When transcription is complete the whole
// stream is settled. −1 when nothing is settled yet (only an open first group).
export const readThroughIndex = (words = [], { complete = false, gap = PARA_GAP } = {}) => {
  if (!Array.isArray(words) || !words.length) return -1;
  if (complete) return words.length - 1;
  let through = -1;
  for (let i = 0; i < words.length - 1; i++) {
    const g = gapAfter(words, i);
    const sa = spk(words[i]), sb = spk(words[i + 1]);
    if ((g != null && g >= gap) || (sa != null && sb != null && sa !== sb)) through = i;
  }
  return through;
};

// The plain transcript text of the SETTLED words only — the slice the live EO read parses so that
// "read" means "the reader has actually folded it", and so a half-heard trailing group never churns
// the referent list. Joins on space, blank line between breath groups. Feeds app.js's live-referent
// parse; also handy for a settled-prose export.
export const settledText = (words = [], opts = {}) => {
  const through = readThroughIndex(words, opts);
  if (through < 0) return '';
  return groupedText(words.slice(0, through + 1));
};

// Words → text, a blank line between breath groups (the shape parseText reads best).
const groupedText = (words) => segmentsOf(words).map((s) => {
  let line = '';
  for (let i = s.startIdx; i <= s.endIdx; i++) line += (line ? ' ' : '') + String(words[i]?.text ?? '');
  return line.trim();
}).filter(Boolean).join('\n\n');

// ── 3 · best-effort prose — the pauses become punctuation ────────────────────────
// formatTranscript(words, { format }) → { tokens, paras, format }
//   tokens : [{ i, raw, text, sentenceStart, paraStart, punct }] index-aligned into `words`.
//            `raw` is the untouched surface (so an edit still reads the real word); `text` is the
//            displayed surface — sentence-cased and pause-punctuated when format is on. `punct` is
//            whatever mark the pause added ('' when none), kept separate so a caller can style it.
//   paras  : [{ start, end, tokenIdxs:[i…], speaker }] — display paragraphs, for a block render.
// format:false is the raw stream: paragraphs on PARA_GAP only, no case or punctuation changes (byte-
// for-byte the reading you had before this module) — that IS the toggle-off state.
export const formatTranscript = (words = [], { format = true } = {}) => {
  const ws = Array.isArray(words) ? words : [];
  const tokens = [];
  const paras = [];
  let para = null;
  let sentenceStart = true;

  const openPara = (i) => { para = { start: ws[i]?.start ?? null, end: ws[i]?.end ?? null, tokenIdxs: [], speaker: spk(ws[i]) }; paras.push(para); };

  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const raw = String(w?.text ?? '');
    const paraStart = i === 0 || groupBreakAfter(ws, i - 1);
    if (paraStart) { openPara(i); sentenceStart = true; }

    let text = raw, punct = '';
    if (format) {
      // Capitalise the first alphabetic character of a sentence-initial word; leave the rest as heard
      // (a proper noun the model already cased stays cased; a lowercase mid-sentence word stays low).
      if (sentenceStart && raw) text = raw.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead, ch) => lead + ch.toUpperCase());
      // The pause after this word chooses its trailing mark — unless the model already punctuated it.
      const g = gapAfter(ws, i);
      const breaks = groupBreakAfter(ws, i);
      if (!ANY_PUNCT_END.test(text)) {
        if (breaks || (g != null && g >= SENT_GAP)) punct = '.';
        else if (g != null && g >= CLAUSE_GAP) punct = ',';
      } else if (TERMINAL.test(text)) {
        // Model already ended the sentence — honour it for the case machine below.
      }
      text += punct;
    }

    tokens.push({ i, raw, text, sentenceStart, paraStart, punct });
    para.tokenIdxs.push(i);
    if (isNum(w?.end)) para.end = w.end;

    // The next word opens a new sentence when this one ended one (a terminal mark placed, or one the
    // model supplied) or a breath group closed here.
    const endedSentence = format ? (TERMINAL.test(text)) : false;
    sentenceStart = endedSentence || groupBreakAfter(ws, i);
  }
  return { tokens, paras, format: !!format };
};

// ── 4 · chapters — where the topic turns ─────────────────────────────────────────
// The content-word bag of a word range [a,b], as a Map<token,count> (drop stopwords + 1-char tokens —
// tok() already does both), so a window's vector is the union of its blocks' bags.
const bagRange = (words, a, b) => {
  const bag = new Map();
  for (let i = a; i <= b; i++) {
    for (const t of tok(String(words[i]?.text ?? ''))) bag.set(t, (bag.get(t) || 0) + 1);
  }
  return bag;
};
const addBag = (into, from) => { for (const [k, v] of from) into.set(k, (into.get(k) || 0) + v); return into; };
// Cosine similarity of two token bags in [0,1]; 0 when either is empty (a silent window shares nothing).
const cosine = (a, b) => {
  if (!a.size || !b.size) return 0;
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) { const w = b.get(k); if (w) dot += v * w; }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
};

const clockMMSS = (s) => { const t = Math.max(0, Math.round(s || 0)); const m = Math.floor(t / 60); return `${m}:${String(t % 60).padStart(2, '0')}`; };

// A readable title for a chapter from how it opens: its first breath group's words, trimmed to a short
// phrase, first letter capitalised. Falls back to its top keywords, then to its clock time.
const titleFor = (words, seg, keywords) => {
  let phrase = '';
  for (let i = seg.startIdx; i <= seg.endIdx && phrase.split(' ').length < 9; i++) {
    const t = String(words[i]?.text ?? '').trim();
    if (t) phrase += (phrase ? ' ' : '') + t;
    if (/[.!?]$/.test(t) && phrase.length >= 12) break;
  }
  phrase = phrase.replace(/[\s,;:.!?]+$/, '').trim();
  if (phrase.length > 48) phrase = phrase.slice(0, 46).replace(/\s+\S*$/, '') + '…';
  if (phrase.length >= 8) return phrase.replace(/^([^\p{L}]*)(\p{L})/u, (_, lead, ch) => lead + ch.toUpperCase());
  if (keywords && keywords.length) return keywords.slice(0, 4).join(' · ');
  return clockMMSS(seg.start);
};

// The chapter's distinctive keywords: the content words most frequent INSIDE it relative to the whole
// transcript (a light TF·IDF), so "remuneration/stock" beats "court/case" said everywhere.
const keywordsFor = (words, startIdx, endIdx, globalDf, segCount) => {
  const local = new Map();
  for (let i = startIdx; i <= endIdx; i++) for (const t of tok(String(words[i]?.text ?? ''))) local.set(t, (local.get(t) || 0) + 1);
  const scored = [];
  for (const [t, c] of local) {
    if (t.length < 3 || isStop(t)) continue;
    const df = globalDf.get(t) || 1;
    scored.push([t, c * Math.log(1 + segCount / df)]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, 5).map(([t]) => t);
};

// detectTranscriptChapters(words, opts) → [{ index, startIdx, endIdx, startTime, endTime, title,
//   keywords, wordCount, depth }] — the transcript's chapters, or [] when it shows no topic structure
// (short, or one continuous subject) — the honest empty, the way a text with no recurring heading form
// simply reads as flowing prose in reader-render.
//
// The cohesion is measured over fixed-size word BLOCKS (TextTiling's pseudo-sentences), not breath
// groups, so it is robust however densely the speaker paused; an accepted seam is then SNAPPED to the
// nearest breath-group start, so a chapter always opens on a breath rather than mid-clause.
//   opts.targetBlocks how many blocks to aim for across the transcript (sets the block size)
//   opts.minGapSecs   a chapter runs at least this long (default 25s) — no minute-by-minute over-cutting
//   opts.maxChapters  a ceiling (default 24)
export const detectTranscriptChapters = (words = [], {
  targetBlocks = 28, window = null, minGapSecs = 25, maxChapters = 24,
} = {}) => {
  const ws = Array.isArray(words) ? words : [];
  const N = ws.length;
  if (N < 40) return [];   // too short to speak of chapters — one flow

  // Fixed word-blocks, size adapted so a long transcript yields ~targetBlocks of them (bounded so a
  // block is never a stray handful nor a whole scene). Each block is a pseudo-sentence for cohesion.
  const blockWords = Math.max(6, Math.min(34, Math.round(N / targetBlocks)));
  const blocks = [];
  for (let a = 0; a < N; a += blockWords) {
    const b = Math.min(N - 1, a + blockWords - 1);
    blocks.push({ startIdx: a, endIdx: b, startTime: ws[a]?.start ?? null, bag: bagRange(ws, a, b) });
  }
  const W = window || Math.max(2, Math.min(5, Math.round(blocks.length / 8)));
  if (blocks.length < 2 * W + 2) return [];

  // Document frequency of each content token across blocks (for the keyword TF·IDF below).
  const globalDf = new Map();
  blocks.forEach((bl) => { for (const t of bl.bag.keys()) globalDf.set(t, (globalDf.get(t) || 0) + 1); });

  // Lexical-cohesion score at each inter-block gap g (between block g and g+1): cosine of the window of
  // W blocks on each side. A LOW score is a topic seam. Silence at the seam deepens it.
  const gaps = [];
  for (let g = 0; g < blocks.length - 1; g++) {
    const left = new Map(), right = new Map();
    for (let k = Math.max(0, g - W + 1); k <= g; k++) addBag(left, blocks[k].bag);
    for (let k = g + 1; k <= Math.min(blocks.length - 1, g + W); k++) addBag(right, blocks[k].bag);
    const sim = cosine(left, right);
    const pause = gapAfter(ws, blocks[g].endIdx) || 0;   // the silence at the block seam
    gaps.push({ g, sim, pause: Math.max(0, pause), at: blocks[g + 1].startIdx, startTime: blocks[g + 1].startTime });
  }

  // TextTiling depth: how far the cohesion dips below its neighbouring peaks on each side. A seam only
  // counts if the conversation was MORE cohesive around it than at it.
  const depthAt = (i) => {
    let lp = gaps[i].sim; for (let k = i - 1; k >= 0; k--) { if (gaps[k].sim >= lp) lp = gaps[k].sim; else break; }
    let rp = gaps[i].sim; for (let k = i + 1; k < gaps.length; k++) { if (gaps[k].sim >= rp) rp = gaps[k].sim; else break; }
    return Math.max(0, (lp - gaps[i].sim)) + Math.max(0, (rp - gaps[i].sim));
  };
  gaps.forEach((gp, i) => { gp.depth = depthAt(i); });

  // The cut line: a seam is a boundary when its cohesion dips deep enough — depth clears BOTH the
  // classic HearstText threshold (mean + 0.5·std) AND an absolute floor, and the valley itself is
  // genuinely incohesive (a low cosine, not merely the deepest ripple in an otherwise-cohesive run).
  // That last guard is what keeps a single continuous subject from hallucinating chapters. A long
  // silence at a modest dip is also a seam. Seams within a block of either end are dropped (an edge
  // artifact of the truncated window, never a real chapter). Rank by a blend of depth + silence.
  const VALLEY_MAX = 0.55;   // a real seam's cohesion is low, not just locally-lowest
  const MIN_DEPTH = 0.2;     // an absolute floor beneath the relative threshold
  const longPause = 1.6;     // seconds — a silence this long at a dip is a strong seam
  const edge = blockWords;   // no chapter starts within one block of either end
  const depths = gaps.map((g) => g.depth);
  const mean = depths.reduce((a, b) => a + b, 0) / (depths.length || 1);
  const std = Math.sqrt(depths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (depths.length || 1));
  const cut = Math.max(mean + 0.5 * std, MIN_DEPTH);
  const cand = gaps
    .filter((g) => g.at >= edge && g.at <= N - 1 - edge)
    .filter((g) => (g.depth >= cut && g.sim <= VALLEY_MAX) || (g.pause >= longPause && g.depth > mean && g.sim <= 0.6))
    .map((g) => ({ ...g, rank: g.depth + Math.min(1, g.pause / 3) }))
    .sort((a, b) => b.rank - a.rank);

  // Snap each seam to the nearest breath-group start, so a chapter opens on a breath. Then space the
  // accepted boundaries at least minGapSecs apart (fallback to ≥ 2·blockWords words), capped.
  const segs = segmentsOf(ws);
  const segStarts = segs.map((s) => s.startIdx);
  const snap = (at) => {
    let best = at, bd = Infinity;
    for (const s of segStarts) { const d = Math.abs(s - at); if (d < bd && d <= blockWords) { bd = d; best = s; } }
    return best;
  };
  const accepted = [];
  const farEnough = (c) => c.at > 0 && accepted.every((a) => {
    if (isNum(ws[c.at]?.start) && isNum(ws[a.at]?.start)) return Math.abs(ws[c.at].start - ws[a.at].start) >= minGapSecs;
    return Math.abs(c.at - a.at) >= 2 * blockWords;
  });
  for (const c of cand) {
    if (accepted.length >= maxChapters - 1) break;
    const snapped = { ...c, at: snap(c.at) };
    if (farEnough(snapped)) accepted.push(snapped);
  }
  if (!accepted.length) return [];
  accepted.sort((a, b) => a.at - b.at);

  // The chapter starts: word 0, then each accepted seam. Each chapter spans to the next start.
  const starts = [0, ...accepted.map((c) => c.at)];
  const segCount = Math.max(blocks.length, 1);
  const chapters = starts.map((startIdx, ci) => {
    const endIdx = ci + 1 < starts.length ? starts[ci + 1] - 1 : ws.length - 1;
    const startSeg = segs.find((s) => startIdx >= s.startIdx && startIdx <= s.endIdx) || segs[0];
    const keywords = keywordsFor(ws, startIdx, endIdx, globalDf, segCount);
    return {
      index: ci, startIdx, endIdx,
      startTime: isNum(ws[startIdx]?.start) ? ws[startIdx].start : null,
      endTime: isNum(ws[endIdx]?.end) ? ws[endIdx].end : null,
      wordCount: endIdx - startIdx + 1,
      depth: ci === 0 ? 0 : +(accepted[ci - 1].depth.toFixed(3)),
      title: titleFor(ws, { ...startSeg, startIdx }, keywords),
      keywords,
    };
  });
  return chapters;
};

// ── 5 · referents over the word stream — which word names which figure ────────────
// referentRuns(words, lex) → Map<wordIndex, { entId, docId, label, head }> — the figures the transcript
// names, aligned to the exact words that spell them. `lex` is the referent reading's lexicon
// ([{ label, docId, entId }] — app.js entityLexicon); a label may be several words ("Railroad Retirement
// Tax Act"), so this is a greedy LONGEST-first match of label token runs against the word stream (the
// same match linkifySegs runs over prose, here over timed words so the mapping is index-exact). `head`
// marks the first word of a multi-word figure, for a single link/badge over the run. Pure.
const refNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const referentRuns = (words = [], lex = []) => {
  const map = new Map();
  if (!Array.isArray(words) || !words.length || !Array.isArray(lex) || !lex.length) return map;
  const byFirst = new Map();
  for (const e of lex) {
    const toks = String(e?.label ?? '').toLowerCase().split(/\s+/).map(refNorm).filter(Boolean);
    if (!toks.length) continue;
    const arr = byFirst.get(toks[0]) || []; arr.push({ entId: e.entId, docId: e.docId, label: e.label, toks }); byFirst.set(toks[0], arr);
  }
  for (const arr of byFirst.values()) arr.sort((a, b) => b.toks.length - a.toks.length);
  const wn = words.map((w) => refNorm(w?.text));
  for (let i = 0; i < wn.length; i++) {
    const cands = byFirst.get(wn[i]); if (!cands) continue;
    let hit = null;
    for (const c of cands) { let ok = true; for (let k = 0; k < c.toks.length; k++) { if (wn[i + k] !== c.toks[k]) { ok = false; break; } } if (ok) { hit = c; break; } }
    if (hit) { for (let k = 0; k < hit.toks.length; k++) map.set(i + k, { entId: hit.entId, docId: hit.docId, label: hit.label, head: k === 0 }); i += hit.toks.length - 1; }
  }
  return map;
};

// The chapter containing word index `i` (or the one sounding at time `t` when given { time }).
// A small lookup the surface uses to badge the clicked word with its chapter.
export const chapterAt = (chapters = [], i, { time = null } = {}) => {
  if (!Array.isArray(chapters) || !chapters.length) return null;
  if (time != null && isNum(time)) {
    let hit = chapters[0];
    for (const c of chapters) if (isNum(c.startTime) && c.startTime <= time) hit = c; else if (isNum(c.startTime)) break;
    return hit;
  }
  for (const c of chapters) if (i >= c.startIdx && i <= c.endIdx) return c;
  return chapters[chapters.length - 1];
};
