// EO: NUL(Network → Void, Clearing) — third fold: assemble answer
// The third fold (§4). The document is a fold of its event log; the turn is a
// fold of its stage list; the ARC is a fold of its section events. The long
// answer is not stored — it is PROJECTED from the appended SectionEvents,
// exactly as the graph is projected from parse events. Re-folding the same
// events yields the identical answer (§8, invariant 5: replay-stable), because
// this reads only its argument — no module-scope state.

export const assembleArc = (sectionEvents = []) =>
  sectionEvents
    .map(s => String(s.answer || '').trim())
    .filter(Boolean)
    .join('\n\n');

// The cited source indices, folded across every section, de-duped and ordered.
export const arcSources = (sectionEvents = []) =>
  [...new Set(sectionEvents.flatMap(s => s.sources || []))].sort((a, b) => a - b);
