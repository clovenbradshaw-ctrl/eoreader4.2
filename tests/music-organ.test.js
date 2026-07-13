import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runArtifact, organForKind, createTaskSpec } from '../src/frame/tasks/index.js';
import { musicOrgan } from '../src/organs/out/index.js';
import { ingestMusic } from '../src/organs/in/music.js';
import { projectGraph } from '../src/core/index.js';

// The music LOOP, pinned end to end: a musical request routes to the music organ,
// plans in beats, hands the generator well-formed musical directives, assembles the
// phrases — and the composed notes go straight back through the ear (ingestMusic)
// into the same graph spine prose lands on. This is the competency the omnimodal
// task language exists to prove (docs/omnimodal-task-language.md); nothing here
// touches a model — the generator is a stub, as everywhere in this suite.

test('music/route: musical artifact nouns reach the music organ, prose stays text', () => {
  assert.equal(organForKind('lullaby'), 'music');
  assert.equal(organForKind('song'), 'music');
  assert.equal(organForKind('memo'), 'text');
  assert.equal(createTaskSpec({ request: 'compose a short lullaby about the sea' }).kind, 'lullaby');
});

test('music/lower: every directive reads as an instruction, cadences in natural order', () => {
  assert.equal(musicOrgan.lower({ act: 'open', subject: 'the sea at dusk' }),
    'State the opening motif of a phrase evoking the sea at dusk.');
  assert.equal(musicOrgan.lower({ act: 'develop', subject: 'the tide', detail: 'in a minor mode' }),
    'Develop and vary the motif of a phrase evoking the tide, in a minor mode.');
  // the object comes BEFORE the destination — not "Resolve to a cadence a phrase…"
  assert.equal(musicOrgan.lower({ act: 'close', subject: 'the sea' }),
    'Resolve a phrase evoking the sea to a cadence.');
  assert.equal(musicOrgan.lower({ act: 'resolve' }), 'Resolve a phrase to a cadence.');
  // an unknown act still yields a playable instruction, never a crash
  assert.equal(musicOrgan.lower({ act: 'improvise', subject: 'rain' }), 'Play a phrase evoking rain.');
});

test('music/run: a lullaby request plans in beats, renders phrases, and round-trips through the ear', async () => {
  const calls = [];
  const stubMusic = async (view) => {
    calls.push(view);
    const bank = ['C4', 'E4', 'G4', 'A4', 'G4', 'E4'];
    const n = Math.max(2, Math.min(view.maxBeats || 4, 12));
    return Array.from({ length: n }, (_, i) => bank[i % bank.length]).join(' ');
  };
  const res = await runArtifact({
    request: 'compose a short lullaby about the sea',
    organs: { text: async () => { throw new Error('a lullaby leaf must not render as text'); }, music: stubMusic },
  });
  assert.equal(res.graph.root.status, 'done', 'the piece rolled up done');
  assert.equal(res.progress.done, res.progress.total, 'every phrase leaf landed');
  assert.ok(calls.length >= 2, `the arc decomposed into phrases (got ${calls.length} leaves)`);
  for (const c of calls) {
    assert.ok(c.maxBeats >= musicOrgan.minBudget && c.maxBeats <= musicOrgan.ceiling,
      `each leaf budgets beats within [${musicOrgan.minBudget}, ${musicOrgan.ceiling}] (got ${c.maxBeats})`);
    assert.equal(c.unit, 'beats');
    assert.match(String(c.goal), /motif|cadence|phrase/i, `the directive is musical: ${c.goal}`);
    assert.match(String(c.goal), /the sea/, 'the subject rides into every phrase directive');
  }
  // the composed melody is a valid score: the ear hears every note and folds the
  // pitch-class web — the same entities/edges spine a text source lands on.
  const notes = String(res.output || '').split(/\s+/).filter(Boolean);
  assert.ok(notes.length >= 6, `the assembled piece carries the phrases (${notes.length} notes)`);
  const heard = ingestMusic({ name: 'roundtrip', notes });
  const g = projectGraph(heard.log);
  assert.deepEqual([...g.entities.keys()].sort(), ['A', 'C', 'E', 'G'], 'pitch classes are the entities');
  assert.ok((g.edges || []).length > 0, 'the intervals are the bonds');
  assert.equal(heard.units.length, notes.length, 'every composed note was heard');
});
