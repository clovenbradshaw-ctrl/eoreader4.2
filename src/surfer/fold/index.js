// EO: SEG·SYN·CON·EVA(Field,Network,Lens → Field,Network,Lens, Clearing,Composing,Binding,Tracing) — barrel
// The fold holon: spans → notes. The unit of evidence the model sees.

export { foldNote }        from './integral.js';
export { impressionQuery } from './impression.js';

// The reading substrate (rich-notes §2·§3): the typed open-world graph the notes
// project from, and the membrane that crosses it to the talker as plain groups.
export {
  buildSubstrate, detectTensions, substrateToEOT, substrateToJSONLD, renderLines,
  readReflections, readMetaReflections, readConnections,
} from './substrate.js';
export { projectNotes, projectGroupedNote, assertNotesNoLeak } from './project.js';

// Deep reading (fold/deep-reading.js): when the model is not otherwise busy, surf to the place
// of most interest, fold it, and deposit a reflection on the graph — an enacted EVA at band
// void, reafferent (canWitness false — the firewall). The pure engine + the governed idle loop.
export {
  deepReading, createDeepReader, buildReflection, seededRng,
  RESTING, READING, REFLECTION_ENACTMENT,
} from './deep-reading.js';
// The significance-reflection prompt (the model voice for `reflect`): first-person,
// surprise-oriented, plus the output discipline a small model needs (reflect-prompt.js).
export {
  SIGNIFICANCE_REFLECT_SYSTEM, significanceReflectMessages, reflectionInput, REFLECT_DECODE, cleanReflection,
} from './reflect-prompt.js';

// The audit (fold/audit.js): is the inner monologue actually HELPING? Measures the monologue's
// own output on the system's terms — distinct (not ruminating), novel (not restating the
// record), significant (beats the band), and SAFE (the firewall held — no reflection became a
// fact). auditMonologue RUNS a fresh reader over a doc and audits it; auditLog is read-only over
// a doc the reader already rested on; reportAudit renders the verdict.
export { auditMonologue, auditLog, firewallAudit, reportAudit } from './audit.js';

// Significance (fold/significance.js): the connections the reader INFERS but the text never states
// — contradicts (a tension), connects (a common-neighbour latent link), corroborates (convergence)
// — promoted to the graph as reafferent, void, provenance-carrying CON edges. They MOVE the physics
// (surf, retrieval, the provenance graph) yet never witness: factsAdded 0, inferredAdded N. Impact
// without laundering (docs/monologue-significance.md).
export { weaveSignificance, inferSignificance, inferFoldSignificance, buildSignificanceEdge, readSignificance, SIGNIFICANCE } from './significance.js';

// Weave (fold/weave.js): loops on loops. Metacognition — the reflection ABOUT the reflections
// (loop 2) — and cross-connections — CON bonds between held interpretations (echo · bears-on ·
// analogy). Both reafferent, band void, canWitness false: the firewall holds at every level.
export {
  metaReflect, createMetaReader, buildMetaReflection,
  connect, buildConnection, weaveReading,
  analogize, relationGraph, wlColors,
  METACOGNITION, CONNECTION,
} from './weave.js';

// Verdict (fold/verdict.js): the two cross-cutting classifiers of docs/cognition-catalog.md —
// living-or-dead (the successor-mode verdict over held tensions: sustained · spent-down ·
// spent-up, with the EVA-row fate names) and sayable-or-not (the narrate-only router).
// Pure reads over the substrate and the enacted stream; nothing written back.
export {
  MODE_OF, FATE_OF, modeOf, verdictOf, classifyTensions, recEventsOf,
  sayability, routeSubstrate, VERBALIZABLE, NARRATE_ONLY,
} from './verdict.js';
