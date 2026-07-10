// EO: DEF·SYN·CON·EVA·REC·SIG·INS·NUL(Void,Field,Network → Entity,Network,Paradigm,Void,Atmosphere, Making,Clearing,Composing,Tracing,Tending) — barrel
// research/index.js — deep research as a grounded projection over an
// append-only log (docs/deep-research-log.md).
//
// The log (events.js) is the one fact; the report (project.js → render.js) and
// the live process view (live.js) are both projectReport(log) at a cursor;
// the driver (driver.js) is the only writer. The surface (surface.js) mounts
// the whole thing into any DOM element — the main app docks it in the right
// panel.

export {
  RKIND, OPERATOR_OF, ASK_TRIGGERS, VOID_TERRAINS,
  openResearch, pinSource, readSpan, extractProposition, evaTest, conEdge,
  recFrame, voidAbsence, askUser, answerAsk, promoteProposition, phraseSection,
} from './events.js';
export { projectReport } from './project.js';
export { runGroundedResearch, addressOfSentence, termSimilarity, holonicFacets, stripTaskFraming } from './driver.js';
export { liveView, describeEvent } from './live.js';
export { createResearchSession, formatChatReply } from './session.js';
export { renderReportFragment, renderTraceFragment, renderReportHTML, REPORT_CSS } from './render.js';
export { mountResearchSurface } from './surface.js';
