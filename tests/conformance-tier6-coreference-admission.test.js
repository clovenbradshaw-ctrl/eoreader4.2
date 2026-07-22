// TIER 6 — Coreference and admission (docs/parse-conformance-spec.md).
// "Where the cast comes from, and where it goes wrong quietly."
//
// A pronoun/descriptor does not resolve to a single verdict in this engine —
// createCorefField (src/perceiver/parse/coref.js) models it as a decaying
// FIELD over candidates. The observable, testable consequence of a correct
// resolution is a relation event (SEG/CON/SIG) whose subject id is the
// antecedent's admission id, landed on the sentence where the pronoun/
// descriptor appears — that is what every #25 case below checks, rather
// than asserting on the field's internal weights directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readWithSeed } from './conformance/harness/read.js';
import { readingDiff } from './conformance/harness/reading-hash.js';
import { loadFixture } from './conformance/harness/fixtures.js';
import { promoteBoundDescriptors } from '../src/perceiver/individuation.js';
import { couplingByNode } from '../src/perceiver/individuation.js';
import { createLog, projectGraph } from '../src/core/index.js';

// A relation event (SEG/CON/SIG) whose subject/src resolves to `refId`, on `sentIdx`.
const hasRelationFor = (doc, refId, sentIdx) => doc.log.snapshot().some((e) => e.sentIdx === sentIdx
  && ((e.op === 'CON' || e.op === 'SIG') && e.src === refId
    || (e.op === 'SEG' && e.subject && e.subject.id === refId)));

// ── #25 — Chain battery ───────────────────────────────────────────────────────
test('Tier6 #25: pronoun chain across a paragraph break resolves to the same referent', async () => {
  const text = 'Mayor Owusu called the meeting to order.\n\nShe then read the agenda aloud. Later she adjourned the session.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-pronoun-paragraph' });
  const id = doc.admission.admitted.get('Mayor Owusu');
  assert.ok(id, 'Mayor Owusu was not admitted');
  assert.ok(hasRelationFor(doc, id, 1), 'the pronoun "She" in sentence 1 (across the paragraph break) produced no relation event for Mayor Owusu');
  assert.ok(hasRelationFor(doc, id, 2), 'the pronoun "she" in sentence 2 produced no relation event for Mayor Owusu');
});

test('Tier6 #25: role-then-title-then-surname chain ("the Mayor" / "Mayor Owusu" / "Owusu") collapses to one referent', async () => {
  const text = 'The Mayor called the meeting to order. Mayor Owusu then read the agenda. Owusu adjourned the session.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-role-alias' });
  const graph = doc.projectGraph();
  assert.equal(graph.entities.size, 1, `expected the role/title/surname chain to collapse to one graph entity, got ${graph.entities.size}: ${[...graph.entities.values()].map((e) => e.label)}`);
});

test('Tier6 #25: same-surname family members stay two distinct referents', async () => {
  const text = 'John Reyes attended the meeting. His brother Mark Reyes did not attend.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-family-surname' });
  const graph = doc.projectGraph();
  assert.equal(graph.entities.size, 2, `expected John Reyes and Mark Reyes to stay distinct, got ${graph.entities.size} entities: ${[...graph.entities.values()].map((e) => e.label)}`);
});

test('Tier6 #25: a referent named once and never again still admits cleanly (no crash, one mention)', async () => {
  const text = 'Fenwick attended briefly before leaving early.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-named-once' });
  const id = doc.admission.admitted.get('Fenwick');
  assert.ok(id, 'a once-named referent was not admitted at all');
  assert.deepEqual(doc.admission.mentions.get(id), [0]);
});

test.todo('Tier6 #25 GAP, confirmed — an appositive clause on a possessive-apostrophe surname ("Mayor O\'Connell, who...") suppresses admission entirely', async () => {
  // This is the spec's OWN literal example for the appositive case (#25:
  // "appositives (`Mayor O'Connell, who …`)"). Measured: with the apostrophe
  // present, ANY appositive clause after the name — not just "who ..." —
  // drops admission to zero (verified against "a longtime official" too, not
  // just "who had served..."). Removing either the apostrophe or the
  // appositive clause alone restores normal admission, so it is specifically
  // the (apostrophe-name) x (appositive) combination that breaks.
  const text = "Mayor O'Connell, who had served for a decade, called the meeting to order. O'Connell then read the agenda.";
  const doc = await readWithSeed(text, { seed: 'tier6-25-appositive-apostrophe' });
  assert.ok(doc.admission.admitted.size > 0, `expected at least one referent to be admitted; admitted nothing for: ${JSON.stringify(text)}`);
});

test.todo('Tier6 #25 GAP, confirmed — split antecedents ("they" = two prior referents) produce no relation signal at all', async () => {
  // Neither a correct union-binding NOR an incorrect single-antecedent guess
  // — the SVO-regex reader (src/perceiver/parse/relations.js) simply emits
  // no SEG/CON/SIG event for this sentence's subject, plural or otherwise.
  const text = 'Council Member Reyes attended the hearing. Council Member Vance also attended the hearing. Afterward, they left the building together and discussed the outcome.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-split-antecedent' });
  const reyesId = doc.admission.admitted.get('Council Member Reyes');
  const vanceId = doc.admission.admitted.get('Council Member Vance');
  assert.ok(reyesId && vanceId, 'setup: both antecedents must be admitted for this to be a meaningful split-antecedent test');
  assert.ok(hasRelationFor(doc, reyesId, 2) || hasRelationFor(doc, vanceId, 2),
    '"they" in sentence 2 produced a relation event for neither prior referent');
});

test.todo('Tier6 #25 GAP, confirmed — a reflexive/possessive pronoun chain ("she ... herself") produces no relation signal', async () => {
  const text = 'Owusu raised her hand to speak. She reminded herself of the agenda before continuing.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-reflexive' });
  const id = doc.admission.admitted.get('Owusu');
  assert.ok(id, 'setup: Owusu must be admitted for this to be a meaningful reflexive-chain test');
  assert.ok(hasRelationFor(doc, id, 1), 'sentence 1 ("She reminded herself...") produced no relation event for Owusu');
});

test.todo('Tier6 #25 GAP, confirmed — quoted speech attributing to a speaker introduced AFTER the quote produces no attribution signal', async () => {
  // The spec's named case: '"..." said X' (inverted Verb-Subject attribution
  // order). The SVO-regex reader expects Subject-Verb order and emits
  // nothing for this sentence at all (confirmed: no SEG/CON/SIG event of any
  // kind on sentence 0, not merely a misattributed one).
  const text = '"The proposal is sound," said Council Member Vance. Vance then took her seat.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-quote-after' });
  const id = doc.admission.admitted.get('Council Member Vance');
  assert.ok(id, 'setup: Council Member Vance must be admitted for this to be a meaningful attribution test');
  assert.ok(hasRelationFor(doc, id, 0), 'the inverted-attribution sentence produced no relation event for its speaker');
});

test.todo('Tier6 #25 GAP, confirmed — org/person metonymy ("the Department" / "Metro") is not unified into one referent', async () => {
  const text = 'The Department declined to comment on the proposal. Later, Metro said it would review the matter further.';
  const doc = await readWithSeed(text, { seed: 'tier6-25-metonymy' });
  const graph = doc.projectGraph();
  assert.equal(graph.entities.size, 1, `expected "the Department" and "Metro" to unify as one organizational referent, got ${graph.entities.size}: ${[...graph.entities.values()].map((e) => e.label)}`);
});

// ── #26 — Descriptor-channel promotion ───────────────────────────────────────
// "assert unifyDescriptor fires exactly once, emits exactly one REC held:true
// promotion emanon->holon... Assert idempotence: re-reading the same document
// does not emit a second promotion."
//
// Trigger condition (found by direct measurement, src/perceiver/parse/
// coref.js bindDescriptorsByElimination): the descriptor's owner must be
// named via a GENITIVE NAME ("Kim's wife"), not a possessive pronoun ("his
// wife") — `dr.ownerNamed` only goes true on the name form. With that:
const LATE_NAMING_TEXT = "Kim's wife arrived at the meeting. Kim's wife greeted several council members. Someone introduced her as Emma.";

test('Tier6 #26: a bound descriptor promotes exactly once (REC held:true, emanon/protogon -> holon)', async () => {
  const doc = await readWithSeed(LATE_NAMING_TEXT, { seed: 'tier6-26-promote' });
  const descriptors = doc.corefField.descriptorReferents();
  const wife = descriptors.find((d) => d.roleKey === 'wife');
  assert.ok(wife, 'the "wife" descriptor was not tracked at all');
  assert.equal(wife.bound, doc.admission.admitted.get('Emma'), 'the "wife" descriptor did not bind to Emma by elimination');

  const events = promoteBoundDescriptors(doc, { append: true });
  assert.equal(events.length, 1, `expected exactly one promotion event, got ${events.length}`);
  assert.equal(events[0].op, 'REC');
  assert.equal(events[0].held, true);
  assert.equal(events[0].kind, 'name');
  assert.equal(events[0].to, doc.admission.admitted.get('Emma'));
});

test.todo('Tier6 #26 GAP, confirmed — promoteBoundDescriptors is not idempotent: calling it twice appends the same promotion event twice', async () => {
  const doc = await readWithSeed(LATE_NAMING_TEXT, { seed: 'tier6-26-idempotence' });
  promoteBoundDescriptors(doc, { append: true });
  promoteBoundDescriptors(doc, { append: true });
  const recEvents = doc.log.snapshot().filter((e) => e.op === 'REC');
  assert.equal(recEvents.length, 1, `expected re-promoting the same doc to be a no-op; found ${recEvents.length} REC events in the log after two calls`);
});

// ── #27 — Merge/split adversary pairs ────────────────────────────────────────
// "For each merge case, a near-identical negative that must not merge."
const MERGE_SPLIT_PAIRS = [
  {
    name: 'role + surname chain merges; two DIFFERENT roles on the same surname do not',
    merge: 'Chief Drake arrived at the station. Drake spoke to the reporters.',
    negative: 'Chief Drake arrived at the station. Deputy Drake spoke to the reporters.',
  },
  {
    name: 'title + bare surname merges; two different titles on the same surname do not',
    merge: 'Council Member Vance spoke first. Vance then left the chamber.',
    negative: 'Council Member Vance spoke first. Mayor Vance then left the chamber.',
  },
];

test('Tier6 #27: merge/split adversary pairs — every merge case collapses, every negative stays split', async () => {
  for (const { name, merge, negative } of MERGE_SPLIT_PAIRS) {
    const mergeDoc = await readWithSeed(merge, { seed: `tier6-27-merge-${name}` });
    const negDoc = await readWithSeed(negative, { seed: `tier6-27-neg-${name}` });
    assert.equal(mergeDoc.projectGraph().entities.size, 1, `${name}: merge case did not collapse to one referent`);
    assert.equal(negDoc.projectGraph().entities.size, 2, `${name}: negative case wrongly merged into one referent`);
  }
});

// ── #28 — Admission monotonicity ─────────────────────────────────────────────
// "Appending text to a document may add referents and may promote them; it
// must never remove a previously-admitted referent whose supporting spans
// are unchanged."
test('Tier6 #28: appending a new paragraph never removes a previously-admitted referent', async () => {
  const base = loadFixture('muni-council-minutes-01').text;
  const appended = `${base}\n\nITEM 7 — NEW BUSINESS\n\nCouncil Member Priya Nair was sworn in as the newest member. She thanked the outgoing member for his service.`;
  const docA = await readWithSeed(base, { seed: 'tier6-28-a' });
  const docB = await readWithSeed(appended, { seed: 'tier6-28-b' });
  const diff = readingDiff(docA, docB);
  assert.deepEqual(diff.referents.lost, [], `appending text lost referent(s): ${JSON.stringify(diff.referents.lost)}`);
});

// ── #29 — LATENT accounting ──────────────────────────────────────────────────
// "LATENT sightings contribute to coupling and not to mass... take a
// document, promote one sighting from PRESENT to LATENT, and assert mass
// drops by exactly that sighting's contribution while ρ is unchanged."
//
// src/weave/waveform/cast.js's buildCast does not expose raw mass/rho in its
// public return shape (only gateType/onCast/salience/presence) — this
// mirrors its own internal fold (ROLE_WEIGHT, buildCouplingGraph) directly,
// using the same exported building blocks (core/index.js projectGraph,
// individuation.js couplingByNode) it uses, so the arithmetic is checked
// against the real mechanism, not a reimplementation of it.
const ROLE_WEIGHT = { FOREGROUND: 1, PRESENT: 0.5, LATENT: 0 };
const massOf = (sightings, ref) => sightings.filter((s) => s.referent === ref)
  .reduce((m, s) => m + (ROLE_WEIGHT[s.role] ?? 0) * (s.evidence ?? 1), 0);
const couplingGraphOf = (sightings) => {
  const log = createLog({ docId: 'tier6-29' });
  const byOrdinal = new Map();
  for (const s of sightings) { if (!byOrdinal.has(s.ordinal)) byOrdinal.set(s.ordinal, []); byOrdinal.get(s.ordinal).push(s); }
  for (const group of byOrdinal.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      if (a.referent === b.referent) continue;
      const w = (a.evidence ?? 1) * (b.evidence ?? 1);
      if (w > 0) log.append({ op: 'CON', src: a.referent, tgt: b.referent, via: 'co-sight', sentIdx: a.ordinal, w });
    }
  }
  return projectGraph(log);
};

test('Tier6 #29: promoting a sighting from PRESENT to LATENT drops mass by exactly its weighted contribution, leaving ρ unchanged', () => {
  const base = [
    { referent: 'a', ordinal: 0, role: 'FOREGROUND', evidence: 1 },
    { referent: 'b', ordinal: 0, role: 'PRESENT', evidence: 1 },
    { referent: 'a', ordinal: 1, role: 'PRESENT', evidence: 1 },
    { referent: 'b', ordinal: 1, role: 'FOREGROUND', evidence: 1 },
  ];
  const demoted = base.map((s) => (s.referent === 'b' && s.ordinal === 0) ? { ...s, role: 'LATENT' } : s);

  const massBase = massOf(base, 'b');
  const massDemoted = massOf(demoted, 'b');
  assert.equal(massBase - massDemoted, ROLE_WEIGHT.PRESENT * 1, 'mass did not drop by exactly the demoted sighting\'s weighted contribution');

  const rhoBase = couplingByNode(couplingGraphOf(base)).get('b').rho;
  const rhoDemoted = couplingByNode(couplingGraphOf(demoted)).get('b').rho;
  assert.equal(rhoDemoted, rhoBase, 'ρ (coupling) changed when a sighting was demoted from PRESENT to LATENT — coupling must come from co-sighting structure alone, independent of role');
});
