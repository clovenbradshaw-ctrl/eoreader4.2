// EO: NUL·SEG(Field → Void, Clearing,Dissecting) — transcript export renderer
// transcript-export.js — turn a heard transcript (the audio organ's doc) into the
// files a listener actually wants to keep: captions (SRT/VTT), the plain prose, and
// the timed structure (paragraphs, sentences, per-word). Plus one that shows the
// WHOLE READING — the first pass, the SEG segmentation, and the SYN unifications the
// ear made — so the transcript is auditable, not just consumed.
//
// Pure, DOM-free, and framework-free: the app dynamically imports it and wraps the
// returned string in a Blob to download; Node tests call the same builders directly.
// It reads only the shape organs/in/audio.js emits — `tokens` (flat, time-ordered
// words with [start,end]), `utterances` (breath groups), `audit` (contested/low-conf
// readings), `readings` (the witnesses), and the raw `log` (the EO operator trace).

// A long enough silence to read as a breath group / paragraph break, in seconds —
// the same PARA_GAP organs/in/audio.js segments on, so paragraphs here match the SEG.
const PARA_GAP = 0.9;

const isNum = (x) => typeof x === 'number' && isFinite(x);
const clampSec = (x) => (isNum(x) && x > 0 ? x : 0);

// A timestamp at MILLISECOND precision — the resolution SRT and WebVTT both specify,
// so keeping the full ms is in-spec, not a stretch of it. SRT wants a comma before
// the millis (00:00:20,000); WebVTT wants a dot (00:00:20.000). Hours are always
// emitted (00:…) — universally accepted by both and by every player that reads them.
const stamp = (seconds, sep) => {
  const ms = Math.max(0, Math.round(clampSec(seconds) * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(s)}${sep}${String(f).padStart(3, '0')}`;
};
export const srtTime = (s) => stamp(s, ',');
export const vttTime = (s) => stamp(s, '.');

// The transcript's flat, time-ordered words — the authoritative per-word list the
// organ keeps (each already carries a filled [start,end]). Falls back to flattening
// the utterances for a doc that only kept those.
const wordsOf = (doc) => {
  if (Array.isArray(doc?.tokens) && doc.tokens.length)
    return doc.tokens.map(t => ({ text: t.text, start: clampSec(t.start), end: clampSec(t.end ?? t.start), conf: t.conf ?? null, relisten: !!t.relisten, unitIdx: t.unitIdx ?? 0 }));
  const out = [];
  (doc?.utterances || []).forEach((u, i) => (u.words || []).forEach(w =>
    out.push({ text: w.text, start: clampSec(w.start ?? u.start), end: clampSec(w.end ?? w.start ?? u.end), conf: w.conf ?? null, relisten: !!w.relisten, unitIdx: i })));
  return out;
};

// The breath groups — one caption cue / one sentence each. Uses the organ's own
// utterances when present, else regroups the flat words on a PARA_GAP pause.
const cuesOf = (doc) => {
  if (Array.isArray(doc?.utterances) && doc.utterances.length) {
    return doc.utterances.map((u, i) => {
      const words = (u.words || []).map(w => ({ text: w.text, start: clampSec(w.start ?? u.start), end: clampSec(w.end ?? w.start ?? u.end) }));
      const text = words.map(w => w.text).join(' ').trim() || String(doc.sentences?.[i] || '').trim();
      return { index: i, start: clampSec(u.start), end: clampSec(u.end), text, words };
    }).filter(c => c.text);
  }
  const cues = []; let cur = null, lastEnd = null;
  for (const w of wordsOf(doc)) {
    if (!cur || (lastEnd != null && w.start - lastEnd >= PARA_GAP)) { cur = { index: cues.length, start: w.start, end: w.end, text: '', words: [] }; cues.push(cur); }
    cur.words.push({ text: w.text, start: w.start, end: w.end }); cur.end = w.end; lastEnd = w.end;
  }
  return cues.map(c => ({ ...c, text: c.words.map(w => w.text).join(' ').trim() })).filter(c => c.text);
};

// Group the breath-group cues into paragraphs on a long pause — the reading's own
// sense of "a new thought starts here", carried straight from the silence.
const parasOf = (doc) => {
  const cues = cuesOf(doc); const paras = []; let cur = null, lastEnd = null;
  for (const c of cues) {
    if (!cur || (lastEnd != null && c.start - lastEnd >= PARA_GAP)) { cur = { start: c.start, end: c.end, sentences: [] }; paras.push(cur); }
    cur.sentences.push(c); cur.end = c.end; lastEnd = c.end;
  }
  return paras.map(p => ({ start: p.start, end: p.end, text: p.sentences.map(s => s.text).join(' '), sentences: p.sentences.map(s => s.text) }));
};

// A doc has a timed transcript to export — audio/video that was heard into words.
export const hasTranscript = (doc) => !!(doc && (
  (Array.isArray(doc.tokens) && doc.tokens.length) ||
  (Array.isArray(doc.utterances) && doc.utterances.some(u => (u.words || []).length))
));

// Shared front matter for the JSON exports — where the reading came from and whose
// hearing it is, so a downloaded file stands on its own.
const head = (doc) => ({
  source: doc?.docId || 'transcript',
  modality: doc?.modality || 'audio',
  duration: isNum(doc?.duration) ? +doc.duration.toFixed(3) : null,
  witness: doc?.witness || null,
  witnesses: (doc?.readings || []).map(r => r.label),
  generatedFrom: 'eoreader4 · audio organ',
});

// ── the caption formats ───────────────────────────────────────────────────────

// SRT — one cue per breath group, millisecond stamps, comma-separated as the format
// specifies. Indices are 1-based; cues never zero-length (end nudged past start).
export const toSrt = (doc) => {
  const cues = cuesOf(doc);
  return cues.map((c, i) => {
    const end = Math.max(c.end, c.start + 0.001);
    return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(end)}\n${c.text}\n`;
  }).join('\n');
};

// WebVTT — the same cues, but with a timestamp on EVERY word: WebVTT cue timestamps
// (<00:00:01.234>) inline before each word are valid, in-spec markup, and give a
// player word-by-word highlighting. The cue still reads as plain text where those
// tags aren't rendered, so it stays a compliant caption file either way.
export const toVtt = (doc) => {
  const cues = cuesOf(doc);
  const body = cues.map((c, i) => {
    const end = Math.max(c.end, c.start + 0.001);
    const line = c.words.length
      ? c.words.map((w, j) => (j === 0 ? '' : '<' + vttTime(w.start) + '>') + w.text).join(' ')
      : c.text;
    return `${i + 1}\n${vttTime(c.start)} --> ${vttTime(end)}\n${line}\n`;
  }).join('\n');
  return `WEBVTT\n\n${body}`;
};

// ── the plain and structured formats ───────────────────────────────────────────

// The prose — paragraphs split on the reading's own pauses. What you paste into a doc.
export const toText = (doc) => parasOf(doc).map(p => p.text).join('\n\n');

// Paragraphs, timed — each thought-group with its [start,end] and its sentences.
export const toParagraphsJson = (doc) => JSON.stringify({
  ...head(doc), unit: 'paragraph',
  paragraphs: parasOf(doc).map(p => ({ start: +p.start.toFixed(3), end: +p.end.toFixed(3), text: p.text, sentences: p.sentences })),
}, null, 2);

// Sentences (breath groups), timed — each with the words that make it up.
export const toSentencesJson = (doc) => JSON.stringify({
  ...head(doc), unit: 'sentence',
  sentences: cuesOf(doc).map(c => ({
    index: c.index, start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text,
    words: c.words.map(w => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })),
  })),
}, null, 2);

// Word-level timestamps — the flat, time-ordered list, a stamp on every word, with
// the ear's confidence and whether a second witness re-heard it kept alongside.
export const toWordsJson = (doc) => JSON.stringify({
  ...head(doc), unit: 'word',
  words: wordsOf(doc).map(w => ({
    text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3),
    ...(isNum(w.conf) ? { conf: +w.conf.toFixed(3) } : {}),
    ...(w.relisten ? { relisten: true } : {}),
  })),
}, null, 2);

// ── the full process — the reading, not just the result ─────────────────────────

// One EO operator, rendered in the log's own compact notation, so the raw trace is
// legible: INS mints a referent, DEF grounds an attribute, EVA flags a contested or
// shaky hearing, CON lays the reading line of time, SYN collapses two surfaces, REC
// deposits the rule the ear learned. This is the vocabulary organs/in/audio.js emits.
const renderOp = (e) => {
  const at = e.sentIdx != null ? ` @u${e.sentIdx}` : '';
  switch (e.op) {
    case 'INS': return `INS   r#${e.id} "${e.label ?? ''}"${at}`;
    case 'DEF': return `DEF   r#${e.id} ${e.key}=${e.value}${at}`;
    case 'EVA': return `EVA   r#${e.id} ${e.reason}${e.value != null ? ' "' + e.value + '"' : ''}${at}`;
    case 'CON': return `CON   r#${e.src} —${e.via || 'then'}→ r#${e.tgt}${at}`;
    case 'SYN': return `SYN   ${e.from} ⇒ ${e.to} (${e.via || 'merge'})`;
    case 'REC': return `REC   unify ${e.token} := ${e.expansion} (${e.via || 'rule'})${e.weight != null ? ' P=' + e.weight : ''}`;
    case 'SEG': return `SEG   ${e.kind || 'segment'}${e.refSeq != null ? ' ref#' + e.refSeq : ''}${e.reason ? ' (' + e.reason + ')' : ''}`;
    default:    return `${e.op}${at}`;
  }
};

// The whole read, as a Markdown document a person can follow: the first pass (the raw
// hearing, breath group by breath group), the SEG (how the stream was cut on silence),
// the EVA (where the witnesses disagreed or the ear was unsure), the SYN (repeated
// words folded to one referent, near-spellings merged), and — appended verbatim — the
// raw EO operator log the transcript was actually built from.
export const toProcessTrace = (doc) => {
  const cues = cuesOf(doc); const paras = parasOf(doc); const words = wordsOf(doc);
  const audit = doc?.audit || {};
  const readings = doc?.readings || [];
  const events = (doc?.log && typeof doc.log.snapshot === 'function') ? doc.log.snapshot() : [];
  const ms = (s) => stamp(s, '.');
  const L = [];

  L.push(`# How this transcript was read`);
  L.push('');
  L.push(`_${doc?.docId || 'transcript'}_ — heard by ${doc?.witness || 'the speech model'}${isNum(doc?.duration) ? `, ${doc.duration.toFixed(1)}s of audio` : ''}.`);
  L.push('');
  L.push(`A transcript is a **reading**, not the objective truth of the waveform. This document shows how the reading was made: the first pass, where the stream was segmented, where it was evaluated, and where surfaces were unified — the same operators the engine folds a novel with.`);
  L.push('');

  // 1 — the witnesses
  L.push(`## The witnesses`);
  if (readings.length) readings.forEach(r => L.push(`- ${r.primary ? '**' + r.label + '** (primary)' : r.label}`));
  else L.push(`- ${doc?.witness || 'primary'}`);
  L.push('');

  // 2 — the first pass, segmented
  L.push(`## The first pass — heard, then cut into breath groups (SEG)`);
  L.push('');
  L.push(`The stream was segmented on silence: a gap of ${PARA_GAP.toFixed(1)}s or more reads as a breath. ${cues.length} breath group${cues.length !== 1 ? 's' : ''} across ${paras.length} paragraph${paras.length !== 1 ? 's' : ''}.`);
  L.push('');
  cues.forEach((c) => {
    L.push(`- \`[${ms(c.start)} → ${ms(c.end)}]\` ${c.text}`);
  });
  L.push('');

  // 3 — the evaluation
  const contested = audit.contested || [];
  L.push(`## Where the reading was evaluated (EVA)`);
  L.push('');
  if (!contested.length && !audit.lowConfidence) {
    L.push(`A single, confident hearing — no contested spans, nothing the ear flagged as shaky. (Turn on “Audit readings” before importing to take a second witness and surface the divergences.)`);
  } else {
    if (audit.lowConfidence) L.push(`- ${audit.lowConfidence} word${audit.lowConfidence !== 1 ? 's' : ''} the ear itself flagged as low-confidence.`);
    contested.forEach(c => {
      const alts = (c.alts || []).map(a => `“${a.surface}” (${a.witness})`).join(', ');
      L.push(`- \`[${ms(c.span?.[0] || 0)}]\` chose “${c.chosen?.surface || ''}” over ${alts}`);
    });
  }
  L.push('');

  // 4 — the unifications
  const syns = events.filter(e => e.op === 'SYN');
  const repeats = (() => {
    const seen = new Map();
    for (const w of words) { const k = (w.text || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''); if (!k) continue; seen.set(k, (seen.get(k) || 0) + 1); }
    return [...seen.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  })();
  L.push(`## What was unified (SYN · REC)`);
  L.push('');
  L.push(`A word said again is the **same referent**, not a new one — its mass accumulates the way every repeated mention does in text.`);
  if (repeats.length) {
    L.push('');
    repeats.slice(0, 20).forEach(([k, n]) => L.push(`- \`${k}\` — heard ${n}×, one referent`));
  }
  if (syns.length) {
    L.push('');
    L.push(`Surfaces the ear proved were one word (acoustic gate / coref):`);
    syns.forEach(e => L.push(`- ${e.from} ⇒ ${e.to} (${e.via || 'heard-same'})`));
  }
  L.push('');

  // 5 — the raw operator log
  L.push(`## The raw operator log`);
  L.push('');
  L.push(`Every event the audio organ appended, in order — the append-only trace the transcript is a projection of.`);
  L.push('');
  L.push('```eot');
  if (events.length) events.forEach(e => L.push(renderOp(e)));
  else {
    // No live log (e.g. a rehydrated doc) — reconstruct the INS/DEF spine from the words.
    words.forEach(w => L.push(`INS   "${w.text}" @[${ms(w.start)}→${ms(w.end)}]`));
  }
  L.push('```');
  L.push('');
  return L.join('\n');
};

// The menu descriptor the UI iterates — id, human label, file extension, MIME, and
// the builder. Order matches the reading's download menu. `copy` is the clipboard
// action (plain transcript text); the rest are file downloads.
export const FORMATS = [
  { id: 'srt',   label: 'SRT caption',                    ext: 'srt',  mime: 'text/plain;charset=utf-8',   build: toSrt },
  { id: 'vtt',   label: 'VTT caption',                    ext: 'vtt',  mime: 'text/vtt;charset=utf-8',     build: toVtt },
  { id: 'paras', label: 'Paragraphs',                     ext: 'json', mime: 'application/json',           build: toParagraphsJson },
  { id: 'sents', label: 'Sentences',                      ext: 'json', mime: 'application/json',           build: toSentencesJson },
  { id: 'txt',   label: 'Transcript text',                ext: 'txt',  mime: 'text/plain;charset=utf-8',   build: toText },
  { id: 'words', label: 'Word-level timestamps',          ext: 'json', mime: 'application/json',           build: toWordsJson },
  { id: 'proc',  label: 'Full process — pass · SEG · SYN', ext: 'md',   mime: 'text/markdown;charset=utf-8', build: toProcessTrace },
];

// Build one format by id — the single call the UI makes. Returns { text, ext, mime,
// filename } or null for an unknown id / a doc with no transcript.
export const buildFormat = (doc, id, baseName = 'transcript') => {
  const fmt = FORMATS.find(f => f.id === id);
  if (!fmt || !hasTranscript(doc)) return null;
  const safe = String(baseName || 'transcript').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'transcript';
  return { text: fmt.build(doc), ext: fmt.ext, mime: fmt.mime, filename: `${safe}.${fmt.ext}` };
};
