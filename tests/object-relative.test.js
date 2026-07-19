import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';

// OBJECT-RELATIVE READING (parse/relations.js, under the total read). A figure is often mentioned
// only as the OBJECT of a relative clause — "the wretch whom Victor created", "the creature whom I
// had left" — where the object is FRONTED as the relative pronoun. The subject-relative reading
// (antecedent as subject) can't reach this and drops the person-relation entirely. This pins the
// object-relative reading: "the HEAD whom S V" emits S –V→ HEAD, and HEAD's own main verb after the
// relative clause is still read. The person-relation is exactly what a figure test needs to tell a
// creature (acts on / is acted on by people) from a setting (the sun, which takes none).

// The creature recurs enough (with agency) to be admitted as an unnamed-referent figure, so "the creature" is a
// resolvable HEAD the relative clause can hang off.
const T = [
  'Victor Frankenstein toiled for months.',
  'Victor beheld the creature.',
  'The creature stretched its hand.',
  'The creature wandered the woods.',
  'The creature watched the family.',
  'The creature swore revenge.',
  'The creature whom Victor had created escaped.',
  'The creature whom Victor pursued fled north.',
].join(' ');

const edges = (doc) => (doc.log.snapshot ? doc.log.snapshot() : doc.log.events)
  .filter((e) => e.op === 'CON' || e.op === 'SIG');
const has = (evs, via, tgtRe) => evs.some((e) => e.via === via && tgtRe.test(String(e.tgt)));

test('an object-relative emits SUBJECT –verb→ antecedent (the fronted object)', () => {
  const doc = parseText(T, { docId: 'or', unnamedReferents: true, totalRead: true });
  assert.ok(doc.admission.isAdmitted('creature'), 'the creature is an unnamed-referent figure (a resolvable head)');
  const evs = edges(doc);
  // "the creature whom Victor had created escaped" → Victor –created→ the creature
  const created = evs.find((e) => e.via === 'created' && /creature/.test(String(e.tgt)));
  assert.ok(created, 'Victor –created→ the creature is recovered from the object-relative');
  assert.match(String(created.src), /victor/i, 'the explicit clause subject (Victor) is the source');
  assert.equal(created.tgtKind, undefined, 'the antecedent is a figure endpoint, not an np lemma');
  // "the creature whom Victor pursued fled north" → Victor –pursued→ the creature
  assert.ok(has(evs, 'pursued', /creature/), 'Victor –pursued→ the creature is recovered too');
  // and the confidence is the `relative` prior — a recovered, lower-certainty read
  assert.equal(created.confidence, 0.6, 'graded by the relative prior (0.60)');
});

test("HEAD's own main verb after the relative clause is still read", () => {
  const doc = parseText(T, { docId: 'or', unnamedReferents: true, totalRead: true });
  // "the creature whom Victor pursued FLED north" → the creature –fled→ north
  assert.ok(edges(doc).some((e) => e.via === 'fled' && /creature/.test(String(e.src))),
    'the matrix verb (fled) binds the creature as its subject, past the embedded relative clause');
});

test('OFF the total read the object-relative adds nothing (byte-identical path)', () => {
  const on  = parseText(T, { docId: 'or', unnamedReferents: true, totalRead: true });
  const off = parseText(T, { docId: 'or', unnamedReferents: true });
  assert.ok(has(edges(on), 'created', /creature/), 'on: the buried edge is recovered');
  assert.ok(!edges(off).some((e) => e.via === 'created' && /creature/.test(String(e.tgt))),
    'off: no object-relative edge is invented (the total read gates it)');
});
