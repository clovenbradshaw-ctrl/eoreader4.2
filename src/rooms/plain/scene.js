// EO: SIG·INS(Void → Entity,Field, Making,Tending) — the worked corpus (fixture-as-content)
// scene.js — four sources on a city's surveillance procurement, hand-authored as the shape
// an honest reading emits, not demo chrome bolted onto a live engine. Every clickable thing
// carries its kind (name / connection / idea) so the surface never has to guess which three
// questions are legal — terrain.js reads the kind and the arithmetic does the rest.
//
// The numbers behind "Where people disagree" (§3) are tuned so that reading the word
// "surveillance" as everyone, as the budget hearing, and as the court filing reproduces the
// three panels in the plain-version doc exactly: everyone → camera > line item > partnership
// > legal exposure > sensing > thing-done; budget → line item > capability > partnership >
// camera; court → thing-done > legal exposure > camera > line item. select.readAs is the fold;
// tests/plain-select.test.js pins the redraws.

export const TITLE = 'Surveillance procurement';
export const SUBTITLE = 'How a city bought a surveillance network';

// ── The four sources (doc §1, left rail). ────────────────────────────────────────────
export const SOURCES = [
  { id: 'budget', label: 'Budget hearing',  full: 'Council Budget Hearing, 3 Mar 2025' },
  { id: 'vendor', label: 'Vendor contract', full: 'Fusus master services agreement' },
  { id: 'court',  label: 'Court filing',    full: 'ACLU v. City, motion for records' },
  { id: 'press',  label: 'Press release',   full: 'Downtown Partnership announcement' },
];

// ── The reading (middle pane). An array of segments: a bare string is prose; an object is a
// highlighted thing the person can click. `kind` is the terrain it already is; `id` keys the
// registry below. Nothing here says "entity" or "operator" — the mark IS the type. ─────────
export const READING = Object.freeze({
  source: 'budget',
  heading: 'Council Budget Hearing, 3 Mar 2025',
  segments: Object.freeze([
    '…the department requested an additional allocation for the ',
    { kind: 'name', id: 'fusus', text: 'Fusus' },
    ' platform, describing it as ',
    { kind: 'idea', id: 'public-safety', text: 'a public-safety partnership' },
    ' with the ',
    { kind: 'connection', id: 'fusus-downtown', text: 'Downtown Partnership' },
    '. Councilmember ',
    { kind: 'name', id: 'reyes', text: 'Reyes' },
    ' asked whether ',
    { kind: 'idea', id: 'surveillance', text: 'surveillance' },
    ' was the right word. The chief replied that the system ',
    { kind: 'idea', id: 'does-not-record', text: 'does not record' },
    '…',
  ]),
});

// ── The registry of clickable things. Each carries its kind and the per-thing counts the
// popover shows to the right of each question (keyed by the question `view` in terrain.js).
// A name → occurrences / instances / blindspots; a connection → neighbors / split / picture;
// an idea → meanings / holds / shifts. Missing counts render blank, never zero. ─────────────
export const THINGS = Object.freeze({
  fusus:            { kind: 'name',       title: 'Fusus',                            counts: { occurrences: 12, instances: 7, blindspots: 3 } },
  reyes:            { kind: 'name',       title: 'Councilmember Reyes',              counts: { occurrences: 5, instances: 3 } },
  'fusus-downtown': { kind: 'connection', title: 'Fusus  →  Downtown Partnership',   counts: { neighbors: 9, split: 2, picture: 1 } },
  surveillance:     { kind: 'idea',       title: '"surveillance"',                   counts: { meanings: 6, holds: 2, shifts: 2 } },
  'public-safety':  { kind: 'idea',       title: '"a public-safety partnership"',    counts: { meanings: 4, holds: 1 } },
  'does-not-record':{ kind: 'idea',       title: '"does not record"',                counts: { meanings: 3, holds: 2, shifts: 1 } },
});

// ── §3 · Where people disagree — the meanings of "surveillance" by basis. by = per-document
// weight; 'everyone' is their sum (derived in select.readAs, never stored). ─────────────────
export const MEANINGS = Object.freeze({
  surveillance: Object.freeze([
    { label: 'a camera that records',              by: { budget: 2, court: 2, press: 10 } },
    { label: 'a line item in a contract',          by: { budget: 9, court: 1, press: 2  } },
    { label: 'a partnership with a business group', by: { budget: 3,          press: 7  } },
    { label: 'a legal exposure',                   by: {          court: 3, press: 5  } },
    { label: 'a sensing capability',               by: { budget: 5,          press: 1  } },
    { label: 'a thing done to people',             by: {          court: 4          } },
  ]),
});

// The document a basis names, for the "Read it as: [everyone ▾]" dropdown labels. Only the
// documents that actually use the word appear (basesOf derives the set from MEANINGS).
export const BASIS_LABEL = Object.freeze({
  everyone: 'everyone',
  budget: 'the budget hearing',
  court: 'the court filing',
  press: 'the press release',
});
export const BASIS_ORDER = ['budget', 'court', 'press'];

// ── §4 · When people changed their minds — a REC scan of "surveillance", one sentence of
// English per mark. `steady` spans hold; `break` marks are where the meaning stopped fitting.
export const SHIFTS = Object.freeze({
  surveillance: Object.freeze({
    word: 'surveillance',
    lede: 'Two moments where the meaning shifted, not just the details.',
    marks: Object.freeze([
      { kind: 'steady', when: 'Mar 2024 – Jan 2025', text: 'Everyone treats it as a crime-fighting tool. Nobody argues.' },
      { kind: 'break',  when: 'Feb 2025', note: 'something broke',
        text: 'A device that records nothing, run by nobody in uniform, is still being called this. The old meaning stops fitting. Afterwards, people start saying “sensing” instead.',
        source: 'budget' },
      { kind: 'break',  when: 'Nov 2025', note: 'something broke again',
        text: '“Sensing” has nowhere to put the question of who paid for it. Afterwards, the conversation is about procurement.',
        source: 'vendor' },
      { kind: 'steady', when: 'Dec 2025 – now', text: 'Steady. No further shifts.' },
    ]),
  }),
});

// ── §5 · Center everything on this — a change of basis, not of data. Every ordered pair
// carries the role each end plays as read FROM the other, so the picture re-describes without
// an edge moving. select.centerOn is the fold. ─────────────────────────────────────────────
export const GRAPH = Object.freeze({
  nodes: Object.freeze({
    fusus: 'Fusus',
    partnership: 'Downtown Partnership',
    budget: 'the budget line',
    chief: 'the police chief',
  }),
  order: ['fusus', 'partnership', 'budget', 'chief'],
  roles: Object.freeze({
    'fusus|partnership': "who it's sold with",
    'fusus|budget': 'how it gets paid for',
    'fusus|chief': 'who runs it',
    'partnership|fusus': "the platform they're tied to",
    'partnership|budget': 'who the spending flows to',
    'partnership|chief': 'who they appear beside',
    'budget|fusus': 'what the money buys',
    'budget|partnership': 'who the money reaches',
    'budget|chief': 'who signs for it',
    'chief|fusus': 'the system in their hands',
    'chief|partnership': 'who they vouch for',
    'chief|budget': 'what they defend',
  }),
});

// ── §6 · The map. Three columns: ambient (around it, never connected — the desert cell), the
// things actually named, and the patterns. The grey box's words are the product declining,
// politely, to summarize the ambient. ──────────────────────────────────────────────────────
export const MAP = Object.freeze({
  around: ['overtime', 'liability', 'tourism', 'street lighting', 'trash pickup'],
  things: ['surveillance', 'camera', 'Fusus', 'Downtown Partnership', 'Councilmember Reyes'],
  patterns: ['procurement', 'public–private deals', 'vendor consolidation'],
  desert: 'These sit around the topic and never touch it. We’re not going to guess why. That part’s yours.',
  span: { from: '2024', to: '2026', now: 'Jul 26' },
  shiftMarks: ['Feb 2025', 'Jul 2025', 'Nov 2025', 'Dec 2025'],
});

// ── §7 · Study guide. The order is forced and the order is the pedagogy: a section can never
// be built before what it depends on (§5 needs §3). The groups are the three movements. ─────
export const STUDY_GUIDE = Object.freeze({
  title: 'How a city bought a surveillance network',
  built: 'built from your 4 sources',
  groups: Object.freeze([
    { title: 'START HERE — what you’re looking at', sections: [
      'What’s in these documents',
      'Words that keep coming back',
      'The seven things that actually get named',
    ] },
    { title: 'HOW IT FITS TOGETHER', sections: [
      'The line between “public” and “private” — and who’s on each side',
      'Who is working with whom',
      'The whole arrangement, in one picture',
    ] },
    { title: 'WHAT IT MEANS — AND WHERE IT BREAKS', sections: [
      'What the budget says “surveillance” means',
      'What the court filing says it means',
      'The question neither of them can answer',
      { text: 'Feb 2025: people change their minds', star: true },
      { text: 'Nov 2025: they change them again', star: true },
      'What none of these documents can tell you',
    ] },
  ]),
});

// ── §8 · Blind spots — things the sources name but never explain. Gaps in what you have, not
// gaps in what exists. This is the typed void (NUL) made a card: a system without a typed void
// has nothing to put here. ─────────────────────────────────────────────────────────────────
export const BLIND_SPOTS = Object.freeze([
  { name: '"the vendor"',       note: 'Mentioned 6 times. Never named. Never described.' },
  { name: 'District 7',         note: 'Every other district is consulted. This one appears once, in a list.' },
  { name: 'the 2019 agreement', note: 'Three documents refer back to it. None of them contain it.' },
]);
