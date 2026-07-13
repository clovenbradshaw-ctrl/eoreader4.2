// EO: EVA·SYN·SEG(Field,Entity → Void,Network, Tracing,Making,Unraveling) — the hearing that edits itself
// The ear's second pass — signal-from-noise, then a self-editing resolution.
//
// organs/in/audio.js lands a speech model's transcript on the spine as-is: one INS
// per word, repeats unified by norm, the model's own confidence carried through. But
// a transcript is a READING, and a first reading of a name is often its worst: the
// clearest, oft-repeated hearing of "Darcy" should correct the one-off "Marcy" mumbled
// under a cough — not the other way round. This module is where the machine does that
// itself, autonomously, WITHOUT handing the waveform back to a model to re-guess:
//
//   1. acousticSignal — parse the signal from the noise on every word SPAN, from the
//      decoded PCM directly. A word is loud-over-room-tone or it is not; the boundary
//      is the field's OWN derived noise null (the Born rule, voidnull.js), never a
//      chosen dB. This yields an acoustic confidence orthogonal to the model's logprob:
//      the model can be sure of a word the microphone barely caught, and vice-versa.
//
//   2. resolveTranscript — GRAPH-AWARE coreference + most-confident election, folded
//      back into the append-only stream as an EDIT. Near-spelling entity surfaces that
//      are the same referent misheard ("Darcy"/"Darcey"/"Marcy") are found by mutual
//      nearest neighbour, gated by a noise null so a genuinely distinct name is never
//      swallowed. Each cluster ELECTS its most-confident surface — acoustic signal ×
//      model confidence × accumulated mass — and every losing hearing is RE-HEARD to
//      it: a SEG retracts the shaky INS, a fresh INS re-mints the confident surface, a
//      SYN·REC folds the referents to one. Nothing is unwritten — the correction lands
//      as data on the same log, auditable down to the evidence that licensed it, and
//      the visible transcript (tokens, sentences) is reprojected to match.
//
// Pure, DOM-free, framework-free. acousticSignal reads a Float32 PCM buffer; the
// resolution reads only the shape organs/in/audio.js emits (a doc with `log`, `tokens`,
// `sentences`, `units`). Both are safe to call in Node — the tests drive them directly.

import { createNoiseFloor, boundedNull } from '../../core/index.js';
import { isStop } from '../../perceiver/parse/index.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const isNum = (x) => typeof x === 'number' && isFinite(x);

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
//
// Returns one record per span, index-aligned: { snr (dB over ambient), acous (0..1),
// signal (bool — cleared the noise null) }. Degrades safely: too little audio to know
// the floor → every span reads acous:null, signal:true (assume nothing, veto nothing).
export const acousticSignal = (mono, SR, spans, { frameMs = 25, hopMs = 10, alpha = 0.05 } = {}) => {
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

  // The ambient — the low bulk of frame energies (the 20th percentile is well inside
  // the room-tone mass, below any real speech), the reference every span is read over.
  const sorted = frames.map(f => f.rms).sort((a, b) => a - b);
  const ambient = Math.max(sorted[Math.floor(sorted.length * 0.2)], 1e-6);
  const loud    = Math.max(sorted[Math.floor(sorted.length * 0.95)], ambient * 1.0001);
  const span    = Math.log(loud / ambient) || 1;   // the dynamic range, for the 0..1 squash

  // The derived noise null over frame energies — the boundary a span's mean energy
  // must beat to read as signal rather than room. Fed every frame RMS; the bulk-fit
  // trims the speech outliers so the line sits just above ambient.
  const floor = createNoiseFloor({ scale: 'log', alpha });
  for (const f of frames) floor.observe(f.rms);
  const nullLine = floor.threshold();

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
    const acous = clamp01(Math.log(Math.max(rms, ambient) / ambient) / span);
    // Signal iff the span's own energy beats what the room produces by chance. When the
    // null cannot be trusted (Infinity — thin/contaminated background) veto nothing.
    const signal = isFinite(nullLine) ? rms > nullLine : true;
    return { snr: +snr.toFixed(2), acous: +acous.toFixed(4), signal };
  });
};

// ── 2 · the resolution — coreference + most-confident election, self-edited ─────

// Normalized edit distance similarity in [0,1] over two short strings — the
// near-spelling read (1 = identical, 0 = nothing shared). Iterative-DP Levenshtein,
// bounded to the small tokens this ever sees (names, a few graphemes each).
const editSim = (a, b) => {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return 1 - prev[n] / Math.max(m, n);
};

// The confidence of a single hearing (one token) — the two channels blended. Model
// confidence (whisper's logprob) and acoustic signal (this module's §1) are orthogonal
// witnesses; either present pulls the estimate, both present average, neither leaves a
// neutral prior. A hearing the microphone missed OR the model doubted is a weak vote.
const hearingConf = (t) => {
  const c = isNum(t.conf) ? clamp01(t.conf) : null;
  const a = isNum(t.acous) ? clamp01(t.acous) : null;
  if (c != null && a != null) return 0.5 * c + 0.5 * a;
  return c != null ? c : a != null ? a : 0.7;   // neutral prior when unmeasured
};

// An entity candidate surface — a proper-name-like token worth resolving. The heuristic
// is deliberately conservative and its limits are owned, not hidden: an initial capital
// on the cased surface, not a stopword, ≥3 graphemes. This catches the ASR name-drift
// case ("Darcy"/"Marcy") without dragging in function words that repeat for other reasons.
// It will over-admit a sentence-initial common noun and under-admit an all-lowercased
// model's names — a real ceiling, left as a caveat, not papered over.
const isEntitySurface = (text, norm) =>
  /^\p{Lu}/u.test(String(text || '')) && norm.length >= 3 && !isStop(norm);

// resolveTranscript(doc, opts) — the graph-aware, self-editing pass.
//
// Reads the audio doc's flat `tokens` (each { id, text, norm, start, end, unitIdx,
// conf?, acous? }) and its append-only `log`. Finds entity surfaces that are one
// referent misheard, elects the most-confident spelling of each, and REWRITES the
// weaker hearings to it — on the log (SEG·INS·DEF·SYN·REC) and in the projected views.
//
//   alpha   the tolerated false-merge rate for the noise null (default 0.05).
//   minSim  a hard floor on similarity below which two surfaces are never candidates,
//           regardless of the null (default 0.5 — half the graphemes shared).
//
// Returns a receipt { revisions:[{ from, to, unitIdx, start, at, via, conf }], clusters,
// edits } and mutates `doc` in place (tokens/sentences/units patched, doc.revisions set).
// Inert — returns an empty receipt and appends nothing — when no cluster clears the null,
// so a clean transcript is byte-identical to one that never ran this (golden parity).
export const resolveTranscript = (doc, { alpha = 0.05, minSim = 0.5 } = {}) => {
  const empty = { revisions: [], clusters: [], edits: 0 };
  if (!doc || !doc.log || !Array.isArray(doc.tokens) || !doc.tokens.length) return empty;
  const tokens = doc.tokens;

  // Aggregate the entity surfaces: norm → { mentions:[tokenIdx], mass, confMass,
  // surfaces: Map(cased → count) }. Mass is sighting count; confMass weights each
  // sighting by its hearing confidence, so the election favours the surface heard
  // often AND clearly, not merely often.
  const ent = new Map();
  tokens.forEach((t, i) => {
    if (!t.norm || !isEntitySurface(t.text, t.norm)) return;
    const e = ent.get(t.norm) || { norm: t.norm, mentions: [], mass: 0, confMass: 0, surfaces: new Map() };
    e.mentions.push(i);
    e.mass += 1;
    e.confMass += hearingConf(t);
    e.surfaces.set(t.text, (e.surfaces.get(t.text) || 0) + 1);
    ent.set(t.norm, e);
  });
  const norms = [...ent.keys()];
  if (norms.length < 2) return empty;

  // Pairwise near-spelling similarity, and the background of also-ran sims that the
  // noise null is derived over (the same discipline equivalence.js uses: a proposed
  // merge must beat what chance spelling-overlap produces, or it is held, not merged).
  const background = [];
  const sim = new Map();   // "a␟b" → score
  const key = (a, b) => (a < b ? a + '␟' + b : b + '␟' + a);
  for (let i = 0; i < norms.length; i++)
    for (let j = i + 1; j < norms.length; j++) {
      const s = editSim(norms[i], norms[j]);
      sim.set(key(norms[i], norms[j]), s);
      background.push(s);
    }

  // Mutual nearest neighbour: i and j merge only when each is the OTHER's strongest
  // match — the parameter-free grouping. The null (boundedNull, a bounded [0,1] score)
  // is the abstention: a pair clears only if its similarity beats the derived line AND
  // the hard minSim floor. A distinct name whose nearest neighbour is a coincidence sits
  // below the line and is never merged.
  const nearest = new Map();
  for (const a of norms) {
    let best = null, bs = -1;
    for (const b of norms) {
      if (b === a) continue;
      const s = sim.get(key(a, b));
      if (s > bs) { bs = s; best = b; }
    }
    if (best) nearest.set(a, { best, score: bs });
  }

  // Union-find over the mutually-nearest pairs that clear the null.
  const parent = new Map();
  const find = (x) => { let p = parent.get(x) ?? x; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; return p; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  for (const a of norms) {
    const na = nearest.get(a); if (!na) continue;
    const nb = nearest.get(na.best);
    if (!nb || nb.best !== a) continue;                       // not mutual
    const s = na.score;
    // The derived line when the background can support one; otherwise the caller's
    // conservative minSim floor (a thin transcript of two names cannot estimate a null,
    // but "over half the graphemes shared AND mutually nearest" is already a real gate).
    const line = boundedNull(background, { alpha, leaveOut: s, fallback: minSim });
    if (s >= minSim && s > line) union(a, na.best);
  }

  // Group into clusters by root; a cluster of one is nothing to resolve.
  const byRoot = new Map();
  for (const n of norms) { const r = find(n); (byRoot.get(r) || byRoot.set(r, []).get(r)).push(n); }
  const clusters = [...byRoot.values()].filter(c => c.length > 1);
  if (!clusters.length) return empty;

  // The log's INS events, in order — 1:1 with `tokens` (audio.js appends exactly one
  // INS per word, in word order, before any SYN/REC). This lets a self-edit retract the
  // EXACT INS that recorded a losing hearing rather than guessing which one it was.
  const insSeq = doc.log.snapshot().filter(e => e.op === 'INS' && e.kind !== 'view' && e.kind !== 'merge').map(e => e.seq);

  const revisions = [];
  let edits = 0;

  for (const cluster of clusters) {
    // Elect the winner: the norm with the greatest confidence-weighted mass. Ties fall
    // to raw mass, then to the surface with the most distinct-grapheme length (the
    // fuller spelling — "Darcy" over "arcy"), a stable, content-based tiebreak.
    const winner = cluster.slice().sort((x, y) => {
      const ex = ent.get(x), ey = ent.get(y);
      return (ey.confMass - ex.confMass) || (ey.mass - ex.mass) || (y.length - x.length) || (x < y ? -1 : 1);
    })[0];
    const we = ent.get(winner);
    // The winning surface: the most frequent cased spelling of the winning norm.
    const winLabel = [...we.surfaces.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    const winConf = we.confMass / (we.mass || 1);

    for (const loser of cluster) {
      if (loser === winner) continue;
      const le = ent.get(loser);
      const s = sim.get(key(loser, winner)) ?? editSim(loser, winner);
      // Fold the referents to one on the spine (graph-aware), and record the RULE the
      // ear learned — the same SYN+REC deposit audio.js leaves for a merge it was handed,
      // here DISCOVERED autonomously from confidence + spelling rather than supplied.
      doc.log.append({ op: 'SYN', kind: 'merge', from: loser, to: winner, via: 'coref-resolved', sentIdx: tokens[le.mentions[0]].unitIdx ?? 0 });
      doc.log.append({ op: 'REC', kind: 'unify', token: loser, expansion: winner, via: 'coref-resolved', weight: +s.toFixed(3), sentIdx: tokens[le.mentions[0]].unitIdx ?? 0 });

      // Re-hear every mention of the losing surface as the confident one — an edit that
      // LANDS on the append-only stream: retract the shaky INS, re-INS the winner, and
      // DEF the provenance so the correction is groundable (what it was, why it changed).
      for (const i of le.mentions) {
        const t = tokens[i];
        const origLabel = t.text;
        const seq = insSeq[i];
        if (seq != null) doc.log.retract(seq, `re-heard "${origLabel}" as "${winLabel}" (coref + confidence)`);
        const at = t.unitIdx ?? 0;
        doc.log.append({ op: 'INS', id: winner, label: winLabel, sentIdx: at, kind: 'reheard' });
        doc.log.append({ op: 'DEF', id: winner, key: 'revisedFrom', value: origLabel, sentIdx: at });
        doc.log.append({ op: 'DEF', id: winner, key: 'time', value: `${(+t.start).toFixed(2)}-${(+t.end).toFixed(2)}`, sentIdx: at });
        doc.log.append({ op: 'EVA', id: winner, reason: 'reheard-on-resolution', value: `${origLabel} ⇒ ${winLabel}`, sentIdx: at });

        // Reproject the visible transcript: the span now reads the confident surface,
        // keeping a groundable trail of what it was heard as first.
        revisions.push({ from: origLabel, to: winLabel, unitIdx: at, start: +(+t.start).toFixed(3), at: seq ?? null, via: 'coref+confidence', conf: +winConf.toFixed(3) });
        t.revisedFrom = origLabel;
        t.text = winLabel;
        t.norm = winner;
        t.id = winner;
        // Patch the matching utterance word too — the caption/sentence exports read the
        // nested `utterances`, not the flat tokens, so both must carry the confident
        // surface. Matched within the unit by nearest start time (tokens and utterance
        // words are 1:1 there, but the time match survives any incidental desync).
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

// Rebuild doc.sentences / doc.units / doc.mentions from the (possibly patched) tokens —
// the same grouping organs/in/audio.js does at ingest, run again so the visible reading
// matches the edited stream. `units` keeps audio.js's "(Ns)" time suffix per utterance.
const rebuildViews = (doc) => {
  const byUnit = new Map();
  for (const t of doc.tokens) {
    const u = t.unitIdx ?? 0;
    (byUnit.get(u) || byUnit.set(u, []).get(u)).push(t);
  }
  const idxs = [...byUnit.keys()].sort((a, b) => a - b);
  const sentences = [], units = [];
  const mentions = new Map();
  for (const u of idxs) {
    const ws = byUnit.get(u);
    const text = ws.map(w => w.text).join(' ');
    sentences[u] = text;
    const start = isNum(ws[0]?.start) ? ws[0].start : 0;
    units[u] = `${text} (${start.toFixed(1)}s)`;
    for (const w of ws) mentions.set(w.id, [...(mentions.get(w.id) || []), u]);
  }
  // Fill any gap left by an empty unit index (defensive — audio units are contiguous).
  for (let i = 0; i < units.length; i++) { if (sentences[i] == null) sentences[i] = ''; if (units[i] == null) units[i] = ''; }
  doc.sentences = sentences;
  doc.units = units;
  doc.mentions = mentions;
};
