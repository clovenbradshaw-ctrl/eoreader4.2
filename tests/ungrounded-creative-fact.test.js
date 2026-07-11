// The creative / factual split for the ungrounded-claim mark. The grounder flags a
// fact-from-nowhere so it can no longer read as sourced — but it must NOT flag creative
// output, which is meant to come from the writer. So the [no source] mark is owed by an
// assertion of FACT and withheld from a question, an invitation to imagine, an
// interjection. And the mark now rides in the long-form / section modes (bindAndVeto),
// not only in the chat answer — an ungrounded fact is disclosed in every mode.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderBound, UNSOURCED_MARK, isFactualClaim } from '../src/enactor/ground/bind.js';
import { bindAndVeto } from '../src/enactor/ground/section.js';
import { runContinuation } from '../src/weave/longgen/index.js';

test('isFactualClaim — a plain declarative is a fact; overt non-assertions are not', () => {
  assert.equal(isFactualClaim('The tower stands three hundred metres tall.'), true);
  assert.equal(isFactualClaim('They are social birds often seen in flocks.'), true);
  // Non-assertions — creative or rhetorical, no checkable fact.
  assert.equal(isFactualClaim('What could the tower have been?'), false);
  assert.equal(isFactualClaim('Imagine a tower that touches the clouds.'), false);
  assert.equal(isFactualClaim('Picture the sea at dawn.'), false);
  assert.equal(isFactualClaim('Alas, the tower is gone.'), false);
  assert.equal(isFactualClaim(''), false);
});

test('renderBound mark — a zero-contact FACT is tagged, a creative line is left alone', () => {
  const bound = [
    { claim: 'The tower is three hundred metres tall.', citation: null, score: 0 }, // ungrounded fact
    { claim: 'Imagine a tower that touches the clouds.', citation: null, score: 0 }, // creative — not a fact
    { claim: 'What might it have looked like?', citation: null, score: 0 },          // a question — not a fact
  ];
  const out = renderBound(bound, { mark: true });
  assert.ok(out.includes(`metres tall. ${UNSOURCED_MARK}`), 'the ungrounded fact wears its provenance');
  assert.ok(!out.includes(`clouds. ${UNSOURCED_MARK}`), 'creative output is not marked');
  assert.ok(!out.includes(`looked like? ${UNSOURCED_MARK}`), 'a question is not marked');
  assert.equal(out.split(UNSOURCED_MARK).length - 1, 1, 'exactly one mark — only the fact');
});

test('bindAndVeto — the mark rides in the section/long-form mode, and answer stays clean', () => {
  const spans = [{ idx: 0, score: 0.9, text: 'Dolphins are highly intelligent marine mammals.' }];
  // A draft: one claim lifted from the span (grounds), one fact from nowhere.
  const draft = 'Dolphins are highly intelligent marine mammals. They can pilot small submarines.';
  const gated = bindAndVeto(draft, spans, {});

  // The clean answer (fed back as long-form left-context) carries no marker.
  assert.ok(!gated.answer.includes(UNSOURCED_MARK), 'answer stays clean — no marker leaks into the running document');
  // The display projection marks the ungrounded fact.
  assert.ok(gated.marked.includes(UNSOURCED_MARK), 'marked discloses the fact from nowhere');
  assert.ok(gated.marked.includes(`small submarines. ${UNSOURCED_MARK}`), 'the mark lands on the unsourced fact');
  assert.ok(!/intelligent marine mammals\.\s*\[no source\]/.test(gated.marked), 'the grounded lift is not marked');
});

test('bindAndVeto — a pure generation (no spans) is never marked; creative opt-out honoured', () => {
  const draft = 'A dragon coiled around the tower and slept for a thousand years.';
  const noSpans = bindAndVeto(draft, [], {});
  assert.equal(noSpans.marked, noSpans.answer, 'nothing to ground against ⇒ marked === answer, no disclosure');
  assert.ok(!noSpans.marked.includes(UNSOURCED_MARK));

  const spans = [{ idx: 0, score: 0.9, text: 'The keep was built of grey stone.' }];
  const creative = bindAndVeto(draft, spans, { creative: true });
  assert.ok(!creative.marked.includes(UNSOURCED_MARK), 'a caller-declared creative piece opts out of the mark');
});

test('runContinuation surfaces a marked display projection alongside the clean answer', async () => {
  const ground = [
    { idx: 0, score: 0.9, text: 'Dolphins are highly intelligent marine mammals that live in social pods.' },
    { idx: 1, score: 0.8, text: 'Dolphins use echolocation to hunt fish in murky coastal water.' },
  ];
  const model = {
    id: 'stub', kind: 'local', isLoaded: () => true, async load() {},
    async phrase() { return 'They forage cooperatively across the reef.'; },
  };
  const res = await runContinuation({ ground, model, nul: false, prose: true });
  assert.equal(typeof res.marked, 'string', 'the closure exposes a marked projection for display');
  // The clean answer never carries the marker (it feeds back as left-context).
  assert.ok(!res.answer.includes(UNSOURCED_MARK), 'the clean answer stays mark-free');
});
