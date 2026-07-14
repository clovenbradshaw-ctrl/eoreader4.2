// EO: SYN·EVA(Network,Field → Field,Lens, Composing,Binding) — the two-pass generator
// The whole topline, composed before it is written: an ordering and a phrasing of exactly the
// objects the machinery decided (docs/topline.md). Generation runs in two passes, and the second
// one is where the safety lives.
//
//   applySteer  — re-project the closed inventory under any standing feedback (never adds).
//   phraseAll   — pass one: one object, one sentence, in the fixed order (the telegram).
//   joinTopline — pass two: the model joins its own sentences, gated by set-containment.
//
// Length falls out of the count: one object → one sentence; four → four, joined. The model's entire
// freedom is word order and connective tissue. Every sentence points at an object below it; the
// ones that do not are the ones that never make it out.

import { phraseAll } from './phrase.js';
import { joinTopline } from './join.js';
import { applySteer } from './feedback.js';

// Generate a topline from a closed inventory. Model-optional: with no model it returns the
// deterministic telegram, which is correct — a thin field is a one-sentence topline, not a failure.
// Returns a serialisable record the room persists and the surface renders.
export const generateTopline = async ({ inventory, steer = null, model = null, signal = null } = {}) => {
  const steered = applySteer(inventory, steer);
  const inv = steered.inventory;
  const sentences = await phraseAll(inv, { model, signal });
  const joined = await joinTopline(sentences, { model, signal });
  const cites = [...new Set(inv.objects.flatMap((o) => o.cite || []))].filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  return {
    text: joined.text,
    telegram: joined.telegram,
    joined: joined.joined,
    kind: inv.kind,
    objects: sentences.map((s) => ({ text: s.text, cite: s.cite, type: s.type })),
    cites,
    unmet: steered.unmet,
    ...(joined.rejected ? { rejected: joined.rejected } : {}),
  };
};
