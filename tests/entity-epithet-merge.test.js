// The epithet-fold — "God", "Good God", "Great God" are ONE referent (the one God,
// variously praised), not three. Containment alone cannot see this: it is byte-identical
// to the two-Bushes case ("George Bush" abstains between "George Herbert Bush" and
// "George Walker Bush"), so sticky abstention correctly holds all such families apart.
// The signal that separates a decorated UNIQUE referent from a distinguished family is
// the conventions ledger's: the head is a non-person (`isNonPerson` — "God") and the
// leading tokens are epithets (`isModifier` — "Good"/"Great"). This pins that fold at
// both layers — the name-variant clusterer and the cross-source entity-panel merge —
// AND pins that it stays OFF by default, so the Bushes and the two Testaments never move.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clusterAnchors, distinctReferentCount, epithetReducedHead }
  from '../src/perceiver/parse/name-variants.js';
import { mergeEntitiesByReferent } from '../src/rooms/reader/entity-merge.js';

// The ledger registers, as sets — `isNonPerson` (unique free-capitals that name no
// person) and `isModifier` (the epithet adjectives). Lowercased at the call so casing
// never matters, exactly as the real ledger's `norm` does.
const NONPERSON = new Set(['god', 'lord']);
const EPITHET   = new Set(['good', 'great', 'almighty', 'holy', 'most', 'high', 'lord']);
const preds = {
  epithetHead: (t) => NONPERSON.has(String(t).toLowerCase()),
  isEpithet:   (t) => EPITHET.has(String(t).toLowerCase()),
};

const anchorsInto = (labels, opts) => {
  const a = clusterAnchors(labels, opts);
  return new Set([...a.values()]);
};

// ── the primitive: which head does a name decorate ─────────────────────────────
test('epithetReducedHead reads the unique head a name decorates', () => {
  assert.equal(epithetReducedHead(['good', 'god'], preds), 'god');
  assert.equal(epithetReducedHead(['almighty', 'god'], preds), 'god');
  assert.equal(epithetReducedHead(['god'], preds), 'god', 'the bare head decorates itself');
  assert.equal(epithetReducedHead(['george', 'bush'], preds), null, 'no token is a non-person head');
  assert.equal(epithetReducedHead(['old', 'testament'], preds), null, '"testament" is no non-person head');
  assert.equal(epithetReducedHead(['george', 'walker', 'bush'], preds), null, 'proper-name middle is no epithet');
  // Two heads, neither an epithet of the other → abstain (not a single decoration).
  assert.equal(epithetReducedHead(['lord', 'god'], { epithetHead: (t) => ['lord', 'god'].includes(t), isEpithet: () => false }), null);
});

// ── clusterAnchors: opt-in, and inert by default ───────────────────────────────
test('clusterAnchors is byte-identical when no epithet predicates are passed', () => {
  const labels = ['God', 'Good God', 'Great God'];
  assert.equal(distinctReferentCount(labels), 3, 'default: three referents, the abstention holds');
  assert.deepEqual(clusterAnchors(labels), clusterAnchors(labels, {}), 'no-opts and empty-opts agree');
});

test('with the epithet signal, God / Good God / Great God fold to one referent', () => {
  const labels = ['God', 'Good God', 'Great God', 'Almighty God'];
  const a = clusterAnchors(labels, preds);
  assert.equal(new Set([...a.values()]).size, 1, 'one referent');
  for (const l of labels) assert.equal(a.get(l), 'God', `${l} anchors on the bare head "God"`);
});

test('the fold anchors on the head even when the bare head is absent', () => {
  const a = clusterAnchors(['Good God', 'Great God'], preds);
  assert.equal(new Set([...a.values()]).size, 1, 'the two epithet-forms still unite');
});

// ── the fold does NOT touch the cases abstention rightly holds apart ────────────
test('the two Bushes stay two even with the epithet signal on', () => {
  const labels = ['George Bush', 'George Herbert Bush', 'George Walker Bush'];
  assert.equal(anchorsInto(labels, preds).size, 3, 'no Bush token is a non-person head — untouched');
});

test('Old Testament and New Testament stay distinct with the epithet signal on', () => {
  // "old"/"new" ARE common adjectives, but "testament" is no `isNonPerson` head, so the
  // fold never fires — the two books stay two (plus the bare "Testament").
  const labels = ['Testament', 'Old Testament', 'New Testament'];
  assert.equal(anchorsInto(labels, preds).size, 3, 'the head is an ordinary noun — no fold');
});

// ── the cross-source panel merge (entity-merge.js) ─────────────────────────────
const row = (label, docId, mentions) => ({ label, docId, entId: `${label}@${docId}`, sn: docId, mentions, links: 1, key: label });

test('mergeEntitiesByReferent collapses the God epithets into one panel row', () => {
  const rows = [
    row('God', 'S1', 12), row('Good God', 'S1', 3),
    row('Great God', 'S2', 2), row('Almighty God', 'S2', 1),
  ];
  const merged = mergeEntitiesByReferent(rows, preds);
  assert.equal(merged.length, 1, 'one row for the one God');
  assert.equal(merged[0].label, 'God', 'the row is labelled with the head, not an epithet');
  assert.equal(merged[0].mentions, 18, 'mentions aggregate across every epithet form and source');
  assert.equal(merged[0].sourceCount, 2, 'it spans both sources');
});

test('the panel merge is byte-identical without the epithet signal', () => {
  const rows = [row('God', 'S1', 12), row('Good God', 'S1', 3), row('Great God', 'S2', 2)];
  const plain = mergeEntitiesByReferent(rows, {});
  assert.ok(plain.length >= 2, 'default keeps the epithet forms apart (no fold)');
  assert.ok(!plain.some(r => r.label === 'God' && r.sourceCount === 2),
    'nothing collapses God across sources without the signal');
});

test('the panel merge leaves the Bushes and the Testaments apart under the signal', () => {
  const rows = [
    row('George Bush', 'B3', 5), row('George Herbert Bush', 'B1', 4), row('George Walker Bush', 'B2', 4),
    row('Old Testament', 'T1', 6), row('New Testament', 'T1', 6),
  ];
  const merged = mergeEntitiesByReferent(rows, preds);
  const labels = merged.map(r => r.label).sort();
  assert.deepEqual(labels, ['George Bush', 'George Herbert Bush', 'George Walker Bush', 'New Testament', 'Old Testament'],
    'every one of these stays its own row');
});

// ── the honest limit: true synonyms share no orthography ───────────────────────
test('distinct names of one referent (YHWH / Elohim / Adonai) do NOT fold — that needs coreference, not containment', () => {
  // Different NAMES of God in Hebrew share no tokens, so neither containment nor the
  // epithet-fold can (or should) unite them — that is a discriminator-convergence job,
  // not a name-variant one. Only the containment/epithet chains relate (אל ⊑ אל שדי).
  const names = ['יהוה', 'אלהים', 'אדוני'];  // YHWH, Elohim, Adonai
  assert.equal(anchorsInto(names, preds).size, 3, 'three unrelated surface names remain three');
});
