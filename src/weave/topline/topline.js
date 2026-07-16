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
import { verifyForm, formReceipt } from './surface.js';
import { contentTokens } from './contain.js';

// Generate a topline from a closed inventory. Model-optional: with no model it returns the
// deterministic telegram, which is correct — a thin field is a one-sentence topline, not a failure.
// Returns a serialisable record the room persists and the surface renders.
export const generateTopline = async ({ inventory, steer = null, model = null, signal = null } = {}) => {
  const steered = applySteer(inventory, steer);
  const inv = steered.inventory;
  const sentences = await phraseAll(inv, { model, signal });
  const joined = await joinTopline(sentences, { model, signal });
  const cites = [...new Set(inv.objects.flatMap((o) => o.cite || []))].filter((n) => Number.isInteger(n)).sort((a, b) => a - b);

  // The verifier at the same grain as the output (surface.js). The join's containment gate already
  // proved the text adds nothing, so `verdict.ok` holds on any shipped topline — but it holds it as
  // a TYPED reading (which cube region a violation would occupy, coverage over the objects) rather
  // than a boolean, and it attaches a replay receipt: this IS the "extraordinarily effective is a
  // property of the verifier" made concrete. The anchor is the machinery's own words (each object's
  // pass-one sentence), never the source — the model was given no gaps to be fluent across.
  const anchor = sentences.map((s) => String(s.text || '')).join(' ');
  const holons = sentences.map((s, i) => ({ key: s.key ?? `obj:${i}`, tokens: contentTokens(String(s.text || '')) }));
  const verdict = verifyForm(joined.text, { anchor, holons });
  const receipt = formReceipt({ output: joined.text, anchor, system: 'topline:join', model, mode: joined.joined ? 'realized' : 'telegram', verdict });

  return {
    text: joined.text,
    telegram: joined.telegram,
    joined: joined.joined,
    kind: inv.kind,
    // Each stored object carries BOTH its phrased sentence (pass one/two) AND the closed-inventory
    // fields it was phrased from — `fields`, `standing`, `relational`, `key`. Downstream consumers
    // (the findings projection, claims.js) re-derive the mechanical telegram and read the claim's
    // standing straight off these; dropping them left every projected claim as "is undefined." with
    // a flat "Stated" banding, because phraseMechanical had no fields to phrase and no standing to read.
    objects: inv.objects.map((o, i) => ({
      text: sentences[i]?.text ?? '', cite: sentences[i]?.cite ?? o.cite ?? [],
      type: o.type, key: o.key, relational: !!o.relational, standing: o.standing, fields: o.fields,
    })),
    cites,
    unmet: steered.unmet,
    verdict,
    receipt,
    ...(joined.rejected ? { rejected: joined.rejected } : {}),
  };
};
