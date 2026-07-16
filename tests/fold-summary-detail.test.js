// The fold → summary DETAIL TIERS (src/surfer/fold/summary-prompt.js SUMMARY_DETAILS)
// and ARC COVERAGE (summary.js arcStops): brief is one fast sentence from a small,
// budget-fitted ask; paragraph is the ENTIRE work as one paragraph over stops that
// span the arc; every tier is one one-shot prompt that fits the smallest local window
// with the referential gate still holding. Deterministic throughout: no model, no
// network; the "model" is a scripted phrase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { surfFold } from '../src/surfer/surf.js';
import { detectGrain } from '../src/surfer/levels.js';
import {
  summaryFold, telegramSummary, packetSurface,
  summaryMessages, summarySystem, SUMMARY_DETAILS,
  realizeSummary, summaryAdditions,
} from '../src/surfer/fold/index.js';

// ── fixtures ──────────────────────────────────────────────────────────────────────────

const LOUIS_TEXT = `Louis Armstrong was an American trumpeter and singer from New Orleans.
Armstrong recorded West End Blues with his Hot Five band in 1928.
Armstrong sang What a Wonderful World in 1967.
His wife Lucille Armstrong managed their home in Queens.
Armstrong toured with his trumpet across Europe and Africa.
Armstrong shaped jazz phrasing for every singer who followed.`;

// A synthetic "novel": three acts with distinct casts, long enough (>40 sentences) that
// the arc coverage engages, with each act's figures confined to its own third — so a
// packet that covers the arc MUST carry spans from every act, and a packet that peaked
// in one place cannot.
const NOVEL = (() => {
  const acts = [
    { who: 'Miriam Vale', where: 'Harbourton', deed: 'mended the lighthouse lamp' },
    { who: 'Corin Ashe', where: 'the Saltmarsh', deed: 'traded maps with the ferrymen' },
    { who: 'Odette Brant', where: 'Windmere', deed: 'signed the harbour treaty' },
  ];
  const lines = [];
  for (const [a, act] of acts.entries()) {
    lines.push(`CHAPTER ${['I', 'II', 'III'][a]}.`);
    for (let i = 0; i < 20; i++) {
      lines.push(`${act.who} ${act.deed} in ${act.where} once more.`);
      lines.push(`The people of ${act.where} watched ${act.who} through the long season.`);
    }
  }
  return lines.join('\n');
})();

// A token estimate matching the prompt fitter's own rule (ASCII bytes/4), for asserting
// the budget from the outside without importing a private function.
const estTokens = (s) => Math.ceil(String(s).length / 4);

// ── the tier table ────────────────────────────────────────────────────────────────────

test('SUMMARY_DETAILS: three one-shot tiers, ordered by size', () => {
  const { brief, standard, paragraph } = SUMMARY_DETAILS;
  assert.ok(brief && standard && paragraph, 'the three tiers exist');
  assert.ok(brief.inputBudget < standard.inputBudget && standard.inputBudget < paragraph.inputBudget);
  assert.ok(brief.decode.maxTokens < standard.decode.maxTokens, 'the fast tier decodes short');
  assert.ok(paragraph.maxSentences <= 7, 'a paragraph is never more than a paragraph');
  // every tier fits the smallest local window (4096) with its own decode reserved
  for (const t of [brief, standard, paragraph]) {
    assert.ok(t.inputBudget + t.decode.maxTokens + 384 <= 4096, 'input + decode + reserve fit a 4k window');
  }
});

test('summarySystem picks the voice: brief is short, paragraph over an arc speaks the whole work', () => {
  assert.ok(summarySystem('cursor', 'brief').length < summarySystem('cursor', 'standard').length,
    'the brief system costs less prefill than the standard one');
  assert.match(summarySystem('full', 'paragraph'), /entire work/, 'the whole-work voice');
  assert.match(summarySystem('entity', 'paragraph'), /one figure/, 'a paragraph-length entity summary keeps its frame');
  assert.match(summarySystem('entity', 'brief'), /one sentence/i, 'the brief entity voice');
});

// ── brief: the fast voice at any place in the fold ────────────────────────────────────

test('brief messages ask for one sentence and fit the brief budget', () => {
  const doc = parseText(NOVEL);
  const p = summaryFold(doc, { surf: surfFold, scope: 'cursor', cursor: 30, maxSpans: 4 });
  const m = summaryMessages(p, { detail: 'brief' });
  assert.equal(m.length, 2, 'one one-shot prompt: system + user');
  assert.match(m[1].content, /Summary \(1 sentence\):/);
  const total = estTokens(m[0].content) + estTokens(m[1].content);
  assert.ok(total <= SUMMARY_DETAILS.brief.inputBudget,
    `the whole ask fits the brief budget (${total} <= ${SUMMARY_DETAILS.brief.inputBudget})`);
});

test('realizeSummary at brief passes the tier decode and caps at two sentences', async () => {
  const doc = parseText(LOUIS_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'entity', entity: 'Louis Armstrong', maxSpans: 4 });
  let seenOpts = null;
  const chatty = async (messages, opts) => {
    seenOpts = opts;
    return 'Louis Armstrong was a trumpeter from New Orleans. He recorded West End Blues. He toured Europe. He shaped jazz.';
  };
  const out = await realizeSummary(p, { phrase: chatty, detail: 'brief' });
  assert.equal(out.via, 'model');
  assert.equal(seenOpts.maxTokens, SUMMARY_DETAILS.brief.decode.maxTokens, 'the brief decode budget rode the call');
  assert.ok((out.text.match(/[.!?]/g) || []).length <= 2, `capped at two sentences: ${out.text}`);
});

// ── the budget fit — shed the middle, keep the arc's ends ─────────────────────────────

test('the prompt fit sheds middle spans first and keeps the first and last passages', () => {
  const doc = parseText(NOVEL);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', coverage: 'arc', maxSpans: 12 });
  const first = p.spans[0].text;
  const last = p.spans[p.spans.length - 1].text;
  const m = summaryMessages(p, { detail: 'brief' });   // the tightest budget forces shedding
  assert.ok(m[1].content.includes(first.slice(0, 40)), 'the opening span survives the fit');
  assert.ok(m[1].content.includes(last.slice(0, 40)), 'the closing span survives the fit');
});

// ── arc coverage: the whole novel in one packet ───────────────────────────────────────

test('arc coverage spans the whole work — every act reaches the packet', () => {
  const doc = parseText(NOVEL);
  const n = (doc.units || doc.sentences || []).length;
  const p = summaryFold(doc, {
    surf: surfFold, scope: 'full', coverage: 'arc',
    grain: (d) => detectGrain(d, { grain: 'auto' }), maxSpans: 12,
  });
  assert.ok(p, 'a packet is produced');
  assert.equal(p.coverage, 'arc');
  const idxs = p.spans.map((s) => s.idx);
  assert.ok(Math.min(...idxs) < n / 3, 'the opening act is read');
  assert.ok(Math.max(...idxs) > (2 * n) / 3, 'the closing act is read');
  const surface = packetSurface(p);
  assert.ok(/Miriam|Harbourton/.test(surface), 'act one reaches the surface');
  assert.ok(/Odette|Windmere/.test(surface), 'act three reaches the surface');
});

test('arc coverage without an injected grain falls back to quantiles and still spans the arc', () => {
  const doc = parseText(NOVEL);
  const n = (doc.units || doc.sentences || []).length;
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', coverage: 'arc', maxSpans: 10 });
  const idxs = p.spans.map((s) => s.idx);
  assert.ok(Math.min(...idxs) < n / 3 && Math.max(...idxs) > (2 * n) / 3);
});

test('a short document never pays for the arc — coverage degrades to peak', () => {
  const doc = parseText(LOUIS_TEXT);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', coverage: 'arc' });
  assert.ok(p, 'a packet is still produced');
  assert.equal(p.coverage, 'peak', 'nothing to stratify — the adaptive surf stands');
});

// ── paragraph: the whole work, one paragraph out, gate still armed ────────────────────

test('paragraph tier: a rambling decode is capped to one paragraph', async () => {
  const doc = parseText(NOVEL);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', coverage: 'arc', maxSpans: 12 });
  const rambler = async () => Array.from({ length: 12 }, () =>
    'Miriam Vale mended the lighthouse lamp in Harbourton.').join(' ');
  const out = await realizeSummary(p, { phrase: rambler, detail: 'paragraph' });
  assert.equal(out.via, 'model');
  assert.ok((out.text.match(/[.!?]/g) || []).length <= SUMMARY_DETAILS.paragraph.maxSentences,
    'never more than a paragraph');
});

test('the referential gate holds at every tier', async () => {
  const doc = parseText(NOVEL);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', coverage: 'arc', maxSpans: 12 });
  const fabricate = async () => 'Captain Nemo signed the harbour treaty in Atlantis in 1870.';
  for (const detail of ['brief', 'standard', 'paragraph']) {
    const out = await realizeSummary(p, { phrase: fabricate, detail });
    assert.equal(out.via, 'telegram-gated', `${detail}: a fabricated referent never ships`);
    assert.ok(out.additions.names.length > 0);
    assert.equal(out.text, telegramSummary(p, { maxSentences: SUMMARY_DETAILS[detail].maxSentences }));
  }
});

test('the whole-work ask carries no ids, tags, or machinery', () => {
  const doc = parseText(NOVEL);
  const p = summaryFold(doc, { surf: surfFold, scope: 'full', coverage: 'arc', maxSpans: 12 });
  const m = summaryMessages(p, { detail: 'paragraph' });
  assert.ok(!/\[s\d+\]|eo:/.test(m[1].content), 'membrane-clean');
  assert.match(m[1].content, /one paragraph/, 'the ask states the paragraph bound');
  // sanity: a fabricated name is still catchable against this packet's surface
  const a = summaryAdditions('Captain Nemo arrived.', packetSurface(p));
  assert.ok(a.names.includes('Nemo'));
});
