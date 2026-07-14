import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WITNESS_DIMENSIONS, DIVERSITY_TIERS, tierRank, diversityTier, makeDiversity,
  emptyDiversity, EMPTY_DIVERSITY, isDiversity, diversityOf, withVoices, mergeDiversity,
  moreDiverse, attachDiversity, diversityOfProposition,
} from '../src/core/witness.js';
import { makeProposition, isProposition } from '../src/core/proposition.js';

// The witness diversity of a proposition, made first-class (core/witness.js). The proposition is the
// floor of MEANING; this is the floor of its STANDING — how many independent voices, through how many
// senses, hold the distinction up. One frozen currency, four named dimensions and a derived tier,
// that any proposition carries and reflect.js / corroboration.js mint instead of re-deriving.

// ── the dimensions and the ladder are the named vocabulary ────────────────────
test('the four diversity dimensions and the five-rung ladder are named and ordered', () => {
  assert.deepEqual(WITNESS_DIMENSIONS, ['spans', 'origins', 'voices', 'senses']);
  assert.deepEqual(DIVERSITY_TIERS,
    ['unwitnessed', 'interpretation', 'single-source', 'corroborated', 'cross-modal']);
  assert.equal(tierRank('unwitnessed'), 0);
  assert.equal(tierRank('cross-modal'), 4);
  assert.equal(tierRank('nonsense'), -1);
});

// ── diversityTier — the ladder, defined once ──────────────────────────────────
test('diversityTier climbs the ladder from the dimensions', () => {
  assert.equal(diversityTier({}), 'unwitnessed');
  assert.equal(diversityTier({ reafferent: 3 }), 'interpretation', 'only the engine\'s own notes');
  assert.equal(diversityTier({ origins: 1 }), 'single-source');
  assert.equal(diversityTier({ origins: 2, voices: 2 }), 'corroborated');
  assert.equal(diversityTier({ origins: 2, voices: 2, senses: 2 }), 'cross-modal');
});

test('diversityTier keys corroboration on VOICES, not raw origins — two mirrors are single-source', () => {
  // Two origins (two docIds) but one meaningfully-distinct voice (mirrors of one publisher):
  // the rung the corroboration measure refines reflect.js down to.
  assert.equal(diversityTier({ origins: 2, voices: 1 }), 'single-source');
  assert.equal(diversityTier({ origins: 2, voices: 1, senses: 2 }), 'single-source',
    'one voice across two senses is still one voice');
  assert.equal(diversityTier({ origins: 2 }), 'corroborated', 'voices default to origins when unmeasured');
});

// ── makeDiversity — the currency is consistent by construction ─────────────────
test('makeDiversity mints a frozen, self-consistent descriptor with a derived tier', () => {
  const d = makeDiversity({ spans: 3, origins: 2, senses: new Set(['text', 'sight']) });
  assert.equal(d.tier, 'cross-modal');
  assert.equal(d.rank, 4);
  assert.equal(d.spans, 3);
  assert.equal(d.origins, 2);
  assert.equal(d.voices, 2, 'voices default to origins');
  assert.deepEqual(d.senses, ['sight', 'text'], 'senses normalise to a sorted array');
  assert.ok(Object.isFrozen(d), 'a minted diversity is frozen — a fact, not a buffer');
  assert.ok(isDiversity(d));
});

test('a Set, an array, or a count are all accepted for senses', () => {
  assert.equal(makeDiversity({ origins: 2, senses: new Set(['a', 'b']) }).tier, 'cross-modal');
  assert.equal(makeDiversity({ origins: 2, senses: ['a', 'b'] }).tier, 'cross-modal');
  assert.equal(makeDiversity({ origins: 2, senses: 2 }).senses.length, 0,
    'a bare count feeds the tier but has no labels to list');
});

test('the empty diversity is the zero — nothing witnesses it', () => {
  assert.equal(EMPTY_DIVERSITY.tier, 'unwitnessed');
  assert.equal(EMPTY_DIVERSITY.rank, 0);
  assert.deepEqual(emptyDiversity(), EMPTY_DIVERSITY);
  assert.ok(isDiversity(EMPTY_DIVERSITY));
});

test('isDiversity rejects a shape whose rank disagrees with its tier', () => {
  assert.equal(isDiversity({ spans: 0, origins: 0, voices: 0, senses: [], reafferent: 0, tier: 'corroborated', rank: 0 }), false);
  assert.equal(isDiversity(null), false);
  assert.equal(isDiversity({}), false);
});

// ── diversityOf — fold raw witnesses into the currency ────────────────────────
test('diversityOf folds witness records, de-duplicating origins/voices/senses', () => {
  const d = diversityOf([
    { origin: 'a.txt', sense: 'text' },
    { origin: 'a.txt', sense: 'text' },          // same origin — folds
    { origin: 'b.txt', sense: 'sight' },
  ], { spans: 4 });
  assert.equal(d.origins, 2);
  assert.equal(d.voices, 2, 'voices default to origins');
  assert.deepEqual(d.senses, ['sight', 'text']);
  assert.equal(d.spans, 4);
  assert.equal(d.tier, 'cross-modal');
});

test('diversityOf collapses mirrors by voice key and counts the enactor door as reafference only', () => {
  const d = diversityOf([
    { origin: 'web-1', voice: 'wikipedia.org', sense: 'text' },
    { origin: 'web-2', voice: 'wikipedia.org', sense: 'text' },   // two origins, one voice
    { origin: 'note-1', door: 'enactor' },                         // the engine's own note — never a source
  ]);
  assert.equal(d.origins, 2);
  assert.equal(d.voices, 1, 'two mirrors are one voice');
  assert.equal(d.reafferent, 1);
  assert.equal(d.tier, 'single-source', 'one voice, despite two origins');
});

test('a proposition witnessed only through the enactor door is interpretation, not a source', () => {
  const d = diversityOf([{ origin: 'note', door: 'enactor' }, { origin: 'note2', door: 'enactor' }]);
  assert.equal(d.origins, 0);
  assert.equal(d.reafferent, 2);
  assert.equal(d.tier, 'interpretation');
});

// ── withVoices — the corroboration bridge ─────────────────────────────────────
test('withVoices re-mints the tier with a refined voice count — corroborated → single-source', () => {
  const before = makeDiversity({ origins: 2 });             // reflect: two origins, voices default 2
  assert.equal(before.tier, 'corroborated');
  const after = withVoices(before, 1);                      // corroboration: really one voice
  assert.equal(after.voices, 1);
  assert.equal(after.origins, 2, 'origins are unchanged — the downgrade is honest about both');
  assert.equal(after.tier, 'single-source', 'the downgrade is not cosmetic — the tier re-derives');
});

// ── mergeDiversity + moreDiverse ──────────────────────────────────────────────
test('mergeDiversity unions two disjoint witness sets and re-derives the tier', () => {
  const a = makeDiversity({ origins: 1, senses: ['text'] });
  const b = makeDiversity({ origins: 1, senses: ['sight'] });
  const m = mergeDiversity(a, b);
  assert.equal(m.origins, 2);
  assert.deepEqual(m.senses, ['sight', 'text']);
  assert.equal(m.tier, 'cross-modal');
  assert.equal(mergeDiversity(a, EMPTY_DIVERSITY).origins, 1, 'merging the zero is a no-op');
});

test('moreDiverse is a total order by tier then voices then origins', () => {
  const single = makeDiversity({ origins: 1 });
  const corrob = makeDiversity({ origins: 2 });
  const cross  = makeDiversity({ origins: 2, senses: ['text', 'sight'] });
  assert.equal(moreDiverse(cross, corrob), true);
  assert.equal(moreDiverse(corrob, single), true);
  assert.equal(moreDiverse(single, corrob), false);
  assert.equal(moreDiverse(makeDiversity({ origins: 3 }), makeDiversity({ origins: 2 })), true,
    'same tier — more voices wins');
});

// ── attachDiversity — the diversity ON a proposition ──────────────────────────
test('attachDiversity binds the standing to a proposition, keeping it a proposition', () => {
  const p = makeProposition({ substrate: 'Anna', relation: 'trusted', differentia: 'Ben' });
  const d = makeDiversity({ origins: 2 });
  const pd = attachDiversity(p, d);
  assert.ok(isProposition(pd), 'the slots survive — still a proposition');
  assert.equal(pd.substrate, 'Anna');
  assert.equal(pd.diversity.tier, 'corroborated');
  assert.ok(Object.isFrozen(pd));
  assert.equal(diversityOfProposition(pd).tier, 'corroborated');
  assert.equal(diversityOfProposition(p), EMPTY_DIVERSITY, 'a bare proposition reads as the zero');
});
