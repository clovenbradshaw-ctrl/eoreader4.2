// EO: INS·CON·EVA(Void → Entity,Link,Lens, Making,Binding,Tracing) — audio-transcription adapter (speech)
// The audio-transcription adapter — a speech model's transcript, onto the spine.
//
// The image adapter ingests a vision model's *already-extracted* detections; this
// is its ear. A speech model (whisper, any — nothing bundled here) has already
// turned the waveform into UTTERANCES of timed WORDS. The DSP, the segmentation,
// the second-witness relisten and the acoustic term-unification all happen in the
// front-end sense organ (transcribe.html) — the cochlea. This adapter takes the
// bare product of that hearing and emits the SAME operators onto the SAME log:
//
//   • each word is an INS of its normalized surface — so "Darcy" said again is the
//     SAME referent, the way every "Gregor" tokenizes to one entity (organs/in/music.js);
//     sightings accumulate γ-mass exactly as repeated mentions do in text;
//   • a CON bonds each word to the next along the READING LINE OF TIME, labelled by
//     the silence between them — `then` when they run on, `pause` across a breath.
//     Adjacency in time is speech's reading order, never a semantic judgement;
//   • a SYN merge is emitted for every unification the ear already made — near
//     spellings the acoustic gate proved one word, coref links the referent
//     unifier proposed — so distinct surfaces collapse to one entity on the spine
//     (the same union-find `read/equivalence.js` runs, supplied here rather than discovered).
//
// What plain text cannot carry, this doc does: every unit keeps its [start,end] in
// seconds, so an EVA event can point at *when* a passage was said, and a caller can
// replay the exact span. Nothing here decides what was meant; the engine's own fold
// reads the transcript the way it reads a novel.

import { createLog }         from '../../core/index.js';
import { projectGraph }      from '../../core/index.js';
import { createConventions } from '../../core/conventions/index.js';
import { tok }               from '../../perceiver/parse/index.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

// A long enough silence to read as a breath group / paragraph break, in seconds.
const PARA_GAP = 0.9;

// Accept either the nested shape the front-end emits ({ utterances:[{words:[…]}] })
// or a flat word list ({ words:[…] }); normalize to utterances of timed words.
const asUtterances = (transcript) => {
  if (Array.isArray(transcript.utterances) && transcript.utterances.length) {
    return transcript.utterances.map(u => ({
      start: u.start ?? (u.words?.[0]?.start ?? 0),
      end:   u.end   ?? (u.words?.[u.words.length - 1]?.end ?? u.start ?? 0),
      words: (u.words || []).map(w => ({ ...w, norm: norm(w.text) })).filter(w => w.norm),
    })).filter(u => u.words.length);
  }
  // Flat words → split into utterances on a long pause.
  const words = (transcript.words || []).map(w => ({ ...w, norm: norm(w.text) })).filter(w => w.norm);
  const utts = [];
  let cur = null, lastEnd = null;
  for (const w of words) {
    if (!cur || (lastEnd != null && (w.start ?? lastEnd) - lastEnd >= PARA_GAP)) {
      cur = { start: w.start ?? 0, end: w.end ?? w.start ?? 0, words: [] };
      utts.push(cur);
    }
    cur.words.push(w);
    cur.end = w.end ?? w.start ?? cur.end;
    lastEnd = cur.end;
  }
  return utts;
};

// A reading's timed words, flattened and normalized — the shape the contest audit reads
// against, whichever witness produced it (utterances of words, or a flat word list).
const flatWords = (reading) => {
  if (!reading) return [];
  if (Array.isArray(reading.words) && reading.words.length)
    return reading.words.map(w => ({ ...w, norm: norm(w.text) })).filter(w => w.norm);
  return asUtterances(reading).flatMap(u => u.words);
};

// The alternate word whose time-span most overlaps [a,b] — the "what did the OTHER witness
// hear at this moment" lookup that makes a divergence auditable. Null when nothing overlaps.
const overlapAt = (words, a, b) => {
  let best = null, bestOv = 0;
  for (const w of words) {
    const ov = Math.min(b, w.end ?? w.start ?? b) - Math.max(a, w.start ?? a);
    if (ov > bestOv) { bestOv = ov; best = w; }
  }
  return best;
};

export const ingestAudio = (transcript = {}) => {
  const {
    name = `audio-${Date.now()}`,
    duration = 0,
    device = null,
    // Unifications the ear already made: near-spelling / coref surface pairs the
    // acoustic gate or the referent unifier proved one word. Emitted as SYN merges.
    merges = [],   // [{ a, b, via?, P? }] — surfaces or normalized forms
    // A transcript is a READING, not the objective truth of the waveform. `witness` labels
    // whose hearing the primary reading is (model + device); `alternates` are OTHER readings
    // of the same audio — a second-pass relisten, a different model — kept so the divergences
    // can be AUDITED rather than silently overwritten. `media` is a playable URL for the clip.
    witness = device ? `whisper · ${device}` : 'primary',
    alternates = [],   // [{ label, words | utterances }] — competing readings of the same audio
    media = null,      // object URL of the decoded clip, so a source can be played back
  } = transcript;

  const utterances = asUtterances(transcript);
  // Every alternate reading, flattened to timed words, for the contest audit below.
  const altReadings = (alternates || []).map((a, i) => ({
    id: `alt-${i}`, label: a.label || `witness ${i + 2}`, words: flatWords(a),
  })).filter(a => a.words.length);

  const log = createLog({ docId: name });
  const units = [];             // one per utterance, the display line
  const sentences = [];         // utterance text, for embeddings / tok
  const timings = [];           // per-utterance [start, end] in seconds
  const tokens = [];            // flat, time-ordered, with id + [start,end]
  const mentions = new Map();

  let prev = null;              // previous word's entity id, to lay the reading line
  let prevEnd = null;
  // The contested moments — where an alternate witness heard a DIFFERENT word at this time.
  // Each is an EVA on the log AND a row here, so the reading can be audited span-by-span.
  const contested = [];         // [{ span:[a,b], unitIdx, chosen, alts:[{surface,witness}] }]

  utterances.forEach((u, unitIdx) => {
    const surfaces = [];
    for (const w of u.words) {
      const id = w.norm;                       // the recurring entity — repeats unify by mass
      const wa = w.start ?? u.start, wb = w.end ?? u.end;
      log.append({ op: 'INS', id, label: w.text, sentIdx: unitIdx });
      mentions.set(id, [...(mentions.get(id) || []), unitIdx]);

      // DEF — the interpretive attributes of THIS reading of the word, so the record carries
      // what plain text drops. A transcript is a hearing, and its provenance is groundable:
      //   • when it was said (the clock every word keeps), so an EVA event can replay the span;
      //   • whose hearing it is (the witness), because the surface is not objective;
      //   • how sure the ear was (acoustic confidence), when the model reported it.
      log.append({ op: 'DEF', id, key: 'time', value: `${wa.toFixed(2)}-${wb.toFixed(2)}`, sentIdx: unitIdx });
      log.append({ op: 'DEF', id, key: 'witness', value: witness, sentIdx: unitIdx });
      if (w.conf != null && isFinite(w.conf)) log.append({ op: 'DEF', id, key: 'conf', value: String(+(+w.conf).toFixed(3)), sentIdx: unitIdx });
      // A word the second witness re-heard is marked, so a reader can see which
      // surfaces the ear corrected — a groundable predicate, not a judgement.
      if (w.relisten) log.append({ op: 'DEF', id, key: 'relisten', value: 'true', sentIdx: unitIdx });

      // EVA — the reading is EVALUATED, not taken as given. Two ways a word is contestable:
      //   • a low-confidence hearing the ear itself flagged (a shaky reading), and
      //   • a divergence: another witness heard a different word in this same span.
      // Either raises an EVA on the log and a contested row for the audit surface.
      if (w.conf != null && isFinite(w.conf) && w.conf < 0.5)
        log.append({ op: 'EVA', id, reason: 'low-confidence-reading', value: String(+(+w.conf).toFixed(3)), sentIdx: unitIdx });
      const rivals = [];
      for (const alt of altReadings) {
        const o = overlapAt(alt.words, wa, wb);
        if (o && o.norm && o.norm !== id) rivals.push({ surface: o.text, norm: o.norm, witness: alt.label });
      }
      if (rivals.length) {
        log.append({ op: 'EVA', id, reason: 'contested-reading', value: rivals.map(r => r.surface).join(' | '), sentIdx: unitIdx });
        contested.push({ span: [wa, wb], unitIdx, chosen: { surface: w.text, witness }, alts: rivals });
      }

      // The reading line of time: bond to the previous word, labelled by the gap.
      if (prev && prev !== id) {
        const gap = wa - (prevEnd ?? u.start);
        log.append({ op: 'CON', src: prev, tgt: id, via: gap >= PARA_GAP ? 'pause' : 'then', sentIdx: unitIdx });
      }
      prev = id;
      prevEnd = wb ?? prevEnd;

      surfaces.push(w.text);
      tokens.push({ id, text: w.text, norm: w.norm, start: wa, end: wb, unitIdx, relisten: !!w.relisten, conf: (w.conf != null && isFinite(w.conf)) ? +w.conf : null });
    }
    units.push(`${surfaces.join(' ')} (${u.start.toFixed(1)}s)`);
    sentences.push(surfaces.join(' '));
    timings.push([u.start, u.end]);
  });

  // SYN + REC on every unification. The SYN collapses the surfaces on the spine (union-find,
  // what the engine's fold consumes); the REC records the RULE the ear learned to do it —
  // "these two surfaces are heard the same" — the learned-convention deposit DEF·EVA·REC leaves.
  for (const m of merges) {
    const a = norm(m.a), b = norm(m.b);
    if (a && b && a !== b) {
      log.append({ op: 'SYN', kind: 'merge', from: a, to: b, via: m.via || 'heard-same', sentIdx: 0 });
      log.append({ op: 'REC', kind: 'unify', token: a, expansion: b, via: m.via || 'heard-same', ...(m.P != null ? { weight: m.P } : {}), sentIdx: 0 });
    }
  }

  const tokensBySentence = sentences.map(s => new Set(tok(s)));

  const doc = {
    docId: name, modality: 'audio',
    duration, device, witness,
    units, sentences, timings, tokens, utterances, tokensBySentence,
    log, mentions,
    // A playable handle on the clip, so the source can be heard/watched back with the transcript
    // aligned (the words keep their [start,end]). Null when the caller decoded but kept no URL.
    media,
    // The readings on record — the primary hearing plus every alternate witness — and the
    // contested spans between them. This is the "these are not objective" audit: the surface
    // shown is one reading, and here is where the witnesses disagreed, with what each heard.
    readings: [{ id: 'primary', label: witness, primary: true }, ...altReadings.map(a => ({ id: a.id, label: a.label, primary: false }))],
    audit: {
      witness, witnessCount: 1 + altReadings.length,
      contested,                                  // span-by-span divergences, for a UI to walk
      contestedCount: contested.length,
      lowConfidence: tokens.filter(t => t.conf != null && t.conf < 0.5).length,
    },
    // The contested readings overlapping time t — what a "audit this moment" click resolves to.
    contestedAt: (t) => contested.filter(c => t >= c.span[0] - 0.05 && t <= c.span[1] + 0.05),
    conventions: createConventions(),
    // The universal contract's metadata slot (organs/in: every doc carries one). A
    // clip's front matter is its container tags (title, speaker, date) plus the
    // pipeline that heard it — passed in by the caller; the waveform carries none.
    metadata: transcript.metadata || {},
    projectGraph: (frame = {}) => projectGraph(log, frame),
  };

  // Temporal grounding: the utterance sounding at time t, and the words in a window.
  // This is what an EVA event points at when it wants to replay a passage.
  doc.utteranceAt = (t) => {
    for (let i = 0; i < timings.length; i++) if (t >= timings[i][0] - 0.05 && t <= timings[i][1] + 0.05) return i;
    return -1;
  };
  doc.wordsInWindow = (a, b) => tokens.filter(w => w.end > a && w.start < b);

  // Cached per embedder organ — hash-space and MiniLM-space vectors are not
  // interchangeable, so a single unkeyed cache would return the wrong space to a
  // later caller (see organs/in/text.js).
  const vecByOrgan = new Map();
  doc.sentenceEmbeddings = async (embedder) => {
    const key = embedder?.id || 'default';
    if (!vecByOrgan.has(key)) vecByOrgan.set(key, Promise.all(sentences.map(s => embedder.embed(s))));
    return vecByOrgan.get(key);
  };

  return doc;
};
