import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText, discoverDarkReferents, proposeReferentNames } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';

// THE DARK-REFERENT READ (src/perceiver/parse/dark-referent.js). A figure with no proper name —
// only a definite description the text keeps returning to — never enters the entity graph, because
// admission anchors on a capital. Frankenstein's creature is the case: "the creature", "the wretch",
// a hail of pronouns, no name in the passage. The read detects it by the gravity warping around it
// (recurrence × subject-agency × a mass that rivals the named cast) and admits it like any name.

const FRANK =
  'Victor Frankenstein toiled for months to build his creation from lifeless matter. ' +
  'On a dreary night in November, Frankenstein beheld the creature open its dull yellow eyes. ' +
  'The creature stretched out a hand toward its maker, but Victor fled the room in horror. ' +
  'For days the creature wandered the woods alone and learned to fear the cruelty of men. ' +
  'The creature watched a poor family through a chink in their cottage wall. ' +
  'The wretch taught itself to speak by listening to the cottagers each evening. ' +
  'When the creature revealed itself, the family drove the wretch away with stones. ' +
  'The creature swore revenge against Frankenstein for abandoning it to misery. ' +
  'The wretch strangled young William in the woods outside Geneva. ' +
  'Frankenstein climbed the glacier and there the creature confronted him. ' +
  'The creature begged Victor to build it a companion so it would no longer be alone. ' +
  'When Victor destroyed the half-made bride, the creature vowed to ruin him. ' +
  'The creature murdered Elizabeth, and Frankenstein pursued the wretch into the frozen north.';

const entityLabels = (doc) => {
  const g = projectGraph(doc.log);
  const rep = g.representative || ((x) => x);
  const seen = new Set(), out = [];
  for (const [id, ent] of g.entities) {
    const r = rep(id); if (seen.has(r)) continue; seen.add(r);
    out.push({ label: doc.admission.labelOf(r) || ent.label, sightings: ent.sightings || 0 });
  }
  return out;
};
const events = (doc) => (doc.log.snapshot ? doc.log.snapshot() : doc.log.events);

test('the nameless creature is admitted as an entity — detected by the gravity warping around it', () => {
  const props = discoverDarkReferents(
    parseText(FRANK, { docId: 'f' }).sentences,
    { admission: parseText(FRANK, { docId: 'f' }).admission,
      conventions: parseText(FRANK, { docId: 'f' }).conventions },
  );
  const creature = props.find((p) => p.head === 'creature');
  assert.ok(creature, 'the creature is proposed as a dark referent');
  assert.equal(creature.label, 'the creature', 'named by its own dominant description');
  assert.ok(creature.subj >= 2 && creature.subj > creature.obl,
    'it is a FIGURE — it acts (subject-dominant), not a setting moved through');
});

test('with the read ON the creature reaches the entity graph, as a dark figure', () => {
  const doc = parseText(FRANK, { docId: 'frankenstein.txt', darkReferents: true });
  const labels = entityLabels(doc).map((e) => e.label);
  assert.ok(labels.includes('the creature'), 'the creature is now an entity');
  assert.ok(labels.includes('Victor Frankenstein'), 'the named cast is unaffected');

  // it is INS'd once per sighting (a real ×N badge) and tagged kind:'dark'
  const darkIns = events(doc).filter((e) => e.op === 'INS' && e.kind === 'dark');
  const creatureIns = darkIns.filter((e) => e.label === 'the creature');
  assert.ok(creatureIns.length >= 3, 'one INS per sighting — the badge is real');
  // and a defeasible figure-grain DEF is recorded for it
  const grain = events(doc).find((e) => e.op === 'DEF' && e.key === 'grain'
    && e.cue === 'dark-referent' && e.value === 'figure');
  assert.ok(grain, 'a defeasible figure-grain DEF marks the dark body a figure');
});

test('the read is OFF by default — byte-identical, no nameless body invented', () => {
  const off = parseText(FRANK, { docId: 'f' });
  const on  = parseText(FRANK, { docId: 'f', darkReferents: true });
  assert.equal(events(off).filter((e) => e.kind === 'dark').length, 0, 'off: no dark INS');
  assert.ok(events(on).filter((e) => e.kind === 'dark').length > 0, 'on: the body is admitted');
  assert.ok(!entityLabels(off).some((e) => e.label === 'the creature'),
    'with the read off the creature does not appear (the reported bug)');
});

test('NON-fire: a description that orbits a NAMED star mints no phantom (Metamorphosis)', () => {
  // "the creature"/"the thing"/"it" all mean the named Gregor; beside a protagonist named dozens
  // of times, the sparse unnamed descriptions never clear star-scale mass, so nothing is minted.
  const meta = readFileSync(new URL('../data/metamorphosis.txt', import.meta.url), 'utf8');
  const doc = parseText(meta, { docId: 'metamorphosis.txt', darkReferents: true });
  const dark = events(doc).filter((e) => e.op === 'INS' && e.kind === 'dark');
  assert.equal(dark.length, 0, 'no dark referent where every figure has a named centre');
});

test('a setting is NOT a dark referent — "the room" is moved through, it never acts', () => {
  const doc = parseText(FRANK, { docId: 'f' });
  const props = discoverDarkReferents(doc.sentences, { admission: doc.admission, conventions: doc.conventions });
  assert.ok(!props.some((p) => p.head === 'room' || p.head === 'wood' || p.head === 'night'),
    'oblique/settings are excluded by the figure test');
});

test('the injected nameReferent hook may rename and fold synonyms before admission', () => {
  // A hook that gives the body a real name and folds "the wretch" onto "the creature".
  const hook = (proposals) => {
    const creature = proposals.find((p) => p.head === 'creature');
    const wretch   = proposals.find((p) => p.head === 'wretch');
    if (!creature) return proposals;
    const mentions = [...new Set([...(creature.mentions || []), ...(wretch?.mentions || [])])].sort((a, b) => a - b);
    return [{ ...creature, id: 'the-creature', label: "Frankenstein's creature", mentions,
              mergedFrom: wretch ? [{ id: wretch.id, label: wretch.label }] : [] }];
  };
  const doc = parseText(FRANK, { docId: 'f', darkReferents: true, nameReferent: hook });
  const labels = entityLabels(doc).map((e) => e.label);
  assert.ok(labels.includes("Frankenstein's creature"), 'the hook renamed the body');
  assert.ok(!labels.includes('the wretch'), 'the wretch folded onto the one figure');
  // the fold is an auditable SYN merge with a corroborating EVA
  const syn = events(doc).find((e) => e.op === 'SYN' && e.match === 'dark-alias');
  assert.ok(syn, 'a SYN records the synonym merge');
});

test('proposeReferentNames — the talker names the nameless body (model-backed, total)', async () => {
  const doc = parseText(FRANK, { docId: 'f' });
  const props = discoverDarkReferents(doc.sentences, { admission: doc.admission, conventions: doc.conventions });
  // a fake talker: names the creature, declares the wretch the same figure.
  const model = {
    phrase: async () => JSON.stringify([
      { id: 'the-creature', name: "Frankenstein's creature", sameAs: null },
      { id: 'the-wretch', name: null, sameAs: 'the-creature' },
    ]),
  };
  const named = await proposeReferentNames(props, { model, sentences: doc.sentences });
  const body = named.find((p) => p.label === "Frankenstein's creature");
  assert.ok(body, 'the talker renamed the body');
  assert.ok((body.mergedFrom || []).some((m) => m.id === 'the-wretch'), 'the wretch folded in');
  assert.equal(named.length, props.length - 1, 'two descriptions became one figure');

  // TOTAL: a model fault leaves the mechanical proposals untouched.
  const broken = { phrase: async () => { throw new Error('no key'); } };
  const fallback = await proposeReferentNames(props, { model: broken, sentences: doc.sentences });
  assert.deepEqual(fallback, props, 'a model fault falls back to the mechanical labels');
});
