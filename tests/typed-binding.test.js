import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../src/core/verdicts.js';
import { createJudgmentLog } from '../src/core/def.js';
import { bindCitations } from '../src/enactor/ground/bind.js';
import {
  typeClaim, predicationSupport, strengthAtLeast, evalEntails, valueEntails, evalTermOf,
} from '../src/enactor/ground/predication.js';
import { recordBindingDefs, recordCorrespondenceDefs } from '../src/turn/judgments.js';
import { parseText } from '../src/perceiver/parse/index.js';

// Typed binding (docs "The Work, v2" #2) — the binder moves from token overlap to a
// same-vs-other DEF over PREDICATION. Falsifiers: each fails if the cut regresses — a claim
// citing off shared subject words without the predicate, an entailed paraphrase punished for
// thin overlap, a guess where the authored tables are silent, a witness that cannot replay,
// or the factcheck's later reading landing as a stranger instead of a revision.

const spansOf = (doc) => doc.sentences.map((text, idx) => ({ idx, text }));

// ── the headline: subject words without the predicate do not corroborate ───────

test('a copular evaluation no span holds ships UNCITED — naming the figure is not ranking it', () => {
  const doc = parseText(
    'The bottlenose dolphin lives in warm coastal waters and hunts fish. '
    + 'The orca hunts in coordinated pods across cold seas. '
    + 'The Maui dolphin is the smallest and rarest species.', { docId: 'tb' });
  const bound = bindCitations('The bottlenose is the best dolphin.', spansOf(doc), { doc, cursor: 0, typed: true });
  assert.equal(bound[0].citation, null, 'no source ranks the bottlenose — no citation, whatever the overlap');
  assert.equal(bound[0].typed.op, 'EVA');
  assert.equal(bound[0].typed.verdict, 'unsupported');
  assert.equal(bound[0].typed.reason, 'never-ranked');
  assert.ok(bound[0].score >= 0, 'the lexical amplitude still rides for the veto battery');
});

test('the same evaluation cites when a span actually ranks the subject', () => {
  const doc = parseText(
    'Critics called the bottlenose the best dolphin of the whole coast. '
    + 'The orca hunts in coordinated pods.', { docId: 'tb2' });
  const bound = bindCitations('The bottlenose is the best dolphin.', spansOf(doc), { doc, cursor: 0, typed: true });
  assert.equal(bound[0].typed.verdict, 'supported');
  assert.equal(bound[0].citation, 's0', 'the ranking span earns the citation');
});

test('a one-place predication the spans never hold is UNSUPPORTED even with subject contact', () => {
  const doc = parseText(
    'Dolphins are kept in captivity within dolphinariums for research. '
    + 'Dolphins range in sizes from the small Maui to the orca.', { docId: 'tb3' });
  const bound = bindCitations('Dolphins are gentle and calm.', spansOf(doc), { doc, cursor: 0, typed: true });
  const b = bound[0];
  assert.equal(b.typed?.op, 'DEF');
  assert.notEqual(b.typed?.verdict, 'supported', 'sharing the subject\'s words is not support');
  assert.equal(b.citation, null);
});

// ── the rescue direction: entailment on thin overlap ───────────────────────────

test('an entailed kin paraphrase cites through the primitive projection, not the tokens', () => {
  const doc = parseText(
    'Grete is Gregor\'s sister. Gregor woke as an insect. Grete played the violin.', { docId: 'tb4' });
  const bound = bindCitations('Grete and Gregor are siblings.', spansOf(doc), { doc, cursor: 0, typed: true });
  const b = bound[0];
  assert.equal(b.typed?.verdict, 'supported', `"sister" projects to the sibling primitive: ${JSON.stringify(b.typed)}`);
  assert.equal(b.citation, 's0', 'the kin span earns the citation on nearly zero shared tokens');
});

// ── the residue: the tables\' silence is INDETERMINATE, decidable order decides ──

test('predicate strength: a stronger span supports, a weaker span does not, silence suspends', () => {
  assert.equal(strengthAtLeast('recommended', 'referred'), true, 'recommending entails having referred');
  assert.equal(strengthAtLeast('referred', 'recommended'), false, 'a referral does not support "recommended"');
  assert.equal(strengthAtLeast('mentioned', 'recommended'), false);
  assert.equal(strengthAtLeast('consulted', 'recommended'), null, 'the tables are silent — the residue');
  assert.equal(strengthAtLeast('said', 'said'), true);
});

test('a relation claim over a weaker span predicate ships uncited-unsupported; unordered ships INDETERMINATE', () => {
  const doc = parseText(
    'Ross referred Ann to the clinic on Monday. Ann thanked Ross for the help.', { docId: 'tb5' });
  const weaker = bindCitations('Ross recommended Ann.', spansOf(doc), { doc, cursor: 0, typed: true })[0];
  assert.equal(weaker.typed?.op, 'CON');
  assert.equal(weaker.typed?.verdict, 'unsupported', 'the span holds strictly less than the claim asserts');
  assert.equal(weaker.typed?.reason, 'predicate-weaker');
  assert.equal(weaker.citation, null);

  const doc2 = parseText('Ross recommended Ann to the clinic. Ann thanked Ross.', { docId: 'tb6' });
  const stronger = bindCitations('Ross referred Ann.', spansOf(doc2), { doc: doc2, cursor: 0, typed: true })[0];
  assert.equal(stronger.typed?.verdict, 'supported', 'the stronger span predicate entails the weaker claim');
  assert.equal(stronger.citation, 's0');

  const doc3 = parseText('Ross consulted Ann about the clinic. Ann thanked Ross.', { docId: 'tb7' });
  const silent = bindCitations('Ross recommended Ann.', spansOf(doc3), { doc: doc3, cursor: 0, typed: true })[0];
  assert.equal(silent.typed?.verdict, 'indeterminate', 'the tables are silent — underconfident, uncited, never guessed');
  assert.equal(silent.typed?.reason, 'strength-unordered');
  assert.equal(silent.citation, null);
});

test('evaluation entailment: degree and polarity decide where the lexicon reaches, silence suspends', () => {
  assert.equal(evalEntails('best', 'good'), true, 'the top degree entails the lower');
  assert.equal(evalEntails('good', 'best'), false, '"good" does not support "the best"');
  assert.equal(evalEntails('worst', 'best'), false, 'opposite polarity never entails');
  assert.equal(evalEntails('remarkable', 'best'), null, 'outside the lexicon — the residue');
  assert.equal(evalTermOf('the finest film of 1979'), 'finest');
  assert.equal(valueEntails("Gregor's sister", 'siblings'), true, 'kin values entail through the primitive');
});

// ── the grammar: witnesses replay, revisions chain, opt-off is byte-identical ──

test('the predication DEF replays from its own witness — no scalar stamps', () => {
  const doc = parseText('Ross referred Ann to the clinic. Ann thanked Ross.', { docId: 'tb8' });
  const spans = spansOf(doc);
  const bound = bindCitations('Ross recommended Ann.', spans, { doc, cursor: 0, typed: true });
  const log = createJudgmentLog();
  recordBindingDefs(log, bound);
  const def = log.latestOf('predication:Ross recommended Ann.');
  assert.ok(def && !def.malformed);
  const w = def.witness;
  assert.equal(w.gate, 'predication');
  assert.ok(w.strength, 'the order consulted rides in the witness');
  // Replay: re-run the aligner from the witness's own sentence over the same spans.
  const again = predicationSupport(typeClaim(w.sentence, doc, 0), spans, doc, 0);
  assert.equal(again.verdict, 'unsupported');
  assert.equal(w.reason, again.reason, 'the witness reproduces the verdict and its reason');
});

test('factcheck REVISES the binder\'s predication DEF — one subject, two readings, one chain', () => {
  const doc = parseText('Grete is Gregor\'s sister. Grete played the violin.', { docId: 'tb9' });
  const bound = bindCitations('Grete and Gregor are siblings.', spansOf(doc), { doc, cursor: 0, typed: true });
  const log = createJudgmentLog();
  recordBindingDefs(log, bound);
  recordCorrespondenceDefs(log, [{ sentence: 'Grete and Gregor are siblings.', verdict: VERDICTS.CORROBORATED, citation: 's0' }]);
  const events = log.all().filter((e) => e.of === 'predication:Grete and Gregor are siblings.');
  assert.equal(events.length, 2, 'the binder seeds, the fact-checker revises — both kept');
  assert.equal(events[1].revises, events[0].t, 'the chain is explicit, never a silent supersession');
  assert.equal(log.latestOf('predication:Grete and Gregor are siblings.').verdict, VERDICTS.CORROBORATED);
  // With no prior (untyped path), correspondence still lands as a first judgment.
  const log2 = createJudgmentLog();
  recordCorrespondenceDefs(log2, [{ sentence: 'fresh.', verdict: VERDICTS.UNSUPPORTED }]);
  assert.equal(log2.latestOf('predication:fresh.').revises, null);
});

test('opt-off and admission-less docs are byte-identical to the lexical binder', () => {
  const doc = parseText('Dolphins range in sizes from the small Maui to the orca.', { docId: 'tb10' });
  const spans = spansOf(doc);
  const draft = 'Dolphins range in sizes from the small Maui to the orca.';
  const off = bindCitations(draft, spans, { doc, cursor: 0 });
  assert.equal(off[0].typed, undefined, 'typed rides only when asked for');
  // The hand-built fixture doc (bind-referent.test.js shape) has no admission.idOf — the
  // typed flag is inert there and the lexical paths decide, exactly as before.
  const bare = { sentences: [draft], admission: { labelOf: (id) => id } };
  const on = bindCitations(draft, [{ idx: 0, text: draft }], { doc: bare, cursor: 0, typed: true });
  assert.equal(on[0].typed, undefined, 'no resolving admission → the lexical floor, byte-identical');
  assert.equal(on[0].citation, 's0');
});

test('a verbatim claim is never demoted by typing — the same parse meets itself', () => {
  const text = 'Dolphins range in sizes from the small Maui to the orca, the apex predator. '
    + 'Some dolphins can leap nine metres.';
  const doc = parseText(text, { docId: 'tb11' });
  const bound = bindCitations('Dolphins range in sizes from the small Maui to the orca, the apex predator.',
    spansOf(doc), { doc, cursor: 0, typed: true });
  assert.equal(bound[0].citation, 's0', 'the verbatim lift survives the typed path');
});
