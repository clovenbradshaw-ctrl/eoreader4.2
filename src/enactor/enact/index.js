// EO: DEF·EVA·REC(Field,Entity,Network → Lens,Paradigm, Making,Tracing,Composing) — enacted DEF-EVA-REC loop; barrel
// The enact holon — the enacted DEF–EVA–REC loop (the significance engine).
//
// Two loops, kept apart (§2, §10):
//
//   DEPICTED   classify/   a clause's phasepost perception — what a clause
//               reports — content, timeless, recomputable, tagged
//               `kind:'phasepost'`. NOT this holon.
//   ENACTED    this holon   the reading's own act of establishing terms (DEF),
//               testing particulars against them (EVA), and restructuring its
//               frame when the testing breaks it (REC) — temporal, ordered,
//               cross-layer, tagged `register:'enacted'`. The cognition.
//
// createEnactedLoop is pure on an injected `read(cursor) → { surprise, terms }`.
// enactedReadingTo wires it to the cheap γ-mass surprise that already runs over
// the whole document (read/readingAt), builds the enacted log once per doc in
// generation order, and folds it to a cursor — the mechanical skeleton the spec
// scopes for today, to be deepened with no shape change once the meaning reader is
// live (§11).

import { readingAt } from '../../perceiver/index.js';
import { createEnactedLoop, BORN_FRAME } from '../../core/enacted/index.js';
import { replayFrames, loopStats } from './replay.js';
import { buildMeaningRead } from './meaning.js';

export { createEnactedLoop, calibrateReader, DEFAULT_THRESHOLDS, DEFAULT_CONFIRM_BAND, DEFAULT_IMPULSE, DEFAULT_IMPULSE_QUANTILE } from '../../core/enacted/index.js';
export { replayFrames, loopStats } from './replay.js';
export { createFrame, snapshotFrame, sameTerms, DEFAULT_STRAIN_LEAK } from '../../core/enacted/index.js';
export { isEnacted, isDepicted, assertSingleRegister } from './register.js';
export { buildMeaningRead } from './meaning.js';
export { stanceFold, createStance } from './stance-fold.js';

// The cheap surprise provider — now the BAYESIAN γ-mass surprise over the field
// (docs/bayesian-surprise.md), the only strain honestly computable until the meaning
// reader is live (§11). It rides `bayes` (the significance channel), not `surprise`
// (novelty), so a frame breaks on a genuine restructuring of the reading rather than
// on an inert improbability. The terms are the figures the reading predicts are in
// play at the cursor: a real, mechanical term-set the frame stands on, re-read
// whenever a frame is set, so a document frame (re-read only on its rare RECs) stays
// older and stickier than a proposition frame — which is why the same referent reads
// differently at two ages of the loop.

// Build the full enacted log for a doc once, in generation order, and cache it. The
// log is append-only and the arrow runs forward, so the whole-document log is the
// superset of every cursor's reading; the fold (replayFrames) reconstitutes any
// cursor from it. Same discipline as projectGraph's memo — keyed by the doc, which
// is immutable post-parse — so the loop is run once, not per cursor move.
//
// The readings drive the loop; the band + thresholds are now calibrated CAUSALLY,
// online inside the loop from the surprises seen so far (calibrate:'causal'), not
// from a median over the whole reading — the future no longer sets the band that
// judges an early line. `bayes` clusters far below the static band, so the causal
// EWMA fits the scale as it reads, drifting up in turbulent text. A caller's
// explicit opts still win.
const LOGS = new WeakMap();
const enactedLogOf = (doc, opts) => {
  const cached = LOGS.get(doc);
  if (cached && !opts) return cached;
  const units = doc.units || doc.sentences || [];
  const readings = units.map((_, c) => readingAt(doc, c));
  // Causal calibration is the default; an explicit band/thresholds/calibrate in opts
  // turns it off (the caller is pinning the scale by hand, e.g. to show the numb path).
  const explicit = opts && (opts.confirmBand != null || opts.thresholds != null || opts.calibrate != null);
  const loop = createEnactedLoop({
    read: (c) => ({ surprise: readings[c]?.bayes ?? 0, terms: readings[c]?.predicted?.figures || [],
                    contrib: readings[c]?.bayesBy || null }),  // per-dimension strain (vector)
    ...(explicit ? {} : { calibrate: { mode: 'causal' } }),  // band + thresholds from PAST surprises only
    bornFrame: explicit ? false : BORN_FRAME,   // reading opts into the stance; an explicit hand-pinned scale wins
    ...(opts || {}),
  });
  if (units.length) loop.runTo(units.length - 1);
  if (!opts) LOGS.set(doc, loop.events);
  return loop.events;
};

// The reader's frames as of a cursor — the cross-layer enacted loop replayed to
// that cursor (§7). Returns the frames per layer (terms + live strain), the RECs
// fired up to here, the convergence/thrash stats over the whole reading, and the
// enacted log itself (generation order). The whole point of folding to a cursor is
// that the reading there is whatever the loop had arrived at by then, no further.
export const enactedReadingTo = (doc, cursor, opts) => {
  const events = enactedLogOf(doc, opts);
  const fold = replayFrames(events, cursor);
  return { ...fold, stats: loopStats(events), events, reader: 'cheap' };
};

// The meaning reader's REC thresholds on its own scale — now the SEED the causal
// calibrator starts from (and the belt when a caller pins the scale by hand), not a
// fixed belt. The meaning surprise (1 − cos) lives far above the γ-mass band, so the
// skeleton's 1.5/4 would fire on every line; these were measured against the worked
// corpus (real all-MiniLM embeddings) to a converging, non-thrashing reading — the
// document frame restructuring on the order of once per few chapters. Under the causal
// default the belt then refits to k·mean-excess as the reading proceeds (scale-free),
// so these hold only until the window is wide enough. Measured, per reader,
// overridable (§11).
export const MEANING_THRESHOLDS = Object.freeze({ proposition: 5, document: 16 });

// The DEEP reading — the same fold, driven by the meaning reader instead of the
// γ-mass skeleton (§11). When the embedder measures meaning, the surprise is the
// prediction error in meaning space, so frames restructure on semantic turns the
// cheap reader is blind to. Async (embedding is async); the per-clause embeddings
// are built once per (doc, embedder) and cached, so subsequent cursor folds only
// re-run the cheap loop. Under the hash organ it falls back to the cheap reader —
// callers can always await this and get an honest result either way.
//
// STRAIN PARITY with the cheap path (the gap this closes). The deeper reader had been
// the one cutting corners: it ran the GLOBAL MEDIAN band — peeking at the future to
// judge the past — and supplied no per-dimension contrib, so its directional strain
// was dead and its impulse, on the compressed 1−cos scale, never fired. It now wires
// exactly as the cheap path does: contrib from the same reading's bayesBy, and CAUSAL
// calibration by default (band, thresholds, and impulse fit from past surprises only).
// The machinery was already built; only the wiring on this path had skipped it.
const MEANING_READS = new WeakMap();   // doc → Map<embedderId, { surprise, terms, contrib } | null>
export const enactedReadingMeaning = async (doc, cursor, { embedder, confirmBand, thresholds, calibrate, ...opts } = {}) => {
  // The firewall and any explicit forces pass straight through to the skeleton.
  const fallback = () => enactedReadingTo(doc, cursor, {
    ...(confirmBand != null ? { confirmBand } : {}),
    ...(thresholds != null ? { thresholds } : {}),
    ...(calibrate != null ? { calibrate } : {}),
    ...opts,
  });
  if (!embedder?.measuresMeaning) return fallback();           // firewall → skeleton

  let perDoc = MEANING_READS.get(doc);
  if (!perDoc) { perDoc = new Map(); MEANING_READS.set(doc, perDoc); }
  let mr = perDoc.get(embedder.id);
  if (mr === undefined) {
    // The cheap reading is read ONCE per cursor and shared: the meaning surprise drives
    // WHEN the frame breaks; the same reading's bayesBy is the per-dimension axis it
    // breaks ALONG (the contrib). Both come off the one readingAt — no second pass.
    const reads = (doc.units || doc.sentences || []).map((_, c) => readingAt(doc, c));
    mr = await buildMeaningRead(doc, embedder, {
      termsAt:   (c) => reads[c]?.predicted?.figures || [],
      contribAt: (c) => reads[c]?.bayesBy || null,
    });
    perDoc.set(embedder.id, mr);                               // cache the embeddings (incl. a null result)
  }
  if (!mr) return fallback();                                  // could not measure → skeleton

  const units = doc.units || doc.sentences || [];
  const read = (c) => ({ surprise: mr.surprise[c], terms: mr.terms[c], contrib: mr.contrib?.[c] || null });

  // ONE calibration discipline: CAUSAL, the same arrow the cheap path runs (§5). The
  // band, the layer thresholds, AND the impulse are fit from the surprises seen SO FAR,
  // never the whole reading. The old default fit the band from the GLOBAL MEDIAN of
  // every surprise — the future setting the band that judged an early line; that
  // survives only as an explicitly-requested numb-reader demonstration
  // (calibrate:{mode:'global'}), kept out of the live answer path. An explicit
  // confirmBand/thresholds (or a non-causal calibrate) still pins the scale by hand,
  // exactly as on the cheap path; otherwise causal is the live default.
  const numb = calibrate?.mode === 'global';
  const pinned = !numb && (confirmBand != null || thresholds != null ||
                           (calibrate != null && calibrate.mode !== 'causal'));
  const loop = createEnactedLoop({
    read,
    bornFrame: (numb || pinned) ? false : BORN_FRAME,   // stance sources the scale; a hand-pinned/numb reading wins
    thresholds: thresholds ?? MEANING_THRESHOLDS,   // the meaning scale — seed for causal, belt when pinned
    ...(numb
        ? { confirmBand: medianOf(mr.surprise) }                                       // the numb global-median reader, by request
        : pinned
          ? { ...(confirmBand != null ? { confirmBand } : {}), ...(calibrate ? { calibrate } : {}) }
          : { calibrate: calibrate ?? { mode: 'causal' } }),                           // the live default
    ...opts,
  });
  if (units.length) loop.runTo(units.length - 1);
  const fold = replayFrames(loop.events, cursor);
  // confirmBand is the live scale as it stood at the end — the causal band fit from the
  // reading's own past (or the pinned/global band when one was requested).
  return { ...fold, stats: loopStats(loop.events), events: loop.events,
           reader: 'meaning', confirmBand: round3(loop.confirmBand) };
};

const medianOf = (xs) => {
  if (!xs?.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round3 = (x) => Math.round(x * 1000) / 1000;
