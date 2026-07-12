// EO: SEG·EVA·SYN(Field → Field,Lens,Paradigm, Dissecting,Tracing,Composing) — the surfer core — surfFold
// The surfer — a surfer with no pilot. (docs/surfing-the-fold.md)
//
// The fold used to read significance at one fixed cursor: the top retrieval hit.
// That is a router-style CHOICE, and a choice is the wrong category. The surfer
// replaces it. It does not ask where to look; it measures where the field is
// steepest and steps there. The field is the witness, the gradient is the verdict,
// the step is mechanical — the witness-does-not-decide rule applied to navigation.
//
// Three axes, three quantities the reading already maintains:
//
//   focus    the warmest figure (γ-mass argmax) — where the eye sits.
//   cursor   advance through the flat, arrest on the peaks of BAYESIAN surprise
//            (read/reading.js `bayes`), so it arrests where the reading was
//            REWRITTEN, not where a token merely looked odd (the TV-snow fix).
//   frame    a frame breaking under accumulated strain (a REC) is an arrest too —
//            the same DEF·EVA·REC loop the significance engine runs, calibrated to
//            the reach, so the cursor axis and the frame axis read the same scalar.
//
// Every move is a pure function of the log and the field: same document, same
// anchor, same path. The frame axis lives in the enact holon (loop.js, a leaf with
// no read dependency), so this import stays acyclic.

import { readingAt } from '../perceiver/index.js';
import { deriveNull, buildDensity, eigenLenses, vonNeumann, commutator, projectorFrom, cellAt } from '../core/index.js';
import { createEnactedLoop, calibrateReader } from '../enactor/enact/index.js';
import { atmosphereFromActivations, corpusSigma, centroidBasis } from './atmosphere.js';
import { updateStance } from './stance.js';
import { bornSalience, figureSalience, linkSalience, linksBySentence } from './salience.js';
import { chorusStops } from './chorus.js';

// The reach: a little behind the anchor (to read the frame it sits inside), mostly
// ahead (a surf rides forward, and the arrow of time orders the frame axis).
const DEFAULT_REACH = Object.freeze({ behind: 4, ahead: 16, maxStops: 5 });

export const surfFold = (doc, anchor = 0, opts = {}) => {
  const units = doc?.units || doc?.sentences || [];
  const S = units.length;
  const empty = { anchor: 0, stops: [], peak: 0, focus: null, field: [], recCursors: [], recAxes: [], rode: 'bayesian-figure' };
  if (S === 0) return empty;

  // ADAPTIVE REACH (opt-in, opts.reach === 'adaptive'): let the surf get as much as it needs.
  // The fixed window (behind/ahead) bounds the surf by an arbitrary distance — too narrow for
  // a whole-arc question (the anchor's frame and the crisis it builds to can be 30 sentences
  // apart). Adaptive reach reads the field over the WHOLE document and lets the NOISE NULL
  // decide how much is structure: the boundary mode (deriveNull) is forced on, and the stop
  // count is uncapped, so a cursor arrests iff its surprise beats what the document's own
  // non-cohering bulk throws up by chance. "As much as it needs" is then bounded by signal,
  // not by a window — the same self-terminating discipline the idle/think loops use. Default
  // (no opts.reach) is byte-identical: the fixed window, the median rule, maxStops = 5.
  const adaptive = opts.reach === 'adaptive';
  const { behind, ahead, maxStops } = adaptive
    ? { behind: S, ahead: S, maxStops: Infinity }
    : { ...DEFAULT_REACH, ...opts };
  const a  = clampIdx(anchor, S);
  const lo = Math.max(0, a - behind);
  const hi = Math.min(S - 1, a + ahead);

  // Measure the field at every cursor in the reach — the random-access regime: the
  // field is stateless in the cursor, so it can be read anywhere and leapt to.
  const readings = [];
  for (let c = lo; c <= hi; c++) readings[c] = readingAt(doc, c);
  const bayesAt = (c) => readings[c]?.bayes ?? 0;
  const figAt   = (c) => readings[c]?.predicted?.figures?.[0] || null;

  // The per-cursor trace (warmth + surprise + novelty), for the audit.
  const field = [];
  for (let c = lo; c <= hi; c++) {
    field.push({ idx: c, focus: figAt(c), bayes: readings[c].bayes, surprisalBits: readings[c].surprisalBits });
  }
  const reachBayes = field.map(f => f.bayes);

  // The FRAME axis: run the enacted loop over the reach and collect the cursors where a
  // frame broke. The same loop the significance engine runs, so cursor and frame never
  // disagree — both ride `bayes`. The read now also carries `contrib` (the per-dimension
  // bayesBy), so a local REC restructures ALONG the straining axis (its cause), not
  // whatever figures were merely in view — the directional-strain parity the document
  // readers already have (enact/index.js) but the surfer's own loop had skipped.
  const cal = calibrateReader(reachBayes);
  let recCursors = [];
  let recAxes = [];
  try {
    const loop = createEnactedLoop({
      read: (c) => ({ surprise: bayesAt(c), terms: readings[c]?.predicted?.figures || [],
                      contrib: readings[c]?.bayesBy || null }),
      // ONE calibration discipline — CAUSAL, the same arrow the document readers run: the
      // band that judges cursor c is fit from the surprises BEFORE c. The reach fit seeds
      // it so a short window is not numb early (calibrateReader(reachBayes) as the seed,
      // refined causally as the reach is stepped), instead of the acausal whole-reach band
      // that let a later cursor set the band judging an earlier one.
      //
      // The impulse (shock) gate stays at the loop's fixed fallback, NOT a reach quantile:
      // on a ~20-cursor reach a high quantile sits barely above the median, so it fires on
      // routine noise rather than a genuine shock — the fires-on-the-scale-not-the-signal
      // anti-pattern. The shock a frame-axis impulse would catch is already a peak on the
      // CURSOR axis (the three-axis redundancy), so it still becomes a stop, through the
      // axis that calibrates it honestly (the derived VOID boundary) — not this one.
      calibrate: { mode: 'causal' },
      confirmBand: cal.confirmBand,
      thresholds:  cal.thresholds,
    });
    for (let c = lo; c <= hi; c++) loop.step(c);
    const recs = loop.events.filter(e => e.op === 'REC' && e.cursor >= lo && e.cursor <= hi);
    recCursors = [...new Set(recs.map(e => e.cursor))].sort((x, y) => x - y);
    // The straining axis per REC — the directional strain the surfer can now carry (dead
    // without contrib): the dimensions a local frame broke ALONG, tagged with the layer
    // that broke (proposition | document) and the trigger (accumulation grind | impulse
    // shock), so a cursor that broke at both layers reads as two honest records, not a dup.
    recAxes = recs.map(e => ({ cursor: e.cursor, layer: e.layer, alongAxis: e.alongAxis || [], trigger: e.trigger }));
  } catch { recCursors = []; recAxes = []; }

  // The CURSOR axis: arrest on the peaks. The arrest threshold is calibrated to the reach,
  // not a fixed floor — `bayes` clusters low, so a constant floor would arrest nowhere.
  // Default: the reach MEDIAN. With opts.alpha set, it is the DERIVED VOID BOUNDARY
  // (read/voidnull.js) — a high quantile of the noise null the reach's own non-cohering
  // bulk throws up by chance: extreme-value (the bar the largest of N chance draws reaches,
  // so the longest accidental peak is VOID, not a stop), leave-one-out, robust, alpha the
  // only knob (the hallucination budget). A cursor then arrests only when its bayes BEATS
  // what this context produces by chance (SYN), and every reach cursor carries its verdict
  // (SYN/NUL) so a checked-and-empty stretch is a record, not a silence. The threshold is
  // the context's, computed live — the signal/noise boundary recalibrated to the window the
  // surf landed in. Default (no alpha) is byte-identical to the median rule. The anchor is
  // always a stop (retrieval set it down); every REC cursor is always a stop (a frame broke
  // there); the strongest remaining peaks fill toward maxStops, never the flat between them.
  // LENS CONDITIONING (Track C #3). With opts.lens set to a chosen eigen-lens |L⟩ AND
  // per-unit significance activations supplied, each cursor's field contribution is
  // weighted by |⟨L|vᵤ⟩|² (Born) — the surf "rides forward inside one reading" and
  // arrests on that reading's peaks rather than the document's loudest overall. Unset
  // (the default), `scoreOf`/`scoreAt`/`scoreSeries` ARE the raw bayes, so the arrest is
  // byte-identical to today — the parity gate.
  const activations = Array.isArray(opts.activations) ? opts.activations : null;
  const lensVec = (opts.lens && activations) ? opts.lens : null;
  const lensCond = lensVec ? (c) => bornWeight(lensVec, activations[c]) : null;
  // THREAD CONDITIONING (salience.js): condition the score by the Born weight of each cursor
  // against the activated conversation thread (opts.thread, a sparse term basis). This is the
  // SAME |⟨·|·⟩|² as the eigen-lens, but the basis is the live thread (prompt + recent turns +
  // cast) over the discrete term space — embedder-free. So a cursor's score becomes structure
  // (bayes) × salience-to-the-thread, and the null below then decides where the surfer's
  // return stops being salient. Absent opts.thread it is null → byte-identical to today.
  // opts.thread is { terms, figures } (threadBasis) or a bare term Map (terms only). A cursor
  // is salient to the thread by EITHER channel: it uses the thread's words (term overlap) OR it
  // is about the thread's figures (figure overlap over the coref-resolved field — "the
  // creature" counts as Gregor). max, not product: lexical silence about a figure the sentence
  // is plainly concerning must not zero it out (that was the lexical-only miss of the reversal).
  const threadTerms = opts.thread ? (opts.thread.terms || opts.thread) : null;
  const threadFigs  = opts.thread && opts.thread.figures ? opts.thread.figures : null;
  const hasThread   = (threadTerms && threadTerms.size) || (threadFigs && threadFigs.size);
  // the LINK channel: the salient unit is the edge, not the node. A span's link salience is
  // the strongest link it carries — a link BETWEEN thread figures scores above one merely
  // incident on one, so the relation outranks the mention. Built once (reads the log).
  const threadLinks = (threadFigs && threadFigs.size) ? linksBySentence(doc) : null;
  const threadCond = hasThread
    ? (c) => Math.max(
        threadTerms ? bornSalience(threadTerms, doc.tokensBySentence?.[c]) : 0,         // lexical
        threadFigs ? figureSalience(threadFigs, readings[c]?.predicted?.figures || []) : 0,  // coref figures
        threadLinks ? Math.max(0, ...(threadLinks.get(c) || []).map((l) => linkSalience(threadFigs, l))) : 0,  // the link
      )
    : null;
  // Compose the conditioners multiplicatively — a cursor must be both on the chosen reading
  // (lens) and on the thread (salience) to score. Either alone is the single-condition case.
  const cond = (lensCond && threadCond) ? (c) => lensCond(c) * threadCond(c)
    : (lensCond || threadCond || null);
  const scoreOf = (f) => (cond ? f.bayes * cond(f.idx) : f.bayes);
  const scoreAt = (c) => (cond ? bayesAt(c) * cond(c) : bayesAt(c));
  const scoreSeries = cond ? field.map(scoreOf) : reachBayes;

  // Adaptive reach reads structure off the noise null (the principled "how much"), so the
  // boundary mode is forced on there — with a default alpha if the caller named none. A fixed
  // window keeps the median rule unless the caller opts into a boundary alpha (byte-identical).
  const alpha = Number.isFinite(opts.alpha) ? opts.alpha : (adaptive ? 0.05 : null);
  const useBoundary = Number.isFinite(alpha);
  const band = useBoundary ? null : medianOf(scoreSeries);
  let isPeak;
  if (useBoundary) {
    for (const f of field) {
      const sc = scoreOf(f);
      const nul = deriveNull(scoreSeries, { scale: 'linear', alpha, leaveOut: sc });
      f.verdict = sc > nul ? 'SYN' : 'NUL';   // beats the noise null → structure; else held
    }
    isPeak = (f) => f.verdict === 'SYN';
  } else {
    isPeak = (f) => scoreOf(f) > band;
  }
  // THE CHORUS (opts.chorus, chorus.js). Off (the default) → `chorus` is null and the
  // incumbent median-rule / void-boundary arrest below runs VERBATIM, byte-identical to
  // today. On, several rides (significance, novelty, and — with a thread — the relevance
  // channels) each nominate against their own noise null and merge born-soft; the chorus
  // returns the stop list, or null to defer to the incumbent arrest when the reach was too
  // thin to tell signal from chance. A pure read of the field/readings already computed.
  const chorus = opts.chorus
    ? chorusStops({ field, readings, a, recCursors, maxStops, doc, alpha: alpha ?? 0.05 }, opts)
    : null;
  let stopList;
  if (chorus) {
    stopList = chorus.stopList;
  } else {
    const stops = new Set([a, ...recCursors]);
    const peaks = field
      .filter(f => isPeak(f) && !stops.has(f.idx))
      .sort((x, y) => scoreOf(y) - scoreOf(x));
    for (const p of peaks) {
      if (stops.size >= maxStops) break;
      stops.add(p.idx);
    }
    stopList = [...stops].sort((x, y) => x - y);
  }

  // The peak: the steepest stop — where to take the significance reading.
  let peak = a;
  for (const c of stopList) if (scoreAt(c) > scoreAt(peak)) peak = c;

  // The focus: the warmest figure across the stops — each stop votes its warmest
  // figure; the peak's figure breaks ties so the eye sits where the field is steepest.
  const votes = new Map();
  for (const c of stopList) { const f = figAt(c); if (f) votes.set(f, (votes.get(f) || 0) + 1); }
  let focus = figAt(peak);
  let best  = votes.get(focus) || 0;
  for (const [f, v] of votes) if (v > best) { best = v; focus = f; }

  const base = { anchor: a, stops: stopList, peak, focus, field, recCursors, recAxes, rode: chorus ? 'chorus' : (useBoundary ? 'bayesian-void' : 'bayesian-figure') };

  // THE SIGNIFICANCE COLUMN (Tracks B/C/D). Off unless activations are supplied AND at
  // least one significance opt is set — so the default surf is byte-identical (the new
  // fields never appear). The passes read off ONE density operator ρ built over the
  // doc's significance activations (core/spectral.js), each gated by deriveNull. Pure on
  // vectors, so this runs unchanged on text, music, video — omnimodal for free.
  const wantSig = activations && (opts.atmosphere || opts.lensReport || opts.lens || opts.paradigm || opts.stance);
  if (!wantSig) return base;
  return { ...base, ...significancePass(activations, opts, { field, peak }) };
};

// Build ρ over the document's significance activations and read the three terrains off
// it. Memo-free (surf is not memoised); cheap at the 27-cell grain. `signs` rides the
// EVA stance when supplied (a defeated reading subtracts), default +1 (asserting).
export const significancePass = (activations, opts, surf = {}) => {
  const out = {};
  const basis = opts.prior ? (opts.prior.keys ? opts.prior : centroidBasis(opts.prior)) : null;
  const { rho } = buildDensity(activations, opts.weights || null, opts.signs || null);

  // LENS (Track C): the document's natural readings, ranked by Born weight, each gated
  // by a spectral null — a lens is REAL only when its weight beats what a random
  // spectrum of this rank throws up by chance (deriveNull on the eigenvalues). The von
  // Neumann entropy is the NPOV scalar AND the predictive uncertainty of the next unit.
  if (opts.lensReport || opts.lens || opts.paradigm) {
    const spectrum = eigenLenses(rho).map(l => l.weight);
    const lensEntropy = vonNeumann(spectrum);
    const k = Number.isFinite(opts.k) ? opts.k : 4;
    const top = eigenLenses(rho, { k });
    const lenses = top.map(({ lens, weight }) => {
      const nul = deriveNull(spectrum, { scale: 'linear', alpha: opts.alpha ?? 0.05, leaveOut: weight });
      return { weight: round(weight), real: Number.isFinite(nul) ? weight > nul : false, lens };
    });
    out.lenses = lenses;
    out.lensEntropy = round(lensEntropy);
  }

  // ATMOSPHERE (Track B): the Ground-grain tone + KL departure from the corpus prior.
  if (opts.atmosphere && basis) {
    out.atmosphere = atmosphereFromActivations(activations, basis, { alpha: opts.alpha ?? 0.05 });
  }

  // PARADIGM (Track D): incommensurability of the doc's basis against a competing one
  // (the corpus σ eigenbasis), gated against a WITHIN-document baseline so generic
  // non-commutation does not fire. Reports the under-read vs mis-framed candidate; the
  // append-only REC at the Paradigm site is the loop's to emit (kept report-only here).
  if (opts.paradigm && basis) {
    out.paradigm = paradigmReading(activations, rho, basis, opts);
    // The append-only REC, surfaced at top level for the fold (the spec's surf.paradigmRec):
    // a measured basis-defeat the note records as a reframe, not a deeper read.
    if (out.paradigm.rec) out.paradigmRec = out.paradigm.rec;
  }

  // STANCE (Track F): how the surfer MOVES ρ at the commit — the measured update stance,
  // with the confabulation guard quantified. Read off the field shape around the peak,
  // routed through cellAt: a Making only when a rank-1 lens clears its spectral null;
  // a Ground-grain Cultivating/Clearing (reserve, do not name a clause) otherwise.
  if (opts.stance) {
    out.stance = updateStance(surf.field || [], surf.peak ?? 0, rho, { alpha: opts.alpha ?? 0.05 });
  }
  return out;
};

// The Paradigm pass, report-only. The competing basis is the corpus σ's top
// eigenvectors; the baseline is the two halves of the DOCUMENT itself (two bases
// everyone agrees are commensurable). The commutator is incommensurable only when it
// beats that baseline's null — the calibration the spec's honest seam demands.
const paradigmReading = (activations, rho, basis, opts) => {
  const m = Number.isFinite(opts.paradigmRank) ? opts.paradigmRank : 3;
  const sigma = corpusSigma(basis);
  if (!sigma?.dim) return { measurable: false, verdict: 'unmeasured' };
  const docProj = projectorFrom(eigenLenses(rho, { k: m }).map(l => l.lens));
  const sigProj = projectorFrom(eigenLenses(sigma.rho, { k: m }).map(l => l.lens));
  const incommensurability = commutator(docProj, sigProj);

  // Baseline: split the doc in two and measure how much two commensurable halves'
  // bases non-commute. A handful of splits gives the chance distribution.
  const half = activations.length >> 1;
  const baseline = [];
  if (half >= m) {
    const a1 = projectorFrom(eigenLenses(buildDensity(activations.slice(0, half)).rho, { k: m }).map(l => l.lens));
    const a2 = projectorFrom(eigenLenses(buildDensity(activations.slice(half)).rho, { k: m }).map(l => l.lens));
    baseline.push(commutator(a1, a2));
    // a coarser split (thirds) so deriveNull has more than one sample to work with
    const t = Math.max(m, Math.floor(activations.length / 3));
    if (t < activations.length - m) {
      const b1 = projectorFrom(eigenLenses(buildDensity(activations.slice(0, t)).rho, { k: m }).map(l => l.lens));
      const b2 = projectorFrom(eigenLenses(buildDensity(activations.slice(t)).rho, { k: m }).map(l => l.lens));
      baseline.push(commutator(b1, b2));
    }
  }
  // Without enough baseline samples we cannot tell incommensurable from generic — the
  // safe (speak-more) failure is to stay UNDER-READ, never to claim a paradigm shift.
  const meanBase = baseline.length ? baseline.reduce((s, x) => s + x, 0) / baseline.length : Infinity;
  // Hysteresis (cube.md #8): ascend only on a measured defeat that clears the baseline
  // by a MARGIN, so a single noisy reach does not trigger a REC. The margin factor is
  // the within-call form; a caller threading `opts.paradigmPrior` (the previous reach's
  // incommensurability) can additionally require the defeat to have been SUSTAINED —
  // temporal hysteresis the stateless surf cannot enforce on its own.
  const hyst = opts.paradigmHysteresis ?? 1.5;
  const bar = meanBase * hyst;
  const sustained = !Number.isFinite(opts.paradigmPrior) || opts.paradigmPrior > bar;
  const beatsBaseline = Number.isFinite(meanBase) && incommensurability > bar && sustained;

  // THE ASCENT (Track D, now emitting). When the basis is defeated past its baseline,
  // the honest move is not a better reading inside the frame — it is a new frame. Emit
  // an append-only REC at the Paradigm site (REC_Composing_Paradigm — Generate × Pattern),
  // carrying its surprise-delta: the margin by which the basis was defeated, which is also
  // the cost that must be cleared again to move back. Routed through cellAt so the move is
  // refused if it is not Object-diagonal. This is the helix TURNING — REC re-admits what
  // counts as ground, handing the next read a bare NUL in the new (competing) frame.
  let rec = null;
  if (beatsBaseline) {
    const cell = cellAt('REC', { site: 'Paradigm', stance: 'Composing' });
    if (cell) rec = Object.freeze({
      op: 'REC', site: 'Paradigm', stance: 'Composing', grain: 'Pattern', cell: cell.key,
      surpriseDelta: round(incommensurability - meanBase),   // the audit's record of why the basis moved
      incommensurability: round(incommensurability), baseline: round(meanBase),
      reground: true,                       // hands back a bare ground (a NUL) in the new frame
      reframedTo: 'corpus-eigenbasis',      // the competing basis the next read re-grounds against
      rode: 'paradigm-commutator',
    });
  }

  return {
    measurable: baseline.length > 0,
    incommensurability: round(incommensurability),
    baseline: round(meanBase),
    // mis-framed: the basis itself fails to commute past baseline → ascend (REC the
    // Paradigm). under-read: it still commutes → stay at the Lens, retrieve more.
    verdict: beatsBaseline ? 'mis-framed' : 'under-read',
    rec,
  };
};

// |⟨L|v⟩|² — the Born overlap of a (27-cell) activation with a chosen eigen-lens,
// both unit-normalised. 0 when either is absent so a missing activation simply
// contributes no conditioning, never a crash.
const bornWeight = (lens, v) => {
  if (!Array.isArray(lens) || !Array.isArray(v)) return 0;
  let dot = 0, nl = 0, nv = 0;
  const n = Math.min(lens.length, v.length);
  for (let i = 0; i < n; i++) { dot += lens[i] * v[i]; nl += lens[i] * lens[i]; nv += v[i] * v[i]; }
  const d = Math.sqrt(nl) * Math.sqrt(nv);
  if (d <= 1e-12) return 0;
  const o = dot / d;
  return o * o;
};

const round = (x) => Math.round(x * 1e4) / 1e4;

const clampIdx = (x, S) => Math.max(0, Math.min(S - 1, x | 0));
const medianOf = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
