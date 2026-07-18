// EO: DEF(Kind → Paradigm, Dissecting) — the shared English function-word list
// stopwords.js — one closed-class word list, so "is this token content or
// scaffolding" answers the same way everywhere a content-word overlap is the
// grounding rule. rooms/doc/ground.js's contentWords and enactor/ground/spans.js's
// contentTerms were always meant to be "the same shape" (spans.js's own comment
// says so) but had quietly drifted apart — 24 words only one of them stopped, 6
// only the other. This is their union, restoring the shared behavior both
// intended. Each caller keeps its own tokenizer (its own token regex, its own
// minimum length — doc/ground.js counts a bare number as content, spans.js
// does not, and that difference is deliberate); only the closed class itself
// lives here, once.
export const STOPWORDS = Object.freeze(new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'am', 'it', "it's", 'its', 'this', 'that', 'these', 'those', 'they', 'them',
  'their', 'he', 'him', 'she', 'his', 'her', 'we', 'our', 'you', 'your', 'i', 'me', 'my',
  'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'will', 'would', 'can',
  'could', 'may', 'might', 'must', 'shall', 'should', 'if', 'then', 'than', 'now',
  'once', 'there', 'here', 'which', 'who', 'whom', 'what', 'when', 'where', 'how',
  'all', 'any', 'some', 'each', 'into', 'out', 'up', 'down', 'over', 'under', 'off',
  'about', 'more', 'most',
]));
