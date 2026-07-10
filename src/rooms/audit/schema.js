// EO: NUL(Kind → Kind, Clearing) — audit record schema/version
// The audit record schema. One JSON object per turn.
//
// {
//   schema:    'eo-audit/1',
//   id:        't42',
//   question:  string,
//   startedAt: ms, finishedAt: ms, durationMs: ms,
//   route:     'math' | 'metadata' | 'smalltalk' | 'grounded' | 'chat' | 'error',
//   grounding: 'auto' | 'grounded' | 'free',   // the register the user selected (the chip)
//   steps:     [{ name, t, data }, ...],
//   prompt:    string | null,   // verbatim, grounded only
//   rawOutput: string | null,   // verbatim, grounded only
//   bound:     [{ claim, citation, score }, ...] | null,
//   vetoes:    [{ id, message, refuses }, ...] | null,
//   answer:    string,
//   sources:   number[],
//   revisions: [{ draft, offDiagonal:[...], replacedBy, why }, ...] | null,
//              // superseded drafts, preserved BESIDE the answer that replaced them — the
//              // conversational record's SEG/retract. A rewrite appends a truer word; the
//              // false one is never unwritten. `why` is the plain reason it was made to
//              // answer again (a confab at a void, an ungrounded claim, or a shape miss —
//              // a "what is her name?" answered with no name), so the trail shows the engine
//              // catching itself: start, stop when off, begin again.
// }

export const SCHEMA_VERSION = 'eo-audit/1';
