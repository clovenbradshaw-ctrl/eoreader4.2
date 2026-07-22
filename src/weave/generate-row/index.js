// EO: REC(Paradigm → Paradigm, Composing) — the generate-row holon barrel
// docs/generate-row-stance-templates.md: a claim-ledger row's rendering shape, chosen by
// measuring the field around its own evidence (stance.js), grounded through closed joins
// (join.js) and a closed slot vocabulary (slots.js), rendered deterministically with a
// strictly bounded optional prosifier (render.js), and composed into eight product-facing
// plans (plan.js). No model, no network call, in the default path anywhere in this holon.

export { stanceLegality, legalCellFor } from './stance.js';
export { proposeJoin, groundJoin } from './join.js';
export { SLOT_PALETTES, SHAPES, legalSlots, isLegalRole, LENS_TERMINAL_SHAPES, isLensLegalShape } from './slots.js';
export { realizeSlot, prosify, phrase, LEXICON, KNOWN_CONNECTIVE_IDS } from './render.js';
export { tokenize, tokenCount } from './tokenize.js';
export {
  PLANS, planTemplate, dominantProposition,
  definitionPlan, castProfilePlan, timelinePlan, relationshipExplainerPlan,
  comparisonPlan, disputeDigestPlan, gapReport, caption,
} from './plan.js';
