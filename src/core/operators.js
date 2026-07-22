// EO: NUL(Kind → Kind, Clearing) — the nine operators (Act face)
// The nine operators. The vocabulary the whole system speaks.
//
// ACT face: Identity (mode) × Space (domain)
//
//                 Existence       Structure       Interpretation
// Differentiate   NUL hold        SEG resplit     DEF assert
// Relate          SIG attribute   CON bond        EVA evaluate
// Generate        INS instantiate SYN synthesize  REC learn rule
//
// CON — the binding bond at Relate × Structure — is the central operator.
// It is what makes a citation hold a claim to a source.

export const MODES   = Object.freeze(['Differentiate', 'Relate', 'Generate']);
export const DOMAINS = Object.freeze(['Existence', 'Structure', 'Interpretation']);
export const GRAINS  = Object.freeze(['Ground', 'Figure', 'Pattern']);

// NUL is non-transformation — it holds a thing as-is. It is NOT "clearing":
// voiding a fact is a DEF to VOID (an assertion), never a NUL.
// The glyph rides ON the operator, not in any one renderer. It is the domain-columns
// mapping the tiered graph's tier legend already spoke by hand (existence ∅○●, structure
// ｜⋈△, interpretation ⊢⊨⊛); making it authoritative here lets every surface draw the SAME
// mark for a given act, so a graph edge and a legend chip never disagree.
export const OPERATORS = Object.freeze({
  NUL: Object.freeze({ id: 'NUL', mode: 'Differentiate', domain: 'Existence',      label: 'hold (non-transformation)', glyph: '∅' }),
  SEG: Object.freeze({ id: 'SEG', mode: 'Differentiate', domain: 'Structure',      label: 'resplit',                   glyph: '｜' }),
  DEF: Object.freeze({ id: 'DEF', mode: 'Differentiate', domain: 'Interpretation', label: 'assert/define',             glyph: '⊢' }),
  SIG: Object.freeze({ id: 'SIG', mode: 'Relate',        domain: 'Existence',      label: 'attribute',                 glyph: '○' }),
  CON: Object.freeze({ id: 'CON', mode: 'Relate',        domain: 'Structure',      label: 'bond',                      glyph: '⋈' }),
  EVA: Object.freeze({ id: 'EVA', mode: 'Relate',        domain: 'Interpretation', label: 'evaluate',                  glyph: '⊨' }),
  INS: Object.freeze({ id: 'INS', mode: 'Generate',      domain: 'Existence',      label: 'instantiate',               glyph: '●' }),
  SYN: Object.freeze({ id: 'SYN', mode: 'Generate',      domain: 'Structure',      label: 'synthesize',                glyph: '△' }),
  REC: Object.freeze({ id: 'REC', mode: 'Generate',      domain: 'Interpretation', label: 'learn rule',                glyph: '⊛' }),
});

export const isOperator = (op) => typeof op === 'string' && op in OPERATORS;

// The mark for an operator (falling back to a neutral mid-dot when the code is not one
// of the nine — a display never throws on an unknown op, it just draws the dot).
export const glyphOf = (op) => (op && OPERATORS[op] ? OPERATORS[op].glyph : '·');

export const operatorsByMode = (mode) =>
  Object.values(OPERATORS).filter(o => o.mode === mode);

export const operatorsByDomain = (domain) =>
  Object.values(OPERATORS).filter(o => o.domain === domain);

// The Act face read the other way: each of the nine operators has a unique (Mode,
// Domain) pair, so this is a TOTAL lookup over the 3×3 grid — the operator a caller
// gets by declaring what it does (Mode) and where it does it (Domain), instead of a
// caller naming an operator by hand (core/stance-face.js's cellForGrain).
const BY_MODE_DOMAIN = new Map(Object.values(OPERATORS).map(o => [`${o.mode}|${o.domain}`, o]));
export const operatorForMode = (mode, domain) => BY_MODE_DOMAIN.get(`${mode}|${domain}`) ?? null;

// The manner a claim reads as, in the words a reader recognises without the cube's own
// vocabulary — the same three Modes, said the way a person would read them off a claim: an act
// that DIFFERENTIATES pulls two things apart ("distinguishes"), one that RELATES draws them
// together ("links"), one that GENERATES brings something new into the record ("introduces").
// Never a fourth word invented beyond the three Modes already define.
export const MODE_MANNER = Object.freeze({
  Differentiate: 'distinguishes',
  Relate: 'links',
  Generate: 'introduces',
});
export const mannerOf = (op) => (op && OPERATORS[op]) ? MODE_MANNER[OPERATORS[op].mode] : null;
