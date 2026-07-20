// EO: EVA(Lens → Lens, Binding) — the row-level veto battery
// docs/generate-row-stance-templates.md §7: two vetoes joining the battery
// enactor/ground/veto.js already runs, same pattern ({ id, test, refuses, message }).
//
// Implementation note (this file, not the doc): §7's pseudocode writes
// `bidirectionallyEntails(text, propositions)` — bare text in, boolean out. There is no
// NLI model in this codebase (nor should there be — §16 forbids one here), so a
// text-only check has nothing to check WITH. This implementation checks the row's own
// `trace` (§8) instead: forward entailment is "every declared proposition is traced
// somewhere in the row"; backward entailment is "every traced proposition-token points
// at a declared proposition, and every non-proposition token points at a REGISTERED
// fixed lexicon/heading id" (render.js's own closed KNOWN_CONNECTIVE_IDS list). This is
// weaker than true semantic entailment (it cannot catch a proposition-tagged fragment
// whose words quietly drifted from what the proposition says), but it exactly catches
// the two failure modes §7 names by name — a dropped counter-reading, and an unfounded
// connective/hedge word — because renderRow's own construction (§9) guarantees every
// token traces to something, so "something" is exactly what this checks the identity of.

import { KNOWN_CONNECTIVE_IDS, tokenCount } from '../../weave/generate-row/index.js';

export { tokenCount };

// bidirectionallyEntails(row, propositions) -> boolean
//   row            { renderedText, trace } — as returned by realizeSlot/prosify.
//   propositions   the PropositionGroup[] this SPECIFIC row claims to represent (the
//                  same array passed to the realizeSlot call that produced it).
export const bidirectionallyEntails = (row, propositions) => {
  const declaredIds = new Set((propositions || []).map((p) => p.id));
  const tracedPropIds = new Set(
    (row.trace || []).filter((t) => t.source === 'proposition').map((t) => t.refId),
  );

  // forward: nothing declared was dropped.
  for (const id of declaredIds) if (!tracedPropIds.has(id)) return false;
  // backward: nothing traced as a proposition points outside what was declared.
  for (const id of tracedPropIds) if (!declaredIds.has(id)) return false;
  // backward: every non-proposition token is a registered fixed-lexicon word, never an
  // invented hedge, connective, or ordinal.
  const known = new Set(KNOWN_CONNECTIVE_IDS);
  for (const t of row.trace || []) {
    if (t.source !== 'proposition' && !known.has(t.refId)) return false;
  }
  return true;
};

export const ROW_VETOES = Object.freeze([
  {
    id: 'row-entailment-mismatch',
    test: ({ row, propositions }) => !bidirectionallyEntails(row, propositions),
    refuses: true,
    message: 'The rendered row states more, or less, than its grounded propositions establish.',
  },
  {
    id: 'row-fabrication',
    test: ({ row }) => (row.trace || []).length !== tokenCount(row.renderedText),
    refuses: true,
    message: 'A token in the rendered row has no trace pointer.',
  },
]);

// runRowVetoes(ctx) -> { fired, refuse } — same shape as enactor/ground/veto.js's
// runVetoes, so a caller that already knows that battery's contract needs nothing new.
export const runRowVetoes = (ctx) => {
  const fired = [];
  let refuse = false;
  for (const v of ROW_VETOES) {
    if (v.test(ctx)) {
      fired.push({ id: v.id, message: v.message, refuses: !!v.refuses });
      if (v.refuses) refuse = true;
    }
  }
  return { fired, refuse };
};
