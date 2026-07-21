// Tests for src/wiki/from-profile.js — the entityProfile() → article adapter.
// Pure, sync, no DOM: run with `node --test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileToEventLog, articleFromProfile } from '../src/wiki/from-profile.js';
import { renderArticleHTML } from '../src/wiki/render.js';

const profile = () => ({
  label: 'Robert Walton',
  sourceTitle: 'Frankenstein',
  defs: [
    { value: 'a sea captain', idx: 3, score: 0.9, witnesses: [{ idx: 3, text: 'I am about to undertake...' }] },
    { value: 'the letter-writer', idx: 1, score: 0.4, witnesses: [{ idx: 1, text: 'To Mrs. Saville, England.' }] },
  ],
  mentions: [
    { idx: 1, text: 'To Mrs. Saville, England.' },
    { idx: 3, text: 'I am about to undertake a voyage of discovery.' },
  ],
  relations: [
    { srcId: 'walton', srcLabel: 'Walton', tgtId: 'frankenstein', tgtLabel: 'Victor Frankenstein', via: 'rescues', op: 'CON', idx: 40 },
  ],
});

test('profileToEventLog: exactly one DEF (defs[0]); defs[1:] fold to INS, never a fabricated REC', () => {
  const log = profileToEventLog(profile());
  const defs = log.filter((e) => e.op === 'DEF');
  assert.equal(defs.length, 1, 'only the top-ranked property becomes the lede');
  assert.equal(defs[0].text, 'a sea captain');
  const secondaryAttest = log.find((e) => e.op === 'INS' && e.text === 'the letter-writer');
  assert.ok(secondaryAttest, 'the second def is present, but as evidence, not as a reframing');
  assert.equal(log.filter((e) => e.op === 'REC').length, 0, 'no REC event is ever synthesized in v1');
});

test('profileToEventLog: mentions become INS attestations, relations become CON events', () => {
  const log = profileToEventLog(profile());
  const attest = log.filter((e) => e.op === 'INS' && e.kind === 'attest' && e.text === 'To Mrs. Saville, England.');
  assert.equal(attest.length, 1);
  const con = log.find((e) => e.op === 'CON');
  assert.equal(con.text, 'rescues');
  assert.equal(con.to, 'Victor Frankenstein');
});

test('profileToEventLog: SIG carries the referent facet — Entity identity/name resolve from real data', () => {
  const log = profileToEventLog(profile());
  const sig = log.find((e) => e.op === 'SIG');
  assert.ok(sig, 'a registration event exists');
  assert.equal(sig.facets.referent, 'Robert Walton');
});

test('profileToEventLog: never throws on a thin/partial profile (no defs, no relations, no mentions)', () => {
  assert.doesNotThrow(() => profileToEventLog({ label: 'Someone' }));
  const log = profileToEventLog({ label: 'Someone' });
  assert.equal(log.filter((e) => e.op === 'DEF').length, 0);
});

test('articleFromProfile: defaults to Entity terrain and names itself from the profile label', () => {
  const art = articleFromProfile(profile());
  assert.equal(art.terrain, 'Entity');
  assert.equal(art.name, 'Robert Walton');
  assert.equal(art.nameSource, 'referent');
  assert.ok(art.lede && art.lede.text === 'a sea captain');
});

test('articleFromProfile: null profile → null article (never a crash, never a fabricated empty shell)', () => {
  assert.equal(articleFromProfile(null), null);
});

test('articleFromProfile → renderArticleHTML: produces a hero that leads with the typed absence, same as any other terrain-typed article', () => {
  const art = articleFromProfile(profile());
  const hero = renderArticleHTML(art, { hero: true });
  assert.match(hero, /eo-wiki-hero/);
  assert.match(hero, /Robert Walton/);
  // Entity's absence headline (absence.js) still leads in hero mode, exactly as wiki.test.js
  // pins for every other terrain — this is the SAME renderer, not a special case for entities.
  assert.ok(hero.indexOf('eo-wiki-hero-absence') < hero.indexOf('eo-wiki-lede'), 'hero: absence still precedes lede for a live-profile article');
});

test('articleFromProfile: an entity with no standing properties gets an honest empty lede, never a fabricated one', () => {
  const art = articleFromProfile({ label: 'A minor figure', sourceTitle: 'Some Report', mentions: [{ idx: 0, text: 'A minor figure appears once.' }] });
  assert.equal(art.lede, null);
  const hero = renderArticleHTML(art, { hero: true });
  assert.match(hero, /A minor figure/);
});
