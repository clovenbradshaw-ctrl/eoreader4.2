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

// A speaker index off a word/token, or null — Number.isInteger so 0 (Speaker 1) is kept.
const spk = (w) => (Number.isInteger(w?.speaker) ? w.speaker : null);

// The transcript's flat, time-ordered words — the authoritative per-word list the
// organ keeps (each already carries a filled [start,end]). Carries WHO said it (speaker)
// and the waveform witnesses (conf/acous/snr) when present. Falls back to flattening the
// utterances for a doc that only kept those.
const wordsOf = (doc) => {
  const one = (w, u, i) => ({
    text: w.text, start: clampSec(w.start ?? u?.start), end: clampSec(w.end ?? w.start ?? u?.end),
    conf: w.conf ?? null, acous: w.acous ?? null, snr: w.snr ?? null,
    speaker: spk(w), relisten: !!w.relisten, unitIdx: w.unitIdx ?? i ?? 0,
  });
  if (Array.isArray(doc?.tokens) && doc.tokens.length)
    return doc.tokens.map((t, i) => one(t, null, t.unitIdx ?? i));
  const out = [];
  (doc?.utterances || []).forEach((u, i) => (u.words || []).forEach(w => out.push(one(w, u, i))));
  return out;
};

// Is this transcript diarized into MORE THAN ONE speaker? (Only then do captions/prose carry a
// speaker label — a single-speaker clip stays clean.)
const isMultiSpeaker = (doc) => {
  if (Array.isArray(doc?.speakers) && doc.speakers.length > 1) return true;
  const seen = new Set();
  for (const w of wordsOf(doc)) if (w.speaker != null) { seen.add(w.speaker); if (seen.size > 1) return true; }
  return false;
};

// The label for a speaker index — the roster's name when the reading kept one, else "Speaker N".
const speakerLabel = (doc, idx) => {
  if (idx == null) return null;
  const roster = Array.isArray(doc?.speakers) ? doc.speakers : [];
  const hit = roster.find(s => s.id === idx);
  return (hit && hit.label) || `Speaker ${idx + 1}`;
};

// The speaker a run of words belongs to — the one that holds the most of them (a cue can straddle a
// change; the majority owns the caption). Null when none of the words carry a speaker.
const dominantSpeaker = (words) => {
  const tally = new Map();
  for (const w of words) if (w.speaker != null) tally.set(w.speaker, (tally.get(w.speaker) || 0) + 1);
  if (!tally.size) return null;
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};

// The breath groups — one caption cue / one sentence each. Uses the organ's own
// utterances when present, else regroups the flat words on a PARA_GAP pause OR a speaker
// change (a caption never straddles two voices). Each cue carries its dominant `speaker`.
const cuesOf = (doc) => {
  if (Array.isArray(doc?.utterances) && doc.utterances.length) {
    return doc.utterances.map((u, i) => {
      const words = (u.words || []).map(w => ({ text: w.text, start: clampSec(w.start ?? u.start), end: clampSec(w.end ?? w.start ?? u.end), speaker: spk(w) }));
      const text = words.map(w => w.text).join(' ').trim() || String(doc.sentences?.[i] || '').trim();
      const speaker = Number.isInteger(u.speaker) ? u.speaker : dominantSpeaker(words);
      return { index: i, start: clampSec(u.start), end: clampSec(u.end), text, words, speaker };
    }).filter(c => c.text);
  }
  const cues = []; let cur = null, lastEnd = null, lastSpk = null;
  for (const w of wordsOf(doc)) {
    const changed = w.speaker != null && lastSpk != null && w.speaker !== lastSpk;
    if (!cur || changed || (lastEnd != null && w.start - lastEnd >= PARA_GAP)) { cur = { index: cues.length, start: w.start, end: w.end, text: '', words: [] }; cues.push(cur); }
    cur.words.push({ text: w.text, start: w.start, end: w.end, speaker: w.speaker }); cur.end = w.end; lastEnd = w.end; lastSpk = w.speaker;
  }
  return cues.map(c => ({ ...c, text: c.words.map(w => w.text).join(' ').trim(), speaker: dominantSpeaker(c.words) })).filter(c => c.text);
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
  // WHO is speaking — the roster the diarization separated from the waveform (voices.js), each with
  // its measured pitch/formants as evidence. Present only when the reading found speakers.
  ...(Array.isArray(doc?.speakers) && doc.speakers.length ? { speakers: doc.speakers } : {}),
  generatedFrom: 'eoreader4 · audio organ',
});

// ── the caption formats ───────────────────────────────────────────────────────

// SRT — one cue per breath group, millisecond stamps, comma-separated as the format
// specifies. Indices are 1-based; cues never zero-length (end nudged past start). When the
// clip is diarized into more than one voice, each cue is prefixed with its speaker — the
// "Speaker 1: …" convention players render inline.
export const toSrt = (doc) => {
  const cues = cuesOf(doc);
  const multi = isMultiSpeaker(doc);
  return cues.map((c, i) => {
    const end = Math.max(c.end, c.start + 0.001);
    const label = multi && c.speaker != null ? `${speakerLabel(doc, c.speaker)}: ` : '';
    return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(end)}\n${label}${c.text}\n`;
  }).join('\n');
};

// WebVTT — the same cues, with a timestamp on EVERY word (valid inline cue timestamps for
// word-by-word highlighting) and, when diarized, a proper WebVTT <v Speaker N> VOICE TAG so a
// player can style and attribute each turn. The cue still reads as plain text where the tags
// aren't rendered, so it stays a compliant caption file either way.
export const toVtt = (doc) => {
  const cues = cuesOf(doc);
  const multi = isMultiSpeaker(doc);
  const body = cues.map((c, i) => {
    const end = Math.max(c.end, c.start + 0.001);
    const inner = c.words.length
      ? c.words.map((w, j) => (j === 0 ? '' : '<' + vttTime(w.start) + '>') + w.text).join(' ')
      : c.text;
    const line = multi && c.speaker != null ? `<v ${speakerLabel(doc, c.speaker)}>${inner}` : inner;
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

// Sentences (breath groups), timed — each with its speaker and the words that make it up.
export const toSentencesJson = (doc) => JSON.stringify({
  ...head(doc), unit: 'sentence',
  sentences: cuesOf(doc).map(c => ({
    index: c.index, start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text,
    ...(c.speaker != null ? { speaker: c.speaker, speakerLabel: speakerLabel(doc, c.speaker) } : {}),
    words: c.words.map(w => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) })),
  })),
}, null, 2);

// Word-level timestamps — the flat, time-ordered list, a stamp on every word, with WHO said it
// (speaker) and the waveform witnesses kept alongside: the model's confidence, the acoustic
// confidence read off the waveform, the SNR over the room, and whether a second witness re-heard it.
export const toWordsJson = (doc) => JSON.stringify({
  ...head(doc), unit: 'word',
  words: wordsOf(doc).map(w => ({
    text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3),
    ...(w.speaker != null ? { speaker: w.speaker } : {}),
    ...(isNum(w.conf) ? { conf: +w.conf.toFixed(3) } : {}),
    ...(isNum(w.acous) ? { acous: +w.acous.toFixed(3) } : {}),
    ...(isNum(w.snr) ? { snr: +w.snr.toFixed(2) } : {}),
    ...(w.relisten ? { relisten: true } : {}),
  })),
}, null, 2);

// ── the elegant transcript — read by turns ─────────────────────────────────────────────────
// A speaker-turn transcript a person actually wants to read: consecutive cues by the same voice are
// gathered into one TURN, headed by the speaker and the time it began, the prose flowing beneath.
// When the clip is one voice (or undiarized) it degrades to timestamped paragraphs — still elegant.
export const toElegantText = (doc) => {
  const cues = cuesOf(doc);
  if (!cues.length) return '';
  const multi = isMultiSpeaker(doc);
  const mmss = (s) => { const t = Math.max(0, Math.round(s)); const m = Math.floor(t / 60); return `${m}:${String(t % 60).padStart(2, '0')}`; };
  const out = [];
  if (!multi) {
    // No speakers — paragraphs on the reading's own pauses, each stamped with when it began.
    for (const p of parasOf(doc)) out.push(`[${mmss(p.start)}]  ${p.text}`);
    return out.join('\n\n');
  }
  // Gather consecutive same-speaker cues into turns.
  let turn = null;
  const turns = [];
  for (const c of cues) {
    if (!turn || c.speaker !== turn.speaker) { turn = { speaker: c.speaker, start: c.start, parts: [] }; turns.push(turn); }
    turn.parts.push(c.text);
  }
  for (const t of turns) out.push(`${speakerLabel(doc, t.speaker)}  ·  ${mmss(t.start)}\n${t.parts.join(' ')}`);
  return out.join('\n\n');
};

// ── the full processing record — everything, as it was read ─────────────────────────────────
// One JSON that carries the WHOLE reading: the front matter and speaker roster, the acoustic
// analysis and coverage, the diarization's auditable merge/keep trail (each decision with its JS
// cost and ΔBIC margin), the paragraphs and the speaker-tagged sentences, and every word with its
// timings, speaker and waveform witnesses. This is "all the ways it was processed", in one file.
export const toFullJson = (doc) => JSON.stringify({
  ...head(doc),
  analysis: doc?.analysis || doc?.audioMeta || null,
  coverage: doc?.coverage || null,
  audit: doc?.audit ? { witness: doc.audit.witness, witnessCount: doc.audit.witnessCount, contestedCount: doc.audit.contestedCount, lowConfidence: doc.audit.lowConfidence } : null,
  // The diarization reading itself — the pre-neural, information-theoretic trail: how each merge was
  // ordered (Jensen–Shannon) and gated (ΔBIC model selection), so the speaker cut re-runs to the number.
  diarization: Array.isArray(doc?.diarizeWitnesses) && doc.diarizeWitnesses.length
    ? { method: 'ib-ordered · dbic-gated', decisions: doc.diarizeWitnesses }
    : null,
  paragraphs: parasOf(doc).map(p => ({ start: +p.start.toFixed(3), end: +p.end.toFixed(3), text: p.text })),
  sentences: cuesOf(doc).map(c => ({
    index: c.index, start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text,
    ...(c.speaker != null ? { speaker: c.speaker } : {}),
  })),
  words: wordsOf(doc).map(w => ({
    text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3),
    ...(w.speaker != null ? { speaker: w.speaker } : {}),
    ...(isNum(w.conf) ? { conf: +w.conf.toFixed(3) } : {}),
    ...(isNum(w.acous) ? { acous: +w.acous.toFixed(3) } : {}),
    ...(isNum(w.snr) ? { snr: +w.snr.toFixed(2) } : {}),
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

  // 5 — the self-edits: where the reading RE-HEARD a name on its confident spelling
  const revisions = Array.isArray(doc?.revisions) ? doc.revisions
    : events.filter(e => e.op === 'EVA' && e.reason === 'reheard-on-resolution')
             .map(e => ({ from: String(e.value || '').split(' ⇒ ')[0], to: String(e.value || '').split(' ⇒ ')[1], unitIdx: e.sentIdx }));
  L.push(`## What was re-heard on resolution (SEG · INS · SYN)`);
  L.push('');
  if (!revisions.length) {
    L.push(`Nothing. No near-spelling name cleared the noise null — the first reading of every entity was already its most confident, so no span was rewritten.`);
  } else {
    L.push(`The transcript EDITED ITSELF: ${revisions.length} mention${revisions.length !== 1 ? 's' : ''} of a name heard more than one way was folded to the reading the ear was most sure of (acoustic signal × model confidence × how often it was said). Each edit is on the log — the shaky hearing retracted (SEG), the confident one re-minted (INS), the referents merged (SYN) — so nothing is lost, only superseded.`);
    L.push('');
    revisions.forEach(r => L.push(`- “${r.from}” ⇒ **${r.to}**${isNum(r.start) ? ` \`[${ms(r.start)}]\`` : ''}${isNum(r.belief) ? ` _(belief ${(+r.belief).toFixed(2)})_` : ''}`));
  }
  L.push('');

  // 6 — the raw operator log
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
  { id: 'srt',     label: 'SRT caption',                     ext: 'srt',  mime: 'text/plain;charset=utf-8',    build: toSrt },
  { id: 'vtt',     label: 'VTT caption',                     ext: 'vtt',  mime: 'text/vtt;charset=utf-8',      build: toVtt },
  { id: 'elegant', label: 'Elegant transcript — by speaker', ext: 'txt',  mime: 'text/plain;charset=utf-8',    build: toElegantText },
  { id: 'txt',     label: 'Transcript text',                 ext: 'txt',  mime: 'text/plain;charset=utf-8',    build: toText },
  { id: 'paras',   label: 'Paragraphs (JSON)',               ext: 'json', mime: 'application/json',            build: toParagraphsJson },
  { id: 'sents',   label: 'Sentences (JSON)',                ext: 'json', mime: 'application/json',            build: toSentencesJson },
  { id: 'words',   label: 'Word-level timestamps (JSON)',    ext: 'json', mime: 'application/json',            build: toWordsJson },
  { id: 'full',    label: 'Full processing (JSON)',          ext: 'json', mime: 'application/json',            build: toFullJson },
  { id: 'proc',    label: 'Full process — pass · SEG · SYN', ext: 'md',   mime: 'text/markdown;charset=utf-8', build: toProcessTrace },
];

// Build one format by id — the single call the UI makes. Returns { text, ext, mime,
// filename } or null for an unknown id / a doc with no transcript.
export const buildFormat = (doc, id, baseName = 'transcript') => {
  const fmt = FORMATS.find(f => f.id === id);
  if (!fmt || !hasTranscript(doc)) return null;
  const safe = String(baseName || 'transcript').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'transcript';
  return { text: fmt.build(doc), ext: fmt.ext, mime: fmt.mime, filename: `${safe}.${fmt.ext}` };
};
