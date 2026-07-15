// EO: EVA·DEF(Field,Network → Lens,Paradigm, Tracing,Binding,Dissecting) — the intake keep-criterion + witness
// The measure behind the web organ (organs/in/web.js, docs/the-web-organ-spec.md §2/§3): how much a
// candidate open-web span is worth keeping, and how that judgment DECOMPOSES. Split from the organ so
// the MDL keep-criterion and the sub-cut witness stay one cohesive, testable object; the organ next
// door runs the four gates, the seeded sample, and the record.
//
// THE KEEP-CRITERION (§2). (a) gross magnitude is salience — decides candidacy, computed upstream.
// (b) explanatory gain is the MDL test: custody is earned only if absorbing the span COMPRESSES the
// corpus — ΔL_back (bits refunded re-encoding already-read, INDEPENDENTLY-sourced spans given this
// one — retrodiction) + ΔL_fwd (bits saved tightening the rolling prediction, measured upstream).
// Surprising-but-repaying-nothing is noise; repaying-but-unsurprising is redundant; the keeper is
// both. amplitude = magnitude modulated by gain (keepAmplitude).
//
// ΔL_back is model-free and auditable: a span's encode cost is its distinct content-token dictionary;
// bits saved co-encoding it with an independent prior are the tokens they share, each weighted by
// rarity (idf) so a case number dominates and a function word self-discounts. Source-independence
// (§5) is load-bearing: ΔL_back counts only DIFFERENT-lineage priors, and no CORROBORATED intake may
// rest only on same-lineage spans — the echo, which downgrades to INDETERMINATE (F-indep).
//
// THE WITNESS (§3) is the decomposition, not a scalar margin: the sub-cut chain (core/cut), the
// specific independent priors acted on, and the ruled-out other. The verdict is the span's RELATION
// to the log (corroborate / contradict / stall / off-diagonal), never a truth-claim about content.

import { CUT_KINDS, GROUNDS, VERDICTS, makeCut, foldCuts, violatesB1, makeRuledOut } from '../../core/index.js';

const round = (x) => Math.round(x * 1000) / 1000;

// gate 4 — strip HTML/Markdown structure before any judgment (and any model), so structure adds no
// token of magnitude: we never keep a span for how it is formatted.
export const stripStructure = (text) => String(text || '')
  .replace(/<[^>]*>/g, ' ')                       // HTML tags
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')      // md links/images → their text
  .replace(/[*_`~#>|]+/g, ' ')                    // md emphasis / code / headings / quotes / table pipes
  .replace(/\s+/g, ' ')
  .trim();

// Function words carry no identity — a "shared" one is background, not a bridge. Dropped so the MDL
// gain measures CONTENT overlap, never grammar (with few priors even idf cannot flatten a `the`).
const STOPWORDS = new Set(('a an the and or but of to in on at by for with as is are was were be been being '
  + 'it its this that these those from has have had not no nor than then so into over under about through '
  + 'their there they them his her our your my we you he she who whom which what when where why how all any '
  + 'each more most other some such only own same too very can will just').split(' '));

// contentTokens(text) → the distinct content tokens of the MDL dictionary: lowercased, split on
// non-word, length ≥ 2, function words dropped. Digits KEPT — a case number is an exact-string bridge.
export const contentTokens = (text) => {
  const set = new Set();
  for (const t of stripStructure(text).toLowerCase().split(/[^a-z0-9]+/))
    if (t.length >= 2 && !STOPWORDS.has(t)) set.add(t);
  return set;
};

// hasSource — gate 3. Citable iff it carries a span-id address (pin.js grammar `uri#holon[range]`,
// whose seam is the `#`) or is explicitly pinned. No `#`, no pin.
export const hasSource = (candidate) =>
  candidate?.pinned === true || (typeof candidate?.address === 'string' && candidate.address.includes('#'));

// ΔL_back — bits refunded by co-encoding the candidate with the INDEPENDENT-lineage priors (§5).
// idf(t) = log2(1 + N/df(t)): a token in one prior is a rare, strong bridge; one in all of them
// self-discounts toward 1. Each shared token counts its idf once. ΔL_fwd is measured upstream and
// passed in (opt overrides the candidate's own); gain = back + fwd.
export const explanatoryGain = (candidate, priors = [], { foreBits } = {}) => {
  const cand = contentTokens(candidate?.text);
  const lineage = candidate?.lineage ?? null;
  const independent = [], sameLineage = [];
  for (const p of priors || []) (p && p.lineage != null && p.lineage === lineage ? sameLineage : independent).push(p);

  const N = independent.length;
  const df = new Map();                                   // token → # independent priors containing it
  for (const p of independent) for (const t of contentTokens(p?.text)) if (cand.has(t)) df.set(t, (df.get(t) || 0) + 1);

  let back = 0;
  const bridges = [];
  for (const [t, d] of df) {
    back += Math.log2(1 + N / d);
    if (d >= 2) bridges.push(t);                          // a token joining ≥2 independent priors — the keystone shape
  }
  const fwd = Math.max(0, Number(foreBits ?? candidate?.foreBits) || 0);
  return Object.freeze({
    back: round(back), fwd: round(fwd), gain: round(back + fwd),
    independentPriors: independent.map((p) => p.address).filter(Boolean),
    sameLineagePriors: sameLineage.map((p) => p.address).filter(Boolean),
    bridges: Object.freeze(bridges),
  });
};

// amplitude = magnitude modulated by gain (§2), squashed to [0,1) for the Bernoulli draw: salient-
// but-explaining-nothing → ~0 (noise); salient AND explanatory keeps its magnitude. `k` is the
// half-saturation gain (≈ one strong bridge).
export const keepAmplitude = (magnitude, gain, { k = 2 } = {}) => {
  const m = Math.max(0, Math.min(1, Number(magnitude) || 0));
  const g = Math.max(0, Number(gain) || 0);
  return round(m * (g / (g + k)));
};

// intakeCuts — the §3 witness: presence (NULSIG) — a pin + content, or a void; argument (INS) — the
// span's entities resolve to log entities; predicate (residual) — the relation does the EXPLANATORY
// work claimed, CORROBORATED only when the gain is real AND source-independent, CONTRADICTED on a
// contrary phase, else it STALLS to INDETERMINATE.
export const intakeCuts = (candidate, gain) => {
  const of = `intake:${candidate?.address ?? ''}`;
  const cuts = [];
  cuts.push(makeCut({
    kind: CUT_KINDS.PRESENCE, of, grounds: GROUNDS.NULSIG,
    verdict: hasSource(candidate) && contentTokens(candidate?.text).size > 0 ? VERDICTS.CORROBORATED : VERDICTS.UNSUPPORTED,
    witness: { address: candidate?.address ?? null, magnitude: candidate?.magnitude ?? 0 },
  }));

  if (candidate?.diffuse) {
    cuts.push(makeCut({ kind: CUT_KINDS.ARGUMENT, of, grounds: GROUNDS.INS, verdict: VERDICTS.INDETERMINATE, witness: { reason: 'referent-diffuse', anchor: null } }));
  } else if (Array.isArray(candidate?.refs) && candidate.refs.length) {
    for (const anchor of candidate.refs)
      cuts.push(makeCut({ kind: CUT_KINDS.ARGUMENT, of, grounds: GROUNDS.INS, verdict: VERDICTS.CORROBORATED, witness: { anchor } }));
  }

  const independent = gain.independentPriors.length > 0;
  let predicate;
  if ((candidate?.phase ?? 'assert') === 'deny') {
    predicate = { verdict: VERDICTS.CONTRADICTED, witness: { relation: 'contrary', reason: 'opposed-phase-against-kept', priors: gain.independentPriors } };
  } else if (gain.back > 0 && independent) {
    predicate = { verdict: VERDICTS.CORROBORATED, witness: { relation: 'compresses-independent-record', bitsBack: gain.back, bridges: gain.bridges, priors: gain.independentPriors } };
  } else {
    predicate = { verdict: VERDICTS.INDETERMINATE, witness: { relation: 'unexplained-residual', reason: independent ? 'no-compression' : 'no-independent-prior', bitsBack: gain.back } };
  }
  cuts.push(makeCut({ kind: CUT_KINDS.PREDICATE, of, grounds: GROUNDS.RESIDUAL, ...predicate }));
  return cuts;
};

// intakeVerdict — the span's RELATION to the log (§4): the fold of the cuts plus the §4/§5 layer.
// Opposed phase → CONTRADICTED (a keep — a contradiction is a finding); a CORROBORATED fold with no
// independent prior → INDETERMINATE (F-indep, the echo); a Figure claim over a Void terrain →
// OFF_DIAGONAL (the confabulation shape).
export const intakeVerdict = (candidate, gain, world = {}) => {
  const cuts = intakeCuts(candidate, gain);
  let verdict = foldCuts(cuts);
  let ruledOut = null, downgraded = null;

  const subject = candidate?.subject ?? candidate?.address ?? null;
  const voidOnly = world.voidTerrain instanceof Set ? world.voidTerrain.has(subject) : false;
  if (candidate?.claimsFigure && voidOnly)
    return Object.freeze({ verdict: VERDICTS.OFF_DIAGONAL, cuts, ruledOut: null, downgraded: 'figure-at-void' });

  if (verdict === VERDICTS.CORROBORATED) {
    if (gain.independentPriors.length === 0) { verdict = VERDICTS.INDETERMINATE; downgraded = 'no-independent-prior'; }   // §5 / F-indep: the echo
    else if (violatesB1(verdict, cuts)) { verdict = VERDICTS.INDETERMINATE; downgraded = 'b1'; }
    else if (candidate?.ruledOut && candidate.ruledOut.other != null) ruledOut = makeRuledOut(candidate.ruledOut);        // §3.3 the near-miss it excluded
    else { verdict = VERDICTS.INDETERMINATE; downgraded = 'no-ruled-out'; }
  } else if (verdict === VERDICTS.INDETERMINATE) {
    // the echo can also be caught at the predicate cut (no independent prior to compress against);
    // surface that reason so F-indep is attributable however it fired.
    const pred = cuts.find((c) => c.kind === CUT_KINDS.PREDICATE);
    if (pred?.witness?.reason === 'no-independent-prior') downgraded = 'no-independent-prior';
  }
  return Object.freeze({ verdict, cuts, ruledOut, downgraded });
};

// CONTESTED vs THIN (§4) — from magnitude and cancellation, NEVER one blended number. High magnitude
// + both phases present is a story; low magnitude is THIN. `world.phasesBySubject`: Map<subj, Set>.
export const contestFlag = (candidate, world = {}, { contestedFloor = 0.5 } = {}) => {
  const subject = candidate?.subject ?? candidate?.address ?? null;
  const phases = world.phasesBySubject instanceof Map ? world.phasesBySubject.get(subject) : null;
  const mag = Math.max(0, Math.min(1, Number(candidate?.magnitude) || 0));
  if (phases && phases.has('assert') && phases.has('deny') && mag >= contestedFloor) return 'contested';
  if (mag < contestedFloor) return 'thin';
  return null;
};
