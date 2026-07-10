import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseText } from '../src/perceiver/parse/index.js';
import {
  readCommission, describeBrief,
  extractStyleTemplate, styleVectorOf, styleDistance, blendTemplates, describeTemplate,
  arcOf, surfaceOf, PHASE_OPS,
  targetStyleVector, chooseInspiration, rankCandidates, nameAnchor, qualityPrior, scoreByStructure,
  huntQueries, libraryKindsFor, huntCandidates, fetchExemplar, STYLE_ROLE,
  shapeOptions, styleGuidance, draftPlan, describePlan,
  openCommission, confirmCommission, advanceCommission, nextResponseOptions,
  serializeCommission, resumeCommission,
} from '../src/weave/commission/index.js';
import { MOVE_ALPHABET } from '../src/perceiver/predict/index.js';
import { predictDirection } from '../src/weave/longgen/index.js';
import { gutenbergBookUrl, gutenbergTextUrl } from '../src/organs/ingest/gutenberg.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = readFileSync(path.join(ROOT, 'data/metamorphosis.txt'), 'utf8');

// ── brief.js — reading the ask apart ─────────────────────────────────────────

test('brief: "in the style of X" is peeled into an exemplar', () => {
  const b = readCommission('write me an essay in the style of Montaigne');
  assert.equal(b.wantsCommission, true);
  assert.equal(b.deliverable, 'essay');
  assert.ok(b.exemplar, 'an exemplar was found');
  assert.equal(b.exemplar.name, 'Montaigne');
  assert.equal(b.exemplar.kind, 'author');
  assert.equal(b.wantsStyle, true);
  assert.equal(b.longform, true);
});

test('brief: topic and style are separated', () => {
  const b = readCommission('compose an essay about grief in the style of Joan Didion');
  assert.equal(b.deliverable, 'essay');
  assert.equal(b.topic, 'grief');
  assert.equal(b.exemplar.name, 'Joan Didion');
});

test('brief: other imitation cues are caught', () => {
  assert.equal(readCommission('draft a short story à la Borges').exemplar.name, 'Borges');
  assert.equal(readCommission('write something in the manner of Sir Thomas Browne').exemplar.name, 'Sir Thomas Browne');
  assert.equal(readCommission("a poem in Dickinson's voice").exemplar.name, 'Dickinson');
});

test('brief: a scholarly commission routes to the academic register', () => {
  const b = readCommission('write me a literature review of research on sleep and memory');
  assert.equal(b.register, 'scholarly');
  assert.equal(b.longform, true);
});

test('brief: a plain question is not a commission', () => {
  const b = readCommission('what is the capital of France?');
  assert.equal(b.wantsCommission, false);
  assert.equal(b.exemplar, null);
});

test('brief: an unspecified-inspiration commission is still a commission', () => {
  const b = readCommission('write me an essay on the ethics of attention');
  assert.equal(b.wantsCommission, true);
  assert.equal(b.exemplar, null);            // inspiration to be chosen by the selector
  assert.equal(b.topic, 'the ethics of attention');
  assert.match(describeBrief(b), /inspiration to be chosen/);
});

// ── template.js — the EOT structure ──────────────────────────────────────────

test('template: an exemplar reading yields a well-formed StyleTemplate', () => {
  const doc = parseText(fixture, { docId: 'meta' });
  const t = extractStyleTemplate(doc, { name: 'Kafka', title: 'The Metamorphosis', source: 'gutenberg' });

  assert.equal(t.kind, 'eo-style-template');
  // grammar: a bigram over the ten-symbol move alphabet
  assert.deepEqual(t.grammar.alphabet, MOVE_ALPHABET);
  const marginalSum = MOVE_ALPHABET.reduce((s, op) => s + t.grammar.marginal[op], 0);
  assert.ok(Math.abs(marginalSum - 1) < 1e-3, 'marginal is a distribution');
  for (const prev of MOVE_ALPHABET) {
    const rowSum = MOVE_ALPHABET.reduce((s, op) => s + t.grammar.trans[prev][op], 0);
    assert.ok(Math.abs(rowSum - 1) < 1e-3, `trans row ${prev} is a distribution`);
  }
  // fingerprint mirrors the marginal
  assert.ok(Math.abs(t.fingerprint.EVA - t.grammar.marginal.EVA) < 1e-3);
  // arc: a phase schedule
  assert.equal(t.arc.bins, 3);
  assert.equal(t.arc.phases.length, 3);
  for (const p of t.arc.phases) assert.ok(Object.keys(PHASE_OPS).includes(p));
  // surface: sane, bounded signatures
  assert.ok(t.surface.meanWords > 0);
  for (const k of ['quotationRate', 'firstPersonRate', 'digressionRate', 'lexicalDiversity']) {
    assert.ok(t.surface[k] >= 0 && t.surface[k] <= 1, `${k} in [0,1]`);
  }
  assert.equal(t.exemplar.name, 'Kafka');
  assert.equal(t.exemplar.source, 'gutenberg');
  assert.ok(t.provenance.movesRead > 0);
  assert.match(describeTemplate(t), /Kafka/);
});

test('template: styleVector is unit-norm and self-distance is zero', () => {
  const doc = parseText(fixture, { docId: 'meta2' });
  const t = extractStyleTemplate(doc, { name: 'Kafka' });
  const v = styleVectorOf(t);
  assert.equal(v.length, MOVE_ALPHABET.length + 8);
  const norm = Math.hypot(...v);
  assert.ok(Math.abs(norm - 1) < 1e-3, 'unit-norm');
  assert.ok(styleDistance(t, t) < 1e-4, 'a template is at distance ~0 from itself');
});

test('template: two different forms sit at a positive structural distance', () => {
  const doc = parseText(fixture, { docId: 'meta3' });
  const kafka = extractStyleTemplate(doc, { name: 'Kafka' });
  // a synthetic first-person, question-laden, clipped voice — a different region of shape-space
  const chatty = parseText(
    'Do you see it? I do. I think so. Why not? I ask myself. We wonder. I feel it now. '
    + 'Is that right? I hope so. We try. I know. Do we? I will. We shall. I must. Why? I care.',
    { docId: 'chatty' });
  const other = extractStyleTemplate(chatty, { name: 'chatter' });
  assert.ok(styleDistance(kafka, other) > 0.02, 'distinct forms are distinguishable');
});

test('template: blend fuses two exemplars into one grammar', () => {
  const a = extractStyleTemplate(parseText(fixture, { docId: 'a' }), { name: 'A' });
  const b = extractStyleTemplate(parseText(fixture.slice(0, fixture.length >> 1), { docId: 'b' }), { name: 'B' });
  const blend = blendTemplates([a, b]);
  assert.equal(blend.exemplar.blendedFrom, 2);
  const sum = MOVE_ALPHABET.reduce((s, op) => s + blend.grammar.marginal[op], 0);
  assert.ok(Math.abs(sum - 1) < 1e-2, 'blended marginal stays a distribution');
});

test('template: arcOf and surfaceOf are usable stand-alone', () => {
  const s = surfaceOf(['I wonder, greatly, at this.', 'The house—old, vast—stood still.']);
  assert.ok(s.digressionRate > 0);
  const arc = arcOf([{ op: 'INS', register: 'content', cursor: 0 }, { op: 'EVA', register: 'content', cursor: 9 }],
    { INS: 0.5, EVA: 0.5 }, { bins: 2 });
  assert.equal(arc.schedule.length, 2);
});

// ── inspire.js — deciding what would be a good inspiration ────────────────────

test('inspire: the target shape differs by deliverable', () => {
  const essay = targetStyleVector({ deliverable: 'essay' });
  const review = targetStyleVector({ deliverable: 'review' });
  assert.equal(essay.length, review.length);
  assert.ok(styleDistance(essay, review) > 0.02, 'an essay and a review sit in different regions');
});

test('inspire: a named exemplar anchors the ranking', async () => {
  const brief = readCommission('write me an essay in the style of Montaigne');
  const candidates = [
    { title: 'A Treatise on Something Else', text: 'unrelated', source: 'gutenberg' },
    { title: 'Essays — Michel de Montaigne', text: 'the essays', source: 'gutenberg' },
    { title: 'Attention paper', text: 'ml', source: 'openalex', citedBy: 9000 },
  ];
  const ranked = await rankCandidates(candidates, brief);
  assert.match(ranked[0].item.title, /Montaigne/, 'the named author wins');
  assert.ok(ranked[0].terms.anchor >= 0.7);
});

test('inspire: nameAnchor reads full name and surname', () => {
  assert.equal(nameAnchor({ title: 'Essays — Michel de Montaigne' }, { name: 'Montaigne' }), 1);
  assert.equal(nameAnchor({ title: 'The White Album', authors: ['Joan Didion'] }, { name: 'Joan Didion' }), 1);
  assert.ok(nameAnchor({ title: 'Selected Essays of Bacon' }, { name: 'Francis Bacon' }) >= 0.7);
  assert.equal(nameAnchor({ title: 'Nothing' }, { name: 'Montaigne' }), 0);
});

test('inspire: quality prior rises with citations and canon', () => {
  assert.ok(qualityPrior({ source: 'openalex', citedBy: 20000 }) > qualityPrior({ source: 'openalex', citedBy: 3 }));
  assert.ok(qualityPrior({ source: 'gutenberg' }) > 0.5);
});

test('inspire: policy governs whether the pick is committed', async () => {
  const brief = readCommission('write me an essay on attention');
  const cands = [{ title: 'Essays', text: 'attention and focus', source: 'gutenberg' }];
  const proposed = await chooseInspiration(cands, brief, { policy: 'propose' });
  assert.equal(proposed.committed, false);
  assert.equal(proposed.recommended.length, 1);
  const auto = await chooseInspiration(cands, brief, { policy: 'auto' });
  assert.equal(auto.committed, true);
});

test('inspire: an unnamed literary commission can propose a blend', async () => {
  const brief = readCommission('write me an essay on solitude');
  const cands = [
    { title: 'Essays of Montaigne', text: 'solitude and the self', source: 'gutenberg' },
    { title: 'Essays of Emerson', text: 'solitude and society', source: 'gutenberg' },
  ];
  const choice = await chooseInspiration(cands, brief, { policy: 'propose' });
  assert.equal(choice.blend, true);
  assert.equal(choice.recommended.length, 2);
});

test('inspire: scoreByStructure rewards the matching form', () => {
  const doc = parseText(fixture, { docId: 'struct' });
  const t = extractStyleTemplate(doc, { name: 'Kafka' });
  const s = scoreByStructure(t, { deliverable: 'story' });
  assert.ok(s >= 0 && s <= 1);
});

// ── hunt.js — reaching the libraries ─────────────────────────────────────────

test('hunt: the shelves are chosen by register', () => {
  assert.deepEqual(libraryKindsFor({ deliverable: 'essay' }), ['gutenberg']);
  assert.deepEqual(libraryKindsFor({ deliverable: 'review' }), ['openalex', 'arxiv']);
  assert.deepEqual(libraryKindsFor({ register: 'scholarly' }), ['openalex', 'arxiv']);
  assert.deepEqual(libraryKindsFor({}), ['gutenberg', 'openalex']);
});

test('hunt: a named exemplar becomes a Gutenberg query', () => {
  const q = huntQueries(readCommission('write me an essay in the style of Montaigne'));
  assert.equal(q.gutenberg, 'Montaigne essays');
});

test('hunt: candidates aggregate across shelves, one failing is survived', async () => {
  const brief = readCommission('write me a literature review of sleep and memory research');
  const search = async (q, kind) => {
    if (kind === 'arxiv') throw new Error('arxiv down');
    return [{ title: `${kind} hit`, text: 'sleep', source: kind }];
  };
  const items = await huntCandidates(brief, { search, k: 4 });
  assert.ok(items.some((it) => it.source === 'openalex'));
  assert.ok(!items.some((it) => it.source === 'arxiv'));   // the failed shelf is simply absent
});

test('hunt: fetchExemplar admits a whole Gutenberg book, role-tagged', async () => {
  const BOOK = 'Title: Essays\nAuthor: Montaigne\n\n*** START OF THE PROJECT GUTENBERG EBOOK ESSAYS ***\n'
    + 'Of the education of children. I have never seen a greater monster than myself. '
    + 'We are all patchwork. The soul discharges her passions upon false objects. *** END OF THE PROJECT GUTENBERG EBOOK ESSAYS ***';
  const client = { fetchUrl: async () => ({ text: BOOK, ok: true, status: 200 }) };
  const got = await fetchExemplar({ source: 'gutenberg', url: gutenbergBookUrl(3600) }, { client });
  assert.ok(got, 'a source was admitted');
  assert.equal(got.role, STYLE_ROLE);
  assert.ok(got.doc.sentences.length > 0);
  // and its EOT structure can be read straight off the admitted doc
  const t = extractStyleTemplate(got.doc, { name: 'Montaigne', source: 'gutenberg' });
  assert.equal(t.grammar.alphabet.length, MOVE_ALPHABET.length);
});

// ── shape.js — the exemplar grammar bends the move draw ──────────────────────

test('shape: shapeOptions carries the grammar and leans on it', () => {
  const t = extractStyleTemplate(parseText(fixture, { docId: 'shp' }), { name: 'Kafka' });
  const opts = shapeOptions(t, {});
  assert.equal(opts.grammar, t.grammar);
  assert.ok(opts.weights.grammar > 1, 'the borrowed form is felt');
  assert.equal(opts.arc, true);
  assert.equal(shapeOptions(null, { a: 1 }).a, 1);      // no template → passthrough
});

test('shape: styleGuidance names the exemplar and its voice', () => {
  const chatty = parseText('I wonder, and I wander. I ask, do you see? I feel it, I do. '
    + 'I turn it over, I. We wonder. I muse; I digress (often).', { docId: 'g1' });
  const t = extractStyleTemplate(chatty, { name: 'Montaigne' });
  const g = styleGuidance(t, { deliverable: 'essay' });
  assert.match(g, /manner of Montaigne/);
  assert.match(g, /essay/);
});

test('shape: an exemplar grammar actually changes the predicted direction', () => {
  const units = [{ move: 'DEF', boundFraction: 1 }, { move: 'CON', boundFraction: 1 }];
  const forced = { alphabet: MOVE_ALPHABET, marginal: Object.fromEntries(MOVE_ALPHABET.map((o) => [o, 0.1])),
    trans: { CON: Object.fromEntries(MOVE_ALPHABET.map((o) => [o, o === 'SYN' ? 0.9 : 0.0111])) } };
  const withGrammar = predictDirection(units, { grammar: forced });
  const without = predictDirection(units, {});
  const p = (post, op) => (post.find(([o]) => o === op) || [, 0])[1];
  assert.ok(p(withGrammar.posterior, 'SYN') > p(without.posterior, 'SYN'),
    'the exemplar transition CON→SYN lifts SYN in the draw');
});

// ── plan.js — the drafted multi-response plan ────────────────────────────────

test('plan: a longform essay is planned across responses, arced', () => {
  const brief = readCommission('write me an essay in the style of Montaigne');
  const t = extractStyleTemplate(parseText(fixture, { docId: 'pl' }), { name: 'Montaigne', source: 'gutenberg' });
  const plan = draftPlan(brief, t);
  assert.equal(plan.kind, 'commission-plan');
  assert.ok(plan.sections.length >= 3);
  assert.ok(plan.responses >= 2 && plan.responses <= 3, 'a longform piece spans multiple responses');
  const mapped = plan.map.flat().sort((a, b) => a - b);
  assert.deepEqual(mapped, plan.sections.map((s) => s.id), 'every section lands in some response');
  assert.equal(plan.arc[0], 'open');
  assert.equal(plan.arc[plan.arc.length - 1], 'close');
  assert.match(describePlan(plan), /Montaigne/);
});

test('plan: an unread inspiration is marked pending', () => {
  const plan = draftPlan(readCommission('write me an essay on time'), null);
  assert.equal(plan.inspirationPending, true);
  assert.match(describePlan(plan), /Inspiration still to be chosen/);
});

// ── commission.js — the whole arc, run offline ───────────────────────────────

const MONTAIGNE_BOOK = 'Title: Essays\nAuthor: Michel de Montaigne\n\n'
  + '*** START OF THE PROJECT GUTENBERG EBOOK ESSAYS ***\n'
  + 'Of the education of children. I have never seen a greater monster than myself. '
  + 'We are all patchwork, and so shapeless and diverse a contexture. The soul discharges '
  + 'her passions upon false objects where the true are wanting. I speak truth, not so much '
  + 'as I would, but as much as I dare. Every man carries the entire form of the human condition. '
  + '*** END OF THE PROJECT GUTENBERG EBOOK ESSAYS ***';

const fakeMontaigneSearch = async (q, kind) => (kind === 'gutenberg'
  ? [{ title: 'Essays — Michel de Montaigne', text: 'the complete essays', source: 'gutenberg', url: gutenbergBookUrl(3600), gutenbergId: 3600 }]
  : []);
const fakeClient = { fetchUrl: async (u) => ({ text: u === gutenbergTextUrl(3600) ? MONTAIGNE_BOOK : '', ok: true, status: 200 }) };

test('commission: open reads the ask, hunts Gutenberg, reads the work, drafts the plan', async () => {
  const c = await openCommission('write me an essay in the style of Montaigne', {
    client: fakeClient, search: fakeMontaigneSearch, policy: 'auto',
  });
  assert.ok(c, 'a commission opened');
  assert.equal(c.brief.exemplar.name, 'Montaigne');
  assert.equal(c.exemplars.length, 1);
  assert.equal(c.exemplars[0].role, STYLE_ROLE);
  assert.equal(c.exemplars[0].source, 'gutenberg');
  assert.ok(c.template, 'the EOT structure was taken');
  assert.equal(c.template.grammar.alphabet.length, MOVE_ALPHABET.length);
  assert.match(c.shape.guidance, /manner of Montaigne/);
  assert.ok(c.plan.sections.length >= 3);
  assert.equal(c.committed, true);
});

test('commission: not a commission → null', async () => {
  assert.equal(await openCommission('what is the capital of France?', { client: fakeClient }), null);
});

test('commission: propose policy waits, confirm commits', async () => {
  const c = await openCommission('write me an essay in the style of Montaigne', {
    client: fakeClient, search: fakeMontaigneSearch, policy: 'propose',
  });
  assert.equal(c.committed, false);
  assert.equal(confirmCommission(c).committed, true);
});

test('commission: serialize/resume preserves the form across a reload', async () => {
  const c = await openCommission('write me an essay in the style of Montaigne', {
    client: fakeClient, search: fakeMontaigneSearch, policy: 'auto',
  });
  const round = resumeCommission(JSON.parse(JSON.stringify(serializeCommission(c))));
  assert.equal(round.template.grammar.marginal.EVA, c.template.grammar.marginal.EVA);
  assert.match(round.shape.guidance, /Montaigne/);
  // and the shaped options still carry the grammar for the next response
  const { options } = nextResponseOptions(round);
  assert.equal(options.grammar.alphabet.length, MOVE_ALPHABET.length);
});

test('commission: advances across responses', async () => {
  const c = await openCommission('write me an essay in the style of Montaigne', {
    client: fakeClient, search: fakeMontaigneSearch, policy: 'auto',
  });
  const next = advanceCommission(c, { units: [{ move: 'DEF' }] });
  assert.equal(next.state.responsesDone, 1);
});
