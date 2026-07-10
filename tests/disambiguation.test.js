import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSensePrior, chooseSense, biasTopic, sharpenSeed, senseTokens, senseAlign, SENSE_W,
  discriminate, senseAnnouncement,
} from '../src/turn/disambiguate.js';
import { runCuriousResearch } from '../src/turn/research.js';

// The disambiguation prior — the thumb on the scale for a homonymous subject. When a research walk is
// asked to gather "dolphins", the bare-word topic frame ({dolphins}) cannot tell the marine mammal
// from the NFL team: a Miami-Dolphins page shares the word by spelling, rides the leash, and surfaces
// "in the fold" beside the animal. These lock the fix: the model commits to ONE sense before the walk,
// its distinguishing vocabulary presses into the frame so the off-sense page strays, the seed query is
// sharpened so the FIRST fetch is on-sense, and the seed grounding can still overrule a wrong guess.

// ── parseSensePrior — the model's JSON, validated ────────────────────────────────────────────────
test('parseSensePrior reads a well-formed prior and scrubs the subject word from the sense terms', () => {
  const out = parseSensePrior(
    '{"ambiguous":true,"sense":"dolphin (marine mammal)","terms":["dolphin","marine mammal","cetacean","ocean"],'
    + '"collision":"Miami Dolphins (NFL)","alternatives":[{"sense":"Miami Dolphins (NFL)","terms":["NFL","Miami","quarterback"]}]}', 'dolphins');
  assert.equal(out.sense, 'dolphin (marine mammal)');
  // "dolphin"/"dolphins" is the shared word — it distinguishes nothing, so it is dropped.
  assert.ok(!out.senseTerms.includes('dolphin') && !out.senseTerms.includes('dolphins'));
  assert.deepEqual(out.senseTerms, ['marine', 'mammal', 'cetacean', 'ocean']);
  assert.equal(out.anchor, 'marine');                       // the leading, most-discriminating term
  assert.equal(out.collision, 'Miami Dolphins (NFL)');       // the sense it steers away from (glass-box)
  assert.equal(out.alternatives.length, 1);
  assert.deepEqual(out.alternatives[0].terms, ['nfl', 'miami', 'quarterback']);
});

test('parseSensePrior drops a committed term that collides with an alternative sense (Stage 2 anchor discrimination)', () => {
  const out = parseSensePrior(
    '{"ambiguous":true,"sense":"animal","terms":["ocean","cetacean","blowhole"],"collision":"NFL team",'
    + '"alternatives":[{"sense":"NFL team","terms":["ocean","stadium","nfl"]}]}', 'dolphins');
  // "ocean" names BOTH basins → it discriminates nothing → dropped; the anchor is the first survivor.
  assert.deepEqual(out.senseTerms, ['cetacean', 'blowhole']);
  assert.equal(out.anchor, 'cetacean');
  assert.equal(out.collision, 'NFL team');
});

test('parseSensePrior is tolerant of a code fence and prose around the JSON', () => {
  const out = parseSensePrior('Sure! ```json\n{"ambiguous":true,"sense":"x","terms":["alpha","beta"]}\n``` done', 'q');
  assert.equal(out.sense, 'x');
  assert.deepEqual(out.senseTerms, ['alpha', 'beta']);
});

test('parseSensePrior returns null on an unambiguous subject, junk, or a term-less sense', () => {
  assert.equal(parseSensePrior('{"ambiguous":false}', 'oxygen'), null);
  assert.equal(parseSensePrior('the model refused to answer', 'q'), null);
  assert.equal(parseSensePrior('{"ambiguous":true,"sense":"x"}', 'q'), null);            // no terms
  assert.equal(parseSensePrior('{"ambiguous":true,"sense":"x","terms":["q"]}', 'q'), null); // only the subject word
});

// ── chooseSense — commit by prior, divert by evidence ────────────────────────────────────────────
const PRIOR = {
  subject: 'dolphins', sense: 'marine mammal', senseTerms: ['marine', 'cetacean', 'ocean'],
  alternatives: [{ sense: 'NFL team', terms: ['nfl', 'miami', 'quarterback'] }],
};

test('chooseSense keeps the model commit when the seed is on that sense', () => {
  const c = chooseSense(new Set(['marine', 'cetacean', 'ocean', 'pod']), PRIOR);
  assert.equal(c.sense, 'marine mammal');
  assert.equal(c.diverted, false);
  assert.equal(c.anchor, 'marine');            // steered on the leading term
  assert.equal(c.collision, 'NFL team');        // away from the runner-up
});

test('chooseSense DIVERTS when the seed grounding concentrates on an alternative', () => {
  const c = chooseSense(new Set(['nfl', 'miami', 'quarterback', 'stadium']), PRIOR);
  assert.equal(c.sense, 'NFL team');
  assert.equal(c.diverted, true);   // the research legitimately pulled the other way
  assert.equal(c.anchor, 'nfl');
  assert.equal(c.collision, 'marine mammal');   // now steering away from the sense we came off
});

test('chooseSense breaks a near-tie with the prior — a mixed seed does not divert', () => {
  const c = chooseSense(new Set(['marine', 'nfl']), PRIOR);   // one term from each sense → a tie
  assert.equal(c.sense, 'marine mammal');
  assert.equal(c.diverted, false);
});

test('chooseSense keeps the commit when the seed matches no sense vocabulary, and is null without a prior', () => {
  assert.equal(chooseSense(new Set(['unrelated', 'words']), PRIOR).diverted, false);
  assert.equal(chooseSense(new Set(['marine']), null), null);
});

// ── biasTopic / sharpenSeed / helpers ────────────────────────────────────────────────────────────
test('biasTopic folds a sense\'s distinguishing tokens into the frame at SENSE_W', () => {
  const topic = new Map([['dolphins', 3]]);
  biasTopic(topic, ['marine mammal', 'cetacean']);
  assert.equal(topic.get('marine'), SENSE_W);
  assert.equal(topic.get('mammal'), SENSE_W);
  assert.equal(topic.get('cetacean'), SENSE_W);
  assert.equal(topic.get('dolphins'), 3);   // untouched
});

test('sharpenSeed carries the committed sense into the seed query, capped and deduped', () => {
  assert.equal(sharpenSeed('dolphins', PRIOR), 'dolphins marine cetacean');        // top 2 by default
  assert.equal(sharpenSeed('dolphins', PRIOR, { max: 1 }), 'dolphins marine');
  assert.equal(sharpenSeed('marine dolphins', PRIOR, { max: 1 }), 'marine dolphins cetacean'); // skips a term already present
  assert.equal(sharpenSeed('dolphins', null), 'dolphins');                          // no prior → bare word
});

test('senseTokens and senseAlign speak the walk\'s own tokeniser', () => {
  assert.deepEqual(senseTokens(['NFL, Miami', 'quarterback'], { without: ['dolphins'] }), ['nfl', 'miami', 'quarterback']);
  assert.equal(senseAlign(['nfl', 'miami', 'quarterback'], new Set(['nfl', 'miami', 'x'])), 2 / 3);
});

test('discriminate keeps only the terms unique to the target sense, never emptying', () => {
  assert.deepEqual(discriminate(['cetacean', 'ocean', 'blowhole'], ['ocean', 'stadium']), ['cetacean', 'blowhole']);
  assert.deepEqual(discriminate(['mammals'], ['mammal']), ['mammals']);   // stem-collides → but never empties, the lead stands
  assert.deepEqual(discriminate(['cetacean'], []), ['cetacean']);
});

test('senseAnnouncement discloses the anchor and the sense steered away from', () => {
  const commit = { sense: 'dolphin (marine mammal)', anchor: 'cetacean', collision: 'NFL team', diverted: false };
  const line = senseAnnouncement(commit);
  assert.match(line, /marine mammal/);
  assert.match(line, /cetacean/);            // the anchor it steered on
  assert.match(line, /NFL team/);            // the collision it steered away from
  const diverted = senseAnnouncement({ sense: 'NFL team', anchor: 'nfl', collision: 'marine mammal', diverted: true });
  assert.match(diverted, /sources point to NFL team/);
  assert.equal(senseAnnouncement(null), null);
});

// ── The regression: an off-sense page strays under the prior, and is kept without it ──────────────
// A fake web where a football QUERY returns a pure football page and everything else returns a marine
// page that also name-drops the NFL team (so the walk discovers an "nfl" lead to chase). The same walk
// is run twice — with the marine-mammal prior and without — and only the prior strays the football hop.
const slug = (q) => String(q).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dolphinWeb = async (query) => {
  const q = String(query).toLowerCase();
  const isFootball = /touchdown|quarterback|football|\bnfl\b|miami/.test(q);
  const text = isFootball
    ? 'dolphins miami football team quarterback touchdown stadium roster playoffs'   // a pure football page
    // a marine page that mentions only the "touchdown" lead (repeated → the heaviest thing to chase),
    // NOT the rest of the football vocabulary — so the frame it enriches stays a marine frame
    : 'dolphins are marine mammals cetacean ocean echolocation pod blowhole aquatic swimming touchdown touchdown touchdown touchdown';
  return [{ doc: { docId: `web-${slug(q)}`, text, web: { title: query, url: `https://x.test/${slug(q)}` } } }];
};
const ANIMAL_PRIOR = {
  subject: 'dolphins', sense: 'dolphin (marine mammal)',
  senseTerms: ['marine', 'mammal', 'cetacean', 'ocean', 'echolocation'],
  alternatives: [{ sense: 'Miami Dolphins (NFL team)', terms: ['nfl', 'miami', 'quarterback', 'touchdown', 'football'] }],
};

test('the committed sense strays the off-sense (football) page off the leash', async () => {
  const withPrior = await runCuriousResearch('dolphins', { search: dolphinWeb, sensePrior: ANIMAL_PRIOR, maxHops: 4, k: 1 });
  const withoutPrior = await runCuriousResearch('dolphins', { search: dolphinWeb, maxHops: 4, k: 1 });

  const footballId = 'web-dolphins-touchdown';
  const gathered = (w) => w.docs.map((d) => d.docId);

  // Both walks discover and FETCH the "dolphins touchdown" hop (it is the heaviest lead the seed surfaces)…
  assert.ok(withPrior.hops.some((h) => h.query === 'dolphins touchdown'), 'the prior walk still fetches the football hop');
  assert.ok(withoutPrior.hops.some((h) => h.query === 'dolphins touchdown'), 'the bare walk fetches the football hop');

  // …but only the committed frame strays it: it never becomes a source under the prior, and does under the bare walk.
  assert.ok(!gathered(withPrior).includes(footballId), 'the football page is strayed off the leash by the sense prior');
  assert.ok(gathered(withoutPrior).includes(footballId), 'without the prior the football page rides the leash in — the bug');

  // The prior walk still gathered real (marine) sources, and it reports the sense it committed to.
  assert.ok(withPrior.docs.length >= 1);
  assert.equal(withPrior.sense.sense, 'dolphin (marine mammal)');
  assert.equal(withPrior.sense.diverted, false);
});

test('the seed query is sharpened to the committed sense, and the no-prior walk is untouched', async () => {
  const withPrior = await runCuriousResearch('dolphins', { search: dolphinWeb, sensePrior: ANIMAL_PRIOR, maxHops: 2, k: 1 });
  const bare = await runCuriousResearch('dolphins', { search: dolphinWeb, maxHops: 2, k: 1 });

  // The FIRST hop searches the disambiguated seed, not the dumb bare word.
  assert.equal(withPrior.hops[0].query, 'dolphins marine mammal');
  // With no disambiguator and no prior, nothing changes: the seed is the bare word and no sense is reported.
  assert.equal(bare.hops[0].query, 'dolphins');
  assert.equal(bare.sense, null);
});
