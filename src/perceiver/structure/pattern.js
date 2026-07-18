// EO: INS·CON(Void,Entity → Kind,Network, Making,Binding) — the pattern:* entity class (§2)
// A PATTERN is a graph entity, not a side-table of learned weights. It is minted, addressed,
// corroborated, and revised with the SAME INS/anchor/DEF machinery every content entity uses —
// so cross-organ pattern reuse falls out for free, with no separate registry to keep in sync.
//
// The spec's shape (§2), made a pure constructor:
//   { anchor, record_id: 'pattern:<name>', type:'pattern', def:{ detection_params, promotion_threshold, status }, corroboration:[…] }
//
// A pattern lives in the content graph via a new edge type — `instantiates` (span → pattern),
// distinct from `part-of` and `references` — so a span can SAY it matched a pattern without the
// pattern owning the span. This module is PURE: it builds the tuples; index.js appends them to the
// append-only log. No Date.now / random in logic — a clock and an id-source are injected where
// identity or time is needed (codebase convention).

// The three statuses a pattern moves through — a candidate proposed but not yet trusted, a
// promoted one matching is cheap against, a demoted one retired by a REC (§4). `status` is a DEF
// on the pattern's def, so a move is logged and revisable, never a constant flipped in code.
export const PATTERN_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  PROMOTED:  'promoted',
  DEMOTED:   'demoted',
});

// The promotion threshold's DEFAULT — a DEF PLACEHOLDER, not a principled constant (§11, open
// question). It is carried on each pattern's def so it can be revised per-pattern by a REC; nothing
// in the pipeline reads a hardcoded 5. Named here only so a caller that omits it gets an explicit,
// auditable seed rather than an implicit one.
export const DEFAULT_PROMOTION_THRESHOLD = 5;

// patternId(name) → the canonical record_id for a pattern. A pattern is addressed by NAME, not by a
// minted opaque id, because two organs that independently discover "email-header-block" must land on
// ONE pattern (cross-organ reuse, §2). The name is slugified so it is a stable address segment.
export const patternId = (name) =>
  `pattern:${String(name || 'unnamed').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed'}`;

// A witness of a pattern on ONE document. `ruled_out_other` is MANDATORY on the corroboration path
// (§4.3): a witness that records only the shape it matched is an ABOUT witness; one that also records
// the strongest excluded near-miss is a SUPPORTING witness. `source_doc` is what makes two witnesses
// count as two — recurrence WITHIN one doc is one witness repeated (§4.2), enforced downstream by
// distinct-source counting (promotion.js), not here.
export const makePatternCorroboration = ({
  witness_span = null, source_doc = null, ruled_out_other = null,
  agent = 'pre-seg-detector', ts = null, params = null,
} = {}) => Object.freeze({
  witness_span, source_doc, ruled_out_other, agent, ts,
  ...(params ? { params: Object.freeze({ ...params }) } : {}),
});

// makePattern({...}) → a frozen pattern entity. `detection_params` is the statistical/structural
// signature the detector (§3) reads — periodicity, delimiter signature, salience profile — never a
// format name. The pattern KNOWS NOTHING of "email"; it knows a shape. `anchor` is the content hash
// of that shape (injected — a hasher over the params), so two organs that see the same shape mint
// the same anchor and reuse the one pattern.
export const makePattern = ({
  name, anchor = null, detection_params = {},
  promotion_threshold = DEFAULT_PROMOTION_THRESHOLD,
  status = PATTERN_STATUS.CANDIDATE, corroboration = [],
} = {}) => {
  const record_id = patternId(name);
  return Object.freeze({
    anchor,
    record_id,
    type: 'pattern',
    def: Object.freeze({
      detection_params: Object.freeze({ ...detection_params }),
      promotion_threshold,   // a DEF (§2) — logged, revisable, never a code constant
      status,
    }),
    corroboration: Object.freeze((corroboration || []).map((c) => Object.freeze({ ...c }))),
  });
};

// isPattern(x) — a structural guard, so a caller can tell a pattern entity from a content one.
export const isPattern = (x) =>
  !!x && x.type === 'pattern' && typeof x.record_id === 'string' && x.record_id.startsWith('pattern:');

// withCorroboration(pattern, witness) → a NEW pattern with one witness appended. Append-only in the
// value sense too: the old pattern is never mutated, mirroring the log's discipline. The status is
// left untouched — promotion/demotion is the pipeline's decision (promotion.js), never a side effect
// of witnessing.
export const withCorroboration = (pattern, witness) =>
  Object.freeze({
    ...pattern,
    corroboration: Object.freeze([...(pattern.corroboration || []), Object.freeze({ ...witness })]),
  });

// withStatus(pattern, status, reason) → a NEW pattern at a new status. Used by the pipeline to
// realise a promotion/demotion REC's decision; the reason rides for the audit trail.
export const withStatus = (pattern, status, reason = null) =>
  Object.freeze({
    ...pattern,
    def: Object.freeze({ ...pattern.def, status, ...(reason ? { statusReason: reason } : {}) }),
  });

// ── the `instantiates` edge (§2) ────────────────────────────────────────────────────────────────
// A span SAYS it matched a pattern. Distinct from part-of (containment) and references (a pointer to
// another entity): instantiates is "this concrete span is an INSTANCE of that abstract shape". The
// edge is a CON (the bond at Relate × Structure) carrying the span, the pattern's record_id, and the
// warrant that bound them — the detector's confidence and, on a corroborating instance, the
// ruled-out near-miss. Pure tuple; index.js logs it as op:'CON', kind:'instantiates'.
export const INSTANTIATES = 'instantiates';

export const makeInstantiates = ({
  span = null, pattern = null, confidence = 0.5, ruled_out_other = null, agent = 'pre-seg-detector',
} = {}) => {
  const to = typeof pattern === 'string' ? pattern : pattern?.record_id ?? null;
  return Object.freeze({
    op: 'CON', kind: INSTANTIATES,
    from: span, to,
    confidence, ruled_out_other, agent,
  });
};
