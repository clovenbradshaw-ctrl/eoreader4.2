// EO: SIG·NUL(Field → Void, Tending,Clearing) — barrel — sync export family
// organs/out/sync — export the canonical anchor JSONL (core/sync/anchors.js) into whatever
// format a downstream tool actually wants. Each is PURE and produces a deterministic SPEC
// (or, for the trivial JSONL case, the format itself) — the same discipline
// organs/out/publish keeps: adding a format later (TTML, SMIL, MusicXML) is one more small
// file here, never a change to the alignment core.

export { jsonlPlan } from './jsonl.js';
export { srtPlan, renderSrt } from './srt.js';
