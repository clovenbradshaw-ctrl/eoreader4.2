// EO: EVA·REC·SYN(Field,Network → Paradigm,Field, Tracing,Composing) — helix-aware predictor
// The helix-aware predictor — predict the move against the frame, and let a stale
// basis be a REC, not endless surprise.
//
// sequence.js predicts the next unit by ABSOLUTE transitions — the Existence rung of
// the helix. That predictor reads a reframe (a melody's key change, a register shift)
// as pure novelty forever: the TV-snow failure at the meaning layer, high surprise on a
// signal that is not random, only re-based. This predictor climbs a rung. It runs the
// same n-gram at two rungs at once:
//
//   EXISTENCE — the absolute unit (the pitch, the entity). Re-groundable.
//   STRUCTURE — the MOVE between units (the interval, the relative step). Frame-relative
//               by construction, so it survives a reframe the absolute rung cannot.
//
// and reads the DIFFERENCE between the two rungs as the helix's own diagnosis:
//
//   absolute high  & move low   → MIS-FRAMED: the frame moved, the pattern held. The
//                                 honest move is not more data — it is a new frame. Fire
//                                 REC(Paradigm,…) and RE-GROUND the absolute rung (the
//                                 helix turning: relocate the tonic, drop to a bare NUL
//                                 in the new frame and predict afresh).
//   absolute high  & move high  → genuine novelty / noise (under-read or true random):
//                                 reserve, do not relocate — there is no frame to find.
//   absolute low                → the frame still fits: predict, no REC.
//
// The thresholds are MEASURED, not set: a rung's surprise is "high" when it beats the
// deriveNull its own surprise history throws up by chance (the repo's Born rule), and
// the move rung is "holding" when it sits below its own running median. Witness does not
// decide — the field decides, the surfer reads it. The STRUCTURE rung needs a notion of
// "move"; for a numeric signal (MIDI, a scalar stream) that is the first difference, and
// it is omnimodal exactly there — hand it a melody and it predicts intervals, hand it any
// scalar series and it predicts steps. A non-numeric stream (entity ids) has no cheap
// move without the relation labels, so the predictor degrades to the Existence rung
// alone and says so (`rungs: ['existence']`).

import { deriveNull } from '../core/index.js';

const RESERVE = 1.0;
const SEP = '';

// ── the n-gram core: interpolated backoff with a novelty reserve ──────────────
const countsOf = (seq, order) => {
  const uni = new Map();
  const grams = Array.from({ length: order + 1 }, () => new Map());
  for (let i = 0; i < seq.length; i++) {
    uni.set(seq[i], (uni.get(seq[i]) || 0) + 1);
    for (let j = 1; j <= order && i - j >= 0; j++) {
      const ctx = seq.slice(i - j, i).join(SEP);
      const row = grams[j].get(ctx) || new Map();
      row.set(seq[i], (row.get(seq[i]) || 0) + 1);
      grams[j].set(ctx, row);
    }
  }
  return { uni, grams, vocab: uni.size };
};

const probOf = (model, ctx, next, order) => {
  const { uni, grams, vocab } = model;
  const V = Math.max(1, vocab);
  const sum = (m) => { let s = 0; for (const w of m.values()) s += w; return s; };
  const Zuni = sum(uni) + RESERVE;
  let p = ((uni.get(next) || 0) + RESERVE / V) / Zuni;          // add-reserve-smoothed unigram
  for (let j = 1; j <= order && j <= ctx.length; j++) {
    const row = grams[j].get(ctx.slice(ctx.length - j).join(SEP));
    if (!row) continue;
    const Zrow = sum(row) + RESERVE;
    const alpha = (Zrow - RESERVE) / (Zrow - RESERVE + 1);       // confidence in this order
    const pr = ((row.get(next) || 0) + RESERVE / V) / Zrow;
    p = alpha * pr + (1 - alpha) * p;
  }
  return Math.max(p, 1e-6);
};

// the predictive distribution (for generation) — ranked continuations given a context.
const distOf = (model, ctx, order) => {
  const cands = new Set(model.uni.keys());
  const ranked = [...cands].map(u => ({ u, p: probOf(model, ctx, u, order) }))
    .sort((a, b) => b.p - a.p);
  const Z = ranked.reduce((s, r) => s + r.p, 0) || 1;
  return ranked.map(r => ({ u: r.u, p: r.p / Z }));
};

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x) => Math.round(x * 1000) / 1000;

const isNumeric = (seq) => seq.length > 0 && seq.every(x => typeof x === 'number');

// The difference-rung ladder: [seq, Δseq, Δ²seq, …] up to `depth`. Rung 0 is the
// absolute unit (position), rung 1 the move (velocity), rung 2 the move-of-the-move
// (acceleration), and so on — the helix recursing inside prediction. A constant at rung
// k is a stationary regularity the k-1 rungs below it cannot see: a drifting object is
// stationary at rung 1, an accelerating one at rung 2. diffs[r][i] explains seq[i+r].
const diffs = (seq, depth) => {
  const out = [seq];
  for (let r = 1; r <= depth; r++) {
    const prev = out[r - 1], d = [];
    for (let i = 1; i < prev.length; i++) d.push(prev[i] - prev[i - 1]);
    out.push(d);
  }
  return out;
};
const RUNG_LABELS = ['existence', 'structure', 'acceleration', 'jerk', 'snap'];
const rungIndex = (r) => typeof r === 'number' ? r
  : Math.max(0, RUNG_LABELS.indexOf(r === 'move' ? 'structure' : r));

// ── helixPredict: read the stream at both rungs, diagnose, re-ground ──────────
//
//   seq      the unit stream (numbers → the move rung is the first difference;
//            otherwise the Existence rung alone).
//   order    n-gram context length (default 2 — a phrase, not a single step).
//   window   the smoothing window for the "sustained" test (a single spike is not a
//            reframe; hysteresis, cube.md #8).
//   alpha    the Born budget for the deriveNull that calls a surprise "high".
//
// Returns { rungs, steps, recs, summary }. Each step carries the per-rung surprise (in
// bits), the carrying rung, and whether a re-ground fired. `recs` are the measured
// frame relocations, each an append-only REC(Paradigm, Composing) with its surprise-delta.
export const helixPredict = (seq, { order = 2, window = 3, alpha = 0.05, maxRung = 1 } = {}) => {
  const numeric = isNumeric(seq);
  const depth = numeric ? Math.max(1, maxRung) : 0;
  const D = diffs(numeric ? seq : seq, depth);             // D[r] = r-th difference (rung r)
  const R = D.length - 1;                                  // top rung index
  const rungs = numeric ? RUNG_LABELS.slice(0, R + 1) : ['existence'];

  const anchor = new Array(R + 1).fill(0);                 // per-rung ground, relocated on a REC
  const hist = Array.from({ length: R + 1 }, () => []);    // per-rung surprise history
  const steps = [];
  const recs = [];
  let lastReground = -Infinity;

  for (let at = order; at < seq.length; at++) {
    const bits = new Array(R + 1).fill(null);
    for (let r = 0; r <= R; r++) {
      const idx = at - r;                                  // D[r][idx] explains seq[at]
      const from = Math.max(anchor[r], 0);
      if (idx < order || idx - from < order) continue;     // not enough (post-reground) context yet
      const model = countsOf(D[r].slice(from, idx), order);
      const ctx = D[r].slice(idx - order, idx);
      bits[r] = -Math.log2(probOf(model, ctx, D[r][idx], order));
      hist[r].push(bits[r]);
    }
    const win = bits.map((b, r) => (hist[r].length ? mean(hist[r].slice(-window)) : null));

    // the carrying rung — the lowest-surprise rung with evidence (the stationary one).
    let carrying = 0, best = Infinity;
    for (let r = 0; r <= R; r++) if (win[r] != null && win[r] < best) { best = win[r]; carrying = r; }

    // MIS-FRAMED → re-ground: the LOWEST rung r whose surprise beats the deriveNull of its
    // own history (high) while the rung ABOVE it holds below its median — the regularity
    // lives one rung up, so relocate rungs 0..r (drop to a NUL in the new frame). Measured
    // thresholds, sustained by the window (hysteresis — a one-off spike is not a reframe).
    let regrounded = false;
    for (let r = 0; r < R; r++) {
      if (win[r] == null || win[r + 1] == null) continue;
      const hi = deriveNull(hist[r].slice(0, -1), { scale: 'linear', alpha });
      const isHigh = Number.isFinite(hi) && win[r] > hi;
      const holding = hist[r + 1].length >= 4 && win[r + 1] < median(hist[r + 1].slice(0, -1));
      if (isHigh && holding && at - lastReground > window) {
        for (let j = 0; j <= r; j++) anchor[j] = Math.max(0, (at - j) - order);
        lastReground = at; regrounded = true;
        recs.push(Object.freeze({
          at, op: 'REC', site: 'Paradigm', stance: 'Composing', cell: 'REC_Composing_Paradigm',
          rung: rungs[r], surpriseDelta: round(win[r] - win[r + 1]),
          rode: 'helix-misframe', reground: true,
        }));
        break;
      }
    }

    steps.push({
      at, unit: seq[at],
      existenceBits: bits[0] == null ? null : round(bits[0]),
      moveBits: bits[1] == null ? null : round(bits[1]),
      rungBits: bits.map(b => (b == null ? null : round(b))),
      carrying: rungs[carrying], regrounded,
    });
  }

  const meanRung = (r) => { const v = steps.map(s => s.rungBits[r]).filter(x => x != null); return v.length ? round(mean(v)) : null; };
  const carriedAbove0 = steps.some(s => s.carrying !== 'existence');
  return {
    rungs, steps, recs,
    summary: Object.freeze({
      meanExistenceBits: meanRung(0),
      meanMoveBits: R >= 1 ? meanRung(1) : null,
      rungBits: rungs.map((_, r) => meanRung(r)),
      recCount: recs.length,
      diagnosis: recs.length ? 'reframe(s) detected and re-grounded'
        : (carriedAbove0 ? 'a higher rung carries (a constant move/accel)' : 'frame stable'),
    }),
  };
};

// ── helixGenerate: draw forward at the carrying rung, frame-aware ─────────────
//
// Generation is the same object as recognition, drawn instead of scored. Drawing at the
// STRUCTURE rung — sample a MOVE and apply it to the current absolute state — generates
// coherently THROUGH a frame the absolute rung never saw: the learned shape, transposed.
// `repeat` re-grounds generation into a new register by seeding a new absolute start with
// the same move-grammar. Deterministic given `seed` (no Math.random — the workflow rule).
export const helixGenerate = (seq, { order = 2, n = 16, seed = 1, start = null, rung = 'structure' } = {}) => {
  const numeric = isNumeric(seq);
  const k = rungIndex(rung);
  let s = seed >>> 0;
  const rnd = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const draw = (ranked) => { const Z = ranked.reduce((a, r) => a + r.p, 0) || 1; let x = rnd() * Z; for (const r of ranked) { x -= r.p; if (x <= 0) return r.u; } return ranked[ranked.length - 1]?.u; };

  if (numeric && k >= 1) {
    // Draw the k-th difference (the stationary rung) and INTEGRATE up k times, seeding
    // each lower rung with its last observed value — generation by predicting the move
    // (or the move-of-the-move) against the frame, then re-constituting the absolute.
    const D = diffs(seq, k);
    const model = countsOf(D[k], order);
    let ctx = D[k].slice(-order);
    const lasts = []; for (let j = 0; j < k; j++) lasts[j] = D[j][D[j].length - 1];
    if (start != null) lasts[0] = start;                    // re-ground generation into a new frame
    const out = [lasts[0]];
    for (let step = 0; step < n; step++) {
      const dk = draw(distOf(model, ctx, order));
      const nd = new Array(k + 1); nd[k] = dk;
      for (let j = k - 1; j >= 0; j--) nd[j] = lasts[j] + nd[j + 1];   // integrate accel→vel→pos
      for (let j = 0; j <= k; j++) if (j < k) lasts[j] = nd[j];
      out.push(nd[0]);
      ctx = [...ctx, dk].slice(-order);
    }
    return out;
  }
  // Existence rung (k=0) or a non-numeric stream: draw absolute units.
  const eModel = countsOf(seq, order);
  let ctx = start != null ? [start] : seq.slice(-order);
  const out = [...ctx];
  for (let step = 0; step < n; step++) {
    const u = draw(distOf(eModel, ctx, order));
    out.push(u);
    ctx = [...ctx, u].slice(-order);
  }
  return out;
};
