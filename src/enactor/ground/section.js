// EO: CON·EVA(Field,Lens → Link,Lens, Binding,Tracing) — per-section bind+veto (bindAndVeto)
// bindAndVeto — the per-section CON/EVA gate the arc reuses (spec-the-arc §5.5).
//
// A turn's `bind` and `veto` stages run over the whole-turn context; an arc
// generates many sub-turns, each grounded against its OWN cluster span set, and
// needs the same cite-then-flag in one call without threading the full pipeline
// context. This composes the existing pieces — `bindCitations`/`renderBound`
// from the binder, `runVetoes` from the battery — and adds nothing new: the
// guarantee is exactly the turn's, run at section grain.
//
// It returns the bound claims, the re-cited answer, the cited source indices,
// the vetoes that fired, and the BOUND FRACTION — the fraction of claims tied
// to a span — which is what the arc's faithfulness gate reads to decide whether
// to append, truncate, regenerate, or drop the section.

import { bindCitations, renderBound } from './bind.js';
import { runVetoes } from './veto.js';

export const bindAndVeto = (draft, spans = [], opts = {}) => {
  const bound = bindCitations(draft, spans, { doc: opts.doc, cursor: opts.cursor });
  const answer = renderBound(bound);
  const sources = [...new Set(
    bound.filter(b => b.citation).map(b => parseInt(b.citation.slice(1), 10)),
  )];
  const { fired, refuse } = runVetoes({
    draft, question: opts.question, bound, task: opts.task,
    // The edge-level verdicts are a whole-turn fact-check the section gate does
    // not run; absent them the relational vetoes stay inert, exactly as they do
    // on a turn with no classifier (ground/veto.js).
    edgeVerdicts: opts.edgeVerdicts || [],
  });
  const cited = bound.filter(b => b.citation).length;
  return {
    bound, answer, sources,
    vetoes: fired, refuse,
    boundFraction: bound.length ? cited / bound.length : 0,
  };
};
