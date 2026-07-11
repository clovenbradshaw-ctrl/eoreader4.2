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
  // The DISPLAY projection: the same re-cited answer with every ungrounded FACT wearing
  // its provenance ([no source]), so the honesty mark rides in the long-form / section
  // modes exactly as it does in the chat answer (turn/stages.js bind) — an unsourced
  // sentence can no longer read as sourced in ANY mode. Two guards keep it honest:
  //   · the mark is only owed when spans were on offer — a pure generation with nothing
  //     to ground against (spans === []) is not a grounding leak, so it rides clean;
  //   · CREATIVE output is never marked (bind.js isFactualClaim) — only an assertion of
  //     fact. `opts.creative` lets a caller declare the whole piece creative and opt out.
  // `answer` stays byte-identical (it is what the long-form walk feeds back as left-
  // context; a mark leaking into the running document would derail the continuation),
  // so every existing caller is untouched — `marked` is the additive display string.
  const showMark = spans.length > 0 && !opts.creative;
  const marked = showMark ? renderBound(bound, { mark: true }) : answer;
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
    bound, answer, marked, sources,
    vetoes: fired, refuse,
    boundFraction: bound.length ? cited / bound.length : 0,
  };
};
