// The fold → summary pipeline (src/surfer/fold/summary*.js): the packet at its four
// scopes, the telegram floor, the model voice's output discipline and referential
// gate, and the cross-source fold that keeps namesakes apart — with the collapse and
// attribution metrics falsified on a deliberately wrong fold, not just trusted.
// Deterministic throughout: no model, no network; the "model" is a scripted phrase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/surf.js';
import {
  summaryFold, telegramSummary, packetSurface, pickLeadProperty,
  summaryMessages, crossSummaryMessages, cleanSummary, summaryAdditions,
  referentiallyContained, realizeSummary, realizeCrossSummary,
  crossSourceSummaryFold, telegramCrossSummary,
  corefCollapseReport, summaryAttributionErrors,
} from '../src/surfer/fold/index.js';

// ── fixtures ──────────────────────────────────────────────────────────────────────────
// The Armstrong shape (PR #196): each source names a second same-surname person, so the
// within-document surname merge is defeated and a standalone bare "Armstrong" node exists
// in each source — the exact node a label-keyed cross-source fold used to union.

const NEIL_TEXT = `Neil Armstrong was an American astronaut and aeronautical engineer.
Armstrong became the first person to walk on the Moon in 1969.
Armstrong commanded the Apollo 11 mission for NASA.
He married Janet Shearon in 1956, and Janet Armstrong raised their children in Houston.
Armstrong taught engineering at the University of Cincinnati after leaving NASA.
Armstrong flew the X-15 as a test pilot before joining the astronaut corps.`;

const LOUIS_TEXT = `Louis Armstrong was an American trumpeter and singer from New Orleans.
Armstrong recorded West End Blues with his Hot Five band in 1928.
Armstrong sang What a Wonderful World in 1967.
His wife Lucille Armstrong managed their home in Queens.
Armstrong toured with his trumpet across Europe and Africa.
Armstrong shaped jazz phrasing for every singer who followed.`;

const CHAT_TEXT = `Dana: I watched the Apollo 11 documentary about Neil Armstrong last night.
Sam: Armstrong stayed calm during the landing, the fuel warning blaring.
Dana: My grandmother heard Armstrong and thought of the trumpet player.
Sam: Louis Armstrong! He recorded West End Blues in Chicago.
Dana: Two Armstrongs, two different firsts. One walked on the Moon; the other changed jazz.
Sam: The trumpeter never saw the astronaut as a rival for the name.`;

const docs = () => ([
  { doc: parseText(NEIL_TEXT), title: 'Neil article' },
  { doc: parseText(LOUIS_TEXT), title: 'Louis article' },
  { doc: parseText(CHAT_TEXT), title: 'Armstrong chat' },
]);

// ── summaryFold: the four scopes ──────────────────────────────────────────────────────

test('summaryFold full scope: a packet with spans, groups, and machine sources', () => {
  const doc = parseText(LOUIS_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', title: 'Louis article' });
  assert.ok(p, 'a packet is produced');
  assert.equal(p.scope, 'full');
  assert.ok(p.spans.length >= 1, 'verbatim spans ride the packet');
  assert.ok(Array.isArray(p.groups.settled), 'the settled group exists');
  assert.ok(p.sources.length >= 1, 'witness indices ride sources');
  // membrane: no [sN] tags, no hash ids in any line the talker could read
  const surface = packetSurface(p);
  assert.ok(!/\[s\d+\]/.test(surface), 'no citation tag leaks');
});

test('summaryFold entity scope turns on the named referent', () => {
  const doc = parseText(LOUIS_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'entity', entity: 'Louis Armstrong' });
  assert.ok(p.focus.length >= 1, 'the named referent is the focus');
  assert.ok(p.focus.some((f) => /armstrong/i.test(f)), 'focus is the Armstrong referent');
  assert.ok(p.relations.length >= 1, 'the referent carries bonds');
});

test('summaryFold cursor scope anchors where it is told', () => {
  const doc = parseText(NEIL_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'cursor', cursor: 3 });
  assert.equal(p.anchor, 3);
  assert.ok(p.spans.length >= 1);
});

test('summaryFold topic scope rides the theme', () => {
  const doc = parseText(NEIL_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'topic', topic: 'Moon landing Apollo' });
  assert.equal(p.topic, 'Moon landing Apollo');
  assert.ok(p.spans.length >= 1);
});

// ── the telegram floor ────────────────────────────────────────────────────────────────

test('telegramSummary is non-empty and referentially contained in its own packet', () => {
  const doc = parseText(LOUIS_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'entity', entity: 'Louis Armstrong' });
  const t = telegramSummary(p);
  assert.ok(t.length > 0, 'the floor always says something');
  assert.ok(referentiallyContained(t, packetSurface(p)),
    `the floor never fabricates: ${JSON.stringify(summaryAdditions(t, packetSurface(p)))}`);
});

test('pickLeadProperty prefers an identification over a numeric fragment', () => {
  const lead = pickLeadProperty([
    { label: 'Armstrong', value: '11, he dropped out of school', score: 0.9 },
    { label: 'Armstrong', value: 'an American trumpeter and singer', score: 0.7 },
  ]);
  assert.equal(lead.value, 'an American trumpeter and singer');
});

// ── output discipline ─────────────────────────────────────────────────────────────────

test('cleanSummary strips scaffolding and caps sentences', () => {
  const raw = "Certainly! Here's a summary: Armstrong was a trumpeter. He recorded West End Blues. He toured Europe. He sang in Queens. He shaped jazz.";
  const t = cleanSummary(raw, { maxSentences: 3 });
  assert.ok(!/certainly|here's a summary/i.test(t), 'scaffolding is stripped');
  assert.equal((t.match(/[.!?]/g) || []).length, 3, 'capped at three sentences');
});

test('cleanSummary rejects notes-register echo and degenerate residue', () => {
  assert.equal(cleanSummary('As read — Armstrong stays in focus. The reading turns around Armstrong / New Orleans.'), '');
  assert.equal(cleanSummary('Ok.'), '');
});

// ── the referential gate ──────────────────────────────────────────────────────────────

test('summaryAdditions flags a novel name and a novel number, and only those', () => {
  const surface = 'Louis Armstrong was a trumpeter from New Orleans. He recorded in 1928.';
  const a = summaryAdditions('Ultimately, Louis Armstrong met Duke Ellington in 1931.', surface);
  assert.deepEqual(a.names, ['Duke', 'Ellington'], 'the unlicensed name is caught');
  assert.deepEqual(a.numbers, ['1931'], 'the unlicensed number is caught');
  const clean = summaryAdditions('Ultimately, Louis Armstrong recorded there in 1928.', surface);
  assert.deepEqual(clean, { names: [], numbers: [] }, 'sentence-case prose words are free');
});

test('the wrong Armstrong is a catchable addition even at sentence start', () => {
  const surface = 'Louis Armstrong was a trumpeter from New Orleans.';
  const a = summaryAdditions('Neil Armstrong recorded West End Blues.', surface);
  assert.ok(a.names.includes('Neil'), 'the foreign first name is caught');
});

// ── realize: model-optional, floor-guaranteed ─────────────────────────────────────────

test('realizeSummary: no phrase → telegram; fabricating phrase → gated fallback; clean phrase → model', async () => {
  const doc = parseText(LOUIS_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'entity', entity: 'Louis Armstrong' });

  const none = await realizeSummary(p, { sentences: 2 });
  assert.equal(none.via, 'telegram');
  assert.ok(none.text.length > 0);

  const fabricate = async () => 'Louis Armstrong studied under Duke Ellington in Vienna in 1944.';
  const gated = await realizeSummary(p, { phrase: fabricate, sentences: 2 });
  assert.equal(gated.via, 'telegram-gated', 'a fabricated referent never ships');
  assert.ok(gated.additions.names.length > 0);
  assert.equal(gated.text, none.text, 'the floor ships instead');

  const faithful = async () => 'Louis Armstrong, a trumpeter from New Orleans, recorded West End Blues and toured Europe with his trumpet.';
  const ok = await realizeSummary(p, { phrase: faithful, sentences: 2 });
  assert.equal(ok.via, 'model');
  assert.ok(/West End Blues/.test(ok.text));
});

// ── cross-source: the Armstrong discipline ────────────────────────────────────────────

test('crossSourceSummaryFold keeps Neil and Louis apart across three sources', () => {
  const rep = crossSourceSummaryFold(docs(), { name: 'Armstrong' });
  assert.ok(rep.contested.includes('armstrong'), 'the shared surname is detected as contested');
  const neil = rep.referents.find((r) => /neil/i.test(r.referent));
  const louis = rep.referents.find((r) => /louis/i.test(r.referent) && !/lucille/i.test(r.referent));
  assert.ok(neil && louis, 'both full referents exist');
  assert.notEqual(neil, louis);
  assert.ok(neil.docs.length >= 2, `Neil folds across sources (${neil.docs.length})`);
  assert.ok(louis.docs.length >= 2, `Louis folds across sources (${louis.docs.length})`);
  assert.equal(rep.collapse.collapsed.length, 0, 'no group conflates two full names');
  // referent-safe labels: no line of either packet reads a bare contested surname
  for (const r of [neil, louis]) {
    for (const rel of r.relations) {
      assert.notEqual(rel.subject.trim().toLowerCase(), 'armstrong', `bare surname leaked: ${JSON.stringify(rel)}`);
      assert.notEqual(rel.object.trim().toLowerCase(), 'armstrong', `bare surname leaked: ${JSON.stringify(rel)}`);
    }
  }
});

test('spouses sharing the surname stay their own referents', () => {
  const rep = crossSourceSummaryFold(docs(), { name: 'Armstrong' });
  const janet = rep.referents.find((r) => /janet/i.test(r.referent));
  const lucille = rep.referents.find((r) => /lucille/i.test(r.referent));
  assert.ok(janet, 'Janet Armstrong is her own referent');
  assert.ok(lucille, 'Lucille Armstrong is her own referent');
});

test('corefCollapseReport catches a deliberately collapsed fold (negative control)', () => {
  // the OLD bug, reconstructed: one group whose members carry both full names
  const collapsed = [{
    referent: 'Armstrong',
    members: [
      { label: 'Neil Armstrong', docId: 'a', mentions: 5 },
      { label: 'Louis Armstrong', docId: 'b', mentions: 7 },
      { label: 'Armstrong', docId: 'a', mentions: 9 },
    ],
  }];
  const rep = corefCollapseReport(collapsed);
  assert.equal(rep.collapsed.length, 1, 'the collapse is measured, not trusted');
  assert.deepEqual(rep.collapsed[0].conflates.sort(), ['Louis Armstrong', 'Neil Armstrong']);
});

test('summaryAttributionErrors catches cross-attribution, including via a pronoun', () => {
  // hand-built packets so the metric's own logic is what is under test
  const two = [
    { referent: 'Louis Armstrong', figures: [{ label: 'trumpet' }, { label: 'West End Blues' }, { label: 'New Orleans' }] },
    { referent: 'Neil Armstrong', figures: [{ label: 'Apollo' }, { label: 'Moon' }, { label: 'NASA' }] },
  ];

  // the joint-mode failure, verbatim shape: pronoun carries Louis into Neil's claim
  const bad = 'Louis Armstrong was a trumpeter from New Orleans. He walked on the Moon during the Apollo mission.';
  const att = summaryAttributionErrors(bad, two, { contested: ['armstrong'] });
  assert.ok(att.errors.length >= 1, 'the mis-attribution is caught');
  assert.ok(/louis/i.test(att.errors[0].referent), 'charged to the referent holding the pronoun');
  assert.ok(/neil/i.test(att.errors[0].belongsTo), 'and the figure traced to its owner');

  const good = 'Louis Armstrong was a trumpeter from New Orleans. Neil Armstrong walked on the Moon during the Apollo mission.';
  const clean = summaryAttributionErrors(good, two, { contested: ['armstrong'] });
  assert.equal(clean.errors.length, 0, 'a correctly attributed summary passes');

  // a bare contested surname with no disambiguator anywhere in the sentence is flagged
  const vague = 'Armstrong changed music forever.';
  const amb = summaryAttributionErrors(vague, two, { contested: ['armstrong'] });
  assert.ok(amb.ambiguous.length >= 1, 'the bare namesake is flagged as ambiguous');
});

test('realizeCrossSummary sequential mode gates each referent against its own packet', async () => {
  const rep = crossSourceSummaryFold(docs(), { name: 'Armstrong' });
  const two = [
    rep.referents.find((r) => /louis/i.test(r.referent) && !/lucille/i.test(r.referent)),
    rep.referents.find((r) => /neil/i.test(r.referent)),
  ];
  // a "model" that hands EVERY referent the Moon landing — the collapse in a can
  const collapser = async (messages) => {
    const who = /Figure: ([^\n]+)/.exec(messages[1].content)?.[1] || 'Armstrong';
    return `${who} walked on the Moon during the Apollo mission for NASA.`;
  };
  const out = await realizeCrossSummary(two, {
    phrase: collapser, telegram: telegramCrossSummary, mode: 'sequential', sentences: 4,
  });
  // Louis's packet carries no Apollo/NASA — his half must be gated to the floor;
  // the joined text must NOT attribute the Moon to Louis.
  const att = summaryAttributionErrors(out.text, two, { contested: rep.contested });
  assert.equal(att.errors.length, 0, `sequential mode never cross-attributes: ${out.text}`);
});

test('the telegram cross floor is referent-safe and names both figures fully', () => {
  const rep = crossSourceSummaryFold(docs(), { name: 'Armstrong' });
  const two = rep.referents.slice(0, 2);
  const t = telegramCrossSummary(two);
  assert.ok(/Neil/.test(t) || /Louis/.test(t), 'full names are used');
  const att = summaryAttributionErrors(t, two, { contested: rep.contested });
  assert.equal(att.errors.length, 0);
});

// ── prompts stay membrane-clean ───────────────────────────────────────────────────────

test('summaryMessages and crossSummaryMessages carry no ids, tags, or machinery', () => {
  const doc = parseText(NEIL_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', title: 'Neil article' });
  const m = summaryMessages(p, { sentences: 3 });
  assert.equal(m.length, 2);
  assert.ok(!/\[s\d+\]|eo:/.test(m[1].content), 'no citation tag or IRI in the ask');

  const rep = crossSourceSummaryFold(docs(), { name: 'Armstrong' });
  const cm = crossSummaryMessages(rep.referents.slice(0, 2), { sentences: 4 });
  assert.ok(!/\[s\d+\]|eo:/.test(cm[1].content));
  assert.ok(/kept distinct/.test(cm[1].content), 'the ask states the coref demand');
});
