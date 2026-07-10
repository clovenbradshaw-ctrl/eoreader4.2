// EO: SEG·EVA(Void,Network → Field,Lens, Dissecting,Binding) — speech output organ (SEG murmur → enactor gate)
// organs/out/speech — the speech output organ, a BARE RENDERER (add-on 3 §1):
// props → language. The judging (the gate, DEF·EVA·REC) is NOT here; it moved to
// the enactor faculty as the enactor's modality-blind commit step. This organ only
// renders candidate surfaces from the model's token murmur and hands them to the
// core to judge — symmetric with the bare input ingesters, which do no structuring.
//
// SEG cuts the murmur into candidate SVOs (segment.js — the organ's one job). The
// commit machinery it feeds lives in the core: the grounded basis (the DEF), the
// relational correspondence (the EVA), and the collapse (the REC) are
// the enactor faculty. Grounding is the SELECTION of speech, not a flag after it, and it
// is over the proposition, because only a proposition can be true (Frege/Codd).
// The backend gains `propose` beside `phrase` (model/interface.js) — the
// next-token distribution, no internal sampling, no weights touched.
//
// The whole path is FLAGGED and golden-gated. RULES_REV off (the default) leaves
// the phrase()+veto path byte-identical; the gated path is opt-in until it beats
// the Metamorphosis battery (docs §10), then becomes default with phrase() kept
// as the no-logit fallback.

import { segment } from './segment.js';
import { runGate, buildBasis, parseProps, VOID_TOKEN } from '../../../enactor/index.js';

// The organ's own renderer (SEG) is its surface; the commit machinery is re-exposed
// from here only for callers that drove the old talker holon — it now lives in
// the enactor faculty (the enactor's modality-blind commit).
export { segment } from './segment.js';
export { runGate, buildBasis, parseProps, correspondProp, propKey, VOID_TOKEN } from '../../../enactor/index.js';

// The grounded-speech flag (§10). Read once from the environment so a script or
// a bench can flip it (RULES_REV=1) without touching code; defaults OFF, so the
// golden phrase()+veto path is unchanged until the gated path wins the battery.
export const RULES_REV =
  (typeof process !== 'undefined' && process.env && /^(1|true|on)$/i.test(process.env.RULES_REV || '')) || false;

// Can this turn take the gated path? It needs a backend that exposes `propose`
// (logit access), a document, and the surfer's reading. Absent any of these the
// talker falls back to the golden phrase()+veto path — non-breaking by
// construction (model/interface.js).
export const canGroundedSpeak = (model, ctx) =>
  RULES_REV && typeof model?.propose === 'function' && !!ctx?.doc && !!ctx?.surf;

// groundedSpeak — run the full talker holon for one turn: build the basis from
// the surfer's reading, drive the proposal under the gate, and return the
// collapsed speech. The answer is selected by grounding, not flagged after it.
//
//   { model, messages, doc, surf, question, alpha } → gate result
//     { answer, emitted, committed, voided, audit, basis }
//
// `alpha` is the one knob (§9) — the same tolerance the reader's VOID boundary
// uses (read/answerable.js ANSWERABLE_ALPHA), wired in here, not a new constant.
export const groundedSpeak = async ({ model, messages, doc, surf, question, alpha = 0.05, opts = {} } = {}) => {
  const basis = buildBasis(surf, doc, question);
  const parseProp = (surface) => parseProps(surface, doc, basis.cursor)[0] || null;

  const distStream = model.propose(messages, opts);
  const candidates = segment(distStream, { parseProp });
  const result = await runGate(candidates, basis, { alpha });

  return Object.freeze({ ...result, basis });
};
