import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createConventions, induceSlots, BOUNDARY, SEED_SPEECH } from '../src/core/conventions/index.js';

// A ROBUST BATTERY for the conventions ledger + slot induction (the language-learning layer the
// gutenberg branch added). It exercises the register predicates, the DEF·EVA·REC defeasibility
// loop, learned + inherited conventions, the seed-free slot geometry, and — deliberately — the
// degenerate and adversarial inputs the existing tests skip. A few cases CHARACTERIZE current
// (arguably surprising) behavior so a regression is caught either way; they are marked.

// A clean DET·NOUN·VERB grammar, every unit well above minFreq, perfectly symmetric company.
const grammar = (dets, nouns, verbs) => {
  const seq = [];
  for (const d of dets) for (const n of nouns) for (const v of verbs) seq.push(d, n, v, BOUNDARY);
  return seq;
};
const LOWER = grammar(['the', 'a'], ['cat', 'dog', 'man'], ['ran', 'saw', 'ate']);

// ── Register predicates (untested before) ─────────────────────────────────────────────
test('register lookups are case-insensitive and strip exactly one trailing dot', () => {
  const c = createConventions();
  for (const w of ['is', 'IS', 'Is', 'is.']) assert.equal(c.isCopula(w), true, w);
  assert.equal(c.isAttributionVerb('SAID'), true);
  assert.equal(c.isAbbreviation('MR'), true);
  assert.equal(c.isAbbreviation('Mr.'), true);
  assert.equal(c.isAbbreviation('Mr..'), false);   // /\.$/ strips ONE dot only
});

test('degenerate lookups never throw and return false/null', () => {
  const c = createConventions();
  for (const v of [undefined, null, '', 42, {}]) assert.equal(c.isCopula(v), false);
  assert.equal(c.relationType(null), null);
  assert.equal(c.relationType(''), null);
  assert.doesNotThrow(() => c.isModifier(undefined));
});

test('relationType: speech precedence over overlapping buckets; untyped → null', () => {
  const c = createConventions();
  assert.equal(c.relationType('ran'), 'motion');
  assert.equal(c.relationType('father'), 'kinship');
  assert.equal(c.relationType('said'), 'speech');
  assert.equal(c.relationType('observed'), 'speech');   // also perception → speech wins
  assert.equal(c.relationType('called'), 'speech');     // also communication → speech wins
  assert.equal(c.relationType('nonexistentverb'), null);
});

test('the register invariant: "and" is a conjunction, "but" is function-class but NOT a conjunction', () => {
  const c = createConventions();
  assert.equal(c.isConjunction('and'), true);
  assert.equal(c.isConjunction('but'), false);
  assert.equal(c.isFunction('but'), true);
  assert.equal(Object.isFrozen(SEED_SPEECH), true);
});

// ── Learning + the DEF·EVA·REC defeasibility loop (untested before) ────────────────────
test('a learned attribution verb types as speech and accumulates weight (normalized)', () => {
  const c = createConventions({ seeds: false });
  assert.equal(c.relationType('pinged'), null);
  c.learnAttribution('pinged');
  assert.equal(c.isAttributionVerb('pinged'), true);
  assert.equal(c.relationType('pinged'), 'speech');
  assert.equal(c.originOf('attribution-verb', 'pinged'), 'learned');
  c.learnAttribution('Pinged.', 2);                 // norm merges to 'pinged'
  assert.equal(c.weightOf('pinged'), 3);
  assert.equal(c.attribution.get('pinged'), 3);
});

test('a prior gets a head start: a seed survives 3 breaks, defeats on the 4th, reinstates', () => {
  const c = createConventions();
  for (let i = 0; i < 3; i++) assert.equal(c.eva('copula', 'is', false).defeated, false);
  assert.equal(c.eva('copula', 'is', false).defeated, true);   // strain 4 > support 3
  assert.equal(c.isCopula('is'), false);
  c.reinstate('copula', 'is');
  assert.equal(c.isCopula('is'), true);
  assert.equal(c.strainOf('copula', 'is'), 0);
});

test('a from-scratch learned convention (support 1) defeats on its 2nd break', () => {
  const c = createConventions();
  assert.equal(c.eva('copula', 'floop', true).support, 1);
  assert.equal(c.eva('copula', 'floop', false).defeated, false);
  assert.equal(c.eva('copula', 'floop', false).defeated, true);
  assert.equal(c.isCopula('floop'), false);
});

// ── Inherit mode (untested before) ─────────────────────────────────────────────────────
test('inherit flattens origin to prior, drops defeated entries, carries an initialism expansion', () => {
  const base = createConventions();
  base.learnAttribution('pinged');
  base.learnInitialism('NDP', 'Nashville Downtown Partnership');
  base.defeat('copula', 'is');
  const led = base.exportLedger();

  const c2 = createConventions({ seeds: false, inherit: led });
  assert.equal(c2.isAttributionVerb('pinged'), true);
  assert.equal(c2.originOf('attribution-verb', 'pinged'), 'prior');   // origin flattened
  assert.equal(c2.initialismOf('NDP'), 'Nashville Downtown Partnership');
  assert.equal(c2.isCopula('is'), false);                             // defeated entry not inherited
  assert.equal(c2.originOf('copula', 'is'), null);
});

// ── Slot induction geometry (extends the existing abstract test) ───────────────────────
test('a clean grammar induces three slots by company alone, mates shared', () => {
  const c = createConventions({ induce: LOWER });
  const dts = c.slotOf('the'), nns = c.slotOf('dog'), vbs = c.slotOf('ran');
  assert.equal(c.slotOf('a'), dts);
  assert.equal(c.slotOf('cat'), nns);
  assert.equal(c.slotOf('man'), nns);
  assert.equal(c.slotOf('saw'), vbs);
  assert.equal(new Set([dts, nns, vbs]).size, 3, 'three distinct slots');
  assert.deepEqual(new Set(c.slotMatesOf('dog')), new Set(['cat', 'man']));
  assert.equal(c.isClosedClass('the'), true);
});

test('CHARACTERIZATION: an uppercase induce stream makes the slot layer unreachable via accessors', () => {
  // The slot store keys tokens verbatim, but the ledger accessors norm→lowercase before lookup.
  // So a stream that is not already lowercase induces slots that slotOf/slotMatesOf can never hit.
  // This pins the current limitation (a regression that FIXED it would flip these, flagging the change).
  const c = createConventions({ induce: grammar(['The', 'A'], ['Cat', 'Dog', 'Man'], ['Ran', 'Saw', 'Ate']) });
  assert.ok(c.inducedSlots.length >= 1, 'slots are induced (store keeps original case)');
  assert.equal(c.slotOf('The'), null);   // accessor lowercases → 'the' ≠ stored 'The'
  assert.equal(c.slotOf('the'), null);
  assert.equal(c.isClosedClass('The'), false);
  assert.deepEqual(c.slotMatesOf('Dog'), []);
});

test('empty / sub-threshold induce yields no reachable slots', () => {
  assert.equal(createConventions({ induce: [] }).slotField, null);
  const c = createConventions({ induce: ['a', 'b', 'a', 'b'] });   // freq 2 < default minFreq 3
  assert.deepEqual(c.inducedSlots, []);
  assert.equal(c.slotOf('a'), null);
});

test('induceSlots edge cases: empty, all-boundary, a lone recurrent unit, boundary never counts', () => {
  assert.deepEqual(induceSlots([]).slots, []);
  assert.deepEqual(induceSlots([BOUNDARY, BOUNDARY, BOUNDARY]).slots, []);
  const lone = induceSlots(['x', 'x', 'x', 'x'], { minFreq: 2 });
  assert.deepEqual(lone.slots, [['x']]);
  assert.equal(lone.field.freqOf('x'), 4);
  assert.equal(lone.field.freqOf(BOUNDARY), 0);
});

test('lift maps slotted→§id, unslotted→identity, boundary/null pass through', () => {
  const { field, slotOf } = induceSlots(LOWER);
  const lifted = field.lift(['a', 'dog', 'ran', 'NEVERSEEN', BOUNDARY, null], slotOf);
  assert.equal(lifted[0], '§' + slotOf.get('a'));
  assert.equal(lifted[1], '§' + slotOf.get('dog'));
  assert.equal(lifted[3], 'NEVERSEEN');
  assert.equal(lifted[4], BOUNDARY);
  assert.equal(lifted[5], null);
});

test('slot induction is deterministic under reordered segments (indices stable)', () => {
  const segs = [];
  for (const d of ['the', 'a']) for (const n of ['cat', 'dog', 'man']) for (const v of ['ran', 'saw', 'ate']) segs.push([d, n, v, BOUNDARY]);
  const fwd = induceSlots(segs.flat());
  const rev = induceSlots([...segs].reverse().flat());
  for (const key of fwd.slotOf.keys()) assert.equal(rev.slotOf.get(key), fwd.slotOf.get(key), key);
});

test('slot induction is language/script neutral — Cyrillic tokens cluster by company', () => {
  // The same symmetric grammar in a non-Latin, uncased-verb script: geometry, not spelling.
  const c = createConventions({ induce: grammar(['этот', 'тот'], ['кот', 'пёс', 'человек'], ['бежал', 'видел', 'ел']) });
  assert.equal(c.slotOf('кот'), c.slotOf('пёс'));
  assert.equal(c.slotOf('этот'), c.slotOf('тот'));
  assert.notEqual(c.slotOf('кот'), c.slotOf('бежал'));
});

test('cluster sim override collapses everything to singletons; neighbors respects its cap', () => {
  const { field, slots, slotOf } = induceSlots(LOWER);
  const strict = field.cluster({ sim: 2 });   // an impossible cosine
  assert.equal(strict.slots.length, strict.slotOf.size, 'all singletons under sim=2');
  assert.ok(slots.length < slotOf.size);       // the real clustering did merge
  assert.ok(field.neighbors('dog', 1).length <= 1);
});
