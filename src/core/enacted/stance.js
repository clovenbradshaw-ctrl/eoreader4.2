// EO: DEF·EVA·REC(Field,Atmosphere → Lens,Paradigm, Dissecting,Binding,Composing) — recalibration as logged REC
// The stance layer as a fold — recalibration as a REC in the log (prototype, flagged).
//
// THE SEAT this dissolves. The enacted loop rides a scale — "what counts as normal
// surprise for this reading" (the confirm band, the per-line step). Today that scale
// is set two ways, both OUTSIDE the log: hand-set constants (the k·step family), or
// the causal `recalibrate()` window in loop.js that refits band/step every cursor from
// a rolling `seen[]`. The refit is the reading's stance adapting — but by a mechanism
// that sits outside the enacted record: it cannot be replayed by the fold, and it
// cannot itself be RECed. A derived threshold (even the signal-from-noise one measured
// in docs/born-frame-measurement.md) is the same seat with better arithmetic, as long
// as it is computed by something the log does not contain.
//
// THE MOVE. Make the calibration an ENACTED act. A `stance` frame stands on the
// reading's current sense of normal — its band and step. Each cursor is an EVA of the
// incoming surprise against that normal; the departures accumulate as strain. When the
// accumulated drift beats what the reading's own surprise throws up by chance, the
// stance frame can no longer hold its normal and RECs: it installs a NEW normal as a
// DEF. Recalibration is then a REC in the log — replayable by `replayFrames` (which is
// already layer-agnostic), and revisable by the same operator the loop uses on a claim.
// REC applied to REC.
//
// THE BREAK RULE is signal-from-noise, NOT the Born partition. Step 0
// (docs/born-frame-measurement.md) measured that `offMass > onMass` does not track a
// frame break; the stance layer as literally specified in the directive inherited that
// rule and would inherit its negative. So the stance breaks by the criterion that DID
// measure sound: the drift beats the noise line derived from the stream's own spread.
//
// THE FOLD FALLS OUT FOR FREE. `replayFrames` reconstitutes any layer's frame by
// spreading `...e.frame` and accumulating `strainDelta` under the frame's leak. So if
// the stance DEF carries { band, step } and each stance EVA carries
// `strainDelta = (1−λ)·(surprise − band)` with the stance frame's leak = λ, the folded
// strain IS the EWMA drift of surprise from the stance's normal — the detector's own
// state, reconstituted by the existing fold with no new replay code. That is the
// directive's claim made literal: "replayFrames reconstitutes the calibration at any
// cursor with no new code, because it folds any layer generically."

import { DEFAULT_STRAIN_LEAK } from './frame.js';

// BORN_FRAME — ON by default. The reading's calibration (confirm band, per-line step,
// AND the shock gate) comes from the online stance fold: recalibration is a logged,
// replayable stance REC, and the silent causal `recalibrate()`/`seen[]` window is not
// used. Set `BORN_FRAME=0` (or false/off) to restore the causal path for comparison.
// SCOPED to the reading — the boundary parser, surfer, and predictor keep the causal
// calibration (they default `bornFrame` off at the loop; only the reading opts in). The
// swap holds the whole suite green either way; see docs/born-frame-measurement.md.
export const BORN_FRAME =
  !(typeof process !== 'undefined' && process.env && /^(0|false|off)$/i.test(process.env.BORN_FRAME || ''));

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const meanExcess = (xs, band) => {
  const ex = xs.map((x) => Math.max(0, x - band)).filter((e) => e > 0);
  return ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : 0;
};
const stdOf = (xs) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
};
const round = (x) => Math.round(x * 1000) / 1000;

// The two-sided Gaussian critical value for a per-cursor false-alarm budget α — the
// ONE knob, the same hallucination budget deriveNull/boundedNull expose. The surprise
// stream is not Gaussian, so this is an approximation; what matters is that the break
// LINE is z·σ_drift — derived from the stream's OWN spread and the leak — not a bare
// constant. A caller wanting the exact null can Monte-Carlo σ_drift (the noise-k probe
// does); the analytic line keeps the module pure and deterministic for the fold.
const Z = Object.freeze({ 0.1: 1.645, 0.05: 1.96, 0.02: 2.326, 0.01: 2.576 });
const zFor = (alpha) => Z[alpha] ?? 1.96;

// The minimum noise scale — a floor on σ0 so a (near-)flat opening window still admits
// signal, and above the log's 3-decimal rounding so a real drift is not quantized to
// zero. 0.01 is "1% surprise": below it the stream is numerically flat and no departure
// is meaningfully measurable. Real meaning-surprise carries far more spread than this,
// so the floor binds only on degenerate/synthetic constant streams.
const MIN_SCALE = 0.01;

// The stance frame's terms — a human-readable calibration signature, so a DEF in the
// log SAYS what normal the reading committed to (and the thrash detector can see a
// stance oscillating between two normals, exactly as it does for any layer).
const signature = (band, step) => [`band≈${round(band)}`, `step≈${round(step)}`];

// Build the stance fold over a surprise series. Pure and deterministic. Returns the
// enacted events (DEF/EVA/REC for layer 'stance', in generation order) and a
// convenience `calibrationAt(cursor)`; the events also fold through the ordinary
// `replayFrames` with no new code (see header).
//
//   leak     the stance frame's memory (λ) — how far back a drift is felt.
//   alpha    the false-alarm budget for a recalibration (the one knob).
//   warmup   samples used to fit the first / each new normal.
//   minEpoch cursors a fresh stance normal holds before it can REC again (hysteresis,
//            the refractory the loop already runs — a just-recalibrated stance must not
//            immediately re-break on the residual that forced it).
export const stanceFold = (surprises, {
  leak = DEFAULT_STRAIN_LEAK, alpha = 0.05, warmup = 8, minEpoch = 8,
} = {}) => {
  const xs = (surprises || []).map((x) => (Number.isFinite(+x) ? +x : 0));
  const N = xs.length;
  const events = [];
  let seq = 0;
  const emit = (e) => { const s = Object.freeze({ ...e, register: 'enacted', reader: 'reading', seq: seq++ }); events.push(s); return s; };

  const globalStd = stdOf(xs) || 1e-9;   // fallback spread until an epoch has enough samples
  const driftScale = Math.sqrt((1 - leak) / (1 + leak));   // std(EWMA) = σ · this, for iid input

  if (!N) return { events, calibrationAt: () => null };

  // Fit a normal from a window: the band (median), the step (mean excess), and a
  // FROZEN noise scale σ0 (the window's spread, floored so a degenerate flat window
  // still admits signal). σ0 is fit at DEF time from PAST surprises and held for the
  // epoch, so the drift line is judged against the calm the stance committed to — a
  // later turbulent stretch does not inflate its own detection threshold.
  const fit = (window) => {
    const band = median(window);
    const step = meanExcess(window, band);
    const sigma0 = Math.max(stdOf(window), globalStd * 0.25, MIN_SCALE);
    return { band, step, sigma0, scale: Math.max(step, sigma0) };
  };
  let epochStart = 0;
  let cal = fit(xs.slice(0, Math.min(warmup, N)));
  const defFrame = (cursor, producedBy) => emit({
    op: 'DEF', layer: 'stance', cursor,
    frame: Object.freeze({ layer: 'stance', cursor, terms: signature(cal.band, cal.step), threshold: null, leak, band: round(cal.band), step: round(cal.step) }),
    producedBy,
  });
  defFrame(0, 'initial');

  let g = 0;                 // the leaky drift of surprise from the stance's normal (== folded strain)
  const sinceSet = [];       // EVA seqs since the frame was set (the forcing EVAs, §9)

  for (let c = 1; c < N; c++) {
    const s = xs[c];
    // SPIKE-ROBUST departure. A single line far from the normal is a SHOCK — the frame
    // layer's impulse, not a shift in the normal — so its pull on the stance is CLIPPED
    // to the accommodation scale. A sustained shift moves every line the same way and
    // accumulates; one hammer-blow contributes at most `scale` and then leaks away. This
    // is what separates "the reading was surprised once" from "the reading's sense of
    // normal has moved," and it is why the stance does not chase a single anomaly.
    const raw = s - cal.band;
    const departure = Math.max(-cal.scale, Math.min(cal.scale, raw));
    const strainDelta = round((1 - leak) * departure);
    g = round(leak * g + strainDelta);          // EWMA drift — identical to replayFrames' folded strain

    // The noise line: how far the clipped drift wanders by chance under the epoch's own
    // FROZEN spread. std(EWMA) = σ0 · driftScale for iid input; z·that is the (1−α) line.
    const line = round(zFor(alpha) * cal.sigma0 * driftScale);
    const verdict = Math.abs(g) > line ? 'strain' : 'confirm';

    const ev = emit({
      op: 'EVA', testLayer: 'stance', frameLayer: 'stance', frameCursor: epochStart,
      cross: false, cursor: c, particular: c,
      verdict, surprise: round(s), strainDelta, drift: g, line,
    });
    sinceSet.push(ev.seq);

    // REC when the drift beats the noise line AND the fresh normal has held its minimum
    // epoch (hysteresis). The stance's normal has shifted — recalibrate, in the log.
    if (c - epochStart >= minEpoch && line > 0 && Math.abs(g) > line) {
      const from = Object.freeze({ layer: 'stance', cursor: epochStart, terms: signature(cal.band, cal.step), band: round(cal.band), step: round(cal.step) });
      const recEv = emit({
        op: 'REC', target: 'stance', action: 'recalibrate', layer: 'stance', cursor: c,
        trigger: 'drift', alongAxis: [raw >= 0 ? 'turbulence' : 'calm'],
        from, drift: g, line, strainSum: g, forcedBy: sinceSet.slice(),
      });
      // Install the new normal from the recent window — which, because detection lags the
      // shift by the drift's build-up, is now mostly POST-shift data. The reading's
      // re-fit sense of normal, a DEF the fold can replay.
      cal = fit(xs.slice(Math.max(0, c - warmup + 1), c + 1));
      epochStart = c;
      g = 0;
      sinceSet.length = 0;
      defFrame(c, { rec: recEv.seq });
    }
  }

  // Fold the stance events to a cursor and read the live normal — a thin scan mirroring
  // replayFrames (which reconstitutes the SAME frame generically; see the tests).
  const calibrationAt = (cursor = Infinity) => {
    let cur = null;
    for (const e of events) {
      if (e.cursor > cursor) break;
      if (e.op === 'DEF') cur = { band: e.frame.band, step: e.frame.step, cursor: e.cursor, terms: e.frame.terms };
    }
    return cur;
  };

  return { events, calibrationAt };
};

// The ONLINE stance — the same drift detector as `stanceFold`, but driven one cursor
// at a time so the enacted loop can run it in step (loop.js, behind BORN_FRAME). It is
// STRICTLY causal: it seeds its opening normal from the first `warmup` surprises and
// judges every later cursor against a normal fit only from the past — no whole-stream
// peek (the one thing the batch version does that the arrow forbids inside the live
// loop). `observe(cursor, surprise)` returns the event DESCRIPTORS to emit (the loop
// assigns their seq and links the REC→DEF provenance), so the stance's DEF/EVA/REC land
// in the loop's own log and fold through `replayFrames` with the proposition and
// document layers. Until seeded, `band`/`step` report the caller's seed (the loop's
// confirm-band default), so the opening reads exactly as the fixed path did.
export const createStance = ({
  leak = DEFAULT_STRAIN_LEAK, alpha = 0.05, warmup = 8, minEpoch = 8,
  seedBand = 0, seedStep = 0,
} = {}) => {
  const driftScale = Math.sqrt((1 - leak) / (1 + leak));
  const z = zFor(alpha);

  // A running global spread (Welford) — the causal analogue of the batch version's
  // whole-array std, used only as the σ floor so a flat epoch still admits signal.
  let gN = 0, gMean = 0, gM2 = 0;
  const pushGlobal = (x) => { gN++; const d = x - gMean; gMean += d / gN; gM2 += d * (x - gMean); };
  const globalStd = () => (gN >= 2 ? Math.sqrt(gM2 / gN) : 0);

  const seedBuf = [];
  const recent = [];   // ring of the last `warmup` surprises — the window a REC re-fits from
  const pushRecent = (x) => { recent.push(x); if (recent.length > warmup) recent.shift(); };

  let seeded = false;
  let band = seedBand, step = seedStep, sigma0 = MIN_SCALE, scale = Math.max(seedStep, MIN_SCALE);
  let g = 0, epochStart = 0;
  // The step is the accommodation SCALE (typical per-line excess over the normal), not a
  // commitment — it tracks WITHIN an epoch as surprises arrive, running so a scale fit
  // from a flat opening does not stay stuck at zero (which would collapse the k·step belt
  // that reads off it). The BAND is the commitment (RECs on drift); the step is a gauge.
  let exSum = 0, exN = 0;
  const refitScale = () => { step = exN ? exSum / exN : 0; scale = Math.max(step, sigma0); };

  const fit = (win) => {
    band = median(win);
    const ex = win.map((x) => Math.max(0, x - band)).filter((e) => e > 0);
    exSum = ex.reduce((a, b) => a + b, 0); exN = ex.length;
    sigma0 = Math.max(stdOf(win), globalStd() * 0.25, MIN_SCALE);
    refitScale();
  };
  const frameOf = (cursor) => Object.freeze({
    layer: 'stance', cursor, terms: signature(band, step), threshold: null, leak, band: round(band), step: round(step),
  });

  return {
    get band() { return band; },
    get step() { return step; },
    get seeded() { return seeded; },
    // Observe one cursor. Returns { def?, eva?, rec?, recDef? } descriptors (no seq); the
    // loop emits them in that order and sets recDef.producedBy = { rec: <emitted rec seq> }.
    observe(cursor, surprise) {
      const s = Number.isFinite(+surprise) ? +surprise : 0;
      pushGlobal(s); pushRecent(s);
      const out = {};
      if (!seeded) {
        seedBuf.push(s);
        if (seedBuf.length >= warmup) {
          fit(seedBuf); seeded = true; epochStart = cursor; g = 0;
          out.def = { op: 'DEF', layer: 'stance', cursor, frame: frameOf(cursor), producedBy: 'initial' };
        }
        return out;   // opening: no EVA until the first normal is committed
      }
      const raw = s - band;
      const excess = Math.max(0, raw);                            // this line's accommodation over the normal
      if (excess > 0) { exSum += excess; exN += 1; refitScale(); } // step tracks the epoch's live scale
      const departure = Math.max(-scale, Math.min(scale, raw));   // spike-robust (a shock is the frame layer's, not a shift)
      const strainDelta = round((1 - leak) * departure);
      g = round(leak * g + strainDelta);                          // == replayFrames' folded strain
      const line = round(z * sigma0 * driftScale);
      out.eva = {
        op: 'EVA', testLayer: 'stance', frameLayer: 'stance', frameCursor: epochStart,
        cross: false, cursor, particular: cursor,
        verdict: Math.abs(g) > line ? 'strain' : 'confirm', surprise: round(s), strainDelta, drift: g, line,
      };
      if (cursor - epochStart >= minEpoch && line > 0 && Math.abs(g) > line) {
        const from = Object.freeze({ layer: 'stance', cursor: epochStart, terms: signature(band, step), band: round(band), step: round(step) });
        out.rec = {
          op: 'REC', target: 'stance', action: 'recalibrate', layer: 'stance', cursor,
          trigger: 'drift', alongAxis: [raw >= 0 ? 'turbulence' : 'calm'], from, drift: g, line, strainSum: g,
        };
        fit(recent.slice()); epochStart = cursor; g = 0;
        out.recDef = { op: 'DEF', layer: 'stance', cursor, frame: frameOf(cursor), producedBy: null };
      }
      return out;
    },
  };
};
