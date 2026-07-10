// EO: DEF(Void → Kind, Dissecting) — demand: classify question scope
// DEMAND — the question's inherent scope (§5.1).
//
// A cheap keyword read over the raw question, in the same spirit as the turn's
// `route`/`taskOf` register pass. It emits a `scopeClass` that sets a PRIOR on
// section count — it never sets a hard count, and it never pads: a `point`
// question with twelve retrieved spans still gets one section.
//
//   point   — "what does clause 4 say"     → cap at 1 section
//   list    — "what are the exceptions"     → sections ≈ enumerated items
//   survey  — "summarize the obligations"   → sections ≈ evidence clusters
//   compare — "how does A differ from B"    → sections ≈ comparison dimensions
//
// The match is reported with the keywords that fired (or `default` when none
// did), so the audit's length-decision trace can say WHY the scope was read as
// it was — the provenance property generalized from claims to shape.

// compare is read FIRST: "how does A differ from B" also trips explain's "how",
// and a comparison's dimensions are a stronger length prior than an explanation.
const COMPARE = /\b(compare|comparison|contrast|differ(?:s|ence|ences)?|versus|vs\.?|how\s+does\s+.+\s+differ|difference\s+between|tell\s+them\s+apart|distinguish)\b/i;
// survey — a whole-document synthesis. The same family the turn calls `summary`.
const SURVEY  = /\b(summar(?:y|ise|ize)|overview|synthes(?:is|ise|ize)|describe|outline|obligations?|the\s+whole|overall|in\s+general|walk\s+me\s+through)\b/i;
// list — an enumeration. The same family the turn calls `list`.
const LIST    = /\b(list|enumerate|bullet(?:s|ed)?|exceptions?|examples?|name\s+(?:every|all|each)|what\s+are\s+the|which\s+are\s+the|all\s+the)\b/i;

// Which keywords of a pattern actually fired, for the trace.
const hits = (re, q) => {
  const m = String(q || '').match(new RegExp(re.source, re.flags.replace('i', '') + 'gi'));
  return m ? [...new Set(m.map(s => s.toLowerCase()))] : [];
};

export const classifyScope = (question) => {
  const q = String(question || '');
  if (COMPARE.test(q)) return { scopeClass: 'compare', matched: hits(COMPARE, q) };
  if (SURVEY.test(q))  return { scopeClass: 'survey',  matched: hits(SURVEY, q) };
  if (LIST.test(q))    return { scopeClass: 'list',    matched: hits(LIST, q) };
  return { scopeClass: 'point', matched: ['default'] };
};

// Whether a scope is the degenerate one — a pointed lookup that wants a single
// section and is byte-identical to the present single-turn path (§8, invariant 6).
export const isPointScope = (scopeClass) => scopeClass === 'point';
