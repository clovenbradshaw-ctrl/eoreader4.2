// EO: SIG·INS(Void → Entity,Field, Making,Tending) — the worked reading (fixture-as-content)
// scene.js — one hour and fifty-two minutes of a community meeting, read against a corpus.
//
// This is not demo chrome bolted onto a live engine; it is a hand-authored DISTRIBUTION —
// exactly the shape an honest ingest organ should emit. Every uncertain word carries its
// candidates, each with the acoustic prior the microphone justified and the per-source
// corpus counts it appears in. collapse.js turns that into the word on the page, at read
// time, and re-runs the collapse whenever a source is switched. The audio never moves.
//
// The tuning of the headline word (§ "What the machine heard"):
//   With every source on, "drones/drums/drives" collapses to .71 / .19 / .10.
//   Turn the MNPD pilot policy off and the corpus mass holding "drones" up (69 of its 84
//   appearances) drops out; "drums" — the word the audio alone actually preferred — wins
//   at .43. Read against nothing ("itself only") the microphone speaks for itself: "drums"
//   at ~.59, and "drones" falls to ~.10. Every disagreement is a word the corpus chose.
//
// Cursor granularity is the segment — "they scroll together and the cursor is one line."

// ── The sources the reading is run against. `spans` is the count the panel shows; the
// per-word `sup` maps below reference these ids. "itself only" is the empty set. ──────────
export const SOURCES = [
  { id: 'MNPD',   label: 'MNPD DFR pilot policy',        spans: 41 },
  { id: 'code',   label: 'Metro Code § 13.08.080',        spans: 12 },
  { id: 'Skydio', label: 'Skydio master agreement',       spans: 63 },
  { id: 'minutes',label: 'District 7 council minutes',     spans: 28 },
  { id: 'Axon',   label: 'Axon Fusus integration memo',    spans: 37 },
];

export const DEFAULT_ENABLED = SOURCES.map((s) => s.id);

// ── The headline uncertain word. Acoustic priors favour "drums"; the corpus favours
// "drones" (84 appearances, 69 of them in the MNPD policy). Tuned so all-on = .71/.19/.10
// and MNPD-off = drums .43. See collapse.js for the arithmetic. ────────────────────────────
const DRONES = {
  text: 'drones',
  cand: [
    { w: 'drones', ac: 0.3227, sup: { MNPD: 69, Skydio: 8, Axon: 4, minutes: 3 } }, // 84 total
    { w: 'drums',  ac: 1.9,    sup: {} },
    { w: 'drives', ac: 1.0,    sup: {} },
  ],
};

// A quieter uncertain word — the corpus barely touches it, so it holds its acoustic
// reading no matter which sources are on. It exists to show that not every mark flips.
const NEIGHBOR = {
  text: 'neighbor',
  cand: [
    { w: 'neighbor',  ac: 2.4, sup: { minutes: 2 } },
    { w: 'neighbors', ac: 1.0, sup: {} },
    { w: 'labor',     ac: 0.5, sup: {} },
  ],
};

// The word that seeds an absence. "form" is what the search later goes looking for; the
// code book mentions it a little, so a source flip nudges but does not overturn it.
const FORM = {
  text: 'form',
  cand: [
    { w: 'form',  ac: 1.7, sup: { code: 6, MNPD: 2 } },
    { w: 'forum', ac: 1.1, sup: { minutes: 1 } },
    { w: 'norm',  ac: 0.4, sup: {} },
  ],
};

// A right-page note is a list of blocks. Kinds:
//   say   — plain English: what the reading is doing (never a machine word)
//   card  — a boxed observation
//   edge  — a graph edge stated in words
//   turn  — a pointer to why this line matters later
const say  = (text) => ({ kind: 'say', text });
const card = (text) => ({ kind: 'card', text });
const edge = (text) => ({ kind: 'edge', text });
const turn = (text) => ({ kind: 'turn', text });

export const SCENE = {
  title: 'Community meeting, Feb 3',
  clock: { at: '41:20', total: '1:52:04' },
  segments: [
    {
      t: '40:58', speaker: 'Staff',
      tokens: ['The', 'pilot', 'will', 'expand', 'coverage', 'next', 'quarter.'],
      surprise: 0.08,
      note: [say('staff is describing a plan already decided')],
      nodes: [{ id: 'staff', label: 'staff', kind: 'plain' }],
    },
    {
      t: '41:14', speaker: 'Resident', newVoice: true,
      tokens: ['We', 'heard', 'about', 'the', DRONES, 'from', 'a', NEIGHBOR, ','],
      surprise: 0.34,
      note: [
        say('a person is speaking who is not staff and has not spoken before'),
        card('new voice · not yet named'),
        say('a thing was learned, and the learning did not come from the place it should have come from'),
      ],
      nodes: [
        { id: 'resident', label: 'the resident', kind: 'voice' },
        { id: 'neighbor', label: 'neighbor', kind: 'plain' },
        { id: 'drones', label: 'the drones', kind: 'subject' },
      ],
      edges: [
        { from: 'neighbor', to: 'resident', label: 'told' },
        { from: 'resident', to: 'drones', label: 'heard about' },
      ],
    },
    {
      t: '41:20', speaker: 'Resident',
      tokens: ['not', 'from', 'the', 'city.', 'That', 'is', 'the', 'part', 'that', 'bothers', 'me.', 'Nobody', 'asked', 'us.'],
      surprise: 0.97,
      note: [
        say('a gap is being named out loud by the person it happened to'),
        edge('neighbor ──told──▶ resident'),
        edge('city ──did not tell──▶ ×'),
        say('the city bound to MNPD only because MNPD is in the room'),
      ],
      nodes: [{ id: 'city', label: 'the city', kind: 'named' }],
      edges: [
        { from: 'resident', to: 'city', label: 'did not hear from' },
        { from: 'city', to: 'MNPD', label: 'binds to', requires: ['MNPD'], external: true },
      ],
    },
    {
      t: '42:11', speaker: 'Resident',
      tokens: ['Is', 'there', 'a', FORM, '?', 'Is', 'there', 'somewhere', 'you', 'say', 'yes', 'or', 'no', 'to', 'this?'],
      surprise: 0.41,
      note: [
        say('a referent is being created because a person asked for it'),
        card('a form · nothing in any source answers this'),
        turn('this line is why the search later goes looking for the form'),
      ],
      nodes: [{ id: 'form', label: 'a form', kind: 'absence' }],
      edges: [{ from: 'resident', to: 'form', label: 'asks for' }],
    },
    {
      t: '42:40', speaker: 'Staff',
      tokens: ['We', 'can', 'follow', 'up', 'on', 'that', 'offline.'],
      surprise: 0.19,
      note: [
        say('the question is acknowledged and moved out of the room'),
        say('the form is still unanswered — the node stays open'),
      ],
      edges: [{ from: 'staff', to: 'form', label: 'defers', dashed: true }],
    },
  ],

  // ── The attention field. `sources` are the corpus documents that MAKE this a figure;
  // with none of them enabled the figure goes cold. `mentions` are the segment indices it
  // is touched at, and attention decays as the reading moves off it. ──────────────────────
  figures: [
    { id: 'resident', label: 'the resident', note: 'hot, and new',            sources: [],           mentions: [1, 2, 3] },
    { id: 'city',     label: 'the city',     note: 'named, and blamed',        sources: ['minutes'],  mentions: [2] },
    { id: 'drones',   label: 'the drones',   note: 'the subject',              sources: ['MNPD', 'Skydio'], mentions: [1] },
    { id: 'neighbor', label: 'the neighbor', note: 'the wrong channel',        sources: [],           mentions: [1] },
    { id: 'form',     label: 'the form',     note: 'not yet, but rising',      sources: [],           mentions: [3, 4] },
  ],
};
