import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeEntitiesByReferent } from '../src/rooms/reader/entity-merge.js';
import { createReaderApp } from '../src/rooms/reader/app.js';

// CROSS-SOURCE ENTITY MERGE DISAMBIGUATES BY REFERENT, NOT BY A SHARED SURNAME.
//
// The topic explorer folds one entity's per-source rows into a single cross-source row so the panel
// is about entities, not entity-in-one-source ("the eight Iran rows" → one Iran). Done by bare label
// that fold conflates a SURNAME: "Armstrong" names Neil, Louis and Gerry at once, and a bare surname
// stands as its own node whenever a source names two people who share it (the within-document merge
// is correctly defeated — perceiver/parse/pipeline.js). Merging those standalone "Armstrong" nodes
// across unrelated sources produced the reported bug: a read about Neil Armstrong whose "Armstrong"
// entity settled on Louis Armstrong and carried his chapters. mergeEntitiesByReferent folds a
// contested bare surname into the full-name bearer of its OWN source, so the people never cross.

// A per-source row as entitiesInDoc emits it (rows arrive in introduction/admission order).
const row = (label, docId, sn, mentions, links = 0, entId = label.toLowerCase().replace(/\s+/g, '-')) =>
  ({ key: `${docId}#${entId}`, entId, docId, sn, label, mentions, links, sourceCount: 1, kind: null, level: null });

test('a contested surname never merges distinct people across sources', () => {
  // Three sources, each about a different Armstrong, each with a standalone bare "Armstrong" node.
  const rows = [
    row('Neil Armstrong', 'dNeil', 'S1', 1), row('Armstrong', 'dNeil', 'S1', 20, 5, 'armstrong'),
    row('Louis Armstrong', 'dLouis', 'S2', 1), row('Armstrong', 'dLouis', 'S2', 15, 4, 'armstrong'),
    row('Gerry Armstrong', 'dGerry', 'S3', 1), row('Armstrong', 'dGerry', 'S3', 8, 2, 'armstrong'),
  ];
  const merged = mergeEntitiesByReferent(rows);
  const labels = merged.map((m) => m.label).sort();
  assert.deepEqual(labels, ['Gerry Armstrong', 'Louis Armstrong', 'Neil Armstrong'], 'three distinct people, no bare "Armstrong"');
  // Each keeps its own source; nothing spans across the unrelated Armstrong sources.
  for (const m of merged) assert.equal(m.sourceCount, 1, `${m.label} does not span sources`);
  // The bare surname's mentions fold INTO the full-name referent of the same source.
  const neil = merged.find((m) => m.label === 'Neil Armstrong');
  assert.equal(neil.mentions, 21, 'Neil aggregates his full-name + bare-surname mentions');
  // And the row opens on the full-name node, so its label (and thus its wiki referent) is the person.
  assert.equal(neil.entId, 'neil-armstrong', 'opens on the full-name node, not the bare surname');
});

test('a bare surname with no full-name bearer in its source stays a one-source row, never conflated', () => {
  // "dPop" mentions only "Armstrong" (no full name), alongside two fully-named Armstrong sources.
  const rows = [
    row('Neil Armstrong', 'dNeil', 'S1', 3), row('Armstrong', 'dNeil', 'S1', 20, 5, 'armstrong'),
    row('Louis Armstrong', 'dLouis', 'S2', 3), row('Armstrong', 'dLouis', 'S2', 15, 4, 'armstrong'),
    row('Armstrong', 'dPop', 'S3', 6, 2, 'armstrong'),
  ];
  const merged = mergeEntitiesByReferent(rows);
  const stray = merged.filter((m) => m.label === 'Armstrong');
  assert.equal(stray.length, 1, 'the bearer-less bare surname is one honest row');
  assert.equal(stray[0].sourceCount, 1, 'and it spans only its own source — never Neil\'s or Louis\'s');
  assert.ok(merged.find((m) => m.label === 'Neil Armstrong') && merged.find((m) => m.label === 'Louis Armstrong'));
});

test('a single-token name that is NOT a contested surname still merges across sources (Iran)', () => {
  // "Iran" is nobody's surname here, so it folds across sources exactly as before — no regression.
  const rows = [
    row('Iran', 'dA', 'S1', 4), row('Iraq', 'dA', 'S1', 1),
    row('Iran', 'dB', 'S2', 3),
    row('Iran', 'dC', 'S3', 2),
  ];
  const merged = mergeEntitiesByReferent(rows);
  const iran = merged.filter((m) => m.label === 'Iran');
  assert.equal(iran.length, 1, 'one cross-source Iran');
  assert.equal(iran[0].sourceCount, 3, 'spanning all three sources');
  assert.equal(iran[0].mentions, 9, 'mentions aggregate');
});

test('a surname borne by only ONE full name is not contested — a bare token folds normally', () => {
  // Only "Islamic Republic of Iran" ends in "Iran": one referent, so "Iran" is not treated as a
  // contested surname and the bare/long forms merge across sources by their own labels (unchanged).
  const rows = [
    row('Islamic Republic of Iran', 'dA', 'S1', 2), row('Iran', 'dA', 'S1', 5),
    row('Iran', 'dB', 'S2', 4),
  ];
  const merged = mergeEntitiesByReferent(rows);
  const iran = merged.filter((m) => m.label === 'Iran');
  assert.equal(iran.length, 1, 'the single-referent "Iran" still folds across sources');
  assert.equal(iran[0].sourceCount, 2);
});

// ── end-to-end through the reader app ───────────────────────────────────────
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  return app;
};
const settle = () => new Promise((res) => setTimeout(res, 0));

test('the reader keeps Neil, Louis and Gerry Armstrong apart across sources', async () => {
  const app = await freshApp();
  // The Neil article names his wife (Janet Armstrong) too, so the within-doc surname merge is
  // defeated and a standalone bare "Armstrong" node forms — the very shape that used to conflate.
  app.ingestText('Neil Armstrong was an astronaut. Armstrong walked on the Moon. Armstrong flew Gemini 8. Armstrong married Janet Armstrong. Armstrong commanded Apollo 11. Armstrong died in 2012.', 'Neil Armstrong');
  app.ingestText('Louis Armstrong was a jazz trumpeter. Armstrong recorded What a Wonderful World. Armstrong married Lucille Armstrong. Armstrong wore a Star of David. Armstrong died in 1971.', 'Louis Armstrong');
  app.ingestText('Apollo 11 landed on the Moon. Neil Armstrong stepped out first. Armstrong radioed Houston. Armstrong collected samples.', 'Apollo 11');
  await settle();

  const ents = app.entities();
  const neil = ents.find((e) => e.label === 'Neil Armstrong');
  const louis = ents.find((e) => e.label === 'Louis Armstrong');
  assert.ok(neil && louis, 'both full names surface as their own entities');
  // No bare "Armstrong" entity spanning multiple sources — the reported conflation is gone.
  assert.equal(ents.find((e) => e.label === 'Armstrong' && e.sourceCount > 1), undefined, 'no cross-source bare "Armstrong"');
  // Neil's bare mentions across the biography AND the Apollo article fold onto him (the subject).
  assert.ok(neil.sourceCount >= 2, 'Neil folds his Apollo mentions in');
  const janet = ents.find((e) => e.label === 'Janet Armstrong');
  assert.ok(neil.mentions > (janet?.mentions || 0), 'the bare surname lands on the subject Neil, not the wife Janet');
  // Neil and Louis never share an underlying node.
  assert.notEqual(neil.entId, louis.entId);
});

// ── grain (perceiver/parse/grain.js: figure / kind / setting) survives the cross-source fold ──
// entitiesInDoc reads grain off each row's own referent (rooms/reader/app/entities.js); the merge
// must carry it through to the row a cast/figures panel filters on, or the read is computed and
// then silently dropped before it ever reaches the UI (the bug this merge used to have).

test('mergeEntitiesByReferent carries grain through on the opened (fullLead) row', () => {
  const rows = [
    { key: 'd#geneva', entId: 'geneva', docId: 'd', sn: 'S1', label: 'Geneva', mentions: 12, links: 3, sourceCount: 1, kind: null, level: null, grain: 'setting' },
    { key: 'd#elizabeth-lavenza', entId: 'elizabeth-lavenza', docId: 'd', sn: 'S1', label: 'Elizabeth Lavenza', mentions: 9, links: 4, sourceCount: 1, kind: null, level: null, grain: 'figure' },
  ];
  const merged = mergeEntitiesByReferent(rows);
  const geneva = merged.find((m) => m.label === 'Geneva');
  const elizabeth = merged.find((m) => m.label === 'Elizabeth Lavenza');
  assert.equal(geneva.grain, 'setting');
  assert.equal(elizabeth.grain, 'figure');
});

test('mergeEntitiesByReferent leaves grain undefined for a row that never got graded (held)', () => {
  const rows = [
    { key: 'd#krempe', entId: 'krempe', docId: 'd', sn: 'S1', label: 'Krempe', mentions: 2, links: 1, sourceCount: 1, kind: null, level: null, grain: null },
  ];
  const merged = mergeEntitiesByReferent(rows);
  assert.equal(merged[0].grain, null, 'a HELD referent is not guessed into a grain by the merge');
});

// ── the document's own subject outranks a phrase merely built on its name ─────────────────────
// A biography's own subject is often UNDER-counted by raw mentions+links (pronoun references
// never add to `mentions` — perceiver/referents only tallies name/description admissions), while
// a compound phrase that happens to contain the subject's name ("Ada Lovelace Bicentenary
// Lectures") accumulates full, undiscounted mentions — so a bare mentions+links sort can crown
// the compound phrase the panel's centered entity instead of the person the document is about
// (the two stay correctly unmerged; this is purely a ranking bug). titleBySn threads the source's
// own title in as a directional tiebreaker: the title, or a shortened form of it, wins; a phrase
// that merely contains the title does not.

test('the document subject outranks a compound phrase built on its name, even with fewer raw mentions', () => {
  const rows = [
    row('Ada Lovelace', 'd', 'S1', 6, 2, 'ada-lovelace'),
    row('Ada Lovelace Bicentenary Lectures', 'd', 'S1', 9, 3, 'bicentenary-lectures'),
  ];
  const titleBySn = new Map([['S1', 'Ada Lovelace']]);
  const merged = mergeEntitiesByReferent(rows, { titleBySn });
  assert.equal(merged[0].label, 'Ada Lovelace', "the article's own subject ranks first, not the higher-mention compound phrase");
});

test('a shortened form of the title (a surname standing in) still gets a strong boost', () => {
  const rows = [
    row('Lovelace', 'd', 'S1', 4, 1, 'lovelace'),
    row('Ada Lovelace Bicentenary Lectures', 'd', 'S1', 9, 3, 'bicentenary-lectures'),
  ];
  const titleBySn = new Map([['S1', 'Ada Lovelace']]);
  const merged = mergeEntitiesByReferent(rows, { titleBySn });
  assert.equal(merged[0].label, 'Lovelace', "a shortened form of the subject's name still outranks the compound phrase");
});

test('without a title signal, ranking falls back to plain mentions+links (unchanged default)', () => {
  const rows = [
    row('Ada Lovelace', 'd', 'S1', 6, 2, 'ada-lovelace'),
    row('Ada Lovelace Bicentenary Lectures', 'd', 'S1', 9, 3, 'bicentenary-lectures'),
  ];
  const merged = mergeEntitiesByReferent(rows);   // no titleBySn passed
  assert.equal(merged[0].label, 'Ada Lovelace Bicentenary Lectures', 'with no title signal, the higher raw score still leads');
});
