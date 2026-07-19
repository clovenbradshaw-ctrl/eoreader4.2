import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseText, discoverUnnamedReferents, proposeReferentNames } from '../src/perceiver/parse/index.js';
import { projectGraph } from '../src/core/index.js';

// A REFERENT POINTED AT WITHOUT A NAME (src/perceiver/parse/unnamed-referent.js). A referent is
// never in the text — a name is only its brightest manifestation. When a figure wears none, only a
// definite description the text keeps returning to, the name scan finds nothing, yet the referent is
// as present as any named one. Frankenstein's creature is the case: "the creature", "the wretch", a
// hail of pronouns, no name in the passage. The reader finds that SAME centre off the descriptions
// and pronouns that point at it (recurrence × subject-agency) and admits it exactly like a name —
// no "dark" species, no second-class body, no privileged tag on its INS.

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
  const props = discoverUnnamedReferents(
    parseText(FRANK, { docId: 'f' }).sentences,
    { admission: parseText(FRANK, { docId: 'f' }).admission,
      conventions: parseText(FRANK, { docId: 'f' }).conventions },
  );
  const creature = props.find((p) => p.head === 'creature');
  assert.ok(creature, 'the creature is proposed as an unnamed referent');
  assert.equal(creature.label, 'the creature', 'named by its own dominant description');
  assert.ok(creature.subj >= 2 && creature.subj > creature.obl,
    'it is a FIGURE — it acts (subject-dominant), not a setting moved through');
});

test('with the read ON the creature reaches the entity graph — like any referent', () => {
  const doc = parseText(FRANK, { docId: 'frankenstein.txt', unnamedReferents: true });
  const labels = entityLabels(doc).map((e) => e.label);
  assert.ok(labels.includes('the creature'), 'the creature is now an entity');
  assert.ok(labels.includes('Victor Frankenstein'), 'the named cast is unaffected');

  // it is INS'd once per sighting (a real ×N badge) — the INS is SHAPE-IDENTICAL to a name's, with
  // no species tag; the referent is identified by its label, exactly as a named figure is.
  const creatureIns = events(doc).filter((e) => e.op === 'INS' && e.label === 'the creature');
  assert.ok(creatureIns.length >= 3, 'one INS per sighting — the badge is real');
  assert.ok(creatureIns.every((e) => e.kind == null), 'no privileged kind tag — not a special species');
  // a defeasible figure-grain DEF marks it a figure; its cue records HOW it was found (unnamed),
  // not that it is a different kind of thing.
  const grain = events(doc).find((e) => e.op === 'DEF' && e.key === 'grain'
    && e.cue === 'unnamed-referent' && e.value === 'figure');
  assert.ok(grain, 'a defeasible figure-grain DEF marks the body a figure');
});

test('a minimal parse leaves the read off; the reader turns it on — no body is invented either way', () => {
  // parseText defaults to a minimal, name-anchored parse (off); the reader (organs/in/text.js) turns
  // it on because resolving an unnamed referent IS ordinary reading. The signal is the grain cue, not
  // a species tag on the INS.
  const cueCount = (doc) => events(doc).filter((e) => e.op === 'DEF' && e.cue === 'unnamed-referent').length;
  const off = parseText(FRANK, { docId: 'f' });
  const on  = parseText(FRANK, { docId: 'f', unnamedReferents: true });
  assert.equal(cueCount(off), 0, 'minimal parse: the read does not run');
  assert.ok(cueCount(on) > 0, 'reader path: the body is admitted');
  assert.ok(!entityLabels(off).some((e) => e.label === 'the creature'),
    'a minimal parse does not resolve the creature (the reported bug, when the reader forgets to ask)');
});

test('NON-fire: a description that orbits a NAMED centre mints no rival (Metamorphosis)', () => {
  // "the creature"/"the thing"/"it" all mean the named Gregor; beside a protagonist named dozens of
  // times, the sparse unnamed descriptions resolve to HIM, so no rival referent is minted.
  const meta = readFileSync(new URL('../data/metamorphosis.txt', import.meta.url), 'utf8');
  const doc = parseText(meta, { docId: 'metamorphosis.txt', unnamedReferents: true });
  const minted = events(doc).filter((e) => e.op === 'DEF' && e.cue === 'unnamed-referent');
  assert.equal(minted.length, 0, 'no unnamed referent minted where every figure has a named centre');
});

test('a setting is NOT admitted as a referent — "the room" is moved through, it never acts', () => {
  const doc = parseText(FRANK, { docId: 'f' });
  const props = discoverUnnamedReferents(doc.sentences, { admission: doc.admission, conventions: doc.conventions });
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
  const doc = parseText(FRANK, { docId: 'f', unnamedReferents: true, nameReferent: hook });
  const labels = entityLabels(doc).map((e) => e.label);
  assert.ok(labels.includes("Frankenstein's creature"), 'the hook renamed the body');
  assert.ok(!labels.includes('the wretch'), 'the wretch folded onto the one figure');
  // the fold is an auditable SYN merge with a corroborating EVA
  const syn = events(doc).find((e) => e.op === 'SYN' && e.match === 'unnamed-alias');
  assert.ok(syn, 'a SYN records the synonym merge');
});

test('proposeReferentNames — the talker names the nameless body (model-backed, total)', async () => {
  const doc = parseText(FRANK, { docId: 'f' });
  const props = discoverUnnamedReferents(doc.sentences, { admission: doc.admission, conventions: doc.conventions });
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
