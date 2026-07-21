// EO: NUL(Network → Void, Clearing) — the reader room's public entrance.
// The one door outsiders (a demo surface like reader.html, another room) knock on: they import from
// here, never past it into the room's internals (docs/holons.md, docs/architecture.md — "No holon
// imports another's internals — only its index.js"). The running app still boots the room through the
// window.EO membrane in boot.js; this barrel is the framework-free seam a page can mount against.
export { mountReaderSurface } from './reader-surface.js';
export { mountLedger } from './ledger-surface.js';
export { assembleQuestionResult, buildLedger, holonMeaningData, verdictForGroup, STANDINGS } from './question-result.js';
export { anchorFor, resolveAnchor } from './anchor.js';
