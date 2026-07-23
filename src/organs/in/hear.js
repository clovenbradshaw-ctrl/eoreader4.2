// EO: EVA·SYN·SEG(Field,Entity → Void,Network, Tracing,Making,Unraveling) — the hearing that edits itself
// The ear's second pass — signal-from-noise, then a self-editing resolution.
//
// FOUR THINGS THIS MODULE HOLDS, from which everything else follows:
//
//   • The WAVEFORM is the truth. The words are a reading of it, not the thing itself.
//   • Every TRANSCRIPTION IS AN ASSERTION — the ear CLAIMS a span is a word; it is not
//     given. So it is defeasible, and it is BELIEVED, never simply recorded as fact.
//   • A heard assertion earns a LOWER DEGREE OF BELIEF than authored text. Someone WROTE
//     "Darcy"; the ear GUESSED it off a pressure wave. Authored text couples at certainty
//     (coupling 1); a transcription couples BELOW a ceiling < 1, and how far below is set
//     by how well the WAVEFORM — the truth — witnesses it (acousticSignal §1), the speech
//     model's own confidence only a weaker second witness (hearingBelief §2a).
//   • What COUNTS as an entity is the READER's call, not this module's. The transcript is
//     text; the reader already knows how to read text into referents (parse/entities.js
//     admission) and how two near-spellings can be one name (parse/fuzzy.js). We reuse
//     exactly that — no bespoke "looks like a name" regex lives here.
//
// So: organs/in/audio.js lands the first reading on the spine as-is, each word an INS
// whose bond to the next couples at its hearing-belief (< 1). A first reading of a name
// is often its worst — the clear, oft-repeated "Darcy" should correct the one-off "Marcy"
// caught under a cough. resolveTranscript does that autonomously, WITHOUT re-asking a model:
//
//   1. acousticSignal — parse the signal from the noise on every word SPAN, from the
//      decoded PCM directly. A word is loud-over-room-tone or it is not; the boundary is
//      the field's OWN derived noise null (the Born rule, voidnull.js), never a chosen dB.
//
//   1b. detectRepetitionLoops — a small speech model's OTHER failure mode: not a
//      mishearing of a word but the decoder getting stuck, re-emitting the same phrase
//      over and over instead of advancing. Repeated TEXT alone cannot be told apart from
//      a person genuinely repeating themselves, so this reads the repeat against the one
//      thing a hallucinated loop cannot fake: its OWN timestamps — judged not against a
//      chosen wpm ceiling but against this SAME recording's OTHER spans (createNoiseFloor
//      again, fed word-rate instead of RMS energy): a decode loop paces its repeat faster,
//      or steadier, than this speaker otherwise ever gets that many words out. Every
//      repeat after the (possibly genuine) first is marked, never deleted — the record
//      keeps what was emitted.
//
//   2. resolveTranscript — the reader reads the transcript into referents (its own
//      admission), near-spelling variants of one name are found by the reader's own fuzzy
//      matcher under mutual-nearest (so a genuinely distinct name is never swallowed), each
//      cluster ELECTS its most-BELIEVED surface (waveform-grounded), and every weaker
//      hearing is RE-HEARD to it: a SEG retracts the shaky INS, a fresh INS re-mints the
//      believed surface at the believed coupling, a SYN·REC folds the referents to one.
//      Nothing is unwritten — the correction lands as data on the same append-only log,
//      and the visible transcript (tokens, sentences, utterances) is reprojected to match.
//
// Pure, DOM-free, framework-free. acousticSignal reads a Float32 PCM buffer; detectRepetitionLoops
// and the resolution read only the shape organs/in/audio.js emits (a doc with `log`, `tokens`,
// `sentences`, `units`). All three are safe to call in Node — the tests drive them directly.

import { createNoiseFloor, MIN_SAMPLES } from '../../core/index.js';
import { parseText, editWithin, fuzzCeiling } from '../../perceiver/parse/index.js';
import { CONVERSATIONAL_CAP } from '../../turn/converse/index.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const isNum = (x) => typeof x === 'number' && isFinite(x);

// A heard assertion is BELIEVED in the engine's own omnimodal currency — the COUPLING
// `w` a bond carries (project.js: "a referent resolved by field rather than by name
// carries a sub-unit weight"). A transcribed word IS a field-resolution — heard off a
// waveform, not read off an authored name — so its bond couples sub-unit for exactly the
// reason a pronoun-resolved bond does, no audio-specific rule required. And the ceiling
// is the engine's existing witness ceiling: CONVERSATIONAL_CAP (turn/converse) — the cap a
// WITNESS earns because it observes and does not author (parse/coref.js). Authored text
// couples at 1; a heard assertion tops out at the witness cap. That IS "lower belief in
// transcription than text," said once, in the channel the whole engine already reads.

// ── 1 · acoustic signal-from-noise, from the waveform itself ────────────────────
//
// The room has a floor of energy — tone, hiss, breath — under everything. A spoken
// word rises above it; silence and noise sit in it. We frame the whole clip, read
// the RMS energy of every frame, and let the field derive its OWN noise null over
// those energies (createNoiseFloor, log scale — energy is positive and heavy-tailed).
// The null lands just above the ambient bulk because the loud speech frames are the
// handful of high outliers the bulk-fit trims. Then each word SPAN is scored against
// that ambient: how far above the room its own energy sits (a normalized 0..1), and
// whether it clears the null at all (signal vs noise — the binary the resolution reads).
//
//   mono   Float32Array of PCM samples in [-1, 1] (one channel).
//   SR     sample rate (Hz).
//   spans  [{ start, end }] in SECONDS — the word timings the transcript keeps.
//   opts.analysis     the pre-transcription cochlea's analyzeAudio (organs/in/acoustic.js) —
//                     when the caller already ran it, we take ITS noiseFloorDb/loudDb as the
//                     room and dynamic range rather than recomputing a second floor.
//   opts.signalSpans  the cochlea's signal holons — when supplied, a word is signal iff it
//                     overlaps one (the SAME separation the transcription gate used), so the
//                     word-level and clip-level readings never disagree about what is noise.
//
// Returns one record per span, index-aligned: { snr (dB over ambient), acous (0..1),
// signal (bool) }. Degrades safely: too little audio to know the floor → every span reads
// acous:null, signal:true (assume nothing, veto nothing).
export const acousticSignal = (mono, SR, spans, { frameMs = 25, hopMs = 10, alpha = 0.05, analysis = null, signalSpans = null } = {}) => {
  const blank = () => spans.map(() => ({ snr: null, acous: null, signal: true }));
  if (!mono || !mono.length || !isNum(SR) || SR <= 0 || !Array.isArray(spans) || !spans.length) return blank();

  const frame = Math.max(1, Math.round((frameMs / 1000) * SR));
  const hop   = Math.max(1, Math.round((hopMs  / 1000) * SR));
  // Per-frame RMS energy across the whole clip, with the frame's centre time.
  const frames = [];
  for (let i = 0; i + frame <= mono.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += mono[j] * mono[j];
    const rms = Math.sqrt(s / frame);
    if (rms > 0) frames.push({ t: (i + frame / 2) / SR, rms });
  }
  if (frames.length < 8) return blank();

  // The room and the dynamic range. Prefer the cochlea's already-measured floor (dB → linear)
  // so we do not derive a second, divergent noise floor over the same waveform; fall back to
  // the low/high bulk of these frames when no analysis was handed in (the standalone path).
  const fromDb = (db) => (isNum(db) ? Math.pow(10, db / 20) : null);
  const sorted = frames.map((f) => f.rms).sort((a, b) => a - b);
  const ambient = Math.max(fromDb(analysis?.noiseFloorDb) ?? sorted[Math.floor(sorted.length * 0.2)], 1e-6);
  const loud    = Math.max(fromDb(analysis?.loudDb) ?? sorted[Math.floor(sorted.length * 0.95)], ambient * 1.0001);
  const range   = Math.log(loud / ambient) || 1;   // for the 0..1 squash

  // The signal test. With the cochlea's holons, a word is signal iff it overlaps one (the same
  // separation the transcription gate read). Without them, derive the noise null over the frame
  // energies here (createNoiseFloor, log scale) and clear a word's own energy against it.
  const overlapsHolon = (a, b) => signalSpans.some((sp) => a < sp.end && b > sp.start);
  let nullLine = null;
  if (!Array.isArray(signalSpans)) {
    const floor = createNoiseFloor({ scale: 'log', alpha });
    for (const f of frames) floor.observe(f.rms);
    nullLine = floor.threshold();
  }

  return spans.map((sp) => {
    const a = isNum(sp.start) ? sp.start : 0;
    const b = Math.max(isNum(sp.end) ? sp.end : a, a);
    let s = 0, n = 0;
    for (const f of frames) if (f.t >= a - 1e-9 && f.t <= b + 1e-9) { s += f.rms; n++; }
    if (!n) {  // a span shorter than the hop — take the nearest frame
      let best = null, bd = Infinity;
      for (const f of frames) { const d = Math.abs(f.t - (a + b) / 2); if (d < bd) { bd = d; best = f; } }
      if (best) { s = best.rms; n = 1; }
    }
    if (!n) return { snr: null, acous: null, signal: true };
    const rms = s / n;
    const snr = 20 * Math.log10(rms / ambient);
    const acous = clamp01(Math.log(Math.max(rms, ambient) / ambient) / range);
    const signal = Array.isArray(signalSpans) ? overlapsHolon(a, b)
      : isFinite(nullLine) ? rms > nullLine : true;
    return { snr: +snr.toFixed(2), acous: +acous.toFixed(4), signal };
  });
};

// ── 1b · repetition-loop detection — prior matches as the prior to fit against ──
//
// A small ASR model (whisper-base most of all) has a documented failure mode distinct
// from mishearing a WORD: on a hard window — padding silence, cross-talk, an ambiguous
// signal — the decoder can get stuck and re-emit the SAME phrase over and over instead
// of advancing. Matching repeated TEXT alone cannot tell that apart from a person
// genuinely repeating themselves ("no, no, no!", a chant, a stutter) — so this reads the
// text against the one thing a hallucinated repeat cannot fake: its OWN timestamps.
//
// The witness is not a chosen words-per-minute ceiling — that would be exactly the
// invented constant acousticSignal (§1) refuses to use for a noise floor. The PRIOR is
// this transcript's OWN other spans: every other same-length run of words elsewhere in
// the SAME recording is a sample of how this speaker, on this recording, actually paces
// that many words. A candidate repeat is flagged only when it does not FIT that prior —
//
//   • its RATE beats what this recording's own other spans would produce by chance —
//     the identical "background vs proposed structure" test acousticSignal runs on RMS
//     energy (createNoiseFloor, log scale), run here on words/second instead; or
//   • its CYCLE-TO-CYCLE spread is steadier than this recording's own spans have ever
//     been for a run this long — a written cadence next to its own spoken baseline.
//
// Both read the SAME recording's prior, never a universal constant, so a naturally fast
// or naturally even speaker is judged against their OWN rhythm, not against ours.
const MAX_NGRAM_LEN = 10;   // the longest phrase checked as a repeating unit
const MIN_REPEATS   = 3;    // fewer than this reads as ordinary emphasis, not a loop

const wStart = (w) => (isNum(w?.start) ? w.start : null);
const wEnd   = (w) => (isNum(w?.end) ? w.end : wStart(w));
const stdev  = (xs) => { if (!xs.length) return 0; const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };

// Every OTHER non-overlapping `len`-word window in the flat stream, outside the
// candidate's own [skipFrom, skipTo) — this recording's prior for how long `len`
// consecutive words take HERE. Durations only (seconds); a caller derives rate itself.
const priorWindowDurations = (flat, len, skipFrom, skipTo) => {
  const durs = [];
  for (let j = 0; j + len <= flat.length; j += len) {
    if (j < skipTo && j + len > skipFrom) continue;   // overlaps the candidate — not "prior"
    const a = wStart(flat[j]), b = wEnd(flat[j + len - 1]);
    if (a != null && b != null && b > a) durs.push(b - a);
  }
  return durs;
};

// Is the span behind [i, i+len*reps) in `flat` consistent with a PERSON saying this
// phrase `reps` times — judged against how THIS transcript otherwise paces `len`-word
// spans? False (never flag) when the recording carries no usable clock, or too little of
// it elsewhere to know what normal even looks like here (createNoiseFloor's own cold-
// start abstention — "assume nothing, veto nothing" runs here exactly as in acousticSignal).
const spanFailsThePrior = (flat, i, len, reps) => {
  const cycles = [];
  for (let k = 0; k < reps; k++) {
    const a = wStart(flat[i + k * len]), b = wEnd(flat[i + (k + 1) * len - 1]);
    if (a == null || b == null || b < a) return false;
    cycles.push(b - a);
  }
  const prior = priorWindowDurations(flat, len, i, i + len * reps);
  if (prior.length < MIN_SAMPLES) return false;   // too little of the recording to know its own pace

  // Signal 1 — a RATE this recording's own other spans would not produce by chance.
  const priorRates = prior.map((d) => len / d);
  const rateFloor = createNoiseFloor({ scale: 'log', alpha: 0.05 }).observeAll(priorRates).threshold();
  const candRate = (len * reps) / cycles.reduce((s, d) => s + d, 0);
  if (Number.isFinite(rateFloor) && candRate > rateFloor) return true;

  // Signal 2 — a cadence steadier than this recording has ever naturally been for a span
  // this long: the candidate's own cycle-to-cycle spread (std) next to the prior's spread,
  // a ratio against the DOCUMENT's own measured variability, never an absolute number.
  const priorSpread = stdev(prior), candSpread = stdev(cycles);
  if (priorSpread > 0 && candSpread < priorSpread * 0.2) return true;

  return false;
};

// Do the two blocks flat[a..a+len) and flat[b..b+len) carry the SAME normalized words?
const sameBlock = (flat, a, b, len) => {
  for (let k = 0; k < len; k++) if (flat[a + k].norm !== flat[b + k].norm) return false;
  return true;
};

// detectRepetitionLoops(utterances) — walks the flat, time-ordered word stream (any
// breath-group boundaries collapsed; a loop can straddle one as easily as sit inside
// one) and finds every maximal run where the SAME normalized n-gram (1..MAX_NGRAM_LEN
// words) repeats immediately at least MIN_REPEATS times AND the span fails to fit this
// recording's OWN prior (spanFailsThePrior). Mutates the WORD OBJECTS in place —
// every repeat after the first gets `.repeatLoop = true` (the first occurrence is left
// unmarked: it may be the genuine utterance the decoder then seized on and looped). Runs
// left-to-right and greedily consumes a detected run before continuing, so a run is never
// re-split into the smaller pattern that sits inside it.
//
// Returns one record per run — { start, end, phrase, ngram, repeats, words } — for a
// caller to surface as its own audit trail (organs/in/audio.js: an EVA per suspect word,
// doc.audit.repetitionLoops for the run-level view). Inert — empty array, nothing
// mutated — on a transcript with no such run, so a clean hearing is unaffected.
export const detectRepetitionLoops = (utterances = []) => {
  const flat = [];
  for (const u of (utterances || [])) for (const w of (u.words || [])) flat.push(w);
  const n = flat.length;
  const runs = [];
  let i = 0;
  while (i < n) {
    let hit = null;
    const maxLen = Math.min(MAX_NGRAM_LEN, Math.floor((n - i) / MIN_REPEATS));
    for (let len = 1; len <= maxLen; len++) {
      let reps = 1;
      while (i + (reps + 1) * len <= n && sameBlock(flat, i, i + reps * len, len)) reps++;
      if (reps >= MIN_REPEATS && spanFailsThePrior(flat, i, len, reps)) { hit = { len, reps }; break; }
    }
    if (!hit) { i++; continue; }
    const { len, reps } = hit;
    const total = len * reps;
    const phrase = flat.slice(i, i + len).map((w) => w.text).join(' ');
    const suspect = flat.slice(i + len, i + total);   // every repeat but the first
    suspect.forEach((w) => { w.repeatLoop = true; });
    runs.push({
      start: wStart(flat[i]) ?? 0, end: wEnd(flat[i + total - 1]) ?? 0,
      phrase, ngram: len, repeats: reps, words: total,
    });
    i += total;
  }
  return runs;
};

// ── 2a · belief — every transcription is an assertion, held below text ──────────

// The coupling `w` one heard assertion earns, in [0, cap] — the engine's belief currency,
// computed from the audio witnesses (this is the audio-specific part; the CHANNEL it lands
// on is not). The WAVEFORM is the truth, so the acoustic witness (§1) is primary; the
// speech model's own confidence is a weaker second witness. A word the model was sure of
// but the microphone barely caught is not trusted; a word the waveform shows clearly, less
// doubted. The hardest line the truth draws: a span that never cleared its OWN noise null
// (signal false — the waveform holds only room there) is barely believed, however sure the
// model. Whatever the witnesses say, it tops out at the witness ceiling (CONVERSATIONAL_CAP).
export const hearingBelief = (t, cap = CONVERSATIONAL_CAP) => {
  const conf  = isNum(t?.conf)  ? clamp01(t.conf)  : null;   // the model's logprob (2nd witness)
  const acous = isNum(t?.acous) ? clamp01(t.acous) : null;   // the waveform (the truth, 1st witness)
  let w;
  if (acous != null && conf != null) w = 0.65 * acous + 0.35 * conf;   // truth leads, model tempers
  else if (acous != null)            w = acous;                        // waveform alone
  else if (conf != null)             w = 0.85 * conf;                  // model alone — no truth-witness, extra doubt
  else                               w = 0.7;                          // unmeasured — a neutral heard prior
  if (t && t.signal === false) w = Math.min(w, 0.2);                   // the waveform's veto
  if (t && t.repeatLoop) w = Math.min(w, 0.15);                        // the decode-loop veto
  return +(cap * clamp01(w)).toFixed(4);
};

// ── 2b · the resolution — reader-read referents, believed, self-edited ──────────

// The distinct name-referent surfaces the READER finds in the transcript. The transcript
// is text, and the reader already reads text into referents (parse/entities.js admission:
// a name in an argument position anchors on first sighting, a bare capital earns nothing).
// We run exactly that reading and take its admitted single-token names — the entity notion
// is the reader's, not a regex of ours. Returns a Set of admitted norms present as tokens.
const readerReferents = (doc) => {
  const admitted = new Set();
  try {
    const text = (doc.sentences || []).map(s => String(s || '').trim()).filter(Boolean).join('. ');
    if (!text) return admitted;
    const parsed = parseText(text);
    const labels = parsed?.admission?.admitted ? [...parsed.admission.admitted.keys()] : [];
    for (const label of labels) {
      // A single-token name is the ASR name-drift case ("Marcy" for "Darcy"). Multi-word
      // names fold by containment (parse/name-variants.js) — a separate reading, not here.
      const toks = String(label).trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (toks.length === 1) admitted.add(toks[0].replace(/[^\p{L}\p{N}']/gu, ''));
    }
  } catch { /* the reader is best-effort; a transcript it cannot read yields no referents */ }
  return admitted;
};

// resolveTranscript(doc, opts) — the graph-aware, self-editing pass.
//
// Reads the audio doc's flat `tokens` and its append-only `log`. Takes the reader's own
// referents (readerReferents), finds the near-spelling variants of one name by the
// reader's own fuzzy matcher under mutual-nearest, elects the MOST-BELIEVED spelling of
// each (waveform-grounded, hearingBelief), and RE-HEARS the weaker hearings to it — on the
// log (SEG·INS·DEF·SYN·REC, coupled at the believed weight) and in the projected views.
//
// Returns a receipt { revisions:[{ from, to, unitIdx, start, at, via, belief }], clusters,
// edits } and mutates `doc` in place (tokens/sentences/units patched, doc.revisions set).
// Inert — empty receipt, nothing appended — when the reader finds no variant to fold, so a
// clean transcript is byte-identical to one that never ran this (golden parity).
export const resolveTranscript = (doc, { cap = CONVERSATIONAL_CAP } = {}) => {
  const empty = { revisions: [], clusters: [], edits: 0 };
  if (!doc || !doc.log || !Array.isArray(doc.tokens) || !doc.tokens.length) return empty;
  const tokens = doc.tokens;

  // The entity candidates: tokens whose norm the READER admitted as a referent. Aggregate
  // per norm — mentions, mass (sightings), and believedMass (Σ hearingBelief), so the
  // election favours the surface heard often AND believed, not merely often.
  const referents = readerReferents(doc);
  const ent = new Map();
  tokens.forEach((t, i) => {
    if (!t.norm || !referents.has(t.norm)) return;
    const e = ent.get(t.norm) || { norm: t.norm, mentions: [], mass: 0, believedMass: 0, surfaces: new Map() };
    e.mentions.push(i);
    e.mass += 1;
    e.believedMass += hearingBelief(t, cap);
    e.surfaces.set(t.text, (e.surfaces.get(t.text) || 0) + 1);
    ent.set(t.norm, e);
  });
  const norms = [...ent.keys()];
  if (norms.length < 2) return empty;

  // The reader's fuzzy distance — bounded Levenshtein under the reader's own length-aware
  // ceiling (parse/fuzzy.js: "darcy"↔"marcy" is one edit at length five, a match; a short
  // or far-apart pair stays distinct). This is the SAME primitive the surfer uses to rescue
  // a query term the page never spells exactly; the transcription variant is that case.
  const ceilOf = (a, b) => Math.min(fuzzCeiling(a.length), fuzzCeiling(b.length));
  const dist   = (a, b) => editWithin(a, b, Math.max(fuzzCeiling(a.length), fuzzCeiling(b.length)));

  // Mutual nearest neighbour over the fuzzy distance — the parameter-free grouping
  // (equivalence.js): two names fold only when each is the OTHER's closest spelling AND
  // they sit within the reader's fuzz ceiling. A distinct name whose nearest neighbour is
  // a coincidence is beyond the ceiling and is never swallowed. No threshold we invented.
  const nearest = new Map();
  for (const a of norms) {
    let best = null, bd = Infinity;
    for (const b of norms) {
      if (b === a) continue;
      const d = dist(a, b);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) nearest.set(a, { best, d: bd });
  }
  const parent = new Map();
  const find = (x) => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const a of norms) {
    const na = nearest.get(a); if (!na) continue;
    const nb = nearest.get(na.best);
    if (!nb || nb.best !== a) continue;                        // not mutual
    if (na.d >= 1 && na.d <= ceilOf(a, na.best)) union(a, na.best);   // within the reader's ceiling
  }

  // Group into clusters by root; a cluster of one is nothing to resolve.
  const byRoot = new Map();
  for (const n of norms) { const r = find(n); (byRoot.get(r) || byRoot.set(r, []).get(r)).push(n); }
  const clusters = [...byRoot.values()].filter(c => c.length > 1);
  if (!clusters.length) return empty;

  // The log's INS events, in order — 1:1 with `tokens` (audio.js appends exactly one word
  // INS per token, in order, before any SYN/REC). This lets a self-edit retract the EXACT
  // INS that recorded a losing hearing rather than guessing which one it was.
  const insSeq = doc.log.snapshot().filter(e => e.op === 'INS' && e.kind !== 'view' && e.kind !== 'merge' && e.kind !== 'reheard').map(e => e.seq);

  const revisions = [];
  let edits = 0;

  for (const cluster of clusters) {
    // Elect the winner: the norm with the greatest BELIEVED mass — the spelling the ear was
    // most sure of, summed over its sightings (waveform-grounded, §2a). Ties fall to raw
    // mass, then to the longer, then lexical — a stable, content-based order.
    const winner = cluster.slice().sort((x, y) => {
      const ex = ent.get(x), ey = ent.get(y);
      return (ey.believedMass - ex.believedMass) || (ey.mass - ex.mass) || (y.length - x.length) || (x < y ? -1 : 1);
    })[0];
    const we = ent.get(winner);
    // The winning surface: the most frequent cased spelling of the winning norm.
    const winLabel  = [...we.surfaces.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    const winBelief = we.believedMass / (we.mass || 1);

    for (const loser of cluster) {
      if (loser === winner) continue;
      const le = ent.get(loser);
      const at0 = tokens[le.mentions[0]].unitIdx ?? 0;
      // Fold the referents to one on the spine (graph-aware), and record the RULE the ear
      // learned — the same SYN+REC deposit audio.js leaves for a merge it was handed, here
      // DISCOVERED autonomously from belief + the reader's fuzzy read. The merge couples at
      // the winner's belief: even a corrected identity is a HEARD one, never text-certain.
      doc.log.append({ op: 'SYN', kind: 'merge', from: loser, to: winner, via: 'coref-resolved', w: +winBelief.toFixed(3), sentIdx: at0 });
      doc.log.append({ op: 'REC', kind: 'unify', token: loser, expansion: winner, via: 'coref-resolved', weight: +winBelief.toFixed(3), sentIdx: at0 });

      // Re-hear every mention of the losing surface as the believed one — an edit that LANDS
      // on the append-only stream: retract the shaky INS, re-INS the winner at its believed
      // coupling, DEF the provenance (what it was, and the belief that replaced it).
      for (const i of le.mentions) {
        const t = tokens[i];
        const origLabel = t.text;
        const seq = insSeq[i];
        if (seq != null) doc.log.retract(seq, `re-heard "${origLabel}" as "${winLabel}" (reader coref + belief)`);
        const at = t.unitIdx ?? 0;
        doc.log.append({ op: 'INS', id: winner, label: winLabel, sentIdx: at, kind: 'reheard', w: +winBelief.toFixed(3) });
        doc.log.append({ op: 'DEF', id: winner, key: 'revisedFrom', value: origLabel, sentIdx: at });
        doc.log.append({ op: 'DEF', id: winner, key: 'time', value: `${(+t.start).toFixed(2)}-${(+t.end).toFixed(2)}`, sentIdx: at });
        doc.log.append({ op: 'EVA', id: winner, reason: 'reheard-on-resolution', value: `${origLabel} ⇒ ${winLabel}`, sentIdx: at });

        // Reproject the visible transcript: the span now reads the believed surface, keeping
        // a groundable trail of what it was heard as first.
        revisions.push({ from: origLabel, to: winLabel, unitIdx: at, start: +(+t.start).toFixed(3), at: seq ?? null, via: 'reader-coref+belief', belief: +winBelief.toFixed(3) });
        t.revisedFrom = origLabel;
        t.text = winLabel;
        t.norm = winner;
        t.id = winner;
        // Patch the matching utterance word too — the caption/sentence exports read the
        // nested `utterances`, not the flat tokens, so both must carry the believed surface.
        patchUtteranceWord(doc, at, t.start, winLabel, winner, origLabel);
        edits++;
      }
    }
  }

  if (!revisions.length) return empty;

  // Rebuild the projected views from the patched tokens — sentences/units are folds of
  // the flat word list (grouped by unitIdx), so they carry the corrected surfaces the
  // way every projection follows the log. Mentions index the merged referents.
  rebuildViews(doc);
  doc.revisions = revisions;
  return { revisions, clusters, edits };
};

// Patch the utterance word a revised token corresponds to, so the nested `utterances`
// (what captions/sentences export from) carries the confident surface too. Matched by
// nearest start time within the unit; a no-op when the doc kept no utterances.
const patchUtteranceWord = (doc, unitIdx, start, label, norm, origLabel) => {
  const u = Array.isArray(doc.utterances) ? doc.utterances[unitIdx] : null;
  if (!u || !Array.isArray(u.words) || !u.words.length) return;
  let best = null, bd = Infinity;
  for (const w of u.words) {
    if (w.__reheard) continue;                       // don't reclaim an already-patched slot
    const d = Math.abs((isNum(w.start) ? w.start : start) - start);
    if (d < bd) { bd = d; best = w; }
  }
  if (best) { best.revisedFrom = origLabel; best.text = label; best.norm = norm; best.__reheard = true; }
};

// The display views a heard transcript projects from its breath groups — the ONE place
// the "words joined, with the utterance's start stamped" shape lives, so organs/in/audio.js
// builds them here at ingest and resolveTranscript rebuilds them here after an edit, rather
// than each spelling the format its own way. Pure on the utterances (the word source).
export const transcriptViews = (utterances = []) => {
  const sentences = [], units = [], timings = [];
  for (const u of utterances) {
    const surfaces = (u.words || []).map(w => w.text);
    const text = surfaces.join(' ');
    sentences.push(text);
    units.push(`${text} (${(isNum(u.start) ? u.start : 0).toFixed(1)}s)`);
    timings.push([u.start, u.end]);
  }
  return { sentences, units, timings };
};

// Rebuild the projected views from the (patched) utterances — the same projection
// organs/in/audio.js runs at ingest (transcriptViews), re-run so the visible reading
// follows the edited stream. Mentions re-index the merged referents off the flat tokens.
const rebuildViews = (doc) => {
  const { sentences, units } = transcriptViews(doc.utterances || []);
  const mentions = new Map();
  for (const t of doc.tokens) mentions.set(t.id, [...(mentions.get(t.id) || []), t.unitIdx ?? 0]);
  doc.sentences = sentences;
  doc.units = units;
  doc.mentions = mentions;
};
