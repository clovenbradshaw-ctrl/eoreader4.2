// EO: SIG·NUL(Field → Void, Tending,Clearing) — barrel — cross-source sync family
// core/sync — the born-rule gated alignment engine: two feature sequences in, a
// confidence-scored anchor stream out, never a brute-force guess (align.js leans on
// core/voidnull.js's boundedNull, unmodified). This is the holon's one entrance — external
// callers (organs/out/sync's exporters, app/sync.js) import from here, never the deep files.

export { alignSequences, tokenScore, bandedAlign } from './align.js';
export { makeAnchor, makeHeader, toJsonl, fromJsonl, ANCHOR_VERSION } from './anchors.js';
export { timeShiftDecoy, blockShuffleDecoy, crossSourceDecoy } from './decoys.js';
