import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleBrief } from '../src/weave/write/index.js';
import { surfFold } from '../src/surfer/index.js';
import { parseText } from '../src/perceiver/parse/index.js';

// THE POST-ANSWER STALL FIX (weave/write/assemble.js, turn/pipeline.js). assembleBrief builds
// the audit's "what the talker would be handed" brief. It used to re-surf the document FROM
// SCRATCH with adaptive reach — surfFold(0, 'adaptive') reads readingAt at EVERY unit, O(S) —
// and the pipeline runs it inside turn.finish(), on the turn's blocking path, AFTER the answer
// is already produced, purely to populate reading.llm. On a large document (a big source, or
// several fetched pages folded into one) that is tens of seconds of hang between `self` and the
// record's completion: the turn looks stalled long after the answer streamed. The fix hands
// assembleBrief the surf the turn ALREADY did (the fold stage's ctx.surf), so it reconstructs the
// brief from that instead of re-reading the whole document; and the no-surf fallback drops to the
// bounded windowed reach on a large document so it can never pay O(S) either.

// Build an N-sentence document with a recurring hot figure — the shape (a common subject party to
// many bonds, plus filler) that made the from-scratch whole-document surf pathological.
const bigDoc = (clusters = 600) => {
  const names = ['Roger Ebert', 'Rex Reed', 'Rotten Tomatoes', 'Metacritic', 'Empire', 'Razzies', 'Madonna', 'Guy Ritchie'];
  const verbs = ['won', 'received', 'lost', 'claimed', 'stated', 'directed', 'starred', 'produced'];
  const parts = [];
  for (let i = 0; i < clusters; i++) {
    parts.push(`Worst Picture ${verbs[i % verbs.length]} ${names[i % names.length]}.`);
    parts.push(`${names[(i + 1) % names.length]} reviewed Worst Picture.`);
    for (let k = 0; k < 8; k++) parts.push('Critics wrote that the picture was ranked among the worst movies ever made that season.');
  }
  return parseText(parts.join(' '), { docId: 'worst.txt', genderCoref: true });
};

test('assembleBrief reuses the surf it is handed instead of re-surfing the document', () => {
  const doc = bigDoc(20);
  // A sentinel reading: a KNOWN small stop set the from-scratch adaptive surf would never produce.
  const surf = { stops: [2, 6], focus: 'Worst Picture', recCursors: [], field: [], peak: 2, anchor: 2 };

  const b = assembleBrief(doc, { question: 'what is the worst movie?', surf });

  // The brief's surf IS the one handed in — proof no second, whole-document surf ran.
  assert.deepEqual(b.surf.stops, [2, 6], 'the reused stop set rode straight through');
  assert.equal(b.surf.focus, 'Worst Picture', 'the reused focus rode straight through');
  // And it still assembled a real payload from that reading.
  assert.ok(b.prompt.system && b.prompt.user, 'a system+user talker payload was built');
  assert.equal(typeof b.draft, 'string', 'a no-LLM draft was produced');
});

test('the reuse path is bounded on a large document — no O(S) whole-document re-read', () => {
  const doc = bigDoc(600);                       // ~6000 sentences
  const S = (doc.units || doc.sentences || []).length;
  assert.ok(S >= 5000, `a genuinely large document (${S} sentences)`);

  // What the fold stage produces: a bounded surf at an anchor (default windowed reach).
  const foldSurf = surfFold(doc, 5, {});
  const t0 = Date.now();
  const b = assembleBrief(doc, { question: 'what is the worst movie?', surf: foldSurf });
  const ms = Date.now() - t0;

  // Pre-fix this ran the whole-document adaptive surf (~35s here); reusing the fold surf is
  // near-instant. A generous ceiling catches a regression without being flaky on a slow CI box.
  assert.ok(ms < 5000, `reused-surf brief stays bounded on a large doc (took ${ms}ms)`);
  assert.ok(b.prompt.system && b.prompt.user, 'a valid brief was still assembled');
});

test('the no-surf fallback is bounded on a large document (defense in depth)', () => {
  const doc = bigDoc(600);
  const t0 = Date.now();
  const b = assembleBrief(doc, { question: 'what is the worst movie?' });   // no surf handed in
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `the no-surf fallback drops to a bounded reach on a large doc (took ${ms}ms)`);
  assert.ok(b.prompt.system && b.prompt.user, 'a valid brief was still assembled from the bounded reach');
});

test('a small document is unchanged — the adaptive surf still runs when no surf is handed in', () => {
  const doc = parseText(
    'Gregor woke changed. His father drove him back with a stick. Grete turned away from him. In the morning the charwoman found him dead.',
    { docId: 'metamorphosis.txt', genderCoref: true },
  );
  const b = assembleBrief(doc, { question: 'what happened to gregor?' });
  // The point is only that the small-doc path is untouched and still yields a brief; it must not
  // have been forced onto the large-doc fallback.
  assert.ok(b.prompt.system && b.prompt.user, 'the small-doc adaptive path still assembles a brief');
  assert.equal(typeof b.draft, 'string', 'and still renders a no-LLM draft');
});
