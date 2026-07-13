import { test } from 'node:test';
import assert from 'node:assert/strict';

import { innerVoice } from '../src/murmur/narrate/voice.js';
import { createMurmur } from '../src/murmur/index.js';

// The model-free inner voice (src/murmur/narrate/voice.js). The strip must read like a MIND, not a
// dashboard: no gauges, no register %, but first-person OPPOSITIONS — the either/or a thought is
// caught in. These assert the shape (prose, not metrics), the grading (a felt WORD, never a number),
// the determinism (a replayable rotation), and that a wired murmur surfaces the voice on its snapshot.

const imp = (register, decayedIntensity, phrase = null) => ({ register, decayedIntensity, phrase });

test('a crossed register becomes a first-person opposition — prose, no number', () => {
  const v = innerVoice({ signal: { drift: 0.88 }, impressions: [imp('drift', 0.88)], rotate: 0 });
  assert.equal(v.length, 1);
  assert.equal(v[0].register, 'drift');
  const t = v[0].text;
  assert.ok(t.includes('?'), 'it poses the tension as a question');
  assert.ok(/lost|turn back|wandering/.test(t), 'it names the opposite pole (are we lost / turn back)');
  assert.ok(!/\d/.test(t), 'no digits — a voicing, never a metric');
});

test('intensity grades into a FELT word, not a percentage', () => {
  const faint = innerVoice({ impressions: [imp('drift', 0.58)], rotate: 0 })[0].text;
  const strong = innerVoice({ impressions: [imp('drift', 0.95)], rotate: 0 })[0].text;
  assert.ok(faint.includes('a little'), 'a faint drift eases "a little" off');
  assert.ok(strong.includes('far'), 'a strong drift is "far" off');
  assert.notEqual(faint, strong, 'the degree changes the words, not a bar width');
});

test('each register voices its own opposition', () => {
  const reg = (r, x) => innerVoice({ impressions: [imp(r, x)], rotate: 0 })[0];
  assert.match(reg('unease', 0.8).text, /trust|believe|sure/i);
  assert.match(reg('surprise', 0.8).text, /new|find|true/i);
  assert.match(reg('recognition', 0.97).text, /same|repeat|rhyming|echo|patterns/i);
});

test('a wander/narrator phrase leads verbatim — the murmur\'s own words win', () => {
  const v = innerVoice({
    signal: { drift: 0.9 },
    impressions: [imp('drift', 0.9)],
    mutter: { register: 'curiosity', phrase: 'turning over the harbor treaty' },
    rotate: 0,
  });
  assert.equal(v[0].text, 'turning over the harbor treaty', 'the voiced phrase is first, unaltered');
  assert.equal(v[1].register, 'drift', 'a live register still trails as a second thought');
  assert.equal(v.length, 2, 'at most two thoughts flow at once');
});

test('the rotation is deterministic — same inputs, same words (replayable)', () => {
  const a = innerVoice({ impressions: [imp('surprise', 0.8)], rotate: 3 })[0].text;
  const b = innerVoice({ impressions: [imp('surprise', 0.8)], rotate: 3 })[0].text;
  assert.equal(a, b, 'no clock, no randomness');
  const c = innerVoice({ impressions: [imp('surprise', 0.8)], rotate: 4 })[0].text;
  assert.notEqual(a, c, 'a different rotation reads differently (a session varies)');
});

test('the quiet mind still speaks — never a blank strip, still a faint opposition', () => {
  const resting = innerVoice({ signal: null, impressions: [], rotate: 0 });
  assert.equal(resting.length, 1);
  assert.ok(/still|reading along|pulling/.test(resting[0].text), 'a resting line, not empty');
  const along = innerVoice({ signal: { concentration: 0.9, drift: 0.1 }, impressions: [], rotate: 0 });
  assert.ok(/reading along/.test(along[0].text), 'sub-threshold, it reports the calm as prose');
});

test('a wired murmur surfaces the VOICE on its snapshot (no gauges consumed by the strip)', async () => {
  const V = (x, y) => Float32Array.from([x, y]);
  const m = createMurmur({ now: () => 1000 });
  // exchange 1 anchors the topic on-question; exchange 2 reads a perpendicular passage → drift fires.
  await m.observe({ ref: { turnId: 't1', stepName: 'fold', t: 1 }, query: 'the harbor treaty', queryVec: V(1, 0), readingVecs: [V(1, 0)], concentration: { concentrated: true, top: 0.9 }, measuresMeaning: true });
  const snap = await m.observe({ ref: { turnId: 't2', stepName: 'fold', t: 2 }, query: 'go on', queryVec: V(1, 0), readingVecs: [V(0, 1)], concentration: { concentrated: false, top: 0.3 }, measuresMeaning: true });
  assert.ok(Array.isArray(snap.voice) && snap.voice.length >= 1, 'the snapshot carries prose thoughts');
  assert.ok(snap.voice.every((t) => typeof t.text === 'string' && t.text.length), 'every thought is prose');
  assert.ok(m.state().voice.length >= 1, 'the read side-channel exposes the voice to the strip');
});
