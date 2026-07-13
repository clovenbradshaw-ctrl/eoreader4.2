// Adapter tests — external corpus rows → the internal record schema, on synthetic input (no large
// download needed). The load-bearing claims: the CONSERVATIVE Dolly→intent map only asserts genuine
// correspondences (an unmapped category never masquerades as coverage), and every adapter is
// defensive (blank/malformed rows are skipped, never thrown).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOLLY_INTENT, dollyRecord, fromDolly, oasstRecords, helpSteer3Pairs, fromJsonl } from '../tools/corpus/adapters.mjs';

test('Dolly→intent map is conservative — only genuine correspondences', () => {
  // The three intents Dolly can honestly support — the boring half.
  assert.deepEqual(new Set(Object.values(DOLLY_INTENT).filter(Boolean)),
    new Set(['lookup', 'connect-passages', 'synthesis']));
  // Categories with no honest analog map to null (background only), never to a Cleo intent.
  assert.equal(DOLLY_INTENT.brainstorming, null);
  assert.equal(DOLLY_INTENT.creative_writing, null);
});

test('dollyRecord maps category to intent as reference, or _bg as background', () => {
  const row = { instruction: 'Why can camels survive without water?', context: '', category: 'open_qa', response: 'They use the fat in their humps.' };
  const ref = dollyRecord(row, 0);
  assert.equal(ref.intent, 'lookup');
  assert.equal(ref.role, 'reference');
  assert.equal(ref.source, 'dolly');
  assert.equal(ref.user_turn, 'Why can camels survive without water?');
  // An unmapped category keeps its own namespaced label — not a Cleo intent.
  assert.equal(dollyRecord({ category: 'creative_writing', response: 'A scene.' }, 1).intent, 'dolly:creative_writing');
  // As background, category is irrelevant — everything pools into _bg.
  assert.equal(dollyRecord(row, 0, { role: 'background' }).intent, '_bg');
  // Context is folded into the user_turn when present.
  assert.match(dollyRecord({ instruction: 'Q', context: 'C', category: 'closed_qa', response: 'A' }, 0).user_turn, /Q[\s\S]*C/);
});

test('adapters never throw on blank or malformed input', () => {
  assert.deepEqual(fromDolly(''), []);
  assert.deepEqual(fromDolly('\n\nnot json\n{bad'), []);
  assert.equal(dollyRecord({ category: 'open_qa', response: '' }, 0), null);      // no response → no record
  assert.deepEqual(oasstRecords([]), []);
  assert.deepEqual(helpSteer3Pairs([]), []);
});

test('fromJsonl honours the limit', () => {
  const text = Array.from({ length: 10 }, (_, i) => JSON.stringify({ category: 'open_qa', instruction: `q${i}`, response: `a${i}` })).join('\n');
  assert.equal(fromDolly(text, { limit: 3 }).length, 3);
  assert.equal(fromJsonl(text, (r) => r, {}).length, 10);
});

test('oasstRecords pairs a top-ranked assistant reply to its prompter', () => {
  const rows = [
    { message_id: 'p1', parent_id: null, role: 'prompter', text: 'How do I start running?' },
    { message_id: 'a1', parent_id: 'p1', role: 'assistant', text: 'Get comfortable shoes and start slow.', rank: 0 },
    { message_id: 'a2', parent_id: 'p1', role: 'assistant', text: 'A worse answer.', rank: 1 },   // dropped
  ];
  const recs = oasstRecords(rows);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].response, 'Get comfortable shoes and start slow.');
  assert.equal(recs[0].user_turn, 'How do I start running?');
});

test('helpSteer3Pairs orders winner/loser by preference and filters to General', () => {
  const rows = [
    { domain: 'general', prompt: 'Q', response1: 'better', response2: 'worse', overall_preference: -2 },
    { domain: 'general', prompt: 'Q', response1: 'worse', response2: 'better', overall_preference: 3 },
    { domain: 'code', prompt: 'Q', response1: 'a', response2: 'b', overall_preference: -1 },   // filtered out
    { domain: 'general', prompt: 'Q', response1: 'tie', response2: 'tie', overall_preference: 0 }, // no gradient
  ];
  const pairs = helpSteer3Pairs(rows);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].winner, 'better');
  assert.equal(pairs[1].winner, 'better');
});
