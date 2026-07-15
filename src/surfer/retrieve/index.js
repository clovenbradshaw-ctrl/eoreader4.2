// EO: SIG·SEG·CON·DEF(Field,Network → Field,Lens, Tending,Dissecting,Tracing) — barrel
// The retrieve holon: query → candidate spans.

export { retrieveLexical }  from './lexical.js';
export { retrieveSemantic } from './semantic.js';
export { retrieveHybrid, reserveBySource, fuseConcordance, pickRetrievalEmbedder, selectExcerpts } from './hybrid.js';
export { retrieveStructural, retrieveNetwork, queryTouchesDoc, querySubjectTerms } from './structural.js';
export { isReferenceChrome, dropReferenceChrome } from './chrome.js';
export { rrf, rrfScored, RRF_K } from './rrf.js';
// Embedding relevance — the meaning-space Born score and its significance-vs-background
// floor, gating which fetched pages are on-topic enough to save or ground (research walk).
export { cosine, bornScore, significanceFloor, renormAdd } from './relevance.js';
export {
  formatSpanId, parseSpanId, spanId,
  localSource, wikiSource, webSource, scrapeSource, matrixSource,
  sha256Hex, pinLocalDoc, expectedDigest, integritySig, verifyOnResolve,
} from './pin.js';
