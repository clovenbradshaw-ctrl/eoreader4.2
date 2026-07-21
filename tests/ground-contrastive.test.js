// The contrastive-construction guard (enactor/ground/provenance.js CONTRAST_RE,
// enactor/ground/spans.js groundSpans) — pinned against the failure a live fold summary
// shipped: "Armstrong had ... considered joining the faculty at Purdue's Department of
// Aerospace Engineering" when the source actually said he chose the University of
// Cincinnati's aerospace department, Purdue being the school he passed over.
//
// The root cause was two-fold. (1) propsOf (the tiny relation parser) links a subject to
// EVERY noun phrase its clause names, with no notion that "X over Y" REJECTS the second one —
// "chose Cincinnati over Purdue" and "chose Purdue over Cincinnati" parse to the identical
// pair of relations. (2) groundSpans let a near-verbatim lexical match (CITE_VERBATIM) override
// even a correct 'void' propositional verdict — so once (1) or plain lexical overlap put a
// claim about the REJECTED side within reach of a passage that names both sides, nothing
// stopped it from reading as "sourced". These tests pin both fixes independently and together.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { classifyProvenance, isContrastiveLoser } from '../src/enactor/ground/provenance.js';
import { groundSpans } from '../src/enactor/ground/spans.js';
import { groundText } from '../src/enactor/ground/compose.js';

const PASSAGE = 'Armstrong chose the University of Cincinnati over Purdue for his teaching '
  + 'position because Cincinnati had a small aerospace department.';

test('classifyProvenance: the rejected side of "chose X over Y" is fabricated, the chosen side is verbatim', () => {
  const doc = parseText(PASSAGE, { docId: 'd' });

  const winner = classifyProvenance('Armstrong chose Cincinnati for his teaching position.', { doc });
  assert.equal(winner.propositions[0].grounding, 'verbatim', 'the side actually chosen grounds cleanly');
  assert.equal(winner.propositions[0].ground, 'span');

  const loser = classifyProvenance('Armstrong chose Purdue for his teaching position.', { doc });
  assert.equal(loser.propositions[0].grounding, 'fabricated', 'the side passed over must not ground');
  assert.equal(loser.propositions[0].ground, 'void');
  assert.equal(loser.anyWitnessed, false);
});

test('classifyProvenance: a claim naming BOTH sides in one sentence still splits correctly', () => {
  const doc = parseText(PASSAGE, { docId: 'd' });
  // Even when the naive parser extracts two relations from the SAME comparison clause (one
  // per named figure), each is judged on its own merits — the true side is not dragged down
  // by the false one, and the false one is not rescued by the true one.
  const inverted = classifyProvenance(
    'Armstrong chose Purdue over the University of Cincinnati for his teaching position.',
    { doc },
  );
  const byObj = Object.fromEntries(inverted.propositions.map((p) => [p.obj, p.grounding]));
  assert.equal(byObj.purdue, 'fabricated');
  assert.equal(byObj.cincinnati, 'verbatim');
});

test('groundSpans: a plain fabricated claim about the rejected side grounds to the void, not the source', () => {
  const doc = parseText(PASSAGE, { docId: 'd' });
  const passages = [{ u: 'd', idx: 0, text: PASSAGE }];

  const fabricated = groundSpans(['Armstrong joined the faculty at Purdue.'], { passages, doc });
  assert.equal(fabricated[0].kind, 'llm', 'the rejected school must not be reported as the source');
  assert.equal(fabricated[0].witness, 'void');
  assert.equal(fabricated[0].source, null);

  const true_ = groundSpans(['Armstrong chose Cincinnati for his teaching position.'], { passages, doc });
  assert.equal(true_[0].kind, 'source', 'the chosen school still grounds normally');
  assert.ok(true_[0].source && true_[0].source.text, 'and carries the precise passage it came from');
});

test('groundText: the fabricated summary sentence fails the support verdict; the true one passes', () => {
  const doc = parseText(PASSAGE, { docId: 'd' });
  const passages = [{ u: 'd', idx: 0, text: PASSAGE }];

  const bad = groundText('Armstrong joined the faculty at Purdue.', { passages, doc });
  assert.equal(bad.supported, false);
  assert.equal(bad.kind, 'void');

  const good = groundText('Armstrong chose Cincinnati for his teaching position.', { passages, doc });
  assert.equal(good.supported, true);
  assert.equal(good.kind, 'sourced');
});

// isContrastiveLoser directly, not the full groundSpans pipeline: a claim can fail to ground
// for reasons entirely unrelated to this guard (the tiny relation parser doesn't extract a
// clean subject–verb–object triple from every phrasing, proper-noun or not) — routing the
// negative controls through groundSpans would conflate "the guard fired" with "the base parser
// never grounded this in the first place," which is a different, pre-existing limitation. The
// guard's own job is narrow and is exactly what CONTRAST_RE does; test it in isolation.
test('the "over" trigger stays narrow: only a preference verb anchors it, not "over" alone', () => {
  assert.equal(isContrastiveLoser('He logged over 200 hours that year, including time with Purdue.', 'purdue'), false, '"logged over" is not a preference verb');
  assert.equal(isContrastiveLoser('Armstrong flew over the city in a plane.', 'city'), false, 'literal, spatial "over"');
  assert.equal(isContrastiveLoser('The committee handed the project over to Purdue.', 'purdue'), false, '"handed over" is not a comparison');
  assert.equal(isContrastiveLoser('They met over the weekend to discuss Purdue.', 'purdue'), false, '"over the weekend" is not a comparison');
});

test('"rather than" and "instead of" are recognized alongside preference verbs', () => {
  const passage = 'The city chose Elmwood over Fairview for the new stadium, since Elmwood had better transit.';
  assert.equal(isContrastiveLoser(passage, 'fairview'), true);
  assert.equal(isContrastiveLoser(passage, 'elmwood'), false, 'the side actually chosen is never marked a loser');

  const ratherThan = 'The board funded the new library rather than the gymnasium, since the library served more students.';
  assert.equal(isContrastiveLoser(ratherThan, 'gymnasium'), true);
  assert.equal(isContrastiveLoser(ratherThan, 'library'), false);

  const insteadOf = 'The city funded the library instead of the gymnasium.';
  assert.equal(isContrastiveLoser(insteadOf, 'gymnasium'), true);
  assert.equal(isContrastiveLoser(insteadOf, 'library'), false);
});

test('groundSpans: the guard reaches end to end for a proper-noun comparison (not just "chose ... over")', () => {
  const passage = 'The city chose Elmwood over Fairview for the new stadium, since Elmwood had better transit.';
  const doc = parseText(passage, { docId: 'd' });
  const passages = [{ u: 'd', idx: 0, text: passage }];

  const loser = groundSpans(['The city chose Fairview for the new stadium.'], { passages, doc });
  assert.equal(loser[0].kind, 'llm', 'Fairview was passed over — a claim naming it must not source');

  const winner = groundSpans(['The city chose Elmwood for the new stadium.'], { passages, doc });
  assert.equal(winner[0].kind, 'source');
});

test('ordinary (non-contrastive) grounding is unaffected by the guard', () => {
  const passages = [
    { u: 'd', idx: 0, text: 'Armstrong was born in Wapakoneta, Ohio, on August 5, 1930.' },
    { u: 'd', idx: 1, text: 'He attended Blume High School and took flying lessons at the local airfield.' },
  ];
  const faithful = groundText(
    'Armstrong was born in Wapakoneta, Ohio in 1930. He attended Blume High School and learned to fly.',
    { passages },
  );
  assert.equal(faithful.kind, 'sourced');
  assert.ok(faithful.supported && faithful.source >= 1);

  const voidish = groundText('Armstrong walked on the Moon and became a global hero of flying.', { passages });
  assert.equal(voidish.kind, 'void');
  assert.equal(voidish.supported, false);
});

test('groundSpans: a void verdict is a definitive deny even at full lexical overlap (the CITE_VERBATIM override)', () => {
  // Isolates the OTHER half of the fix: independent of the contrastive guard, a claim whose
  // words are a 100% lexical match for a passage must still be denied when the propositional
  // read says the relation is not actually witnessed there.
  const doc = parseText(PASSAGE, { docId: 'd' });
  const passages = [{ u: 'd', idx: 0, text: PASSAGE }];
  const claim = 'Armstrong chose Purdue over the University of Cincinnati for his teaching '
    + 'position because Purdue had a small aerospace department.';
  const v = groundSpans([claim], { passages, doc });
  assert.equal(v[0].kind, 'llm', 'lexical overlap alone must not resurrect a fabricated relation');
});
