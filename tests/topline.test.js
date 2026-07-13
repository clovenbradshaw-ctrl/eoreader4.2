import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  containedIn, contentTokens, addedBy,
  buildInventory, entityInventory, sourceInventory,
  phraseMechanical, phraseObject,
  joinTopline, telegram,
  interpretFeedback, mergeSteer, applySteer,
  generateTopline,
} from '../src/weave/topline/index.js';

// The topline is an ordering and a phrasing of a CLOSED set of objects the machinery decided. The
// safety lives in one place: pass two may lose information, never add it. These tests pin that.

// ── contain.js — the safety gate ─────────────────────────────────────────────
test('the join may add connectives but never content, numbers, negation, or hedges', () => {
  const input = 'Gregor is a travelling salesman. Gregor appears in 7 passages.';
  // pure re-arrangement with added connectives — accepted
  assert.equal(containedIn('A travelling salesman, Gregor appears in 7 passages.', input), true);
  // a new proper noun — rejected
  assert.equal(containedIn('Gregor, a salesman from Prague, appears in 7 passages.', input), false);
  // a new number — rejected
  assert.equal(containedIn('Gregor appears in 8 passages.', input), false);
  // a flipped polarity — "not" is content, never a free connective — rejected
  assert.equal(containedIn('Gregor is not a travelling salesman.', input), false);
  // a new hedge that implies a source — rejected
  assert.equal(containedIn('Gregor is reportedly a travelling salesman.', input), false);
});

test('comma-grouped numbers are one number, and fabricated figures are caught', () => {
  const input = 'The source is 12,500 bytes.';
  assert.equal(containedIn('The source is 12,500 bytes.', input), true);
  assert.equal(containedIn('The source is 12500 bytes.', input), true);         // normalised equal
  assert.equal(containedIn('The source is 13,000 bytes.', input), false);
  assert.deepEqual(addedBy('The source is 99 bytes.', input).numbers, ['99']);
});

test('contentTokens drops connectives but keeps negation and hedges as content', () => {
  const t = contentTokens('it is not the reported salesman');
  assert.ok(!t.includes('it') && !t.includes('is') && !t.includes('the'));   // connectives gone
  assert.ok(t.includes('not') && t.includes('reported') && t.includes('salesman'));  // content kept
});

// ── inventory.js — the closed, ordered set ───────────────────────────────────
test('a plain inventory orders witnessed claims before merely-stated ones', () => {
  const inv = buildInventory({
    subject: 'Gregor',
    claims: [
      { subject: 'Gregor', value: 'a son', cite: [2], count: 1 },                 // stated (one witness)
      { subject: 'Gregor', value: 'a travelling salesman', cite: [1, 5], count: 2 }, // witnessed
    ],
  });
  assert.equal(inv.kind, 'plain');
  assert.equal(inv.objects[0].standing, 'witnessed');
  assert.equal(inv.objects[0].fields.value, 'a travelling salesman');
  assert.equal(inv.objects[1].standing, 'stated');
});

test('a denial-pair makes the kind a contradiction, ordered assert → contest → part', () => {
  const inv = buildInventory({
    subject: 'the clerk',
    claims: [
      { subject: 'the clerk', value: 'present', cite: [3], polarity: '+' },
      { subject: 'the clerk', value: 'present', cite: [9], polarity: '−' },
    ],
  });
  assert.equal(inv.kind, 'contradiction');
  assert.deepEqual(inv.objects.map((o) => o.type), ['claim', 'claim', 'part']);
  assert.equal(inv.objects[0].standing, 'asserted');
  assert.equal(inv.objects[1].standing, 'contested');
});

test('an empty field is an absence — the negative and where it looked, not a fabrication', () => {
  const inv = buildInventory({ subject: 'Grete', claims: [], relations: [], facts: [], gap: { term: 'Grete', cite: [4], scanned: { n: 12, noun: 'passages' } } });
  assert.equal(inv.kind, 'absence');
  assert.equal(inv.objects.length, 1);
  assert.equal(inv.objects[0].type, 'gap');
});

test('at most one inference, and a footing-pulled claim collapses to a single "moved" object', () => {
  const inv = buildInventory({
    subject: 'X',
    claims: [
      { subject: 'X', value: 'a captain', cite: [1], count: 2 },
      { subject: 'X', value: 'a traitor', cite: [2], unsettled: true },   // footing pulled
    ],
    figures: [{ label: 'X', count: 5 }],
    allowInference: true,
  });
  const moved = inv.objects.filter((o) => o.type === 'moved');
  const infer = inv.objects.filter((o) => o.type === 'inference');
  assert.equal(moved.length, 1, 'one moved object, never the claim it moved under');
  assert.ok(infer.length <= 1, 'at most one inference');
  assert.ok(!inv.objects.some((o) => o.fields?.value === 'a traitor'), 'the pulled claim is never phrased');
});

// ── phrase.js — pass one ─────────────────────────────────────────────────────
test('mechanical phrasing reads each object type as a clean telegram sentence', () => {
  assert.equal(phraseMechanical({ type: 'claim', fields: { subject: 'gregor', value: 'a travelling salesman' } }), 'Gregor is a travelling salesman.');
  assert.equal(phraseMechanical({ type: 'claim', fields: { subject: 'gregor', value: 'the clerk', polarity: '−' } }), 'Gregor is not the clerk.');
  assert.equal(phraseMechanical({ type: 'claim', relational: true, fields: { subject: 'Grete', via: 'sister', object: 'Gregor', kinship: true } }), "Grete is Gregor's sister.");
  assert.equal(phraseMechanical({ type: 'fact', fields: { kind: 'count', verb: 'appears in', n: 7, noun: 'passages' } }), 'Appears in 7 passages.');
  assert.equal(phraseMechanical({ type: 'fact', fields: { kind: 'value', verb: 'dated', value: '1912' } }), 'Dated 1912.');
});

test('a model pass-one that adds a word falls back to the mechanical sentence', async () => {
  const fabricator = { phrase: async () => 'Gregor, a salesman from Prague, works hard.' };
  const obj = { type: 'claim', key: 'claim:0', cite: [1], fields: { subject: 'gregor', value: 'a travelling salesman' } };
  const r = await phraseObject(obj, { model: fabricator });
  assert.equal(r.fluent, false);
  assert.equal(r.text, 'Gregor is a travelling salesman.');
});

// ── join.js — pass two ───────────────────────────────────────────────────────
test('one object is one sentence and stops — no model, no join', async () => {
  const r = await joinTopline([{ text: 'Gregor is a travelling salesman.' }], { model: { phrase: async () => 'anything' } });
  assert.equal(r.joined, false);
  assert.equal(r.text, 'Gregor is a travelling salesman.');
});

test('a fabricating join is rejected and the telegram ships; a clean join is kept', async () => {
  const sentences = [{ text: 'Gregor is a travelling salesman.' }, { text: 'Gregor appears in 7 passages.' }];
  const fabricator = { phrase: async () => 'Gregor, a salesman from Prague, appears in 7 passages.' };
  const rejected = await joinTopline(sentences, { model: fabricator });
  assert.equal(rejected.joined, false);
  assert.equal(rejected.text, telegram(sentences));
  assert.ok(rejected.rejected.words.includes('prague'));

  const joiner = { phrase: async () => 'A travelling salesman, Gregor appears in 7 passages.' };
  const kept = await joinTopline(sentences, { model: joiner });
  assert.equal(kept.joined, true);
  assert.equal(kept.text, 'A travelling salesman, Gregor appears in 7 passages.');
});

// ── feedback.js — steering the closed set ────────────────────────────────────
test('"shorter" caps the count; "focus on X" pins X; a request outside the record is unmet', () => {
  assert.equal(interpretFeedback('make it shorter').cap, 2);
  assert.equal(interpretFeedback('one sentence please').cap, 1);
  assert.deepEqual(interpretFeedback('focus on the salesman').pin, ['salesman']);

  const inv = buildInventory({ subject: 'Gregor', claims: [
    { subject: 'Gregor', value: 'a travelling salesman', cite: [1], count: 2 },
    { subject: 'Gregor', value: 'a son', cite: [2], count: 1 },
  ] });
  const { inventory, unmet } = applySteer(inv, mergeSteer(null, interpretFeedback('focus on napoleon')));
  assert.deepEqual(unmet, ['napoleon'], 'the record never named Napoleon — reported, not invented');
  assert.equal(inventory.objects.length, 2, 'nothing was added');
});

test('suppressing a claim removes exactly that object, never the others', () => {
  const inv = buildInventory({ subject: 'Gregor', claims: [
    { subject: 'Gregor', value: 'a travelling salesman', cite: [1], count: 2 },
    { subject: 'Gregor', value: 'a son', cite: [2], count: 1 },
  ] });
  const { inventory } = applySteer(inv, mergeSteer(null, interpretFeedback('wrong, remove salesman')));
  assert.ok(!inventory.objects.some((o) => /salesman/.test(o.fields?.value || '')));
  assert.ok(inventory.objects.some((o) => /son/.test(o.fields?.value || '')));
});

// ── adapt.js + topline.js — end to end ───────────────────────────────────────
const ENTITY_PROFILE = {
  label: 'Gregor', docId: 'doc-1', sn: 'S1', sourceTitle: 'Metamorphosis',
  defs: [
    { value: 'a travelling salesman', idx: 1, count: 2, confidence: 0.9, polarity: '+', modality: 'realis', witnesses: [{ idx: 1 }, { idx: 5 }] },
    { value: 'the son of the family', idx: 2, count: 1, confidence: 0.7, polarity: '+', modality: 'realis', witnesses: [{ idx: 2 }] },
  ],
  relations: [{ srcId: 'grete', srcLabel: 'Grete', tgtId: 'gregor', tgtLabel: 'Gregor', via: 'sister', op: 'CON', idx: 3, type: 'sibling', polarity: '+' }],
  figures: [{ entId: 'gregor', label: 'Gregor', count: 9 }, { entId: 'grete', label: 'Grete', count: 4 }],
  mentions: [{ idx: 1, text: 'a' }, { idx: 2, text: 'b' }, { idx: 5, text: 'c' }],
};

test('an entity profile becomes a topline whose every word traces to the objects', async () => {
  const inv = entityInventory(ENTITY_PROFILE, { mentionCount: 9 });
  assert.equal(inv.kind, 'plain');
  const top = await generateTopline({ inventory: inv });   // no model → the deterministic telegram
  assert.match(top.text, /travelling salesman/);
  assert.match(top.text, /9 passages/);
  assert.deepEqual(top.cites.includes(1), true);
  // every content word of the telegram traces back to the pass-one objects (self-containment)
  assert.equal(containedIn(top.text, top.objects.map((o) => o.text).join(' ')), true);
});

test('with a well-behaved model the topline joins; the join still adds nothing', async () => {
  const inv = entityInventory(ENTITY_PROFILE, { mentionCount: 9 });
  // a joiner that only reorders + connects, staying inside the input vocabulary
  const joiner = { phrase: async (messages) => {
    const body = messages[messages.length - 1].content;
    const lines = body.split('\n').map((l) => l.replace(/^\d+\.\s*/, '').replace(/[.]$/, '')).filter(Boolean);
    return lines.join(', ') + '.';
  } };
  const top = await generateTopline({ inventory: inv, model: joiner });
  assert.equal(top.joined, true);
  assert.equal(containedIn(top.text, top.telegram), true, 'the joined prose adds nothing over the telegram');
});

test('a source reading becomes a topline with one marked inference at most', async () => {
  const reading = {
    title: 'Metamorphosis', sn: 'S1',
    metadata: { author: 'Kafka', date: '1915' },
    claims: [{ subject: 'Gregor', value: 'a travelling salesman', cite: [1], count: 2 }],
    relations: [{ subject: 'Grete', via: 'sister', object: 'Gregor', cite: [3], kinship: true }],
    figures: [{ label: 'Gregor', count: 9 }, { label: 'Grete', count: 4 }],
    counts: { entities: 5, propositions: 40, sentences: 12, bytes: 2000 },
  };
  const inv = sourceInventory(reading);
  const infer = inv.objects.filter((o) => o.type === 'inference');
  assert.ok(infer.length <= 1);
  const top = await generateTopline({ inventory: inv });
  assert.match(top.text, /Kafka/);
  assert.match(top.text, /1915/);
});
