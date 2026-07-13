import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseText } from '../src/perceiver/parse/index.js';
import { stages } from '../src/turn/stages.js';
import { runTurn } from '../src/turn/pipeline.js';
import { buildGroundedMessages } from '../src/model/prompt.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createModel } from '../src/model/interface.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import '../src/model/echo.js';   // registers the deterministic, network-free 'echo' backend

// The observed failure (audit "what is the best elvis movie?"): the answer came back as a
// MECHANICALLY STITCHED raw-span decline — "They do hold: … including Best …; … described
// Butler as…" — full of ellipsis cuts, and the "What it was prompted" panel read "no prompt
// on record — it never reached the model pipeline." Both traced to the answerability floor:
// the referent-diffuse (answerable) and unanswerable (gate) stages substituted a refusalAtom
// AS the answer and `terminate`d the turn BEFORE the prompt/llm stages ran, so nothing model-
// authored was produced and ctx.promptText was never captured. The fix routes both declines
// THROUGH the model: they no longer terminate, they ride a soft measured marker, and the
// prompt carries an honest-decline HINT so the talker declines instead of confabulating.

const HOUSE = [
  "World's tallest house of cards Berg first broke the world record for the world's tallest house of free-standing playing cards in 1992 at the age of seventeen, with a tower fourteen and a half feet tall.",
  'The Optus Centre was completed in 1975.',
  'Nauru House became the tallest building in Melbourne, at a height of 182 metres.',
].join('\n');
const houseDoc = () => parseText(HOUSE, { docId: 'S-H' });
const houseSpans = HOUSE.split('\n').map((text, idx) => ({ idx, score: 0.66, text }));

test('answerable: a measured-diffuse turn no longer terminates — it rides a soft marker to the model', async () => {
  const out = await stages.answerable({
    doc: houseDoc(), question: 'what is the best elvis movie?', task: 'answer', grounding: 'auto',
    spans: houseSpans, referential: { concentrated: false, id: 5, margin: 0.001 },
  });
  assert.notEqual(out.terminate, true, 'the turn continues to the model — it does not short-circuit');
  assert.equal(out.answer, undefined, 'no mechanical raw-span answer is substituted');
  assert.equal(out.referentDiffuse, true, 'the diffusion rides as a soft marker for the prompt stage');
  assert.ok(out.referential, 'the referential measure is preserved (keys proposeWebSearch + referent-ambiguous)');
  // no REFUSING veto is emitted here anymore
  assert.ok(!(out.vetoes || []).some((v) => v && v.refuses), 'no refusing veto substitutes the answer');
});

test('answerable: a concentrated (non-diffuse) turn is untouched — no marker, no terminate', async () => {
  const out = await stages.answerable({
    doc: houseDoc(), question: 'what is the tallest building?', task: 'answer', grounding: 'auto',
    spans: houseSpans, referential: { concentrated: true, id: 5, margin: 0.4 },
  });
  assert.notEqual(out.terminate, true);
  assert.equal(out.referentDiffuse, undefined, 'a led field is not marked diffuse');
});

test('gate: an unanswerable turn no longer terminates — it rides a soft answerability marker', async () => {
  const out = await stages.gate({
    doc: houseDoc(), question: 'what is the tallest house?', route: 'grounded',
    spans: houseSpans, grounding: 'grounded',
  });
  assert.notEqual(out.terminate, true, 'the turn continues to the model — it does not short-circuit');
  assert.equal(out.answer, undefined, 'no mechanical raw-span answer is substituted');
  assert.equal(out.answerability?.licensed, false, 'the unlicensed measurement rides as a soft marker');
  assert.ok(!(out.vetoes || []).some((v) => v && v.refuses), 'no refusing veto substitutes the answer');
});

test('the decline HINT band renders the measured decline and is inert by default', () => {
  const user = (args) => buildGroundedMessages(args)[1].content;
  const spans = [{ text: 'a line', score: 1 }];
  assert.match(user({ question: 'q', spans, declineHint: 'diffuse' }), /did not settle on which figure/,
    "a diffuse turn tells the talker it didn't find a settled answer");
  assert.match(user({ question: 'q', spans, declineHint: 'absent' }), /does not appear to cover what this question names/,
    "an absent-subject turn tells the talker it didn't find that");
  assert.doesNotMatch(user({ question: 'q', spans }), /did not settle on which figure|does not appear to cover/,
    'no hint on an ordinary turn — byte-identical (see prompt-golden.test.js)');
});

test('end to end: an unanswerable grounded turn reaches the model — a prompt on record, no raw-span stitch', async () => {
  const r = await runTurn({
    question: 'what is the tallest house?',
    doc: houseDoc(), model: createModel('echo'), embedder: createHashEmbedder(),
    auditLog: createAuditLog(), grounding: 'grounded',
  });
  assert.equal(r.route, 'grounded');
  assert.notEqual(r.turn?.gated, true, 'no mechanical decline substituted the answer pre-model');
  assert.ok(r.turn?.prompt && r.turn.prompt.length > 0,
    'the verbatim prompt is captured (the "What it was prompted" panel is no longer empty)');
  assert.match(r.turn.prompt, /did not settle on which figure/,
    'the honest-decline hint rode into the prompt the model was handed');
  assert.doesNotMatch(String(r.answer || ''), /…/,
    'the answer is model-authored, not an ellipsis-cut raw-span refusalAtom stitch');
});
