// EO: DEF·SEG(Kind → Kind,Lens, Dissecting,Unraveling) — terrain profiles for typed articles
// The nine terrain profiles. An article is typed by its Site face position, not by
// what its subject is "made of" (docs/terrain-typed-templates.md §1). Wikipedia has
// one template — Entity — and shapes a Field, an Atmosphere, or a Lens like a denser
// thing. EO already names nine terrains (core/cube.js Site face), each with its own
// identity conditions, its own evidentiary shape, and its own way of going wrong.
//
// This module is the FIVE KNOBS (§3) made data: identity condition, section profile,
// render order, admissible/required edges, and characteristic failure. Everything
// else — the invariant nine-operator spine — is shared and lives in spine.js.
//
// `identityKey(log)` is the merge rule (§4). It is the ONLY place terrain-specific
// dedupe logic lives: two mentions are the same article iff their keys match. The
// Ground column keys on a region + an interval; the Figure column on a referent; the
// Pattern column on a criterion or a commitment. That difference propagates into
// merge behaviour, search, and what a duplicate even means.
//
// The nine terrain names, their Domain, and their Object (grain) are NOT redeclared
// here — they are read back from the cube (core/cube.js) so a drift in either fails
// the self-check at load. This module only adds the article-layer profile.

import { TERRAINS as CUBE_TERRAINS, terrainInfo } from '../core/index.js';

// ── article / event-log shape (the input identityKey and project.js consume) ──────
// An article is { terrain, log }. `log` is an append-only array of events, each at
// least { seq, turn, op, kind, ... }. Identity-bearing events carry a `facets` object
// whose keys name the coordinates the terrain's identity condition reads:
//
//   region, interval        Ground column (Void / Field / Atmosphere)
//   referent                Figure/Existence (Entity)
//   endpoints[]             Figure/Structure (Link)     — a set, ordered if asymmetric
//   holder, target, occasion  Figure/Interpretation (Lens)
//   criterion               Pattern/Existence (Kind)
//   members[], topology     Pattern/Structure (Network)
//   community               Ground/Interpretation (Atmosphere, with region)
//   commitments[]           Pattern/Interpretation (Paradigm)
//   relationType            the relation a Field / Link is OF
//
// Facets are folded latest-wins across the log (a later register/def refines an
// earlier one). Nothing here reads prose; the facets are the structured handles.

const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
// A set-valued facet → a stable canonical string: deduped, sorted, '+'-joined. Order
// never changes identity for an unordered set (members, endpoints of a symmetric tie).
const normSet = (xs) => [...new Set((Array.isArray(xs) ? xs : [xs]).map(norm).filter(Boolean))].sort().join('+');
// An ordered pair/list keeps its order (an asymmetric Link: A→B is not B→A).
const normSeq = (xs) => (Array.isArray(xs) ? xs : [xs]).map(norm).filter(Boolean).join('>');

// Fold the identity facets latest-wins over a log (or accept a bare facets object, so
// identityKey can be unit-tested without wrapping every case in a full event log).
export const foldFacets = (logOrFacets) => {
  if (logOrFacets && !Array.isArray(logOrFacets) && typeof logOrFacets === 'object' && logOrFacets.facets == null) {
    // a bare { region, interval, ... } — treat as the already-folded facets
    if (!('log' in logOrFacets)) return { ...logOrFacets };
  }
  const log = Array.isArray(logOrFacets) ? logOrFacets
    : Array.isArray(logOrFacets?.log) ? logOrFacets.log : [];
  const out = {};
  for (const e of log) {
    if (e && e.facets && typeof e.facets === 'object') Object.assign(out, e.facets);
  }
  return out;
};

// The identity key builder: run the facet fold, then compose the terrain's coordinates.
// A key always carries its terrain prefix so two DIFFERENT terrains never collide even
// if their coordinates happen to normalise alike ("Void:paris|1968" ≠ "Atmosphere:…").
const keyer = (terrain, build) => (logOrFacets) => {
  const f = foldFacets(logOrFacets);
  return `${terrain}:${build(f)}`;
};

// ── the section descriptor ────────────────────────────────────────────────────────
// One entry per section, in RENDER order (lede first). `op` is the spine operator the
// section fills; `key` is stable (an operator may appear more than once — Atmosphere
// has two CON sections, Lens has three); `heading` is the terrain's own wording.
// Flags: promoted (Ground promotes SIG from infobox to a full section), distinctive
// (the section no other terrain has), constitutive (the article cannot exist without
// it), largest (expected to dominate), sparse (structurally empty — desert or absent,
// never a TODO), infobox (SIG when it stays the infobox rather than a section).
const S = (op, key, heading, flags = {}) => Object.freeze({ op, key, heading, ...flags });

// ── the nine profiles ─────────────────────────────────────────────────────────────

const PROFILES = {
  // 5.1 Void — Existence × Ground. Absence IS the subject; NUL is the largest section.
  Void: {
    identityKey: keyer('Void', (f) => `${norm(f.region)}|${norm(f.interval)}`),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SIG', 'measurement', 'Measurement behavior', { promoted: true }),
      S('SEG', 'obtains', 'Where it obtains'),
      S('CON', 'rests', 'What rests on it'),
      S('NUL', 'absence', 'Not established', { largest: true }),
      S('EVA', 'contested', 'Contested existence'),
      S('REC', 'escapes', 'Namings and escapes', { distinctive: true }),
      S('SYN', 'composition', 'Composition', { sparse: 'desert' }),
      S('INS', 'attest', 'Attestations', { sparse: 'absent' }),
    ],
    requiredEdges: [{ edge: 'obtains_over', dir: 'out', min: 1 }],
    characteristicFailure: 'someone names the Void, and the article quietly becomes an Entity article about the name',
  },

  // 5.2 Entity — Existence × Figure. The gravity well; the densest cell.
  Entity: {
    identityKey: keyer('Entity', (f) => norm(f.referent) || norm(f.label)),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('INS', 'attest', 'Attestations'),
      S('SEG', 'bounds', 'Boundaries and lifespan', { distinctive: true }),
      S('CON', 'relations', 'Relations'),
      S('SYN', 'partof', 'Part of'),
      S('EVA', 'disputed', 'Disputed'),
      S('REC', 'reframings', 'Reframings'),
      S('NUL', 'absence', 'Not established'),
      S('SIG', 'registration', 'Registration', { infobox: true }),
    ],
    requiredEdges: [],
    characteristicFailure: "an Entity whose only inbound edges are `characterized_by` — a Lens wearing an Entity's clothes",
  },

  // 5.3 Kind — Existence × Pattern. SEG before INS is mandatory: criterion, then members.
  Kind: {
    identityKey: keyer('Kind', (f) => norm(f.criterion)),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SEG', 'criteria', 'Membership criteria'),
      S('INS', 'instances', 'Instances'),
      S('CON', 'relations', 'Relations'),
      S('SYN', 'higher', 'Higher classifications'),
      S('EVA', 'contested', 'Contested membership'),
      S('REC', 'splits', 'Splits and lumps', { distinctive: true }),
      S('NUL', 'absence', 'Not established'),
      S('SIG', 'registration', 'Registration', { infobox: true }),
    ],
    requiredEdges: [{ edge: 'instance_of', dir: 'in', min: 2 }],
    characteristicFailure: 'every instance traces to a single Voice — a Kind asserted, not attested',
  },

  // 5.4 Field — Structure × Ground. Evidence is indirect (implicit rules, INS).
  Field: {
    identityKey: keyer('Field', (f) => `${norm(f.region)}|${norm(f.relationType)}`),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SIG', 'measurement', 'Measurement behavior', { promoted: true }),
      S('SEG', 'extent', 'Extent'),
      S('CON', 'navigates', 'Who navigates it'),
      S('INS', 'rules', 'Implicit rules'),
      S('EVA', 'contested', 'Contested'),
      S('REC', 'explicitations', 'Explicitations', { distinctive: true }),
      S('NUL', 'absence', 'Not established'),
      S('SYN', 'composition', 'Composition', { sparse: 'desert' }),
    ],
    requiredEdges: [{ edge: 'situated_in', dir: 'in', min: 2 }],
    characteristicFailure: 'a Field with no `situated_in` edges — a relational substrate with nothing navigating it',
  },

  // 5.5 Link — Structure × Figure. Endpoints are constitutive; the lede names both.
  Link: {
    identityKey: keyer('Link', (f) => {
      const eps = f.asymmetric ? normSeq(f.endpoints) : normSet(f.endpoints);
      return `${eps}|${norm(f.relationType)}`;
    }),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SEG', 'endpoints', 'Endpoints', { constitutive: true }),
      S('INS', 'attest', 'Attestations'),
      S('CON', 'adjacent', 'Adjacent links'),
      S('SYN', 'networks', 'Networks'),
      S('EVA', 'disputed', 'Disputed'),
      S('REC', 'reframings', 'Reframings'),
      S('NUL', 'absence', 'Not established'),
      S('SIG', 'registration', 'Registration', { infobox: true }),
    ],
    requiredEdges: [{ edge: 'endpoint_of', dir: 'in', min: 2 }],
    characteristicFailure: 'the Link exists only between two Entity articles that mention each other — mutual mention is not a connection',
  },

  // 5.6 Network — Structure × Pattern. Topology is the distinctive section.
  Network: {
    identityKey: keyer('Network', (f) => `${normSet(f.members)}|${norm(f.topology)}`),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SEG', 'topology', 'Topology', { distinctive: true }),
      S('INS', 'links', 'Member links'),
      S('CON', 'adjacent', 'Adjacent networks'),
      S('SYN', 'composes', 'Composes into'),
      S('EVA', 'contested', 'Contested topology'),
      S('REC', 'rewirings', 'Rewirings'),
      S('NUL', 'absence', 'Not established'),
      S('SIG', 'registration', 'Registration', { infobox: true }),
    ],
    requiredEdges: [{ edge: 'member_of', dir: 'in', min: 2 }],
    characteristicFailure: "the analyst's aggregation of links nobody in it would recognise as a system",
  },

  // 5.7 Atmosphere — Significance × Ground. Two CON sections; "reads as strange" is the
  // strongest evidence — the readings the place makes expensive.
  Atmosphere: {
    identityKey: keyer('Atmosphere', (f) => `${norm(f.region)}|${norm(f.community)}`),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SIG', 'measurement', 'Measurement behavior', { promoted: true }),
      S('CON', 'obvious', 'What reads as obvious'),
      S('CON', 'strange', 'What reads as strange', { distinctive: true }),
      S('SEG', 'obtains', 'Where it obtains'),
      S('INS', 'effects', 'Attested effects'),
      S('EVA', 'contested', 'Contested'),
      S('REC', 'weather', 'Weather changes'),
      S('NUL', 'absence', 'Not established'),
      S('SYN', 'composition', 'Composition', { sparse: 'desert' }),
    ],
    requiredEdges: [{ edge: 'obtains_over', dir: 'out', min: 1 }],
    characteristicFailure: 'one Lens generalised into weather — one reading held by one person is a Lens, not an Atmosphere',
  },

  // 5.8 Lens — Significance × Figure. Holder + target are constitutive; the lede names
  // the holder. Three CON sections. `reads` and `held_by` are exactly-one M edges.
  Lens: {
    identityKey: keyer('Lens', (f) => `${norm(f.holder)}|${norm(f.target)}|${norm(f.occasion)}`),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('CON', 'holder', 'Holder', { distinctive: true, constitutive: true }),
      S('CON', 'target', 'Target', { constitutive: true }),
      S('INS', 'reading', 'The reading'),
      S('SEG', 'warrant', 'Warrant'),
      S('CON', 'competing', 'Competing readings'),
      S('SYN', 'paradigm', 'Paradigm'),
      S('EVA', 'tested', 'Tested'),
      S('REC', 'revisions', 'Revisions'),
      S('NUL', 'absence', 'Not established'),
      S('SIG', 'registration', 'Registration', { infobox: true }),
    ],
    requiredEdges: [
      { edge: 'reads', dir: 'out', exact: 1 },
      { edge: 'held_by', dir: 'out', exact: 1 },
    ],
    characteristicFailure: 'the Lens is presented as its target — the reading and the thing read collapse into one article (the DEF-capture signature)',
  },

  // 5.9 Paradigm — Significance × Pattern. The anomaly register is the distinctive EVA.
  Paradigm: {
    identityKey: keyer('Paradigm', (f) => normSet(f.commitments)),
    sections: [
      S('DEF', 'lede', 'Lede'),
      S('SEG', 'commitments', 'Commitments'),
      S('INS', 'lenses', 'Lenses that instance it'),
      S('CON', 'rivals', 'Rival paradigms'),
      S('SYN', 'composes', 'What it composes'),
      S('EVA', 'anomalies', 'Anomaly register', { distinctive: true }),
      S('REC', 'shifts', 'Shifts'),
      S('NUL', 'absence', 'Not established'),
      S('SIG', 'registration', 'Registration', { infobox: true }),
    ],
    requiredEdges: [{ edge: 'instances', dir: 'in', min: 2 }],
    characteristicFailure: 'the Paradigm has one instance — a Lens someone has promoted, usually rhetorically',
  },
};

// ── assemble the frozen TERRAINS, cross-checked against the cube ───────────────────
// Each value: { name, domain, object, identityKey, sections, renderOrder, sparse,
// requiredEdges, characteristicFailure }. `domain`/`object` come from the cube so this
// module can never disagree with the Site face; `renderOrder` is the section keys in
// order; `sparse` lists the operators structurally empty at this terrain.

const build = () => {
  const out = {};
  for (const [name, p] of Object.entries(PROFILES)) {
    const info = terrainInfo(name);           // { domain, grain } from core/cube.js
    if (!info) throw new Error(`wiki/terrains: ${name} is not a cube terrain`);
    const sections = Object.freeze(p.sections.map((s) => Object.freeze({ ...s })));
    out[name] = Object.freeze({
      name,
      domain: info.domain,
      object: info.grain,
      identityKey: p.identityKey,
      sections,
      renderOrder: Object.freeze(sections.map((s) => s.key)),
      sparse: Object.freeze(sections.filter((s) => s.sparse).map((s) => s.op)),
      requiredEdges: Object.freeze(p.requiredEdges.map((e) => Object.freeze({ ...e }))),
      characteristicFailure: p.characteristicFailure,
    });
  }
  return Object.freeze(out);
};

export const TERRAINS = build();

// Every terrain name the cube knows, so callers can iterate the nine without importing
// the cube's domain-keyed shape.
export const TERRAIN_NAMES = Object.freeze(Object.keys(TERRAINS));

export const profileOf = (terrain) => TERRAINS[terrain] || null;

// The merge rule (§4), pulled out so call sites read `identityKeyOf(article)` rather
// than reaching into the profile. Returns null for an unknown terrain.
export const identityKeyOf = (article) => {
  const t = article?.terrain;
  const p = TERRAINS[t];
  return p ? p.identityKey(article) : null;
};

// Two articles are the same iff their terrain matches AND their key matches. Cross-
// terrain never merges here — that is what terrain migration (migrate.js) is for.
export const sameArticle = (a, b) => {
  if (!a || !b || a.terrain !== b.terrain) return false;
  const ka = identityKeyOf(a);
  return ka != null && ka === identityKeyOf(b);
};

// ── self-check ────────────────────────────────────────────────────────────────────
// The nine profiles are exactly the nine cube terrains, each names all nine spine
// operators at least once (the invariant spine is present even where a slot is sparse),
// and the Ground column (Void/Field/Atmosphere) marks SYN sparse (the desert cell).
{
  const cubeNames = new Set(Object.values(CUBE_TERRAINS).flatMap((row) => Object.values(row)));
  const profNames = new Set(TERRAIN_NAMES);
  if (cubeNames.size !== 9 || profNames.size !== 9 || [...cubeNames].some((n) => !profNames.has(n)))
    throw new Error('wiki/terrains: profiles are not exactly the nine cube terrains');
  const SPINE_OPS = ['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC'];
  for (const t of Object.values(TERRAINS)) {
    const ops = new Set(t.sections.map((s) => s.op));
    if (SPINE_OPS.some((op) => !ops.has(op)))
      throw new Error(`wiki/terrains: ${t.name} is missing a spine operator section`);
  }
  for (const g of ['Void', 'Field', 'Atmosphere'])
    if (!TERRAINS[g].sparse.includes('SYN'))
      throw new Error(`wiki/terrains: Ground-column ${g} must mark SYN structurally sparse (the desert cell)`);
}
