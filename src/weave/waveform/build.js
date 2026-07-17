// EO: EVA(Network → Lens, Tracing) — the invariant core (docs/omnimodal-waveform.md §3)
// buildWaveform(reading) => WaveformModel. Pure function of a validated Reading.
// Modality-blind by construction: everything below reads only `units[i].field`,
// `metric`, `segments`, and `sightings` — never anything a perceiver was told not
// to emit (contract.js §2.2). If this file, or anything it imports from
// src/weave/waveform/, ever branches on `reading.meta.modality`, the abstraction
// has leaked and the review rejects it.

import { MIN_SAMPLES } from '../../core/index.js';
import { robustMean } from './metric.js';
import { buildFramesAndTurns } from './frames.js';
import { findEchoes } from './echo.js';
import { buildCast } from './cast.js';
import { validateReading } from '../../perceiver/index.js';

// A DiscardLedger — every unit the pipeline evaluated, queryable, whether or not
// it was ever surfaced as a peak/turn/echo (§3.6). This is what turns "accountable
// loss" into something the reading surface can answer on hover, not just the log.
const createDiscardLedger = (units, baseline, strain, confidence, turnLine) => ({
  get(ordinal) {
    if (ordinal < 0 || ordinal >= units.length) return null;
    return {
      ordinal,
      baseline: baseline[ordinal],
      strain: strain[ordinal],
      confidence: confidence[ordinal],
      turnLine: Number.isFinite(turnLine) ? turnLine : null,
      clearsTurnLine: Number.isFinite(turnLine) && strain[ordinal] > turnLine,
    };
  },
  all() {
    return units.map((_, i) => this.get(i));
  },
});

export const buildWaveform = (reading) => {
  const { ok, errors } = validateReading(reading);
  if (!ok) {
    throw new Error(`buildWaveform: refused an invalid Reading — ${errors.map((e) => e.code).join(', ')}`);
  }

  const { units, metric, segments, referents, sightings, vocab, resolve } = reading;

  // §3.1 — baseline surprise: metric against the whole-Reading centre. Never
  // merged with strain into one number; the two answer different questions.
  const background = robustMean(units.map((u) => u.field));
  const baseline = units.map((u) => metric(u.field, background));

  // §3.1/§3.3 — the two-pass fixpoint: frames, confirmed turns, and the local
  // strain computed under those frames, all in one pass since strain and turns
  // share the same bootstrap.
  const { frames, turns, strain, line: turnLine } = buildFramesAndTurns(units, metric, segments);

  // §3.2 — confidence: an in-frame sample count below MIN_SAMPLES (voidnull's own
  // cold-start floor — not a hand-set constant here either) renders de-emphasized,
  // ramping to full confidence once the frame's own sample supports an estimate.
  const frameOf = new Array(units.length);
  for (const f of frames) for (let i = f.start; i < f.end; i++) frameOf[i] = f;
  const confidence = units.map((_, i) => {
    const f = frameOf[i];
    const n = f ? (i - f.start + 1) : (i + 1);
    return Math.min(1, n / MIN_SAMPLES);
  });

  // §3.4 — echo: non-adjacent recurrence, gated by chance-similarity AND
  // competence-gain, both Born nulls over the candidate population.
  const { echoes } = findEchoes(units, metric);

  // §3.5 — cast presence + gate typing, reusing the individuation gate verbatim.
  const cast = buildCast(referents || [], sightings || []);

  // §3.6 — accountable loss + replay. `provenance` resolves ordinal → source
  // locator through the Reading's own `resolve`, so every mark is a jump target.
  const provenance = (ordinal) => {
    const u = units[ordinal];
    return u ? resolve(u.span) : null;
  };
  const discard = createDiscardLedger(units, baseline, strain, confidence, turnLine);

  // The fine segments pass through unchanged, for display as the ruler.
  const ruler = (segments || []).filter((s) => s.level === 'fine');

  return {
    baseline,
    strain,
    confidence,
    frames,
    turns,
    ruler,
    echoes,
    cast,
    vocab,
    discard,
    provenance,
  };
};
