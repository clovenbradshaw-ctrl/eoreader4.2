// EO: SIG·SEG·CON·DEF(Field,Network → Field,Lens, Tending,Dissecting,Tracing) — barrel
// The retrieve holon: query → candidate spans.

export { retrieveLexical }  from './lexical.js';
export { retrieveSemantic } from './semantic.js';
export { retrieveHybrid, reserveBySource, fuseConcordance, pickRetrievalEmbedder, selectExcerpts } from './hybrid.js';
export { retrieveStructural, retrieveNetwork, queryTouchesDoc } from './structural.js';
export { isReferenceChrome, dropReferenceChrome } from './chrome.js';
