import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TERRAINS, TERRAIN_NAMES, identityKeyOf, sameArticle,
  SPINE, HELIX_POSITION, sectionFor, sectionsOf, contractOf,
  EDGE_TYPES, admissible, cardinalityCheck, diagnoseFailure, isProjectedEdge, emittableFrom,
  NUL_STATES, absenceProfile, headlineAbsence, absenceIsSubject,
  deriveName, nameArticle, needsGeneration,
  renderArticle, ledeAt,
  proposeMigration, applyMigration, migrationPathsFrom,
  articleView, renderArticleHTML, promoteToHero, WIKI_PANEL_CSS,
} from '../src/wiki/index.js';

// Terrain-typed article templates (docs/terrain-typed-templates.md). An article is typed
// by its Site face position — one invariant nine-operator spine, nine terrain profiles —
// and it is a read-time projection over an append-only event log, never a stored struct.

// ── the invariant spine (§2) ────────────────────────────────────────────────────────
test('the spine is the nine operators in helix order, lede (DEF) at position 7', () => {
  assert.equal(SPINE.length, 9);
  assert.deepEqual(SPINE.map((s) => s.op), ['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC']);
  assert.equal(HELIX_POSITION.DEF, 7);                 // rendered first, resolved last
  assert.equal(new Set(SPINE.map((s) => s.op)).size, 9);
  for (const op of SPINE.map((s) => s.op)) assert.ok(contractOf(op), `contract for ${op}`);
});

test('every terrain names all nine spine operators (the spine is invariant)', () => {
  assert.equal(TERRAIN_NAMES.length, 9);
  for (const t of TERRAIN_NAMES) {
    const ops = new Set(TERRAINS[t].sections.map((s) => s.op));
    for (const op of ['NUL', 'SIG', 'INS', 'SEG', 'CON', 'SYN', 'DEF', 'EVA', 'REC'])
      assert.ok(ops.has(op), `${t} missing ${op}`);
  }
});

test('sectionFor resolves per-terrain headings, including doubled/tripled CON sections', () => {
  const [lede] = sectionFor('DEF', 'Void');
  assert.equal(lede.heading, 'Lede');
  // Atmosphere has two CON sections; Lens has three — sectionFor returns all of them
  assert.deepEqual(sectionFor('CON', 'Atmosphere').map((s) => s.heading), ['What reads as obvious', 'What reads as strange']);
  assert.equal(sectionFor('CON', 'Lens').length, 3);
  // Kind: SEG (criteria) renders BEFORE INS (instances) — the mandatory inversion
  const kindOrder = sectionsOf('Kind').map((s) => s.op);
  assert.ok(kindOrder.indexOf('SEG') < kindOrder.indexOf('INS'), 'Kind: criterion before members');
});

test('the Ground column promotes SIG to a section and marks SYN structurally sparse', () => {
  for (const g of ['Void', 'Field', 'Atmosphere']) {
    const sig = sectionFor('SIG', g)[0];
    assert.equal(sig.promoted, true, `${g} promotes SIG`);
    assert.ok(TERRAINS[g].sparse.includes('SYN'), `${g} SYN is the desert cell`);
  }
  // the Figure/Pattern columns keep SIG as the infobox, not a section
  assert.equal(sectionFor('SIG', 'Entity')[0].infobox, true);
});

// ── identity conditions (§4) ──────────────────────────────────────────────────────────
test('identityKey is the per-terrain merge rule (§4)', () => {
  // Void: same region + same interval → same article
  const v1 = { terrain: 'Void', log: [{ facets: { region: 'Beirut', interval: '1975–1990' } }] };
  const v2 = { terrain: 'Void', log: [{ facets: { region: 'beirut' } }, { facets: { interval: '1975–1990' } }] };
  assert.equal(identityKeyOf(v1), identityKeyOf(v2));
  assert.ok(sameArticle(v1, v2));
  // Kind: same members but DIFFERENT criteria → two Kinds
  const k1 = { terrain: 'Kind', log: [{ facets: { criterion: 'melts below 20C' } }] };
  const k2 = { terrain: 'Kind', log: [{ facets: { criterion: 'liquid at room temperature' } }] };
  assert.notEqual(identityKeyOf(k1), identityKeyOf(k2));
  // Link: symmetric endpoints order-independent; asymmetric ordered
  const sym = (a, b) => ({ terrain: 'Link', log: [{ facets: { endpoints: [a, b], relationType: 'co-signed' } }] });
  assert.equal(identityKeyOf(sym('A', 'B')), identityKeyOf(sym('B', 'A')));
  const asym = (a, b) => ({ terrain: 'Link', log: [{ facets: { endpoints: [a, b], relationType: 'reports-to', asymmetric: true } }] });
  assert.notEqual(identityKeyOf(asym('A', 'B')), identityKeyOf(asym('B', 'A')));
  // different terrains never collide even on like coordinates
  const atmos = { terrain: 'Atmosphere', log: [{ facets: { region: 'Beirut', community: 'x' } }] };
  assert.notEqual(identityKeyOf(v1), identityKeyOf(atmos));
});

// ── the edge grammar (§6) ─────────────────────────────────────────────────────────────
test('admissible gates edges by domain/range terrain', () => {
  assert.ok(admissible('instance_of', 'Entity', 'Kind'));
  assert.ok(!admissible('instance_of', 'Field', 'Kind'));        // off-domain
  assert.ok(admissible('situated_in', 'Network', 'Field'));
  assert.ok(admissible('obtains_over', 'Void', 'Field'));
  assert.ok(!admissible('obtains_over', 'Entity', 'Field'));      // only Void/Atmosphere emit
  assert.ok(admissible('composes', 'Kind', 'Kind'));
  assert.ok(!admissible('composes', 'Kind', 'Network'));          // composes is same-terrain
  assert.ok(!admissible('nonsuch', 'Void', 'Field'));
});

test('cardinalityCheck: required edges, counted in the right store', () => {
  // Kind needs ≥2 inbound instance_of
  const under = cardinalityCheck({ terrain: 'Kind', edges: [{ type: 'instance_of', dir: 'in', from: 'Entity:a' }] });
  assert.ok(under.violations.some((v) => v.kind === 'missing-required' && v.edge === 'instance_of'));
  const ok = cardinalityCheck({ terrain: 'Kind', edges: [
    { type: 'instance_of', dir: 'in', from: 'Entity:a' }, { type: 'instance_of', dir: 'in', from: 'Entity:b' }] });
  assert.ok(ok.ok);
});

test('cardinalityCheck: a stored Meant-Graph edge is the integrity violation', () => {
  assert.ok(isProjectedEdge('reads') && isProjectedEdge('held_by') && isProjectedEdge('supersedes'));
  assert.ok(!isProjectedEdge('instance_of'));
  // M edges in the STORED pool → stored-significance
  const stored = cardinalityCheck({ terrain: 'Lens', edges: [
    { type: 'reads', dir: 'out', to: 'Entity:x' }, { type: 'held_by', dir: 'out', to: 'Voice' }] });
  assert.equal(stored.violations.filter((v) => v.kind === 'stored-significance').length, 2);
  // the SAME M edges in the PROJECTED pool satisfy the requirement and raise nothing
  const projected = cardinalityCheck({ terrain: 'Lens', edges: [], projected: [
    { type: 'reads', dir: 'out', to: 'Entity:x' }, { type: 'held_by', dir: 'out', to: 'Voice' }] });
  assert.ok(projected.ok, JSON.stringify(projected.violations));
});

test('diagnoseFailure flags an Entity whose only inbound edges are characterized_by', () => {
  const d = diagnoseFailure({ terrain: 'Entity', edges: [{ type: 'characterized_by', dir: 'in', from: 'Lens:a' }] });
  assert.ok(d.findings.some((f) => f.kind === 'entity-is-lens'));
  // emittableFrom: a Void may emit obtains_over
  assert.ok(emittableFrom('Void').includes('obtains_over'));
});

// ── typed absence (§8) — the headline content ────────────────────────────────────────
test('every terrain has a typed, non-blank absence profile', () => {
  const states = new Set(Object.values(NUL_STATES));
  for (const t of TERRAIN_NAMES) {
    const prof = absenceProfile(t);
    assert.ok(prof && prof.length, `${t} absence profile`);
    for (const a of prof) {
      assert.ok(a.headline && a.what, `${t}/${a.id} has headline + gloss`);
      assert.ok(a.states.length && a.states.every((s) => states.has(s)), `${t}/${a.id} valid states`);
    }
  }
});

test('the Ground column leads with an absence that IS its subject', () => {
  for (const g of ['Void', 'Field', 'Atmosphere']) {
    assert.ok(absenceIsSubject(g), `${g} absence is the subject`);
    assert.ok(headlineAbsence(g).subject);
  }
  assert.equal(headlineAbsence('Void').headline, 'What this region does not contain');
  assert.equal(headlineAbsence('Atmosphere').headline, 'What this place makes expensive to say');
  // the Paradigm register is a predictive absence
  assert.ok(headlineAbsence('Paradigm').predictive);
});

// ── self-generating names ─────────────────────────────────────────────────────────────
test('deriveName: entities name themselves; non-entities are composed from facets', () => {
  assert.deepEqual(deriveName({ terrain: 'Entity', log: [{ facets: { referent: 'Ada Lovelace' } }] }),
    { name: 'Ada Lovelace', source: 'referent', complete: true });
  assert.equal(deriveName({ terrain: 'Lens', log: [{ facets: { holder: 'Nabokov', target: 'Kafka' } }] }).name, "Nabokov's reading of Kafka");
  assert.equal(deriveName({ terrain: 'Void', log: [{ facets: { region: 'Beirut', interval: '1975–1990' } }] }).name, 'Absence in Beirut (1975–1990)');
  assert.equal(deriveName({ terrain: 'Field', log: [{ facets: { region: 'the trading floor' } }] }).name, 'The unwritten rules of the trading floor');
});

test('the model is asked for a name only when the cheap derivation is incomplete', async () => {
  // complete derivation → generate is never called
  let calls = 0;
  const generate = async () => { calls++; return 'model name'; };
  const done = await nameArticle({ terrain: 'Entity', log: [{ facets: { referent: 'Ada' } }] }, { generate });
  assert.deepEqual(done, { name: 'Ada', source: 'referent' });
  assert.equal(calls, 0, 'no model call when derivation is complete');
  // an entity with NO referent is incomplete → the gate opens
  const thin = { terrain: 'Entity', log: [] };
  assert.ok(needsGeneration(thin));
  const gen = await nameArticle(thin, { generate });
  assert.deepEqual(gen, { name: 'model name', source: 'generated' });
  assert.equal(calls, 1);
  // no generator → falls back to the derived placeholder, never throws
  const fallback = await nameArticle(thin, {});
  assert.equal(fallback.source, 'placeholder');
});

// ── the read-time projection (§9) ─────────────────────────────────────────────────────
const voidLog = [
  { seq: 0, t: 1, op: 'SIG', kind: 'register', at: '2026-01', facets: { region: 'Beirut', interval: '1975–1990' } },
  { seq: 1, t: 2, op: 'DEF', kind: 'define', id: 'd1', text: 'The undocumented interval.', by: 'archivist' },
  { seq: 2, t: 3, op: 'NUL', kind: 'absent', absence: 'not-picked-out', state: 'unknown', note: 'which blocks stood' },
  { seq: 3, t: 4, op: 'REC', kind: 'reframe', text: 'Named "Green Line" — did not hold', held: false },
  { seq: 4, t: 5, op: 'DEF', kind: 'define', id: 'd2', text: 'The undocumented stretch, 1975–1990.', by: 'archivist', supersedes: 'd1' },
];

test('renderArticle is a fresh projection: σ picks the current lede, priors become reframings', () => {
  const art = renderArticle(voidLog, 'Void');
  assert.equal(art.terrain, 'Void');
  assert.equal(art.lede.text, 'The undocumented stretch, 1975–1990.');    // d2 supersedes d1
  const rec = art.sections.find((s) => s.op === 'REC');
  assert.ok(rec.entries.some((e) => /Prior lede: The undocumented interval/.test(e.text)));   // d1 retired here
  // a fresh object each call — never cached
  assert.notEqual(renderArticle(voidLog, 'Void'), art);
  assert.equal(art.projectedAt, null);
  // absence typed, not one blank
  assert.equal(art.absence.states.unknown, 1);
  assert.ok(art.absence.headline);
  assert.equal(renderArticle([], 'Nonsuch'), null);
});

test('γ: an earlier asOf yields the article as it stood then', () => {
  assert.equal(ledeAt(voidLog, 'Void', 3).text, 'The undocumented interval.');   // before d2
  assert.equal(ledeAt(voidLog, 'Void').text, 'The undocumented stretch, 1975–1990.');
});

test('the desert cell renders as expectedly-empty, not a TODO', () => {
  const art = renderArticle(voidLog, 'Void');
  const syn = art.sections.find((s) => s.op === 'SYN');
  assert.ok(syn.empty && syn.expectedEmpty && syn.sparse === 'desert');
});

// ── terrain migration (§7) ────────────────────────────────────────────────────────────
test('proposeMigration is read-only; repeated escapes are the Emanon finding', () => {
  const log = [
    { op: 'REC', kind: 'reframe', held: false }, { op: 'REC', kind: 'reframe', held: false },
    { op: 'REC', kind: 'reframe', held: false },
  ];
  const p = proposeMigration({ terrain: 'Void', log });
  assert.equal(p.failedMigrations, 3);
  assert.equal(p.emanonFinding, true);                 // three failed migrations is a finding
  // a naming that HELD proposes Void → Entity
  const named = proposeMigration({ terrain: 'Void', log: [{ op: 'REC', kind: 'name', held: true }] });
  assert.ok(named.proposals.some((x) => x.to === 'Entity'));
  assert.deepEqual(migrationPathsFrom('Lens').sort(), ['Atmosphere', 'Paradigm']);
});

test('applyMigration appends a REC + a supersedes edge and nothing else', () => {
  const art = { terrain: 'Void', log: [{ facets: { region: 'Beirut', interval: '1975–1990' } }] };
  const out = applyMigration(art, 'Entity', 'named and bounded');
  assert.equal(out.events.length, 2);
  const [rec, edge] = out.events;
  assert.equal(rec.op, 'REC'); assert.equal(rec.kind, 'migrate'); assert.equal(rec.to, 'Entity');
  assert.equal(edge.edge, 'supersedes'); assert.equal(edge.to, identityKeyOf(art));   // points back to the old address
  assert.equal(applyMigration(art, 'Void'), null);      // migration to the same terrain is not a write
  assert.equal(applyMigration(art, 'Nonsuch'), null);
});

// ── the narrow-panel + hero render ────────────────────────────────────────────────────
test('renderArticleHTML: panel leads with the lede, hero leads with the typed absence', () => {
  const art = renderArticle(voidLog, 'Void');
  const panel = renderArticleHTML(art);
  const hero = promoteToHero(art);
  assert.match(panel, /eo-wiki-panel/);
  assert.match(hero, /eo-wiki-hero/);
  // the hero foregrounds the absence headline; the panel does not lead with it
  assert.match(hero, /What this region does not contain/);
  assert.ok(hero.indexOf('eo-wiki-hero-absence') < hero.indexOf('eo-wiki-lede'), 'hero: absence before lede');
  // view-model carries the accent + hero absence
  const v = articleView(art, { hero: true });
  assert.equal(v.terrain, 'Void');
  assert.ok(v.heroAbsence && v.accent.hue);
  assert.ok(WIKI_PANEL_CSS.includes('.eo-wiki'));
});
