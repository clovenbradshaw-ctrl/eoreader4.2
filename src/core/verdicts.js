// EO: NUL(Lens → Lens, Clearing) — verdict vocabulary
// The verdict vocabulary — a pure enum, the genome's leaf.
//
// It lives in core, not in factcheck, because two holons now read it: the
// edge-grounding fact-checker (factcheck/correspond.js) types a talker claim to
// one of these, and the relation algebra (read/relation-types.js) returns one
// from its embedder-free symbolic check. `read` must stay a leaf — it may import
// *down* into core but never *up* into factcheck — so the shared vocabulary sinks
// to the layer both depend on. Same constants, one home, no cycle.
//
// A boolean is wrong here: absence has more than one cause and the causes are not
// the same verdict (edge-grounding §3). Contradicted is a hard refusal;
// unsupported is a strip-or-flag; indeterminate is held — the no-commit
// discipline at the verdict.
//
// OFF_DIAGONAL is the diagonal guard's verdict (core/cube.js `coherence`), orthogonal
// to the grounding verdicts above: it does not ask whether a document edge
// witnesses the claim, it asks whether the claim's GRAIN matches the grain of the
// terrain the reading typed at the answer locus. A specific (Figure-grain) claim
// asserted where the reading measured an absence — a figure at a Void — is off the
// Object diagonal: the confabulation shape, "a Figure fix to a Ground problem".
//
// core/resolution-face.js is the generator this vocabulary is a projection of
// (spec:verdict-space-taxonomy): a 3×3 grid crossing Bearing (the Mode of the
// claim-witness relation — Binds/Cuts/Doesn't-bear) × Determinacy (Ground/Figure/
// Pattern). CORROBORATED/CONTRADICTED/UNSUPPORTED/INDETERMINATE are the grid's four
// Figure/Pattern-column verdicts. SILENT is the fifth cell, promoted out of
// UNSUPPORTED: "no material at all" (Ground) is a different claim than "material
// exists, does not support" (Figure), and collapsing them made an internal-policy
// redaction indistinguishable from genuine absence (see resolution-face.js §4).
// CONSONANT, CIRCUMSTANTIAL, and UNDERMINED are the grid's remaining three cells —
// legal EVA verdicts, but no code path emits them yet: their separability from their
// shipped neighbors is an open empirical question (resolution-face.js `SHIPPED_FOLD`,
// the spec's §5.2/§6 pre-registered test), not a defect to silently fix. Add a
// detector and promote one only once that separation is measured, not assumed.
export const VERDICTS = Object.freeze({
  CORROBORATED:   'corroborated',
  CONSONANT:      'consonant',       // reserved — unemitted, see core/resolution-face.js
  CIRCUMSTANTIAL: 'circumstantial',  // reserved — unemitted, see core/resolution-face.js
  CONTRADICTED:   'contradicted',
  UNDERMINED:     'undermined',      // reserved — unemitted, see core/resolution-face.js
  UNSUPPORTED:    'unsupported',
  INDETERMINATE:  'indeterminate',
  SILENT:         'silent',
  OFF_DIAGONAL:   'off_diagonal',
});
