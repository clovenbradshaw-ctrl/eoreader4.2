// EO: DEF·EVA·REC(Network,Link → Lens,Void,Entity, Binding,Making,Composing) — the collapse / gate
// enactor/gate.js — the collapse (§5). DEF·EVA·REC over propositions.
//
// The enactor's COMMIT step, modality-blind (add-on 3 §1): the gate runs over
// propositions, so the same collapse commits a spoken proposition, a pass, or a
// struck note. It lives in the core, not the speech organ; the organ only renders
// candidate surfaces for the gate to judge.
//
// The gate is the line between thinking and speaking (Levelt's inner monitor;
// Dehaene's ignition threshold). It runs per candidate PROPOSITION, not per
// token. The proposal advances one proposition past the committed edge
// (speculative); SEG closes the candidate; the gate measures it against the
// grounded basis by RELATIONAL correspondence and collapses what beats the null
// into speech, holding or VOIDing the rest.
//
//   committedContext  the grounded speech so far (starts empty)
//   loop:
//     candidateProp ← segment() closes a proposition past the committed edge
//     EVA: two correspondences, both relational (talker/props.js):
//       findingMatch  = correspond(svo, basis.props)            // is it TRUE
//       questionMatch = correspond(svo, basis.question.targets) // is it RESPONSIVE
//       support    = basis amplitude of the matched finding (0 if none)
//       relevance  = question amplitude of the matched target (0 if none)
//       redundancy = 1 − already-spoken support for this prop
//       projection = modelAmplitude × support × relevance × redundancy
//     REC: threshold against the derived null at alpha:
//       projection > null → COLLAPSE: append to committed, EMIT surface, deplete
//       else              → ROLL BACK; regenerate, discouraging this direction;
//                           OR, no prop can match the remaining targets → VOID
//                           ("the text does not say", the fixed conscience token)
//     stop when the question's targets are exhausted (basis depleted)
//
// The multiply is the protection (§5). Three failure modes, one multiply:
//   true-but-irrelevant   support>0, relevance≈0  → product≈0 → held
//   fluent hallucination  support=0               → product=0 → cannot collapse
//   on-question, unsupported (the dangerous one)  relevance>0, support=0
//                                                 → product=0 → blocked, VOIDs

import { deriveNull } from '../core/index.js';
import { correspondProp, propKey } from './props.js';
import { efferenceCopiesOf } from './efference.js';

// The fixed, unrewordable conscience token (§7) — abstention as a collapse
// OUTCOME, selected by the gate, rendered by the proposer. Distinct from a HELD
// proposition (proposed, no match, simply not emitted): VOID is spoken when the
// only amplitude at a question target is absence.
export const VOID_TOKEN = 'The text does not say.';

// A retry budget for rollback (§6 open risk): a deterministic proposal cannot
// offer an alternative on rollback, so without a cap the loop would spin. After
// this many consecutive failures with the targets still unmet, the gate
// collapses to VOID rather than loop. A real stochastic backend regenerates
// elsewhere within the budget; echo simply exhausts it and VOIDs — the honest
// behaviour when nothing grounds.
const ROLLBACK_BUDGET = 4;

// runGate — drive a candidate-proposition stream against a grounded basis,
// collapsing what grounds into speech.
//
//   candidates  an async iterable of candidateProp (talker/segment.js); the gate
//               drives it with `.next(control)` so it can discourage a rolled-
//               back direction. A plain array works too (for tests).
//   basis       the grounded basis (talker/basis.js).
//   alpha       the one knob (§9) — the same alpha as the VOID boundary
//               everywhere. Low alpha: speak only strong correspondences, abstain
//               often. High alpha: speak weaker ones.
//
// Returns { answer, emitted, committed, voided, audit }.
export const runGate = async (candidates, basis, { alpha = 0.05, modality = null } = {}) => {
  const props   = (basis?.props || []).map(p => ({ ...p }));   // mutable: depletion
  const targets = basis?.question?.targetProps || [];
  const spent   = new Map();   // propKey → fraction of support already spoken

  const committed = [];   // collapsed propositions — the grounded speech
  const emitted   = [];   // their surfaces, in order
  const audit     = [];   // one record per candidate the gate measured
  let voided = false;
  let rollbacks = 0;

  // The noise null the projection must beat (§5 REC). The background is the
  // also-ran support×relevance the basis itself throws up — the field's own
  // non-cohering mass. Derived at alpha (read/voidnull.js); unmeasurable (a thin
  // basis) → a strict positive floor, so the MULTIPLY stays the protection and
  // alpha only calibrates where a real signal is present.
  const background = backgroundProjections(props, targets);

  // A question target is SUPPORTED-UNSPOKEN when a basis prop corresponds to it
  // and has not yet been spoken: the speech can still ground it. When none remain,
  // the basis is depleted — every target the document can answer has been said —
  // and the loop stops. A target with NO corresponding basis prop is never
  // supported-unspoken, so it does not keep the loop alive; it falls to the VOID
  // collapse below (its only amplitude is absence, §7).
  const supportedUnspoken = () => targets.filter(t => {
    const m = correspondProp(t, props);
    return m && !spent.has(propKey(m.prop));
  });
  // The targets the speech never grounded — unspoken at the end. Includes targets
  // with no basis support at all (the dangerous on-question gap → VOID).
  const unmetTargets = () => targets.filter(t => {
    const m = correspondProp(t, props);
    return !(m && spent.has(propKey(m.prop)));
  });

  const it = candidates[Symbol.asyncIterator]
    ? candidates[Symbol.asyncIterator]()
    : arrayIterator(candidates);

  let control;
  let res = await it.next();
  while (!res.done) {
    const cand = res.value;

    const finding  = correspondProp(cand.svo, props);
    const question = relevanceOf(cand.svo, targets);

    const support    = finding ? finding.score * amplitudeOf(finding.prop) : 0;
    const relevance  = question.relevance;
    const key        = finding ? propKey(finding.prop) : propKey(cand.svo);
    const redundancy = Math.max(0, 1 - (spent.get(key) || 0));
    const projection = (cand.modelAmplitude || 0) * support * relevance * redundancy;

    const nul = nullAt(background, projection, alpha);
    const collapse = projection > nul;

    audit.push(Object.freeze({
      surface: cand.surface, support, relevance, redundancy,
      modelAmplitude: cand.modelAmplitude || 0, projection, null: nul, collapse,
    }));

    if (collapse) {
      // COLLAPSE: append to the committed context, emit the surface, deplete the
      // matched finding's support so a second assertion of the same proposition
      // is redundant (redundancy → 0) and cannot collapse again.
      committed.push(Object.freeze({ ...cand, finding: finding?.prop || null }));
      emitted.push(cand.surface);
      if (finding) {
        spent.set(key, 1);
        finding.prop.status = 'spent';
        // Deplete the basis copy's amplitude so it stops being live ground.
        const live = props.find(p => p === finding.prop);
        if (live) live.amplitude = 0;
      }
      rollbacks = 0;   // the budget caps CONSECUTIVE failures — progress resets it
      control = undefined;
    } else {
      // ROLL BACK: do NOT append (the committed edge is unchanged — the talker
      // never builds on a rejected thought). Discourage this direction and let
      // the proposal regenerate. The budget caps a degenerate retry that a
      // deterministic proposal cannot escape (§6 open risk).
      rollbacks++;
      control = { discourage: discourageFrom(cand.surface) };
      if (rollbacks >= ROLLBACK_BUDGET) break;
    }

    // Stop when the question's targets are exhausted (basis depleted, §5): no
    // target the document can answer is still unspoken. With NO target basis
    // (a whole-document task, or an unparseable question) the loop runs to the
    // stream's end and the redundancy depletion bounds it.
    if (targets.length && supportedUnspoken().length === 0) break;

    res = await it.next(control);
  }

  // VOID collapse (§7): a question target the speech never grounded — the only
  // amplitude at that target is absence. Emit the fixed conscience token,
  // selected by the gate. Also when nothing collapsed at all.
  if (!emitted.length) {
    emitted.push(VOID_TOKEN);
    voided = true;
  } else if (targets.length && unmetTargets().length) {
    emitted.push(VOID_TOKEN);
    voided = true;
  }

  // Output is not terminal (add-on 3 §3): every committed proposition is also a
  // prediction. At commitment the core generates an EFFERENCE COPY per commit —
  // the predicted sensed-consequence, indexed to the commit and held outstanding
  // for the monitor to match the system's own output against when it returns
  // through the senses. Modality-blind: the copy carries the proposition, not the
  // organ. VOID commits nothing, so it casts no copy.
  return Object.freeze({
    answer: emitted.join(' '),
    emitted: Object.freeze(emitted),
    committed: Object.freeze(committed),
    efference: Object.freeze(efferenceCopiesOf(committed, { modality })),
    voided,
    audit: Object.freeze(audit),
  });
};

// The relevance of a candidate to the question's targets: the matched target's
// own amplitude (here, 1 — a parsed target is fully asked-for). When the
// question parsed to NO targets (a whole-document task, or an unparseable
// question), relevance degrades to NEUTRAL (1) so the gate does not refuse every
// proposition for want of a target basis — the finding/support factor still
// carries the grounding (documented divergence from the strict three-factor
// reading, which assumes a target basis).
const relevanceOf = (svo, targets) => {
  if (!targets.length) return { relevance: 1, match: null };
  const m = correspondProp(svo, targets);
  return { relevance: m ? m.score : 0, match: m?.prop || null };
};

const amplitudeOf = (prop) => {
  const a = Number.isFinite(prop?.amplitude) ? prop.amplitude : 0;
  // A stop with zero measured strain is still real ground (the anchor is always a
  // stop); floor the support weight to a small positive so a grounded-but-flat
  // proposition can still collapse when it is relevant.
  return a > 0 ? a : 0.5;
};

// The also-ran support×relevance the basis throws up — the noise the projection
// must beat. Each finding prop's amplitude against each target's relevance; with
// no targets, the bare amplitudes (the field's own mass).
const backgroundProjections = (props, targets) => {
  const xs = [];
  for (const p of props) {
    const a = Number.isFinite(p.amplitude) ? p.amplitude : 0;
    if (!targets.length) { xs.push(a); continue; }
    for (const t of targets) {
      const m = correspondProp(t, [p]);
      xs.push(m ? m.score * a : 0);
    }
  }
  return xs;
};

// The derived null at the candidate's projection, leaving it out (a real signal
// never has to outrank itself). Unmeasurable → a strict positive floor: the
// multiply already blocks the three failure modes (product 0), so the floor only
// needs to keep a 0 from collapsing.
const nullAt = (background, projection, alpha) => {
  const n = deriveNull(background, { scale: 'linear', alpha, leaveOut: projection });
  if (!Number.isFinite(n)) return Number.EPSILON;   // thin basis → the multiply is the gate
  return Math.max(n, Number.EPSILON);
};

// A cheap discouragement seed (§6 open risk, named not hidden): the content words
// of a rolled-back surface, so the sampler is pushed off the same opening. The
// real discouragement (a direction in logit space) is the prototype the spec
// defers to .probe/; this is the honest first cut.
const discourageFrom = (surface) =>
  String(surface || '').match(/[A-Za-z']{4,}/g)?.slice(0, 3) || [];

async function* arrayIterator(arr) {
  for (const x of arr || []) yield x;
}
