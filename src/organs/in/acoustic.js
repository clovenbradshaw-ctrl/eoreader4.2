// EO: SEG·INS·CON·DEF·EVA(Field → Entity,Link,Kind,Field, Dissecting,Making,Binding,Tracing) — the pre-transcription cochlea
// The acoustic reading — what the ear hears BEFORE it hears any words.
//
// The audio-transcription adapter (organs/in/audio.js) takes a speech model's finished
// transcript and lays timed WORDS on the spine. But a waveform is a source the instant it
// is decoded — long before whisper has said a thing. This module is the reading that lands
// AT ONCE: the raw envelope (a drawable waveform), the basic acoustic facts (duration, peak,
// loudness, dynamic range, silence), and — the load-bearing part — the SEPARATION OF SIGNAL
// FROM NOISE as NESTED HOLONS.
//
// A holon here is a stretch of time whole at its own scale (Koestler, docs/holons.md): the
// whole clip is a holon; inside it, runs above the noise floor are SIGNAL holons and runs
// below are NOISE holons; inside a signal holon, a higher local floor finds the louder
// bursts nested within — and so on, a few levels deep. Each holon carries its own energy,
// its own bounds, and its own children, and the separation is written onto the append-only
// log as EVA events (this span is signal / this span is noise), so it is AUDITABLE, not a
// silent gate. Transcription then runs "if necessary" — only when there is signal to hear,
// and only over the windows a signal holon actually covers (import-file.js).
//
// Everything here is PURE — Float32 PCM in, plain objects out, no browser API — so the
// cochlea's reading is pinned by a browserless test the same way every other organ is.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';
import { attachReading }     from '../ingest/index.js';

// mm:ss(.d) for a time in seconds — the reader's clock on the waveform.
const clock = (sec) => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${(rem < 10 ? '0' : '') + rem.toFixed(1)}`;
};

// dBFS of a linear amplitude in [0,1]. Silence (0) has no dB; we floor it at a finite
// −120 so the number is always renderable, and mark true silence separately.
const DB_FLOOR = -120;
export const toDb = (lin) => (lin > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(lin)) : DB_FLOOR);

// The value at fraction q of a sorted-ascending copy — a percentile with no interpolation
// fuss (nearest-rank), enough to place a noise floor robustly against outliers.
const percentile = (sortedAsc, q) => {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.max(0, Math.round(q * (sortedAsc.length - 1))));
  return sortedAsc[i];
};

// ── the drawable envelope ──────────────────────────────────────────────────────────────
// Downsample the waveform to `buckets` columns, each carrying the min, max and RMS of the
// samples it spans. A UI draws bars from `amp` (the louder of |min|,|max|), and can tint
// each column by whether the holon separation calls that moment signal or noise.
export const waveformPeaks = (mono, buckets = 800) => {
  const n = mono?.length || 0;
  if (!n) return [];
  const cols = Math.max(1, Math.min(buckets, n));
  const per = n / cols;
  const out = new Array(cols);
  for (let c = 0; c < cols; c++) {
    const a = Math.floor(c * per);
    const b = Math.min(n, Math.floor((c + 1) * per));
    let mn = 0, mx = 0, sq = 0, cnt = 0;
    for (let i = a; i < b; i++) {
      const x = mono[i];
      if (x < mn) mn = x;
      if (x > mx) mx = x;
      sq += x * x; cnt++;
    }
    const rms = cnt ? Math.sqrt(sq / cnt) : 0;
    out[c] = { min: mn, max: mx, amp: Math.max(Math.abs(mn), Math.abs(mx)), rms };
  }
  return out;
};

// ── the per-frame energy track (the raw material of the separation) ──────────────────────
// One RMS per short frame (default 20 ms). Everything below reads this track, never the
// samples again, so the segmentation is cheap and deterministic.
export const frameEnergies = (mono, sampleRate, frameMs = 20) => {
  const n = mono?.length || 0;
  const frameLen = Math.max(1, Math.round((frameMs / 1000) * sampleRate));
  const frames = Math.max(1, Math.ceil(n / frameLen));
  const rms = new Float64Array(frames);
  const times = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    const a = f * frameLen, b = Math.min(n, a + frameLen);
    let sq = 0;
    for (let i = a; i < b; i++) sq += mono[i] * mono[i];
    rms[f] = b > a ? Math.sqrt(sq / (b - a)) : 0;
    times[f] = a / sampleRate;
  }
  return { rms, times, frameDur: frameLen / sampleRate, frameLen };
};

// ── the basic analysis (what a listener asks first) ──────────────────────────────────────
export const analyzeAudio = (mono, sampleRate) => {
  const n = mono?.length || 0;
  const duration = n / sampleRate;
  let peak = 0, sq = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) peak = a;
    sq += mono[i] * mono[i];
    if (a >= 0.999) clipped++;
  }
  const rms = n ? Math.sqrt(sq / n) : 0;
  const { rms: fr } = frameEnergies(mono, sampleRate);
  const sorted = Array.from(fr).sort((x, y) => x - y);
  const floorLin = percentile(sorted, 0.15);   // the quiet-frame level ≈ the noise floor
  const loudLin  = percentile(sorted, 0.95);
  // A frame is silence if it sits within a hair of the floor (and near-zero absolutely).
  const silenceCut = Math.max(floorLin * 1.5, 1e-4);
  let silentFrames = 0;
  for (let i = 0; i < fr.length; i++) if (fr[i] <= silenceCut) silentFrames++;
  return {
    sampleRate,
    samples: n,
    duration,
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    crest: rms > 0 ? peak / rms : 0,
    clippingPct: n ? (clipped / n) * 100 : 0,
    noiseFloorDb: toDb(floorLin),
    loudDb: toDb(loudLin),
    dynamicRangeDb: toDb(loudLin) - toDb(floorLin),
    silencePct: fr.length ? (silentFrames / fr.length) * 100 : 0,
  };
};

// Merge a per-frame signal/noise flag array into contiguous [start,end] runs, each with the
// mean energy over its frames. This is the segmentation proper — the moment noise is told
// from signal — expressed as time spans, not frame indices.
const runsFromFlags = (flags, energies, times, frameDur) => {
  const runs = [];
  let i = 0;
  while (i < flags.length) {
    const kind = flags[i] ? 'signal' : 'noise';
    let j = i, sq = 0, cnt = 0, mx = 0;
    while (j < flags.length && flags[j] === flags[i]) {
      const e = energies[j]; sq += e * e; mx = Math.max(mx, e); cnt++; j++;
    }
    const start = times[i];
    const end = (j < times.length ? times[j] : times[times.length - 1] + frameDur);
    runs.push({ kind, start, end, dur: end - start, rms: cnt ? Math.sqrt(sq / cnt) : 0, peak: mx });
    i = j;
  }
  return runs;
};

// Flag frames in [a,b) as signal when their RMS clears `thresholdLin`.
const flagWindow = (energies, times, a, b, thresholdLin) => {
  const flags = [];
  const eWin = [], tWin = [];
  for (let f = 0; f < energies.length; f++) {
    if (times[f] < a - 1e-9 || times[f] >= b - 1e-9) continue;
    flags.push(energies[f] > thresholdLin ? 1 : 0);
    eWin.push(energies[f]); tWin.push(times[f]);
  }
  return { flags, eWin, tWin };
};

// The threshold that separates signal from noise INSIDE a window — its own 20th-percentile
// floor lifted by `marginDb`, never below a hard absolute floor. Computing it per window is
// what makes the holons NEST: a phrase-level signal holon re-reads its own quiet level, so
// the louder syllables inside it rise as sub-holons.
const windowThreshold = (eWin, marginDb, absFloorLin) => {
  const sorted = eWin.slice().sort((x, y) => x - y);
  const floorLin = percentile(sorted, 0.2);
  const lifted = floorLin * Math.pow(10, marginDb / 20);
  return Math.max(lifted, absFloorLin);
};

// ── the nested holons ────────────────────────────────────────────────────────────────────
// separateHolons(mono, SR, opts) → the whole clip as ONE holon whose children alternate
// signal / noise, each signal child recursively holding its own louder bursts.
//
// opts: { frameMs, marginDb, minDur, maxDepth, absFloorDb }
export const separateHolons = (mono, sampleRate, opts = {}) => {
  const {
    frameMs = 20,        // energy-frame length
    marginDb = 6,        // how far above the local floor a frame must sit to count as signal
    minDur = 0.2,        // a holon shorter than this is a leaf (no further nesting)
    maxDepth = 3,        // deepest nesting the ear resolves
    absFloorDb = -55,    // nothing below this absolute dBFS is ever called signal
  } = opts;

  const { rms: energies, times, frameDur } = frameEnergies(mono, sampleRate, frameMs);
  const duration = (mono?.length || 0) / sampleRate;
  const absFloorLin = Math.pow(10, absFloorDb / 20);

  let idCounter = 0;
  const nextId = () => `h${idCounter++}`;

  // Build the children of a window [a,b) at `depth`. Returns [] when it should not subdivide.
  const build = (a, b, depth) => {
    if (depth >= maxDepth || (b - a) < minDur * 2) return [];
    const { flags, eWin, tWin } = flagWindow(energies, times, a, b, 0);
    if (eWin.length < 2) return [];
    const thr = windowThreshold(eWin, marginDb, absFloorLin);
    // Re-flag against the derived threshold.
    for (let i = 0; i < eWin.length; i++) flags[i] = eWin[i] > thr ? 1 : 0;
    let runs = runsFromFlags(flags, eWin, tWin, frameDur);
    // Discard hair-thin runs by folding them into the neighbour, so a single loud frame in a
    // silence (or one dropout in a phrase) does not shatter the reading into noise.
    runs = coalesce(runs, minDur);
    // A window that comes back as ONE run is not subdividing — refuse to recurse forever.
    if (runs.length <= 1) return [];
    return runs.map((r) => {
      const kids = r.kind === 'signal' ? build(r.start, r.end, depth + 1) : [];
      return holon(r.kind, r.start, r.end, r.rms, r.peak, kids);
    });
  };

  const holon = (kind, start, end, rms, peak, children) => ({
    id: nextId(), kind, start, end, dur: end - start,
    rms, db: toDb(rms), peakDb: toDb(peak),
    children,
  });

  const children = build(0, duration, 0);
  const root = {
    id: nextId(), kind: 'root', start: 0, end: duration, dur: duration,
    rms: 0, db: null, peakDb: null, children,
  };
  // Root RMS is the whole-clip level (from the frame track), for completeness.
  {
    let sq = 0; for (let i = 0; i < energies.length; i++) sq += energies[i] * energies[i];
    root.rms = energies.length ? Math.sqrt(sq / energies.length) : 0;
    root.db = toDb(root.rms);
  }

  // The top-level signal spans — the answer to "is there anything to transcribe, and where".
  const signalSpans = children.filter((c) => c.kind === 'signal').map((c) => ({ start: c.start, end: c.end, dur: c.dur, rms: c.rms, db: c.db }));
  const noiseSpans  = children.filter((c) => c.kind === 'noise').map((c)  => ({ start: c.start, end: c.end, dur: c.dur }));
  const signalSeconds = signalSpans.reduce((s, c) => s + c.dur, 0);
  const noiseSeconds  = noiseSpans.reduce((s, c) => s + c.dur, 0);

  let count = 0, deepest = 0;
  const walk = (h, d) => { count++; deepest = Math.max(deepest, d); (h.children || []).forEach((k) => walk(k, d + 1)); };
  (children || []).forEach((c) => walk(c, 1));

  return {
    root, signalSpans, noiseSpans,
    signalSeconds, noiseSeconds,
    signalRatio: duration > 0 ? signalSeconds / duration : 0,
    count, depth: deepest,
    marginDb, absFloorDb, frameMs,
  };
};

// Fold runs shorter than `minDur` into the neighbour they most resemble, so the segmentation
// reads phrases, not frame flicker. A short run merges with whichever adjacent run is longer
// (or the only neighbour). Iterated to a fixed point.
const coalesce = (runs, minDur) => {
  if (runs.length <= 1) return runs;
  let cur = runs.map((r) => ({ ...r }));
  let changed = true;
  while (changed && cur.length > 1) {
    changed = false;
    let idx = -1;
    for (let i = 0; i < cur.length; i++) if (cur[i].dur < minDur) { idx = i; break; }
    if (idx < 0) break;
    const left = cur[idx - 1], right = cur[idx + 1];
    // Merge the short run rightward by default; leftward if there is no right neighbour or the
    // left neighbour is the longer of the two.
    const into = (!right || (left && left.dur >= right.dur)) ? left : right;
    if (!into) break;
    const merged = mergeRun(into, cur[idx]);
    if (into === left) { cur.splice(idx - 1, 2, merged); }
    else { cur.splice(idx, 2, merged); }
    changed = true;
  }
  return cur;
};

const mergeRun = (a, b) => {
  const start = Math.min(a.start, b.start), end = Math.max(a.end, b.end);
  const dur = end - start;
  // Energy-weighted RMS, and the kind of whichever contributed more duration.
  const rms = dur > 0 ? Math.sqrt((a.rms * a.rms * a.dur + b.rms * b.rms * b.dur) / dur) : Math.max(a.rms, b.rms);
  const kind = a.dur >= b.dur ? a.kind : b.kind;
  return { kind, start, end, dur, rms, peak: Math.max(a.peak || 0, b.peak || 0) };
};

// ── the human-readable reading (the source's text before any transcript) ─────────────────
export const acousticSummary = ({ title = 'Audio', analysis, holons, mediaKind = 'audio' }) => {
  const a = analysis || {};
  const h = holons || {};
  const L = [];
  L.push(`# ${title}`);
  L.push('');
  const kindWord = mediaKind === 'video' ? 'A video clip' : 'An audio clip';
  L.push(`${kindWord} of **${clock(a.duration || 0)}** (${(a.duration || 0).toFixed(1)}s), decoded to mono ${(a.sampleRate || 0).toLocaleString()} Hz — read here as sound before a word of it is transcribed.`);
  L.push('');
  L.push('## What the waveform is');
  L.push(`- **Duration:** ${clock(a.duration || 0)} (${(a.duration || 0).toFixed(1)}s)`);
  L.push(`- **Peak:** ${fmtDb(a.peakDb)}${a.clippingPct > 0.1 ? ` — clipping on ${a.clippingPct.toFixed(1)}% of samples` : ''}`);
  L.push(`- **Loudness (RMS):** ${fmtDb(a.rmsDb)}`);
  L.push(`- **Noise floor:** ${fmtDb(a.noiseFloorDb)}`);
  L.push(`- **Dynamic range:** ${(a.dynamicRangeDb || 0).toFixed(1)} dB`);
  L.push(`- **Silence:** ${(a.silencePct || 0).toFixed(0)}% of the clip sits at the floor`);
  L.push('');
  L.push('## Signal separated from noise');
  const sig = h.signalSpans || [];
  if (!sig.length) {
    L.push('The ear finds **no signal above the noise floor** — the clip reads as silence or steady noise, so there is nothing to transcribe.');
  } else {
    L.push(`The clip separates into **${sig.length} signal holon${sig.length === 1 ? '' : 's'}** totalling **${clock(h.signalSeconds || 0)}** (${Math.round((h.signalRatio || 0) * 100)}% of the clip), nested ${h.depth || 1} level${(h.depth || 1) === 1 ? '' : 's'} deep, against ${(h.noiseSpans || []).length} stretch${(h.noiseSpans || []).length === 1 ? '' : 'es'} of noise/silence.`);
    L.push('');
    for (let i = 0; i < sig.length; i++) {
      const s = sig[i];
      L.push(`- **Signal ${i + 1}** — ${clock(s.start)}–${clock(s.end)} (${s.dur.toFixed(1)}s, ${fmtDb(s.db)})`);
    }
  }
  return L.join('\n');
};

const fmtDb = (db) => (db == null || db <= DB_FLOOR ? '−∞ dB' : `${db.toFixed(1)} dB`);

// ── raise the reading onto the spine ─────────────────────────────────────────────────────
// ingestAcoustic({...}) → a doc on the universal organs/in contract: the nested holons AS
// entities on an append-only log, so the source exists, reads, and encodes into EoT the
// instant it is decoded — no transcript required. Each holon is an INS; its kind, clock and
// level are DEFs; the signal/noise verdict is an EVA (the separation, made auditable); a CON
// bonds each holon to the one after it (the reading line of time) and to the sub-holons it
// contains. A word is a holon; so is a phrase of sound.
export const ingestAcoustic = (spec = {}) => {
  const {
    name = `audio-${Date.now()}`,
    title = name,
    duration = 0,
    sampleRate = 16000,
    analysis = null,
    holons = null,
    peaks = null,
    media = null,
    mediaKind = 'audio',
    metadata = {},
  } = spec;

  const log = createLog({ docId: name });
  const units = [];        // one display line per top-level holon
  const sentences = [];
  const mentions = new Map();

  const h = holons || { root: { children: [] }, signalSpans: [], noiseSpans: [] };
  const top = (h.root && h.root.children) || [];

  let unitIdx = 0;
  let prevTopId = null;
  const emitHolon = (node, parentId, level, di) => {
    const id = node.id;
    const label = node.kind === 'signal'
      ? `signal ${clock(node.start)}–${clock(node.end)}`
      : `${node.dur >= 0.6 ? 'silence' : 'gap'} ${clock(node.start)}–${clock(node.end)}`;
    log.append({ op: 'INS', id, label, sentIdx: di });
    mentions.set(id, [...(mentions.get(id) || []), di]);
    log.append({ op: 'DEF', id, key: 'kind', value: node.kind, sentIdx: di });
    log.append({ op: 'DEF', id, key: 'time', value: `${node.start.toFixed(2)}-${node.end.toFixed(2)}`, sentIdx: di });
    log.append({ op: 'DEF', id, key: 'level', value: String(level), sentIdx: di });
    if (node.db != null) log.append({ op: 'DEF', id, key: 'db', value: node.db.toFixed(1), sentIdx: di });
    // The separation itself — an EVALUATION of the span against the floor, on the record.
    log.append({
      op: 'EVA', id,
      reason: node.kind === 'signal' ? 'signal-above-floor' : 'noise-below-floor',
      value: node.db != null ? `${node.db.toFixed(1)} dB` : 'silence',
      sentIdx: di,
    });
    // Containment: the parent holon holds this one.
    if (parentId) log.append({ op: 'CON', src: parentId, tgt: id, via: 'contains', sentIdx: di });
    for (const kid of (node.children || [])) emitHolon(kid, id, level + 1, di);
    return id;
  };

  top.forEach((node) => {
    const di = unitIdx++;
    const id = emitHolon(node, null, 1, di);
    // The reading line of time across the top-level holons.
    if (prevTopId) log.append({ op: 'CON', src: prevTopId, tgt: id, via: node.kind === 'signal' ? 'then' : 'pause', sentIdx: di });
    prevTopId = id;
    const line = node.kind === 'signal'
      ? `Signal ${clock(node.start)}–${clock(node.end)} (${node.dur.toFixed(1)}s${node.db != null ? `, ${node.db.toFixed(1)} dB` : ''})`
      : `Silence ${clock(node.start)}–${clock(node.end)} (${node.dur.toFixed(1)}s)`;
    units.push(line);
    sentences.push(line);
  });

  if (!units.length) { units.push(`Silence — ${clock(duration)} of no signal above the noise floor`); sentences.push(units[0]); }

  const tokensBySentence = sentences.map((s) => new Set(tok(s)));
  const text = acousticSummary({ title, analysis, holons: h, mediaKind });

  const doc = {
    docId: name, modality: 'audio',
    duration, sampleRate, device: null,
    units, sentences, tokensBySentence,
    log, mentions,
    // The pre-transcription reading's artefacts, kept on the doc so a viewer can draw the
    // waveform, tint it by the holon separation, and play the clip back.
    text,
    media, mediaKind,
    peaks: peaks || null,
    analysis: analysis || null,
    holons: h,
    transcribed: false,
    conventions: createConventions(),
    metadata: { title, ...metadata },
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  attachReading(doc);

  // Which top-level holon (or none) sounds at time t — the "what is happening here" lookup a
  // waveform click resolves to.
  doc.holonAt = (t) => top.find((c) => t >= c.start - 0.02 && t <= c.end + 0.02) || null;

  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map((s) => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
