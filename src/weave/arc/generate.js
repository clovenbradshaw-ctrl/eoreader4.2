// EO: INS(Field → Entity, Making) — generate one section
// generateSection — one section's draft, floored and ceilinged by its evidence.
//
// The section is generated as a gated sub-turn: the section's `subClaim` (a
// retrieval-derived topic hint) stands in for the raw question, and the prompt
// is grounded on the cluster's OWN spans — nothing else. This reuses the model
// holon's grounded prompt builder, so a section speaks the same language as a
// turn; the arc adds only the per-section budget.
//
// The ceiling is a hard `maxTokens` cap. The FLOOR is advisory at this layer: a
// `min_tokens` logit processor enforces it in the model holon when the backend
// exposes one (spec-the-lens-port); a phrase()-only backend cannot be made to
// keep decoding, so the floor rides as a budget the section records and the
// faithfulness gate reads. We pass both into the model opts so a floor-aware
// backend can honour them and a plain one ignores them — non-breaking either way.

import { buildGroundedMessages } from '../../model/index.js';

export const generateSection = async (section, { doc = null, model, corrective = '', signal = null, conversation = {}, tail = '' } = {}) => {
  const messages = buildGroundedMessages({
    question:    section.subClaim,
    spans:       section.spans || [],
    orientation: orientationOf(doc),
    task:        'answer',
    corrective,
    // The planner's read-window (spec-planner.md §5/§6) — the prose so far this turn,
    // for the seam only. '' on a plain arc section, byte-identical there.
    tail,
    // The conversation fold (tail + surfed recap) — null on a plain arc section
    // (buildGroundedMessages defaults it away), the continuation's context when a
    // long generation rides over the session (docs/long-generation.md).
    conversation,
  });
  const raw = await model.phrase(messages, {
    maxTokens: section.ceiling,
    minTokens: section.floor,    // honoured by a floor-aware backend; ignored otherwise
    signal,
  });
  return { rawOutput: String(raw || ''), messages };
};

// The talker's corrective for the regenerate pass (§5.5): the unbound claims are
// named and struck from the allowed-assertion set, so the redo restates only
// what the spans support rather than re-reaching for the same ungrounded prose.
export const stripUnboundCorrective = (bound = []) => {
  const unbound = bound.filter(b => !b.citation).map(b => b.claim);
  if (!unbound.length) return '';
  return 'On the last pass these statements could not be tied to the lines above, so do ' +
    'not assert them again — say only what the lines support:\n' +
    unbound.map(c => `- ${c}`).join('\n');
};

// filename · type · length — the same neutral orientation a turn hands the
// talker (no recognition). Degrades to empty for a section with no doc in hand.
const orientationOf = (doc) => {
  if (!doc) return '';
  const name = doc.docId || doc.name || 'document';
  const n = (doc.units || doc.sentences || []).length;
  return n ? `${name}, ${n} lines` : String(name);
};
