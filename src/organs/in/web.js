// EO: DEF·SEG·EVA(Field,Network → Lens,Void,Paradigm, Dissecting,Clearing,Binding,Tracing) — the web organ (open-web intake collapse)
// The web organ — the open web read as an ORGAN (docs/the-web-organ-spec.md). ONE decision and its
// record: when the surf meets a span on the open web, whether to COLLAPSE it (admit it to the log,
// keep its bytes, witness it), and what DEF that emits. The keep decision is the highest-stakes
// same-vs-other cut in the system — open web, motivated adversaries, unvetted material — so it lands
// as a typed, witnessed, revisable DEF at the INTAKE grain, never a scalar threshold at the front
// door where `about≠says` is least visible.
//
// THE FOUR GATES (the membrane). A span is NOT admitted if (1) we already have it — a NUL, a re-run
// moves no belief; (2) it isn't salient — below candidacy; (3) we can't point to a source — no pin,
// cannot cite stably → do not index (pin.js); (4) we'd keep it for formatting — never: structure is
// stripped before any judgment (and any model), so magnitude is computed on CONTENT alone.
//
// Past the membrane the keep-criterion and the witness live in web-keep.js (the measure): amplitude =
// gross magnitude modulated by MDL explanatory gain, carrying phase. Then SAMPLE, don't threshold
// (attest/frontier.js): keep ~ Bernoulli(GROSS amplitude) from a logged seed, so misses are the
// sampler's — random, recoverable, never tuned. Keep on gross, record phase separately, or the
// phase-cancelling pairs that ARE the contested claims vanish.
//
// Pure and deterministic — amplitude components come from upstream (surfer/salience.js) as in
// frontier.js; the witness bundle's hashing and HTTP are injected seams (attest). This file is the
// organ: the gates, the seeded draw, the four fates, the provenance bundle, and the batch pass that
// recordIntakeDefs (turn/judgments.js) folds onto the judgment log.

import { VERDICTS } from '../../core/index.js';
import { classify, mkFrontier, nullResultReading } from '../../attest/index.js';
import {
  stripStructure, contentTokens, hasSource, explanatoryGain, keepAmplitude,
  intakeCuts, intakeVerdict, contestFlag,
} from './web-keep.js';

// re-exported so a caller reaches the whole organ through one entrance (the measure + the decision).
export {
  stripStructure, contentTokens, hasSource, explanatoryGain, keepAmplitude,
  intakeCuts, intakeVerdict, contestFlag,
} from './web-keep.js';

// The four fates of a span (§4).
export const INTAKE_FATES = Object.freeze({
  COLLAPSED: 'collapsed',        // entered the tape: intake DEF + custody + witness + attest + anchor
  REJECTED: 'rejected',          // rejected for cause: a DEF with a stated reason, no bytes
  ENCOUNTERED: 'encountered',    // NUL'd: address + amplitude + phase + seed. no bytes, no DEF
  NEVER_REACHED: 'never-reached',// outside the crawl: only the envelope (§7)
});

// The typed reason a span did NOT collapse — the honesty the frontier is built on (§8.3).
export const INTAKE_REASONS = Object.freeze({
  ALREADY_HELD: 'already-held',       // gate 1 — a NUL
  NOT_SALIENT: 'not-salient',         // gate 2 — below candidacy
  NO_PIN: 'no-pin',                   // gate 3 — cannot be cited (rejected)
  FORMATTING_ONLY: 'formatting-only', // gate 4 — nothing but structure once stripped (rejected)
  BELOW_DRAW: 'below-draw',           // cleared the gates, lost the seeded sample
  OFF_DIAGONAL: 'off-diagonal',       // a Figure claim where the log holds only Void (rejected)
});

// collapseDecision(candidate, world, opts) → the full intake decision for one span: gates, gain,
// amplitude, seeded draw, verdict, witness cuts, fate. Deterministic on (seed, address) — the bias
// defense (§8.5, F-seed): same seed → same partition, re-runnable.
export const collapseDecision = (candidate, world = {}, { seed = 'crawl', temperature = 1, k = 2, contestedFloor = 0.5, nearMissThreshold = 0.25 } = {}) => {
  const address = candidate?.address ?? '';
  const base = { id: address, address, phase: candidate?.phase ?? 'assert', seed };

  // the membrane (the four gates), before any custody credit
  if (!hasSource(candidate)) return frozen({ ...base, fate: INTAKE_FATES.REJECTED, reason: INTAKE_REASONS.NO_PIN });                             // gate 3
  if (contentTokens(candidate?.text).size === 0) return frozen({ ...base, fate: INTAKE_FATES.REJECTED, reason: INTAKE_REASONS.FORMATTING_ONLY }); // gate 4
  const held = world.held instanceof Set ? world.held : new Set(world.held || []);
  if (held.has(address) || held.has(normText(candidate?.text))) return frozen({ ...base, fate: INTAKE_FATES.ENCOUNTERED, reason: INTAKE_REASONS.ALREADY_HELD, nul: true }); // gate 1
  const magnitude = Math.max(0, Math.min(1, Number(candidate?.magnitude) || 0));
  if (magnitude <= 0) return frozen({ ...base, fate: INTAKE_FATES.ENCOUNTERED, reason: INTAKE_REASONS.NOT_SALIENT });                             // gate 2

  // the keep-criterion (web-keep.js)
  const gain = explanatoryGain(candidate, world.priors || [], { foreBits: candidate?.foreBits });
  const amplitude = keepAmplitude(magnitude, gain.gain, { k });
  const { verdict, cuts, ruledOut, downgraded } = intakeVerdict(candidate, gain, world);
  const contest = contestFlag(candidate, world, { contestedFloor });

  if (verdict === VERDICTS.OFF_DIAGONAL)   // the confabulation shape never collapses, regardless of the draw
    return frozen({ ...base, fate: INTAKE_FATES.REJECTED, reason: INTAKE_REASONS.OFF_DIAGONAL, verdict, cuts, gain, amplitude, contest });

  // the seeded sample (keep on GROSS amplitude; §2, attest/frontier.js)
  const draw = classify({ amplitude, seed, address, temperature, nearMissThreshold });
  const fate = draw.collapsed ? INTAKE_FATES.COLLAPSED : (amplitude >= nearMissThreshold ? 'near-miss' : INTAKE_FATES.ENCOUNTERED);
  return frozen({
    ...base, fate, reason: draw.collapsed ? null : INTAKE_REASONS.BELOW_DRAW,
    verdict, cuts, ruledOut, downgraded, contest,
    gain, magnitude, amplitude, draw: draw.draw, p: draw.p,
  });
};

// provenanceBundle — the §6 witness bundle for a COLLAPSED span: custody (mine, tier 2) + witness
// (theirs, tier 1). The organ builds the shape; hashing and the no-key Wayback flow are injected. The
// load-bearing check is span-verify: a capture that does NOT contain the span is provenance that
// looks like provenance and isn't, so it is flagged WITNESS_INCOMPLETE, never silently shipped.
export const provenanceBundle = (candidate, { myHash = null, witness = null, spanPresentInCapture = null } = {}) => {
  const complete = witness && witness.status === 'success' && spanPresentInCapture === true;
  return Object.freeze({
    span: candidate?.address ?? null,
    live_url: candidate?.url ?? null,
    my_hash: myHash,                                    // tier 2 — the bytes I actually read
    snapshot: witness?.snapshot ?? null,                // tier 1 — the neutral third party's capture
    wayback_timestamp: witness?.wayback_timestamp ?? null,
    cdx_digest: witness?.cdx_digest ?? null,
    replay: witness?.replay ?? null,                    // the id_ RAW replay the verify compared against
    status: complete ? 'witnessed' : 'WITNESS_INCOMPLETE',
    ...(complete ? {} : { incomplete_reason: !witness ? 'no-witness' : witness.status !== 'success' ? `witness-${witness.status}` : 'span-not-in-capture' }),
  });
};

// webOrgan(candidates, world, opts) → the intake reading over a batch: every span sorted into its
// fate, the collapsed set carrying verdict + witness cuts, the frontier (encountered/near-miss)
// carrying address + amplitude + seed + reason (§8.3), the crawl envelope (§7) riding along so a null
// reads "outside my boundary", never "does not exist". This is what recordIntakeDefs folds on.
export const webOrgan = (candidates = [], world = {}, opts = {}) => {
  const decisions = (candidates || []).map((c) => collapseDecision(c, world, opts));
  const by = (f) => decisions.filter((d) => d.fate === f);
  const nearMiss = by('near-miss'), encountered = by(INTAKE_FATES.ENCOUNTERED);
  const frontier = [...nearMiss, ...encountered].map((d) =>
    mkFrontier({ id: d.address, uri: d.address, amplitude: d.amplitude ?? 0, phase: d.phase, seed: d.seed, reason: d.reason, tier: d.fate === 'near-miss' ? 'near-miss' : 'encountered' }));
  return Object.freeze({
    decisions,
    collapsed: by(INTAKE_FATES.COLLAPSED), nearMiss, encountered, rejected: by(INTAKE_FATES.REJECTED),
    contested: decisions.filter((d) => d.contest === 'contested'),
    frontier, envelope: world.envelope || null,
    nullReading: (url) => world.envelope ? nullResultReading(url, world.envelope) : 'no-envelope',
  });
};

const normText = (text) => stripStructure(text).toLowerCase().replace(/\s+/g, ' ').trim();
const frozen = (o) => Object.freeze(o);
