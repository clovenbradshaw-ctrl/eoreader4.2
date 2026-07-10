// EO: EVA·SEG·SIG(Network → Atmosphere,Network, Binding·Tracing·Tending) — the population homeostat
// metabolism/homeostat.js — hold the whole population at its productive operating point.
//
// select.js selects FOR fitness, but nothing holds the POPULATION between its two failure walls. It
// even names one: it "freezes on whatever genome it held when the famine hit" (the frozen wall,
// monoculture); the other is runaway churn where nothing ever converges. The current answer is only
// "seasonal plenty" — hope the season thaws it. That is not a homeostat.
//
// Neurons solve exactly this with SYNAPTIC SCALING: they renormalize total input so no synapse runs
// away and the network sits near CRITICALITY — the band between order and chaos where dynamic range is
// maximal. This is that, for a population: read the gene-pool DIVERSITY and renormalize SELECTION
// PRESSURE to keep it in a critical band. Below the band (converging toward monoculture) → RELAX:
// lower the pressure, widen the neutral reservoir, protect the standing variation that novelty grows
// from. Above the band (churning, no convergence) → TIGHTEN: raise the pressure, let selection settle.
// It is a control loop on the population, not a fitness knob on any genome — the principled cure for
// the freezing failure mode, replacing "hope for plenty" with a governor that acts. Deterministic.

// createHomeostat — the diversity governor. `target`±`band` is the critical window; `gain` is how hard
// it corrects; pressure is clamped to [minPressure, 1] (it can relax selection, never invent it).
export const createHomeostat = ({ target = 0.15, band = 0.05, gain = 0.6, minPressure = 0.35, maxPressure = 1, reservoirBase = 2, reservoirMax = 8 } = {}) => {
  let pressure = maxPressure;
  const lo = target - band, hi = target + band;
  const log = [];

  // observe(diversity) → the renormalized controls for THIS period. `error` is the signed distance
  // from the band (0 inside it); a monotone control law moves pressure WITH diversity.
  const observe = (diversity, period = 0) => {
    const d = Number(diversity) || 0;
    const error = d < lo ? (d - lo) : d > hi ? (d - hi) : 0;   // <0 freezing (monoculture), >0 churning, 0 critical
    const norm = error / Math.max(band, 1e-6);                 // error in band-widths
    // FREEZING (error<0): relax selection — lower pressure toward the floor, and WIDEN the reservoir
    //   to protect the standing variation novelty grows from. CHURNING (error>0): tighten to the
    //   ceiling. CRITICAL (in band): ease pressure back toward the ceiling, reservoir at its base.
    pressure = round(
      error < 0 ? Math.max(minPressure, maxPressure + gain * norm)         // norm<0 → below max
      : error > 0 ? maxPressure
      : Math.min(maxPressure, pressure + 0.1 * (maxPressure - pressure)));
    const reservoir = Math.round(error < 0
      ? Math.min(reservoirMax, reservoirBase + (-norm) * (reservoirMax - reservoirBase))
      : reservoirBase);
    const band_ = error === 0 ? 'critical' : error < 0 ? 'freezing' : 'churning';
    const rec = Object.freeze({ op: error < 0 ? 'REC' : 'SEG', kind: 'homeostat', period, diversity: round(d), pressure, reservoir, band: band_,
      note: `diversity ${round(d)} → ${band_}: pressure ${pressure}, reservoir ${reservoir}` });
    if (!log.length || log[log.length - 1].band !== band_) log.push(rec);   // log band transitions only
    return Object.freeze({ diversity: round(d), pressure, reservoir, band: band_, inBand: error === 0, event: rec });
  };

  return Object.freeze({
    observe,
    pressure: () => pressure,
    window: () => Object.freeze({ target, lo: round(lo), hi: round(hi) }),
    records: () => log.slice(),
  });
};

const round = (x) => Math.round(x * 1000) / 1000;
