// EO — the revise stage's correctives (split from turn/stages.js, 2026-07 compliance
// pass). The corrective texts and the regeneration conditions the REVISE group
// steers by: what to hand the talker on the rewrite pass (constraint / reshape /
// confab / grounding), and when a regenerate is owed at all.
import { isUnbound } from '../enactor/ground/index.js';
import { confabulating, CONFAB_CORRECTIVE, GROUNDING_CORRECTIVE } from './stage-support.js';



// The corrective for a missed CONSTRAINT (turn/expect.js), by dimension. A REFINE, not a
// retreat: it names the one thing the draft got wrong and asks for it again, in the talker's
// own words. For a name the reading already resolved, hand it over outright — the engine knows
// it; the first draft simply failed to say it.
export const constraintCorrective = (err) => {
  if (err.dim === 'coverage')
    return `Your answer is about the right passage but never names ${err.expectedName}, who the ` +
      'reading centers on. Answer again and name them where they belong.';
  if (err.dim === 'name')
    return err.expectedName
      ? `They asked for a name. The reading resolves it as “${err.expectedName}”. Answer with that ` +
        'name plainly — do not describe the person in place of naming them.'
      : 'They asked for a name — a specific person’s name. Give the name if the lines provide one; ' +
        'if they do not, say plainly you did not find it. Do not answer with a description in place of a name.';
  if (err.dim === 'length')
    return `They asked for the answer in ${err.params.max} ${err.params.unit}${err.params.max > 1 ? 's' : ''}. ` +
      'Give it that short — no more.';
  if (err.dim === 'order')
    return err.params.dir === 'desc'
      ? 'They asked for it backwards — tell it from the end to the beginning, the latest events first.'
      : 'They asked for it in order — tell it from the beginning through to the end.';
  return CONFAB_CORRECTIVE;
};

// The reshape corrective — handed when the FORM predictor (turn/shape.js) found the draft
// off-shape for this kind of question. It hands over a content-free SHAPE descriptor (register
// and length, from the matched sample's shape_tags — shapeDescriptor), never the sample's
// verbatim text, so the redo fixes the register and length without a foreign answer's facts to copy.
export const reshapeCorrective = (err) =>
  err.sample
    ? `Your last answer did not read like the kind of answer this question wants. Aim for this ` +
      `shape: ${err.sample} Answer again in that register and length, grounded in the lines you read.`
    : 'Your last answer did not read like the kind of answer this question wants. Answer again in a ' +
      'fitting register and length, grounded in the lines you read.';

// The §5 GATE condition. Under the subjective frame, a REFUSING edge-grounded veto on the
// answer's load-bearing claim no longer rides: a relation the reading DENIES
// (factcheck.refuse — a confident contradiction), or a from-nowhere `unbound` answer whose
// claims tie to nothing, engages the gate and regenerates. Scoped to the default `answer`
// task — the pointed question where retrieval finding nothing IS the absence; a whole-
// document task's connective claims legitimately have no single witness. low-coverage, the
// weak contradiction, edge-unsupported, and the off-diagonal grain over-read stay flag-only.
const refusingEdge       = (ctx) => !!ctx.factcheck?.refuse;
const loadBearingUnbound = (ctx) => isUnbound(ctx.bound || [], ctx.rawOutput);
export const gateCondition      = (ctx) => ctx.task === 'answer' && (refusingEdge(ctx) || loadBearingUnbound(ctx));

// A regenerate is owed when the off-diagonal confab guard fired — a SPECIFIC claim asserted at
// a measured Void (a figure-at-a-void hallucination). The §5 grounding gate that forced an
// ungrounded/unsupported answer to rewrite toward "I did not find it" is OFF: the answer is no
// longer restricted to the document, so an ungrounded answer RIDES with a flag rather than being
// gated into an abstention. (gateCondition is kept for the audit `gated` marker only.)
export const needsRegen = (ctx) => confabulating(ctx);

// The corrective for the regenerate, by failure: a pure §5 gate (no confab) steers back
// onto the lines; otherwise the confab refine drops the unsupported link.
export const correctiveFor = (ctx) =>
  (gateCondition(ctx) && !confabulating(ctx)) ? GROUNDING_CORRECTIVE : CONFAB_CORRECTIVE;
