// EO: INS·CON·DEF(Entity,Link,Lens → …) — the worked passage the terrain demo reads
// scene.js — one short passage, annotated with all nine terrains of the Site face
// (core/cube.js TERRAINS). It is a FIXTURE, the same way replay/scene.js and
// plain/scene.js are: a hand-read of one passage so the surface can show what each
// terrain looks like painted over text, without running the whole parse pipeline in
// the tab. Everything here is declarative — substrings, not offsets — so it reads as
// a reading, not as arithmetic; overlay.js resolves the substrings to spans.
//
// The nine terrains (domain × grain), and what carries each here:
//   Existence  Void   the said-around-it  · Structure Field    relational density
//              Entity the named things    ·           Link      the relations (arrows)
//              Kind   the type of a name  ·           Network   the clusters
//   Interpretation Atmosphere meaning-tone · a per-sentence wash
//                  Lens       a word read under one sense
//                  Paradigm   the dominant frame, and where it turns

export const TITLE = 'A city surveillance procurement';

// The passage, one entry per sentence. The surface renders each as its own block so a
// per-sentence wash (Field / Atmosphere / Paradigm) has somewhere to land.
export const SENTENCES = Object.freeze([
  'In 2019 the city council approved Fusus, a surveillance platform, over the objections of the mayor.',
  'The vendor promised the cameras would deter crime, though the audit found no such effect.',
  'Residents of the Eastside had never been consulted about the network at all.',
  'By 2023 the same council quietly renewed the contract, now calling it a public-safety tool.',
]);

// ── Existence · Figure — ENTITIES (the named things), with coref collapsed to an id.
// `text` is the surface form to mark; `occ` disambiguates a form that repeats in its
// sentence. `kind` is the Existence·Pattern layer (its type); `cluster` the
// Structure·Pattern layer (which community of the graph it sits in).
export const ENTITIES = Object.freeze([
  { id: 'council',  sent: 0, text: 'city council',           kind: 'org',      cluster: 'governing' },
  { id: 'fusus',    sent: 0, text: 'Fusus',                  kind: 'product',  cluster: 'vendor'    },
  { id: 'mayor',    sent: 0, text: 'the mayor',              kind: 'person',   cluster: 'governing' },
  { id: 'vendor',   sent: 1, text: 'The vendor',             kind: 'org',      cluster: 'vendor'    },
  { id: 'cameras',  sent: 1, text: 'the cameras',            kind: 'product',  cluster: 'vendor'    },
  { id: 'audit',    sent: 1, text: 'the audit',              kind: 'doc',      cluster: 'governing' },
  { id: 'eastside', sent: 2, text: 'Residents of the Eastside', kind: 'group', cluster: 'public'    },
  { id: 'council',  sent: 3, text: 'the same council',       kind: 'org',      cluster: 'governing' },
  { id: 'contract', sent: 3, text: 'the contract',           kind: 'doc',      cluster: 'governing' },
]);

// ── Structure · Figure — LINKS (the relations). The `text` is the verb/relation span
// to mark inline; `src`/`tgt` are entity ids the arc connects (tgt null = the arrow
// lands on a claim, not another named thing, so it is drawn as a stub).
export const LINKS = Object.freeze([
  { sent: 0, text: 'approved',              src: 'council', tgt: 'fusus',    rel: 'approved',    polarity: '+' },
  { sent: 0, text: 'over the objections of', src: 'fusus',  tgt: 'mayor',    rel: 'opposed-by',  polarity: '−' },
  { sent: 1, text: 'promised',              src: 'vendor',  tgt: 'cameras',  rel: 'promised',    polarity: '+' },
  { sent: 1, text: 'found no such effect',  src: 'audit',   tgt: 'cameras',  rel: 'disconfirms', polarity: '−' },
  { sent: 3, text: 'renewed',               src: 'council', tgt: 'contract', rel: 'renewed',     polarity: '+' },
]);

// ── Interpretation · Figure — LENSES (a word that reads differently under a frame).
// Each carries the senses the corpus affords; the surface opens them on a click. This
// is the plain-room's disagreement.js made local to one passage.
export const LENSES = Object.freeze([
  { id: 'surveillance', sent: 0, text: 'surveillance', senses: Object.freeze([
      { label: 'a safety capability', gloss: 'something that deters or solves crime' },
      { label: 'a tool of control',   gloss: 'something done to people, not for them' },
      { label: 'a line item',         gloss: 'a contract the council votes on and renews' },
    ]) },
  { id: 'public-safety', sent: 3, text: 'a public-safety tool', senses: Object.freeze([
      { label: "the council's reframing", gloss: 'the same platform, renamed to settle the question' },
    ]) },
]);

// ── Existence · Ground — VOID (what is said AROUND a thing but never OF it). Not a
// highlight of a span that is there, but a mark on the edge of an absence: a thing
// named yet never given a voice, a reference introduced by nothing.
export const VOIDS = Object.freeze([
  { sent: 2, text: 'never been consulted', note: 'The residents are named, but only as the object of an omission — they never act, are never quoted.' },
  { sent: 2, text: 'the network', note: 'Referred to as given ("the network"), yet no sentence ever introduced or defined it.' },
]);

// ── The three ambient / regional washes (Ground + the Interpretation·Pattern frame).
// One value per sentence; the surface paints at most one wash at a time (you can only
// tint the page one way), which is exactly the grain speaking: Ground is a medium.

// Structure · Ground — FIELD: relational density (0..1). How much relating this
// sentence carries — derived-feeling, but pinned here so the demo is deterministic.
export const FIELD = Object.freeze([0.95, 0.7, 0.1, 0.5]);

// Interpretation · Ground — ATMOSPHERE: the meaning-tone of the sentence.
export const ATMOSPHERE = Object.freeze([
  { tone: 'contested',  hue: 'amber',  note: 'a decision made over an objection' },
  { tone: 'doubted',    hue: 'blue',   note: 'a promise the record then contradicts (irrealis "would")' },
  { tone: 'aggrieved',  hue: 'violet', note: 'an omission stated flatly' },
  { tone: 'euphemistic', hue: 'green', note: 'the same thing, renamed to settle it' },
]);

// Interpretation · Pattern — PARADIGM: the dominant frame a region reads under, and
// where it turns. Sentences 0–2 read the platform as "surveillance"; sentence 3
// re-reads it as a "public-safety tool" — a REC break on the dated corpus.
export const PARADIGM = Object.freeze([
  { frame: 'surveillance',   break: false },
  { frame: 'surveillance',   break: false },
  { frame: 'surveillance',   break: false },
  { frame: 'public-safety',  break: true, note: 'the frame turns here — 2019 “surveillance” → 2023 “public-safety tool”' },
]);
