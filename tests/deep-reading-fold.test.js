import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderContinuation } from '../src/weave/longgen/render.js';
import { walk } from '../src/weave/longgen/index.js';
import { deepReading } from '../src/surfer/fold/index.js';
import { surfFold } from '../src/surfer/index.js';
import { canWitness } from '../src/core/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// DEEP READING → GENERATION with the epistemics kept: the reflection rides the beat prompt
// as the reader's OWN reading (reafferent), NOT under the excerpts header, so the binder
// never grounds a claim on it. This is the firewall (docs/deep-reading.md) carried into the
// generation prompt: the model composes WITH the thought; the grounder pulls it apart from
// the witnessed existence/structure.

const beat = { id: 'b0', order: 0, role: 'open', heading: null, kind: 'load-bearing', idx: 0 };
const slice = [{ idx: 0, text: 'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.' }];

test('the reflection rides the prompt marked as the reader’s own reading, never the citable Record', () => {
  const plain = renderContinuation({ beat, slice, prior: 'A prior paragraph.' });
  const same = renderContinuation({ beat, slice, prior: 'A prior paragraph.', reflection: '' });
  assert.deepEqual(same, plain, 'no reflection ⇒ byte-identical prompt (parity)');

  const withRefl = renderContinuation({ beat, slice, prior: 'A prior paragraph.', reflection: 'the stoop is the crux — speed is the whole adaptation' });
  const user = withRefl[1].content;
  assert.match(user, /Reading note \(your own reflection/, 'the reflection is marked as the reader’s own reading');
  assert.match(user, /speed is the whole adaptation/, 'the reflection body is present');
  // the epistemic separation in the prompt: the reflection is NOT under the excerpts header
  // (What I found reading it:), so the binder — which keys on that header — cannot cite it.
  const excerptsAt = user.indexOf('What I found reading it:');
  const reflAt = user.indexOf('Reading note');
  assert.ok(excerptsAt >= 0 && reflAt > excerptsAt, 'the reflection sits below the excerpts header, not inside it');
  assert.ok(!user.slice(excerptsAt, reflAt).includes('speed is the whole adaptation'), 'the reflection body is NOT inside the citable excerpts block');
});

test('a deep-reading reflection is reafferent — the firewall the prompt marking mirrors', () => {
  const doc = parseText('Gregor woke changed. His body was armored. The family gathered and would not enter. His father drove him back with a stick. The apple festered in his back. In the morning the charwoman found him dead.', { docId: 'k.txt' });
  const before = doc.log.length;
  const r = deepReading(doc, { surf: surfFold, commit: false });   // peek — do not pollute the log
  assert.ok(r && r.body.length > 0, 'a reflection with a body was produced');
  assert.equal(doc.log.length, before, 'commit:false leaves the source log untouched');
  assert.equal(r.canWitness, false, 'the reflection cannot witness — reafference, canWitness === false');
  assert.equal(r.event.op, 'EVA', 'it is an enacted EVA (the judgment operator)');
  assert.equal(r.event.door, 'enactor', 'enactor door — so ground/provenance separates it from witnessed content');
});

test('walk parity: no deepRead bundle ⇒ the walk is byte-identical', async () => {
  const model = { name: 'mock', async phrase() { return 'The peregrine is the fastest animal. Its stoop is a controlled dive. Every proportion serves speed.'; } };
  const POOL = [
    'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.',
    'Falcons favour tall cliffs away from human establishments.',
    'The peregrine has a body length of thirty-four to fifty-eight centimetres.',
  ].map((text, i) => ({ idx: i, score: 0.9 - i * 0.05, text }));
  const refold = async ({ seen }) => POOL.filter((s) => !seen.has(String(s.idx))).slice(0, 3);
  const base = await walk({ fold: [], design: { demand: 2, question: 'falcons' }, model, refold, groundLater: true });
  const same = await walk({ fold: [], design: { demand: 2, question: 'falcons' }, model, refold, groundLater: true, deepRead: null });
  assert.equal(same.answer, base.answer, 'deepRead:null ⇒ identical output');
});

test('walk with a deepRead bundle folds a reflection into the beat (source surfed, reader’s own note)', async () => {
  const seenPrompts = [];
  const model = { name: 'mock', async phrase(messages) { seenPrompts.push(messages[1].content); return 'The peregrine is the fastest animal. Its stoop is a controlled dive.'; } };
  const POOL = [
    'The peregrine falcon reaches speeds over three hundred kilometres per hour in its stoop.',
    'Falcons favour tall cliffs away from human establishments.',
    'The peregrine has a body length of thirty-four to fifty-eight centimetres.',
  ].map((text, i) => ({ idx: i, score: 0.9 - i * 0.05, text }));
  const refold = async ({ seen }) => POOL.filter((s) => !seen.has(String(s.idx))).slice(0, 3);
  // A source with a real EVALUABLE place — bonds (falcon strikes prey, falconers trained the
  // peregrine, kings prized the bird), not a bare opening. A reflection is an EVA (an evaluation),
  // so it forms where a relation arrives, never on a figure merely entering.
  const source = parseText('The peregrine falcon is a raptor. It hunts other birds in the air. In its stoop the falcon strikes its prey at great speed. The impact kills the prey outright. Falconers trained the peregrine for the hunt. Medieval kings prized the bird above all others.', { docId: 'src.txt' });
  const res = await walk({ fold: [], design: { demand: 2, question: 'falcons' }, model, refold, groundLater: true, deepRead: { source, surf: surfFold } });
  assert.ok(res.paragraphs.length >= 1, 'the walk still produces paragraphs');
  assert.ok(seenPrompts.some((p) => /Reading note \(your own reflection/.test(p)), 'at least one beat prompt carried a reflection, marked as the reader’s own');
});
