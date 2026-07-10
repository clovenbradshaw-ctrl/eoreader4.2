// EO: SEG(Field → Link, Dissecting) — Page-Hinkley detector
// The changepoint detector (source-trajectory spec §6).
//
// Forgetting gives the slow part of the trajectory — the estimate drifts as the
// source drifts. This gives the SHARP part: a detector over each channel's
// observation stream so the system can NAME a regime boundary instead of only
// smearing through it. A source that was a seeker until a break and a bullshitter
// after it must read as exactly that, with the break dated (§6).
//
// The spec offers two implementations — Bayesian online changepoint detection on
// the run-length posterior, or a Page-Hinkley test on the residual between an
// observation and the current forecast. We take Page-Hinkley (in its clamped
// two-sided CUSUM form): exact arithmetic with no sampling, so the write-time
// decision to emit a SEG changepoint is deterministic and the audit replays it
// byte-for-byte (§7). The "run-length posterior collapse" the spec describes is
// what the reset-on-fire below enacts — evidence before the break stops
// accumulating into the new regime.
//
// The credence channels are BOUNDED (coherence/corroboration in [0,1], revision
// in [−1,1]), which lets the tolerance `delta` do the work a noise model would
// otherwise have to. Set it ABOVE the within-regime jitter and BELOW a real
// regime shift: then a stationary stream — erratic (a bullshitter) or tight (a
// seeker) alike — never accumulates, because every residual is clamped away
// before it can pile up, while a genuine mean shift far larger than `delta`
// accumulates fast and trips the threshold. This is what keeps a noisy-but-
// stationary source ONE regime instead of fragmenting it into phantom breaks.
// Two-sided: degradation (coherence drops) and reform (it climbs back) both fire.

export const createPageHinkley = ({
  delta = 0.3,       // tolerated drift off the forecast — above jitter, below a real shift
  threshold = 0.5,   // accumulated drift past `delta` that names a break
  warmup = 5,        // observations before a fresh regime is allowed to fire
} = {}) => {
  // The regime's running forecast (mean so far, THIS regime), its count, and the
  // two clamped cumulative-deviation sums.
  let n = 0, mean = 0;
  let sDrop = 0;   // climbs when x runs BELOW the forecast by more than delta
  let sRise = 0;   // climbs when x runs ABOVE the forecast by more than delta

  const reset = () => { n = 0; mean = 0; sDrop = 0; sRise = 0; };

  // Feed one observation. Returns null, or a firing descriptor naming the break
  // direction and the accumulated drift (the `run_length_drop` payload).
  const observe = (x) => {
    if (n === 0) { n = 1; mean = x; return null; }   // first point sets the baseline

    const resid = x - mean;                          // residual against the forecast
    sDrop = Math.max(0, sDrop + (-resid - delta));
    sRise = Math.max(0, sRise + (resid - delta));

    n += 1;
    mean += resid / n;                               // fold into the running forecast

    if (n >= warmup && (sDrop > threshold || sRise > threshold)) {
      const direction = sDrop >= sRise ? 'drop' : 'rise';
      const magnitude = Math.max(sDrop, sRise);
      reset();
      return { direction, magnitude };
    }
    return null;
  };

  return { observe, reset, get n() { return n; }, get mean() { return mean; } };
};
