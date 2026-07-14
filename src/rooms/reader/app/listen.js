// EO — one section of the reader session controller (split from rooms/reader/app.js,
// 2026-07 compliance pass: "no god module — no file over ~250 lines"). The body is
// VERBATIM from the closure; cross-section reach rides ctx (call-time), the core
// spine (state · emit · trail beats · client) is destructured once at install.
// the Listen surface's layered reading — words, read-state, referents, chapters, span layers
import { projectTranscript } from '../transcript-edit.js';
import { formatTranscript, detectTranscriptChapters, readThroughIndex, segmentsOf, chapterAt, referentRuns } from '../transcript-format.js';

export const installListen = (appCtx) => {
  const { state } = appCtx;
  // ── the Listen surface's layered reading — words, read-state, referents, chapters, span layers ──
  // The interactive transcript is a stack of READINGS over the same timed word stream: the raw hearing,
  // the best-effort prose the pauses punctuate, the figures the words name, the topic chapters, and —
  // for any one word — what is ACTIVE there (its segment, speaker, confidence, referent, chapter). All
  // pure/model-free; transcript-format.js does the shape work, this composes it against the record.

  // The baseline word list the Listen surface reads: the live ASR tail while a clip is still being
  // heard (so a reload / a fresh run shows the partial at once), else the settled `src.words`. Mirrors
  // setListenTranscript's own selection so the two never disagree about which words are on screen.
  const listenBase = (s) => {
    const streaming = !!(s && s._asr && (s._asr.state === 'running' || s._asr.state === 'pending'));
    const live = streaming && (!s.words || !s.words.length) && Array.isArray(s._asr.words) && s._asr.words.length;
    const baseWords = live ? s._asr.words : (Array.isArray(s.words) ? s.words : []);
    return { streaming, live, baseWords };
  };

  // The word→referent map for a clip (transcript-format.referentRuns), memoised on the source by the
  // referent reading and word count. The lexicon is the referent doc's — the LIVE partial reading while a
  // clip is still being heard, the settled NL reading once it lands — so figures light up as they arrive.
  const transcriptReferentMap = (sn) => {
    const s = appCtx.sourceBySn(sn); if (!s) return new Map();
    const { baseWords } = listenBase(s);
    const rd = appCtx.referentDocFor(s);
    const sig = `${rd?.docId || 'none'}·${rd?._through ?? rd?._sig ?? 'x'}·${baseWords.length}`;
    if (!s._refMap || s._refMap.sig !== sig) {
      const words = projectTranscript(baseWords, s.audioEvents || []).words;
      const lex = rd ? appCtx.entityLexicon([rd]) : [];
      s._refMap = { sig, map: referentRuns(words, lex) };
    }
    return s._refMap.map;
  };

  // The transcript's chapters (transcript-format.detectTranscriptChapters), memoised on the source by
  // word count + whether the final transcript has landed. Empty for a short / single-subject clip.
  const transcriptChapters = (sn) => {
    const s = appCtx.sourceBySn(sn); if (!s) return [];
    const { baseWords, streaming } = listenBase(s);
    const sig = `${baseWords.length}·${streaming ? 'live' : 'done'}·${(s.audioEvents || []).length}`;
    if (!s._chapters || s._chapters.sig !== sig) {
      const words = projectTranscript(baseWords, s.audioEvents || []).words;
      const chapters = detectTranscriptChapters(words).map((c) => ({
        ...c, mmss: c.startTime != null ? mmss(c.startTime) : '',
      }));
      s._chapters = { sig, chapters };
    }
    return s._chapters.chapters;
  };

  const mmss = (x) => { const t = Math.max(0, Math.round(x || 0)); const m = Math.floor(t / 60); return `${m}:${String(t % 60).padStart(2, '0')}`; };
  const speakerLabelOf = (s, idx) => {
    if (idx == null) return null;
    const roster = Array.isArray(s?.speakers) ? s.speakers : [];
    const hit = roster.find((r) => r.id === idx);
    return (hit && hit.label) || `Speaker ${idx + 1}`;
  };

  // transcriptView(sn, { format }) → the whole layered reading the Listen surface renders in one call:
  // every word with its display surface (formatted or raw), its clock, whether the reader has SETTLED it
  // (read → black; still-open tail → grey), and the layer fields (referent, speaker, confidence); the
  // display paragraphs; and the detected chapters. `format:false` is the raw stream — the toggle-off.
  const transcriptView = (sn, { format = true } = {}) => {
    const s = appCtx.sourceBySn(sn);
    if (!s) return { words: [], paras: [], chapters: [], readThrough: -1, complete: false, streaming: false, hasReferents: false, referentCount: 0 };
    const { baseWords, streaming } = listenBase(s);
    const proj = projectTranscript(baseWords, streaming && (!s.words || !s.words.length) ? [] : (s.audioEvents || []));
    const words = proj.words;
    const complete = !streaming && words.length > 0;
    const readThrough = complete ? words.length - 1 : readThroughIndex(words);
    const { tokens, paras } = formatTranscript(words, { format });
    const refMap = transcriptReferentMap(sn);
    const refIds = new Set();
    const out = tokens.map((tk) => {
      const i = tk.i, w = words[i] || {}, base = baseWords[i] || {};
      const ref = refMap.get(i) || null;
      if (ref) refIds.add(ref.entId);
      const conf = (typeof base.conf === 'number' && isFinite(base.conf)) ? base.conf : null;
      const acous = (typeof base.acous === 'number' && isFinite(base.acous)) ? base.acous : null;
      const snr = (typeof base.snr === 'number' && isFinite(base.snr)) ? base.snr : null;
      const speaker = Number.isInteger(base.speaker) ? base.speaker : null;
      return {
        i, text: tk.text, raw: w.text, t0: w.start ?? 0, t1: w.end ?? w.start ?? 0,
        read: i <= readThrough, edited: !!w.edited, redacted: !!w.redacted, origText: w.origText ?? null,
        paraStart: tk.paraStart, sentenceStart: tk.sentenceStart, punct: tk.punct,
        ref: !!ref, refHead: !!(ref && ref.head), entId: ref?.entId ?? null, docId: ref?.docId ?? null, refLabel: ref?.label ?? null,
        speaker, conf, acous, snr,
      };
    });
    const chapters = transcriptChapters(sn);
    return { words: out, paras, chapters, readThrough, complete, streaming, hasReferents: refIds.size > 0, referentCount: refIds.size };
  };

  // spanLayers(sn, i) → what is ACTIVE at one word: the clicked-span inspector. Every reading that
  // touches this instant, stacked — the word and its clock, whether the reader has folded it, who said
  // it, how sure the ear was, the breath group it sits in, its chapter, and the figure it names (with a
  // door to that figure's full profile) plus that figure's strongest standing properties.
  const spanLayers = (sn, i) => {
    const s = appCtx.sourceBySn(sn); if (!s) return null;
    const { baseWords, streaming } = listenBase(s);
    const words = projectTranscript(baseWords, streaming && (!s.words || !s.words.length) ? [] : (s.audioEvents || [])).words;
    if (!Number.isInteger(i) || i < 0 || i >= words.length) return null;
    const w = words[i], base = baseWords[i] || {};
    const complete = !streaming && words.length > 0;
    const readThrough = complete ? words.length - 1 : readThroughIndex(words);
    const segs = segmentsOf(words);
    const seg = segs.find((g) => i >= g.startIdx && i <= g.endIdx) || null;
    // A BRIEF span around the clicked word — not the whole breath group. A group collapses into one
    // long run whenever the stream carries no gap-silences (mid-transcription especially), so instead
    // of dumping the run we window it to a short excerpt CENTERED on the word: a few words each side,
    // ellipsed where trimmed, so you see WHERE the word sits, not a wall of text.
    const SPAN_WORDS = 7;
    let segment = null, segText = '';
    if (seg) {
      const lo = Math.max(seg.startIdx, i - SPAN_WORDS);
      const hi = Math.min(seg.endIdx, i + SPAN_WORDS);
      const join = (a, b) => words.slice(a, b).map((x) => x.text).join(' ').trim();
      const before = join(lo, i), after = join(i + 1, hi + 1);
      const lead = lo > seg.startIdx, trail = hi < seg.endIdx;    // trimmed on that side?
      segment = { before, word: w.text, after, lead, trail, t0: words[lo]?.start ?? null };
      segText = `${lead ? '… ' : ''}${before ? before + ' ' : ''}${w.text}${after ? ' ' + after : ''}${trail ? ' …' : ''}`.trim();
    }
    const chapters = transcriptChapters(sn);
    const ch = chapterAt(chapters, i);
    const refMap = transcriptReferentMap(sn);
    const ref = refMap.get(i) || null;
    let refProps = [], refMentions = null;
    if (ref) { try { const prof = appCtx.entityProfile(ref.docId, ref.entId); if (prof) { refProps = (prof.defs || []).slice(0, 3).map((d) => d.value); refMentions = prof.mentionCount; } } catch { /* best-effort */ } }
    const num = (x, dp) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(dp) : null;
    return {
      i, word: w.text, raw: w.origText || w.text, edited: !!w.edited, redacted: !!w.redacted,
      t0: w.start ?? null, t1: w.end ?? null, timeLabel: `${mmss(w.start || 0)}–${mmss(w.end || w.start || 0)}`,
      read: i <= readThrough,
      speaker: Number.isInteger(base.speaker) ? { idx: base.speaker, label: speakerLabelOf(s, base.speaker) } : null,
      conf: num(base.conf, 3), acous: num(base.acous, 3), snr: num(base.snr, 1),
      segmentText: segText, segment, segmentT0: segment ? segment.t0 : null,
      chapter: ch ? { index: ch.index, title: ch.title, mmss: ch.startTime != null ? mmss(ch.startTime) : '' } : null,
      referent: ref ? { entId: ref.entId, docId: ref.docId, label: ref.label, props: refProps, mentions: refMentions } : null,
    };
  };

  Object.assign(appCtx, { spanLayers, transcriptChapters, transcriptView });
};
