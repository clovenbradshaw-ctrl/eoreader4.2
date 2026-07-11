// EO: SYN·CON·EVA·REC(Network,Entity,Lens → Lens,Paradigm,Network, Composing,Binding,Tracing,Dissecting) — barrel
// The EOT coder: plain text → EOT → code, as a validated intermediate
// representation (docs/eot-coder-roadmap.md, docs/eot-coder-checkpoint.md). One
// mouth over the whole watchmaker loop — mask (Stage 1), checkpoint (§4), repair
// (Stage 3), the signed build ledger (Stage 4), and the pipeline that ties them.

export { build } from './build.js';
export {
  checkpoint, checkpointChain,
  ERROR_TAXONOMY, detectionPoint, MIGRATES_TO_DECODER, STAYS_AT_CHECKPOINT,
} from './checkpoint.js';
export {
  maskField, maskEvent, admits, legalRefs,
  TOKEN_EVENT_ERRORS, OP_IDS, FIELD_VOCAB,
} from './mask.js';
export { constrainedEmit } from './emit.js';
export { repair, STRATEGIES, REPAIRABLE } from './repair.js';
export { createBuildLedger } from './ledger.js';
export { CATALOG, SURFACE_NAMES, hasSurface, surfaceOf, reportCatalogGaps } from './catalog.js';
