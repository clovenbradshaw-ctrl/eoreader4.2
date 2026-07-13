// Name-variant coreference: "Elvis", "Elvis Presley", "Elvis Aaron Presley" and
// "Presley" are surface forms of ONE referent and must fold into one figure — within a
// document (the surname reconciliation must not treat one person's variants as a
// family) AND across sources (the cross-doc binder must fold variants, not only
// verbatim labels — the four-separate-Elvises regression from the entity panel). The
// fold is guarded by sticky abstention: a short form that fits two incomparable full
// names (the two Bushes) is held apart, never guessed into one.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clusterAnchors, distinctReferentCount, isSubsequence, nameTokens }
  from '../src/perceiver/parse/name-variants.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { createCompositeDoc } from '../src/organs/in/composite.js';
import { projectGraph } from '../src/core/project.js';

// A projected referent's total sightings, found by the label of any of its variants.
const sightingsFor = (graph, label) => {
  for (const ent of graph.entities.values()) if (ent.label === label) return ent.sightings;
  return null;
};
const referentLabels = (graph) => [...graph.entities.values()].map(e => e.label).sort();

// ── the containment primitive ────────────────────────────────────────────────
test('isSubsequence is order-preserving token containment', () => {
  assert.ok(isSubsequence(nameTokens('Elvis'), nameTokens('Elvis Presley')));
  assert.ok(isSubsequence(nameTokens('Presley'), nameTokens('Elvis Presley')));
  assert.ok(isSubsequence(nameTokens('Elvis Presley'), nameTokens('Elvis Aaron Presley')));
  assert.ok(!isSubsequence(nameTokens('Elvis Herbert Presley'), nameTokens('Elvis Walker Presley')));
  assert.ok(!isSubsequence(nameTokens('Elvis Presley'), nameTokens('Elvis')));   // longer ⊄ shorter
});

// ── clustering: fold the unambiguous, abstain on the ambiguous ─────────────────
test('all Elvis variants fold onto the most-specific name', () => {
  const anchor = clusterAnchors(['Elvis', 'Elvis Presley', 'Elvis Aaron Presley', 'Presley']);
  for (const l of ['Elvis', 'Elvis Presley', 'Elvis Aaron Presley', 'Presley'])
    assert.equal(anchor.get(l), 'Elvis Aaron Presley', `${l} folds to the full name`);
  assert.equal(distinctReferentCount(['Elvis', 'Elvis Presley', 'Elvis Aaron Presley', 'Presley']), 1);
});

test('two incomparable full names (the two Bushes) stay two, and a short form fitting both abstains', () => {
  const labels = ['George Bush', 'George Herbert Bush', 'George Walker Bush'];
  const anchor = clusterAnchors(labels);
  assert.equal(anchor.get('George Herbert Bush'), 'George Herbert Bush');
  assert.equal(anchor.get('George Walker Bush'), 'George Walker Bush');
  assert.equal(anchor.get('George Bush'), 'George Bush', 'ambiguous short form abstains — its own referent');
  assert.equal(distinctReferentCount(labels), 3);
});

test('a surname shared by two distinct people is ambiguous — the bare surname abstains', () => {
  const labels = ['Elvis Presley', 'Lisa Marie Presley', 'Presley'];
  assert.equal(distinctReferentCount(labels), 3);
  assert.equal(clusterAnchors(labels).get('Presley'), 'Presley');
});

test('a family sharing a surname (Samsa) counts as distinct agents, not one', () => {
  // No one of these is a subsequence of another → three referents, so the mr/mrs-samsa
  // surname unmerge is preserved.
  assert.equal(distinctReferentCount(['Gregor Samsa', 'Mr Samsa', 'Mrs Samsa']), 3);
});

// ── within a document ──────────────────────────────────────────────────────────
test('within one document the bare surname folds when its bearers are one person', () => {
  const doc = parseText(
    `Elvis Presley was born in Memphis. Elvis signed with RCA Victor.
     Presley recorded many songs. Elvis Aaron Presley became famous.
     Presley toured widely. Elvis was a great performer.`,
    { docId: 'S-1' });
  const g = projectGraph(doc.log);
  const labels = referentLabels(g);
  assert.ok(!labels.includes('Presley'), `bare "Presley" must not survive as its own figure: ${labels}`);
  // Every Elvis mention landed on one referent (6 name sightings across the passage).
  assert.equal(sightingsFor(g, 'Elvis Presley'), 6);
});

test('within one document a real family keeps its members apart', () => {
  const doc = parseText(
    `Gregor Samsa woke early. Mr Samsa opened the door. Mrs Samsa wept.
     Mr Samsa spoke to Gregor Samsa. Mrs Samsa left the room.`,
    { docId: 'K-1' });
  const g = projectGraph(doc.log);
  const labels = referentLabels(g);
  assert.ok(labels.includes('Mr Samsa') && labels.includes('Mrs Samsa'),
    `the parents stay distinct: ${labels}`);
});

// ── across sources (the entity-panel regression) ───────────────────────────────
test('across sources the Elvis variants collapse to one referent', () => {
  const sources = {
    'S-1': `Presley recorded at Sun Studio. Presley toured widely. Presley loved gospel.`,
    'S-2': `Elvis Presley signed with RCA Victor. Elvis Presley moved to Memphis.`,
    'S-3': `Elvis was a great performer. Elvis served in the army. Elvis returned.`,
    'S-4': `Elvis Aaron Presley was born in Tupelo. Elvis Aaron Presley became famous.`,
  };
  const docs = Object.entries(sources).map(([id, t]) => parseText(t, { docId: id }));
  // The default (auto-merge) cross-source path; held-identity is a separate mode.
  const g = createCompositeDoc(docs, { heldIdentity: false }).projectGraph();
  const people = [...g.entities.values()].filter(e =>
    /elvis|presley/i.test(e.label));
  assert.equal(people.length, 1, `one Elvis referent, got ${people.map(p => p.label)}`);
  // All the mentions across all four sources fold onto it (3 + 2 + 3 + 2 name sightings).
  assert.equal(people[0].sightings, 10);
});

test('across sources two distinct same-surname people stay distinct', () => {
  const docs = [
    parseText('George Herbert Bush led the nation. George Herbert Bush served.', { docId: 'B-1' }),
    parseText('George Walker Bush led the nation. George Walker Bush served.', { docId: 'B-2' }),
    parseText('George Bush gave a speech. George Bush gave a speech again.', { docId: 'B-3' }),
  ];
  const g = createCompositeDoc(docs, { heldIdentity: false }).projectGraph();
  const bushes = [...g.entities.values()].filter(e => /bush/i.test(e.label));
  assert.equal(bushes.length, 3, `three distinct Bush figures, got ${bushes.map(b => b.label)}`);
});
