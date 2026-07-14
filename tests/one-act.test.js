// THE ONE-ACT LAW (EO; docs/prompt-as-site.md, Tier 3 item 1).
//
//   INS — an act that INSTANTIATES. In this engine the model DECODE is the act at the
//         answer grain: model.phrase() spends tokens and brings a new surface into
//         being. It fires AT MOST ONCE per grain per turn — the revise loop is the one
//         sanctioned correction grain, itself bounded (REWRITE_ATTEMPTS = 1).
//   NUL — a READ. The surf (surfFold) and the prompt assembly (buildGroundedMessages /
//         projectGroundedBands) are projections over the field: pure, repeatable,
//         mutation-free. A read may fire any number of times and must never cause an
//         act — a second assembly is NUL, never a second INS.
//
// Three merged PRs each fixed a bug in exactly this class — a second decode or a
// second surf fired where a read was called for:
//   #77  the DAG explorer's entity toggles became a pure display filter
//        (scopeAssertedDag) that "never re-reads the corpus and never invents an
//        edge" — a view toggle is a read, not a re-derivation.
//   #83  the phatic door: ONE readDiscourse statement per turn, reused by every gate —
//        "the model speaks once per turn instead of a decode per gate."
//   #91  the composer releases at `bind`, where the answer is FORMED; the tail
//        (factcheck · veto · validate — the latter's possible second decode included)
//        only ANNOTATES, it is never a second blocking answer-act.
//
// These tests pin the law so the class cannot silently return. The fixture drives the
// REAL turn pipeline (runTurn) with a COUNTING model stub: phrase() is the single
// funnel every decode path goes through — the llm stage's streamPhrase, the revise
// rewrite, and the validate reaction all call model.phrase (model/stream.js,
// turn/stages.js), and the logit `propose` path is off by default (RULES_REV) — so
// counting phrase() invocations counts every act the turn fired.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runTurn } from '../src/turn/pipeline.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { buildGroundedMessages, projectGroundedBands } from '../src/model/prompt.js';
import { surfFold } from '../src/surfer/index.js';

// ── the fixture ───────────────────────────────────────────────────────────────

// A counting backend: every phrase() — every decode, every act — increments the
// counter and returns the same fixed, plausible answer. Deliberately stubborn: it
// ignores correctives, so a bounded loop shows its bound and an unbounded one hangs.
const countingModel = (reply) => {
  let count = 0;
  return {
    decodes: () => count,
    model: {
      id: 'counting-stub', kind: 'local', isLoaded: () => true,
      describe: () => ({ backend: 'counting-stub', kind: 'local', model: 'counting-stub', label: 'counting' }),
      async load() {},
      async phrase() { count += 1; return reply; },
    },
  };
};

const TEXT =
  'The dolphin swam near the boat. The dolphin is intelligent. ' +
  'It recognizes itself in a mirror. The pod hunted fish together in the bay. ' +
  'The water stayed calm all morning.';

const freshDoc = () => parseText(TEXT, { docId: 'dolphins' });

const run = (question, { doc = null, model }) =>
  runTurn({ question, doc, model, embedder: createHashEmbedder(), auditLog: createAuditLog({ capacity: 64 }) });

// ── the law, per grain ────────────────────────────────────────────────────────

test('a clean grounded turn fires exactly one decode', async () => {
  // The whole grounded pipeline runs — retrieve, the fold's surf, prompt assembly,
  // bind, factcheck, veto — and all of those are READS over the field. The one act
  // is the answer decode. The answer is near-verbatim from the document so it binds
  // cleanly: no gate, no rewrite, no second act.
  const { model, decodes } = countingModel('The dolphin recognizes itself in a mirror.');
  const r = await run('What does the dolphin recognize?', { doc: freshDoc(), model });
  assert.equal(r.route, 'grounded', 'the fixture drove the grounded route');
  assert.ok((r.answer || '').length > 0, 'the counted decode was the answer act');
  assert.equal(decodes(), 1, 'one grounded turn = one decode (the fold surfs, assembles, binds, checks — all reads)');
});

test('a chat turn fires exactly one decode', async () => {
  const { model, decodes } = countingModel('Dolphins mostly eat fish and squid.');
  const r = await run('What do dolphins eat in the wild?', { model });
  assert.equal(r.route, 'chat', 'no document → the chat route');
  assert.ok((r.answer || '').length > 0);
  assert.equal(decodes(), 1, 'one chat turn = one decode');
});

test('assembling the prompt is a read, not an act', () => {
  // The projection over the band catalog (model/bands.js) has no model in its
  // signature — a projection CANNOT fire an act — and it is pure: same args, same
  // bands, args untouched. So a second (third, tenth) assembly is NUL, never a
  // second INS.
  const { decodes } = countingModel('never spoken');
  const args = {
    question: 'What does the dolphin recognize?',
    spans: [
      { idx: 2, score: 0.9, text: 'It recognizes itself in a mirror.' },
      { idx: 1, score: 0.7, text: 'The dolphin is intelligent.' },
    ],
    orientation: 'dolphins.txt · text · 5 sentences',
    task: 'answer',
    conversation: {},
  };
  const before = structuredClone(args);

  const m1 = buildGroundedMessages(args);
  const m2 = buildGroundedMessages(args);
  const m3 = buildGroundedMessages(args);
  assert.deepEqual(m1, m2, 'the same args project the same messages');
  assert.deepEqual(m2, m3, 'however many times it is read');

  const b1 = projectGroundedBands(args);
  const b2 = projectGroundedBands(args);
  assert.deepEqual(b1, b2, 'the band projection is a pure read of the catalog');

  assert.deepEqual(args, before, 'assembly moved nothing — the field is unchanged');
  assert.equal(decodes(), 0, 'no assembly fired a decode — a projection is NUL');
});

test('the revise loop is bounded: one act plus at most one sanctioned rewrite', async () => {
  // Drive a rewrite for real. "In three words" is a mechanically checkable length
  // gate (turn/expect.js): the stubborn stub answers seven words, the gate fires,
  // revise re-prompts ONCE, the redraft is still seven words — and the loop stops,
  // because REWRITE_ATTEMPTS bounds it. An unbounded loop would keep decoding
  // against this stub forever; a raised cap would push the count past 2.
  const { model, decodes } = countingModel('The dolphin recognizes itself in a mirror.');
  const r = await run('In three words, what does the dolphin recognize?', { doc: freshDoc(), model });
  const step = (r.turn.steps || []).find((s) => s.name === 'revise');
  assert.ok(step, 'the revise stage ran in the fold');
  assert.equal(step.data.attempts, 1, 'the rewrite loop engaged exactly once against a stubborn draft');
  assert.equal(decodes(), 2, 'one answer act + one bounded correction act — never a third');
});

test('static tripwire: REWRITE_ATTEMPTS is still the declared cap, and still 1', () => {
  // The constant is module-private (turn/stage-revise.js — the REVISE group of the
  // split stages), so the declared bound cannot be asserted through an import; the
  // behavioral test above pins the OBSERVED bound. This pins the DECLARATION — that
  // the cap is still 1 and still what the loop guard reads — so a silent bump (or
  // the guard decoupling from the constant) fails a named test instead of drifting.
  const src = readFileSync(new URL('../src/turn/stage-revise.js', import.meta.url), 'utf8');
  assert.match(src, /const REWRITE_ATTEMPTS = 1;/, 'the one sanctioned rewrite is still the declared cap');
  assert.match(src, /attempts < REWRITE_ATTEMPTS/, 'and the revise loop is still guarded by it');
});

test('the surf is a read', () => {
  // surfFold's signature admits no model — it cannot fire an act by construction —
  // and it is a pure function of the log and the field (surfer/surf.js): same doc,
  // same anchor, same path, and the append-only log gains nothing. Surfing twice is
  // reading twice, which the law permits without limit.
  const doc = freshDoc();
  const eventsBefore = doc.log.length;
  const s1 = surfFold(doc, 1);
  const s2 = surfFold(doc, 1);
  assert.deepEqual(s1, s2, 'the same surf read twice is the same reading');
  assert.equal(doc.log.length, eventsBefore, 'the surf appended nothing — it read the field, it did not move it');
});
