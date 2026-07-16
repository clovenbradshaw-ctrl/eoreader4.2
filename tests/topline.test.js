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
  // A change-of-state bond carries a VERB on its via, so it reads verbally even when the controller
  // marked it kinship — never the possessive garbage "Henry Clerval is Clerval's became."
  assert.equal(phraseMechanical({ type: 'claim', relational: true, fields: { subject: 'Henry Clerval', via: 'became', object: 'Clerval', kinship: true } }), 'Henry Clerval became Clerval.');
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

// ── contextual.js — the fold-aware, model-WRITTEN definition (ungated; grounded per span) ─
import { contextualDefinition, definitionSpans } from '../src/weave/topline/index.js';

test('with no model (or nothing established) the contextual definition is the telegram, unwritten', async () => {
  const spec = { label: 'Thomas Jefferson', telegram: 'Thomas Jefferson is a philhellene.', objects: [{ text: 'Thomas Jefferson is a philhellene.' }], fold: { title: 'Jefferson and slavery', themes: ['slavery'] } };
  const out = await contextualDefinition(spec, { model: null });
  assert.equal(out.written, false);
  assert.equal(out.text, 'Thomas Jefferson is a philhellene.');
  // nothing to define from → also unwritten, even with a model
  const empty = await contextualDefinition({ label: 'X', objects: [] }, { model: { phrase: async () => 'anything' } });
  assert.equal(empty.written, false);
});

test('the writer is UNGATED — whatever the model writes is returned verbatim (the grounder judges it, not a gate)', async () => {
  const spec = {
    label: 'Thomas Jefferson',
    telegram: 'Thomas Jefferson is a philhellene, lover of Greek culture.',
    objects: [{ text: 'Thomas Jefferson is a philhellene, lover of Greek culture.' }],
    fold: { title: 'Thomas Jefferson and slavery', themes: ['slavery'] },
  };
  // even a model that reaches past the facts is NOT rejected here — spans.js flags it downstream
  const writer = { phrase: async () => 'Thomas Jefferson, born in Shadwell, was a philhellene and lover of Greek culture.' };
  const out = await contextualDefinition(spec, { model: writer });
  assert.equal(out.written, true);
  assert.match(out.text, /Shadwell/);      // returned as written; grounding happens per span later
});

test('the light prompt hands the model the fold and the established facts, and asks little else', async () => {
  let seen = null;
  const spy = { phrase: async (messages) => { seen = messages; return 'A definition.'; } };
  await contextualDefinition({
    label: 'Thomas Jefferson',
    objects: [{ text: 'Thomas Jefferson is a philhellene.' }],
    fold: { title: 'Jefferson and slavery', themes: ['slavery', 'Monticello'] },
  }, { model: spy });
  const user = seen[seen.length - 1].content;
  assert.match(user, /Define: Thomas Jefferson/);
  assert.match(user, /Jefferson and slavery/);
  assert.match(user, /philhellene/);
  // under-instructed on purpose: the system prompt carries no "do not add a name/number/date" list
  assert.doesNotMatch(seen[0].content.toLowerCase(), /do not (introduce|add)/);
});

test('definitionSpans splits a definition into the spans the grounder verdicts', () => {
  assert.deepEqual(
    definitionSpans('Thomas Jefferson was a philhellene. He admired Greek culture.'),
    ['Thomas Jefferson was a philhellene.', 'He admired Greek culture.'],
  );
  assert.deepEqual(definitionSpans('one span no terminator'), ['one span no terminator']);
  assert.deepEqual(definitionSpans(''), []);
});

test('mechanical phrasing never emits a dangling ",." when a claim value carries a trailing comma', () => {
  const s = phraseMechanical({ type: 'claim', fields: { subject: 'Thomas Jefferson', value: 'taught near Gordonsville, Virginia,' } });
  assert.ok(!s.includes(',.'), `got: ${s}`);
  assert.match(s, /Virginia\.$/);
});

// ── definer.js — the un-authored fitness that selects the chorus's best definition ─
import { definitionFitness, bestOfChorus, salience } from '../src/weave/topline/index.js';

test('fitness is coverage × salience, and self-report alone is only PROVISIONAL', () => {
  const f = definitionFitness({ text: 'Thomas Jefferson championed slavery abolition debates.', coverage: 1, fold: { title: 'Jefferson and slavery', themes: ['slavery'] } });
  assert.equal(f.anchored, false);           // no un-authored anchor present
  assert.ok(f.terms.salience > 0);           // touches the fold
  assert.equal(f.score, f.terms.coverage * f.terms.salience);
});

test('salience is the anti-Goodhart term: a perfectly-grounded but off-fold definition scores low', () => {
  const onTopic = definitionFitness({ text: 'Jefferson and slavery were deeply entangled.', coverage: 1, fold: { title: 'Jefferson and slavery', themes: ['slavery'] } });
  const offTopic = definitionFitness({ text: 'Jefferson liked macaroni and gardening.', coverage: 1, fold: { title: 'Jefferson and slavery', themes: ['slavery'] } });
  assert.ok(onTopic.score > offTopic.score, `${onTopic.score} !> ${offTopic.score}`);
  assert.equal(salience('Jefferson liked macaroni.', { themes: ['slavery'] }), 0);
});

test('an un-authored anchor (competency) makes fitness anchored and dominates — the parrot earns little', () => {
  const base = { text: 'Jefferson and slavery.', coverage: 1, fold: { themes: ['slavery'] } };
  const competent = definitionFitness({ ...base, competency: 1 });
  const parrot = definitionFitness({ ...base, competency: 0 });     // predicts nothing held-out
  assert.equal(competent.anchored, true);
  assert.ok(competent.anchors.includes('competency'));
  assert.ok(competent.score > parrot.score, 'competency separates the structural read from the parrot');
});

test('bestOfChorus picks the fittest candidate deterministically and annotates it', () => {
  const chorus = [
    { text: 'Jefferson liked gardening.', coverage: 1, fold: { themes: ['slavery'] } },      // off-fold
    { text: 'Jefferson and slavery, closely bound.', coverage: 1, fold: { themes: ['slavery'] } }, // on-fold
  ];
  const win = bestOfChorus(chorus);
  assert.match(win.text, /slavery/);
  assert.ok(win.fitness.score > 0);
  assert.equal(bestOfChorus([]), null);
});

// ── chorus.js + competency — the evolving definer, selecting on the un-authored anchor ─
import { composeChorus, definitionCompetency, mutateDefiner, defaultDefiner, shouldExplore } from '../src/weave/topline/index.js';

test('competency rewards a definition that predicts held-out mentions over the raw facts, and kills the parrot', () => {
  const seen = ['Jefferson owned enslaved people.', 'Jefferson wrote about liberty.'];
  const heldOut = ['Jefferson enslaved hundreds at Monticello.', 'His writings on liberty shaped the nation.'];
  const structural = definitionCompetency('Jefferson was a slaveholder who wrote foundational texts on liberty and the nation.', { seen, heldOut });
  const parrot = definitionCompetency('Jefferson owned enslaved people. Jefferson wrote about liberty.', { seen, heldOut });
  assert.ok(structural >= parrot, `structural ${structural} should beat/tie parrot ${parrot}`);
  assert.equal(definitionCompetency('anything', { seen, heldOut: [] }), null);   // no answer key → no anchor
});

test('the explore beat is deterministic in the run count (no RNG)', () => {
  assert.equal(shouldExplore(0), true);
  assert.equal(shouldExplore(1), false);
  assert.equal(shouldExplore(4), true);
  // a mutant differs from its parent in exactly one gene
  const parent = defaultDefiner();
  const child = mutateDefiner(parent, 0);
  const diffs = Object.keys(parent).filter((k) => parent[k] !== child[k]);
  assert.equal(diffs.length, 1);
});

test('the chorus writes candidates, selects the fittest, and promotes a challenger that wins by a margin', async () => {
  // champion writes a thin, off-fold line; the challenger (spawned on the explore beat, runs=0)
  // writes an on-fold, grounded one. The grader rewards the on-fold candidate.
  let call = 0;
  const model = { phrase: async () => (call++ === 0
    ? 'Jefferson liked gardening and macaroni.'                 // champion: off-fold
    : 'Jefferson and slavery were deeply entangled at Monticello.') };  // challenger: on-fold
  const grade = async (text) => ({
    coverage: 1,
    competency: /slavery/.test(text) ? 0.9 : 0.1,
  });
  const out = await composeChorus(
    { label: 'Thomas Jefferson', objects: [{ text: 'Jefferson owned enslaved people.' }], fold: { title: 'Jefferson and slavery', themes: ['slavery'] } },
    { model, champion: null, runs: 0, grade },
  );
  assert.equal(out.candidates.length, 2, 'champion + challenger on the explore beat');
  assert.match(out.winner.text, /slavery/);
  assert.equal(out.promoted, true, 'the fitter challenger becomes the champion');
  assert.match(out.champion.voice + out.champion.framing, /.+/);   // a concrete strategy carried forward
});

test('off an explore beat the chorus is the champion alone — one model call (the efficiency)', async () => {
  let calls = 0;
  const model = { phrase: async () => { calls++; return 'A plain definition.'; } };
  const out = await composeChorus(
    { label: 'X', objects: [{ text: 'X is a thing.' }], fold: { themes: [] } },
    { model, champion: defaultDefiner(), runs: 1, grade: async () => ({ coverage: 1, competency: 0.5 }) },
  );
  assert.equal(calls, 1);
  assert.equal(out.candidates.length, 1);
  assert.equal(out.explored, false);
});
