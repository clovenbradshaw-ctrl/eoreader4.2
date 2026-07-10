// EO: SYN·EVA·SIG(Field → Field,Atmosphere, Composing·Tracing·Tending) — the referent Horizon (forward ρ)
// surfer/referent-horizon.js — the FORWARD, discrete-atom twin of horizon.js's density ρ.
//
// horizon.js is the subjective memory in the MEANING basis: a density operator ρ that
// accumulates each turn's reading and answers relEntropy(inc, ρ) — the BACKWARD/significance
// surprise, ρ-relative ("against MY state" — the me-ness). But the FORWARD predictive channel
// (core/surprise.js forwardScore/feltSurprise) scores −log₂ p(arrival) over a Map<atom,mass>
// referent profile, a different representation the density ρ cannot supply. So the forward
// channel needs its OWN owned prior — and until now it had none: reading.js rebuilds the per-cursor
// profile from the log and throws it away, so forward surprise was stateless, a view from nowhere.
//
// This is that owned prior. It holds a running Map<atom,mass> that ACCUMULATES arrivals by the same
// γ-decayed fold horizon.js uses (recent heavier, old forgotten), and answers feltSurprise against
// it — so the surprise is THIS self's: how much the arrival departs from what this reader has
// actually seen, not from a fixed ground. Two horizons with different histories feel different
// surprise for the same arrival — the subjectivity. And because it composes feltSurprise, the
// efference self/world line rides through it: the reafferent (what I caused) is attenuated, the
// exafferent (worldBits) is the real, ρ-relative learning signal.
//
// Modality-blind by inheritance: the prior is Map<atom,mass> in ANY basis (propositions, tonal
// moves, motion, cells), so the same owned Horizon accumulates over text, a melody, a video —
// one self's forward memory, whatever it reads.

import { forwardScore, feltSurprise, forwardDist, NOVELTY_RESERVE } from '../core/index.js';

const round = (x) => Math.round(x * 100) / 100;

// Coerce a plain object or entries into a Map, so callers can pass either — the arrival is small.
const toMap = (a) => (a instanceof Map ? a : new Map(Object.entries(a || {})));

// The γ-decayed fold: every incumbent decays by γ, every arriving atom deposits its mass. This is
// the referent-profile form of horizon.js's `mix` (the density convex blend) — recent readings
// heavier, an early atom's mass fading but never pinned. Returns a fresh Map; inputs untouched.
const fold = (prior, arrival, gamma) => {
  const next = new Map();
  for (const [k, m] of prior) next.set(k, gamma * m);
  for (const [k, m] of arrival) next.set(k, (next.get(k) || 0) + m);
  return next;
};

// createReferentHorizon({ gamma, novelty }) — the owned forward prior.
//   gamma    recency of the fold — weight kept on the accumulated prior each step (0.8 = slow
//            memory that outlasts a few turns; lower forgets faster). Matches horizon.js.
//   novelty  the reserve mass held for an as-yet-unseen atom (protention), passed to the forward
//            score; a committed history predicts sharply, a broad one leaves more reserve.
export const createReferentHorizon = ({ gamma = 0.8, novelty = NOVELTY_RESERVE } = {}) => {
  let prior = new Map();          // the owned running referent profile — this self's forward memory
  let turns = 0, cumSurprise = 0; // ∫ per-step exafferent surprise (the departure this self has felt)

  const totalMass = () => { let s = 0; for (const m of prior.values()) s += m; return s; };
  const reading = (extra = {}) => Object.freeze({
    turns, atoms: prior.size, mass: round(totalMass()),
    cumulativeSurprise: round(cumSurprise), ...extra,
  });

  // feel — how surprising this arrival is GIVEN what this self has accumulated, read WITHOUT
  // committing (the sibling of horizon.surpriseOf). The full efference split: pass `predicted`
  // (the outstanding efference copies' atom keys) to attenuate the reafferent; `worldBits` is the
  // exafferent surprise this self genuinely did not author and did not foresee.
  const feel = (arrival, opts = {}) => feltSurprise(prior, toMap(arrival), { novelty, ...opts });

  // score — the perceptual (no self/world split) forward surprise against the owned prior.
  const score = (arrival, opts = {}) => forwardScore(prior, toMap(arrival), { novelty, ...opts });

  // expect — what this self predicts arrives NEXT: p(next | its accumulated prior). Generation
  // draws from this; reading scores against it. Same forward object, two uses.
  const expect = () => forwardDist(prior, { novelty });

  // observe — fold one arrival into the Horizon, advancing this self's forward memory. Reads the
  // felt surprise BEFORE folding (you are surprised by what you did not yet know), then accumulates
  // the WHOLE arrival — memory habituates to everything sensed, self-caused included (you come to
  // expect your own patterns); the self/world line governs the SURPRISE, not what is remembered.
  const observe = (arrival, opts = {}) => {
    const arr = toMap(arrival);
    const felt = feel(arr, opts);
    prior = fold(prior, arr, gamma);
    turns += 1;
    cumSurprise += felt.worldBits;          // accumulate the EXAFFERENT departure — the learning
    return reading({ turnSurprise: felt.worldBits, felt });
  };

  // reground — the helix turning, in the referent basis: pull the prior back toward the empty
  // ground (max-entropy, nothing expected), forgetting toward a fresh start on a measured defeat.
  // `strength` 1 → fully forget (back to the opening); 0 → no-op. The parallel to horizon.reground.
  const reground = (strength = 0.8) => {
    const s = Math.max(0, Math.min(1, strength));
    if (s >= 1) prior = new Map();
    else { const next = new Map(); for (const [k, m] of prior) next.set(k, (1 - s) * m); prior = next; }
    return reading({ regrounded: true });
  };

  return Object.freeze({
    observe, feel, score, expect, reground, reading,
    prior: () => new Map(prior),
    gamma,
  });
};
