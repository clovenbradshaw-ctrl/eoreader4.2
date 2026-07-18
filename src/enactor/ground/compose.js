// EO: EVA·CON(Field,Network → Lens, Binding,Tracing) — the span-grounding chain, composed once
// ground/compose.js — groundText: segment → groundSpans → groundSummary → supportVerdict in
// ONE modality-neutral call.
//
// The span-grounding chain is three steps the answer path, the welded paragraph, and the fold
// summary all owe: cut the prose into the spans the reader hovers, ground each against what was
// read (source or void, propositionally — ground/spans.js), tally them, and read the answer-grain
// support badge (supportVerdict). Each call site re-wiring the three invites drift; this composes
// them once so every modality stands on the SAME ground. The splitter is segmentSentences — the
// SAME one weld.js feeds groundSpans, so a span here is a span there.
//
// Returns the supportVerdict fields ({ supported, kind, ratio, claims, source }) plus the raw
// `verdicts` (per-span provenance) and `summary` (the tally), for a caller that wants to render
// which sentences stood on a source and which on the void.

import { segmentSentences } from '../../perceiver/parse/index.js';
import { groundSpans, groundSummary, supportVerdict } from './spans.js';

export const groundText = (text, { passages = [], doc = null, floor, minClaims } = {}) => {
  const spans = segmentSentences(String(text || '')).filter((s) => s.trim());
  const verdicts = groundSpans(spans, { passages, doc });
  const summary = groundSummary(verdicts);
  return { ...supportVerdict(summary, { floor, minClaims }), verdicts, summary };
};
