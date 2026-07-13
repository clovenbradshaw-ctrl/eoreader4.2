// EO: DEF(Atmosphere → Lens, Dissecting,Clearing) — the four registers
// Impressions are affective before propositional (spec §7). Each carries one register, and
// the register — not the phrase — is what drives action. This module is the DEF that reads a
// geometric signature and asserts which registers it belongs to. It carries no world model
// and names no facts; it classifies a feeling.
//
//   register      felt as             geometric signature                       drives
//   ────────────  ──────────────────  ────────────────────────────────────────  ─────────────────────
//   unease        something's off     high drift + low concentration            lower confidence; hold
//   surprise      huh, unexpected     high novelty, ANY perplexity              spend retrieval here
//   drift         we've wandered      centroid receding from anchor (§5)        stop / re-retrieve
//   recognition   seen this before    centroid near a prior turn's centroid     link back
//
// `surprise` deliberately fires on SEMANTIC novelty, not token perplexity: "dolphins have
// longer memory than humans" is a low-perplexity sentence and a wild claim, and only a
// semantic-novelty trigger catches it (spec §7).

export const REGISTERS = Object.freeze(['unease', 'surprise', 'drift', 'recognition']);

// classify(signal, triggers) → Array<{ register, intensity }>, one per crossed trigger,
// most intense first. `signal` is the output of sense/geometry.js `senseSignal`. A null
// channel (no geometric reading available) simply cannot raise its register — precision
// over recall (spec §12): the worker stays asleep when there's no signal.
export const classify = (signal = {}, triggers = {}) => {
  const {
    driftNarrate = 0.55, concentrationFloor = 0.20,
    noveltyNarrate = 0.60, recognitionFloor = 0.85,
  } = triggers;
  const { drift, concentration, novelty, recognitionSim } = signal;
  const out = [];

  // drift — the centroid has receded from the anchor past the trigger.
  if (typeof drift === 'number' && drift >= driftNarrate) {
    out.push({ register: 'drift', intensity: drift });
  }

  // unease — the conjunction of drift AND thin footing. Low concentration weighs LOW and
  // never triggers alone (spec §5 caveat); it only sharpens an already-present drift.
  if (typeof drift === 'number' && drift >= driftNarrate
      && typeof concentration === 'number' && concentration <= concentrationFloor) {
    // intensity blends the drift with how thin the ground is.
    out.push({ register: 'unease', intensity: Math.min(1, drift * 0.6 + (1 - concentration) * 0.4) });
  }

  // surprise — semantic novelty spike.
  if (typeof novelty === 'number' && novelty >= noveltyNarrate) {
    out.push({ register: 'surprise', intensity: novelty });
  }

  // recognition — this reading sits on top of an earlier turn's.
  if (typeof recognitionSim === 'number' && recognitionSim >= recognitionFloor) {
    out.push({ register: 'recognition', intensity: recognitionSim });
  }

  out.sort((a, b) => b.intensity - a.intensity);
  return out;
};

// The dominant register of a signal (or null) — the one that drives action this stop.
export const dominant = (signal, triggers) => classify(signal, triggers)[0] || null;
