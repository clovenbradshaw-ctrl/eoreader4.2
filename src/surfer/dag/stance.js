// EO: DEF(Field → Lens,Atmosphere, Dissecting) — re-export shim; the dialectical CON warrant
// Renamed to causal-warrant.js (docs/universalizing-stance-face.md §3): "stance" here
// named a causal-verb warrant strength (accidental/essential/generative), unrelated to
// core/cube.js's Mode × Object Stance face — one of four unrelated concepts the word
// "stance" collided across in this codebase. This is a re-export shim, kept for one
// release so existing imports of this path keep resolving; see causal-warrant.js for
// the real content. tests/stance-registry.test.js enforces that this file stays a
// shim and never grows a local definition of its own.
export {
  WARRANTS as STANCES, proposeWarrant as proposeStance,
  readPolarity, readModality,
  ESSENTIAL_VERBS, ASSOCIATION_VERBS, MECHANISM_CUES, ASSOCIATION_CUES, NULL_CUES, HEDGE_CUES,
  isCausalVerb, isAssociationVerb,
  ARCS, ARC_BAND, ARC_MEANING, classifyArc,
} from './causal-warrant.js';
