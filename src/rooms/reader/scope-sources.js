// EO: SEG·EVA(Network,Field → Field, Unraveling,Tracing) — separate signal from noise
// scope-sources.js — pick the sources a question grounds on, as a pure function so the
// separation is guarded by a test the browserless CI can run (the app that calls it,
// rooms/reader/app.js `ask`, is not).
//
// SEPARATE THE WHEAT FROM THE CHAFF. A topic accretes sources — the document the reader
// is here to read, plus the stubs a few earlier questions pulled in. A single question is
// rarely about ALL of them, but grounding used to fold EVERY source into one composite and
// read the answer over the whole pile. Two harms followed:
//   · a vague question ("what is the most surprising part?") matched an incidental phrase
//     in an unrelated stub and answered from it — over a 78-source topic the answer came
//     back from a Wikipedia stub that happened to contain "most surprising part", not the
//     2,674-page document the reader had loaded;
//   · the fact-check scanned the ENTIRE corpus graph (tens of seconds on a big library).
//
// The signal that survives a vague question is SUBSTANCE, not word overlap: the stubs
// literally contained the query phrase, so lexical matching PREFERRED the noise. The
// document loaded to be read about is the subject; a 4 KB namesake stub is not. So the
// wheat is:
//   · every SUBSTANTIAL source — within `substance` of the largest source by size; and
//   · any small source the question names DISTINCTIVELY — at least `strongHits` distinct
//     content terms, never the one- or two- common-word coincidence the stubs rode in on.
// A small topic (≤ `floor` sources) is left whole — there is nothing to separate — and the
// filter never grounds on nothing (an empty result falls back to the full set).
//
// Pure and DOM-free; app.js maps the kept sources through docFor and grounds the turn on
// them. Scoring reads only a source's `title`, `bytes`, and `text`.

export const SCOPE_DEFAULTS = Object.freeze({
  floor: 6,          // topics at/below this keep every source — nothing to separate
  substance: 0.2,    // a source ≥ this fraction of the largest (by bytes) is substantial
  strongHits: 3,     // distinct content terms a SMALL source must match to be rescued
  scanChars: 200000, // how much of a source's text to scan for term hits (a big doc is kept on size alone)
});

// Words that carry no topic — articles, pronouns, auxiliaries, and the empty quantifiers/
// nouns a vague question is built from ("what is the most surprising PART", "which THING").
// Kept here (not a shared stoplist) because the job is narrow: stop a common word from
// rescuing a stub, never to model language. Additive and conservative.
export const SCOPE_STOPWORDS = new Set(
  ('the a an of to in on at by for and or but nor is are was were be been being this that ' +
   'these those it its as with from into onto over under about above below out off up down ' +
   'what which who whom whose why how when where whether than then them they their there here ' +
   'your yours have has had having do does did done will would shall should can could may ' +
   'might must not no yes more most much many some any all both each few less least very just ' +
   'only also even still ever never part parts thing things kind sort way ways one two get got ' +
   'make made say said tell told').split(/\s+/),
);

// The distinct content terms of a question: word-ish tokens of ≥4 letters, minus the
// stoplist. A short vague question reduces to a handful (often one), which is exactly why
// it cannot rescue a stub below.
export const contentTerms = (question) =>
  [...new Set(String(question || '').toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])]
    .filter((t) => !SCOPE_STOPWORDS.has(t));

// scopeSources(question, sources, opts) → the sources to ground on (a subset of `sources`,
// order preserved). `sources` are the reader's source records (title, bytes, text).
export const scopeSources = (question, sources, opts = {}) => {
  const { floor, substance, strongHits, scanChars } = { ...SCOPE_DEFAULTS, ...opts };
  const srcs = Array.isArray(sources) ? sources : [];
  if (srcs.length <= floor) return srcs;

  const terms = contentTerms(question);
  const maxBytes = srcs.reduce((m, s) => Math.max(m, s?.bytes || 0), 0) || 1;

  // A SMALL source earns its place only by being distinctly named — `strongHits` different
  // content terms present. A question with fewer content terms than that can never rescue a
  // stub (this is the vague-question guard: "surprising part" → one term → rescues nothing).
  const strongHit = (s) => {
    if (terms.length < strongHits) return false;
    const hay = `${s?.title || ''} ${String(s?.text || '').slice(0, scanChars)}`.toLowerCase();
    let n = 0;
    for (const t of terms) if (hay.includes(t) && ++n >= strongHits) return true;
    return false;
  };

  const wheat = srcs.filter((s) => (s?.bytes || 0) >= substance * maxBytes || strongHit(s));
  return wheat.length ? wheat : srcs;   // never ground on nothing
};
