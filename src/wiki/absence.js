// EO: NUL·DEF(Void → Void,Field, Clearing,Dissecting) — the typed absence of each terrain
// Headline content: the TYPES OF ABSENCE for a given terrain. Every article carries a
// "Not established" section (NUL, §8), and the framework's whole point is that absence
// is not one blank — it is typed. This module makes the typing FIRST-CLASS: each terrain
// has its own characteristic absences, and for most terrains the absence is not a
// footnote but the most interesting thing the article can say.
//
// Two axes cross here:
//
//   The three NUL STATES (§8) — cross-cutting, every terrain:
//     never-set  nobody has looked; the field has no history.
//     cleared    it was recorded, then retracted or superseded; the log shows the ghost.
//     unknown    someone looked and could not establish it — a POSITIVE finding, work to
//                produce. (Structurally-sparse desert slots are a FOURTH thing and are
//                NOT filed under NUL — see terrains.js `sparse`.)
//
//   The terrain's CHARACTERISTIC absences — the shapes of not-established that this
//   terrain, and often only this terrain, can carry. For the Ground column the absence
//   IS the subject; for a Lens the missing warrant is itself a finding; for a Paradigm
//   the accumulating anomaly register is what gives the article predictive value.
//
// This is the content the user reads as a HEADLINE. `headlineAbsence(terrain)` returns
// the single most characteristic one, foregrounded by the renderer; `absenceProfile`
// returns the full typology.

// The three states, named once so callers do not stringly-type them.
export const NUL_STATES = Object.freeze({
  NEVER_SET: 'never-set',
  CLEARED: 'cleared',
  UNKNOWN: 'unknown',
});

// A typed absence. `id` stable; `headline` the short hero line; `what` the one-sentence
// gloss; `states` the NUL states it can arrive in; `subject: true` marks the absence
// that IS the article (the Ground column), so the renderer leads with it rather than
// burying it. `predictive: true` marks an accumulating register whose crossing a
// threshold fires REC (the Paradigm's anomaly register) — worth watching, not just
// recording.
const A = (id, headline, what, states, extra = {}) =>
  Object.freeze({ id, headline, what, states: Object.freeze(states), subject: false, predictive: false, ...extra });

const S = NUL_STATES;

const PROFILES = Object.freeze({
  // Void — absence is the whole subject; NUL is the largest section.
  Void: Object.freeze([
    A('not-picked-out', 'What this region does not contain',
      'The defining absence: everything the Void fails to pick out over its interval. This is the article, not a gap in it.',
      [S.UNKNOWN, S.NEVER_SET], { subject: true }),
    A('resisted-count', 'What measurement could not fix',
      'It got bigger when someone tried to count it — the Ground diagnostic. Record what happened when they tried.',
      [S.UNKNOWN]),
    A('failed-namings', 'Names that did not hold',
      'Every attempt to convert this Void into a bounded Entity, logged with its outcome. Most leak. Three failures is a finding, not a backlog.',
      [S.CLEARED]),
  ]),

  // Entity — the gravity well; absence is a gap in a known thing.
  Entity: Object.freeze([
    A('unbounded', "Where the thing's edges are not drawn",
      'Boundaries and lifespan never established — the start, the end, or the extent left open.',
      [S.NEVER_SET, S.UNKNOWN]),
    A('unattested', 'Claims with no span behind them',
      'Asserted, not attested: predicated of the entity by a Voice, with no source span exercising the claim.',
      [S.UNKNOWN]),
    A('lost', 'What was recorded and then cleared',
      'A property once in the record, since retracted or superseded. The log keeps the ghost.',
      [S.CLEARED]),
  ]),

  // Kind — absence is undecidable membership.
  Kind: Object.freeze([
    A('undecidable-members', "Cases the criterion cannot rule on",
      'Candidates the membership rule neither admits nor excludes — the boundary the Kind has not yet had to decide.',
      [S.UNKNOWN]),
    A('unattested-criterion', 'A rule asserted by a single Voice',
      'The membership criterion traces to one Voice with no independent instance — a Kind asserted, not attested. Say so in the lede.',
      [S.UNKNOWN, S.NEVER_SET]),
    A('untested', 'The criterion no instance has yet tested',
      'A well-formed rule that nothing has been run against — its edge cases are never-set until an instance forces one.',
      [S.NEVER_SET]),
  ]),

  // Field — the unwritten rules ARE the field; absence is its substance.
  Field: Object.freeze([
    A('unwritten', 'The rules nobody has stated',
      'The relational conditions that constrain behaviour without anyone stating them. Unwritten is the Field’s substance, not a hole in it.',
      [S.UNKNOWN, S.NEVER_SET], { subject: true }),
    A('unnavigated', 'A substrate with nothing situated in it',
      'No `situated_in` edges: a relational field with nothing navigating it is a story about a field, not a field.',
      [S.NEVER_SET]),
    A('un-explicated', 'Rules never yet written down',
      'The implicit rules pending explicitation. When they are all written down the Field has migrated toward Network — the article keeps both addresses.',
      [S.UNKNOWN]),
  ]),

  // Link — absence is a tie that does not connect.
  Link: Object.freeze([
    A('orphaned', 'A tie whose endpoint was retracted',
      'An endpoint article was cleared; the Link is not deleted, it is orphaned, and the orphaning is logged here as a cleared state.',
      [S.CLEARED]),
    A('unexercised', 'A connection asserted but never used',
      'Claimed to exist, but with no occasion on which it was exercised. The whole difference between a documented relationship and a rumoured one.',
      [S.UNKNOWN]),
    A('mutual-mention', 'Two mentions with nothing crossing',
      'The Link exists only in the space between two Entities that each mention the other. Mutual mention is not a connection.',
      [S.NEVER_SET]),
  ]),

  // Network — absence is an unrecognized or severed whole.
  Network: Object.freeze([
    A('unrecognized-whole', "A system its members would not recognize",
      "The analyst's aggregation of links nobody in it treats as a whole — no evidence the members experience themselves as one system.",
      [S.UNKNOWN, S.NEVER_SET]),
    A('severed', 'Links that were cut',
      'Member links since removed. Change the topology and you have a new Network with a supersession edge to the old one — the cut is logged, never erased.',
      [S.CLEARED]),
    A('unmapped-topology', 'A shape not yet determined',
      'Who is central, who is a bridge, where it would fracture — the topology no read has yet fixed.',
      [S.UNKNOWN]),
  ]),

  // Atmosphere — the strongest evidence is an absence: what the place makes expensive.
  Atmosphere: Object.freeze([
    A('reads-as-strange', 'What this place makes expensive to say',
      'The readings the atmosphere makes costly — the ones people avoid without being told to. The strongest evidence the atmosphere is doing work.',
      [S.UNKNOWN], { subject: true }),
    A('single-lens', 'One reading generalized into weather',
      'The atmosphere rests on one holder’s reading. It needs at least two Lenses it makes obvious, from different holders; one reading by one person is a Lens.',
      [S.NEVER_SET]),
    A('boundary-unknown', 'Where it stops obtaining',
      'The edge of the region the atmosphere holds over — an interpretive community shades into another and the article has not said where.',
      [S.UNKNOWN]),
  ]),

  // Lens — the missing warrant is itself the finding.
  Lens: Object.freeze([
    A('no-warrant', 'A reading resting on no span',
      'The Warrant section reads "none offered." A Lens with no warrant is still a Lens — the empty warrant is itself a finding, not a blank.',
      [S.UNKNOWN, S.NEVER_SET]),
    A('unheld', 'A reading with no holder named',
      'An unattributed reading is not a Lens; it is a claim about the world that has laundered its provenance. Structurally impossible here, not merely discouraged.',
      [S.NEVER_SET]),
    A('collapsed', 'The reading presented as its target',
      'The reading and the thing read have collapsed into one article — the DEF-capture signature at article scale.',
      [S.CLEARED, S.UNKNOWN]),
  ]),

  // Paradigm — the anomaly register is an accumulating absence with predictive value.
  Paradigm: Object.freeze([
    A('anomaly-register', 'Cases the paradigm did not fit',
      'The accumulating EVA failures: cases the paradigm was applied to and did not fit. Nothing happens for a long time; then the accumulation crosses a threshold local adjustment cannot absorb and REC fires. This is how you see a shift coming.',
      [S.UNKNOWN], { subject: true, predictive: true }),
    A('single-instance', 'One instance promoted to a frame',
      'A Paradigm with one instance is a Lens someone has promoted, and the promotion is usually rhetorical.',
      [S.NEVER_SET]),
    A('pre-shift', 'Anomalies not yet absorbed',
      'The open cases the paradigm has neither resolved nor been broken by — the register still building toward a threshold.',
      [S.UNKNOWN]),
  ]),
});

export const absenceProfile = (terrain) => PROFILES[terrain] || null;

// The single most characteristic absence for a terrain — the one the renderer leads
// with as hero content. Prefers the `subject: true` absence (Ground column and the
// Paradigm register, where absence carries the article); otherwise the first typed one.
export const headlineAbsence = (terrain) => {
  const prof = PROFILES[terrain];
  if (!prof || !prof.length) return null;
  return prof.find((a) => a.subject) || prof[0];
};

// Is this terrain one whose ABSENCE is the subject — the Ground column, where the "Not
// established" section is the largest and the point, not a maintenance list? (The
// Paradigm register also qualifies: its accumulating misfits are what it is for.)
export const absenceIsSubject = (terrain) => !!headlineAbsence(terrain)?.subject;

// ── self-check ────────────────────────────────────────────────────────────────────
// Every terrain has a non-empty absence profile (the "Not established" section is never
// blank), every typed absence names at least one NUL state, and every Ground-column
// terrain leads with an absence that IS its subject.
{
  const names = Object.keys(PROFILES);
  if (names.length !== 9) throw new Error('wiki/absence: expected nine terrain absence profiles');
  const valid = new Set(Object.values(NUL_STATES));
  for (const [t, prof] of Object.entries(PROFILES)) {
    if (!prof.length) throw new Error(`wiki/absence: ${t} has no typed absences`);
    for (const a of prof)
      if (!a.states.length || a.states.some((s) => !valid.has(s)))
        throw new Error(`wiki/absence: ${t}/${a.id} has an invalid NUL state`);
  }
  for (const g of ['Void', 'Field', 'Atmosphere'])
    if (!absenceIsSubject(g)) throw new Error(`wiki/absence: Ground-column ${g} must lead with a subject-absence`);
}
