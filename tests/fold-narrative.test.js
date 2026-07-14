// fold-narrative — the turn's stages, spoken as one honest line each, drive the answer
// bubble's thinking trail on every turn. This pins the mapping: which stages speak, what
// they say from their `data`, and which stay silent (a book-keeping pass, or a pass that
// did nothing this turn).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { foldNarrative } from '../src/rooms/reader/fold-narrative.js';

test('the visible stages each speak from their data', () => {
  assert.deepEqual(foldNarrative('route', {}), { kind: 'think', text: 'Taking in the question' });
  assert.deepEqual(foldNarrative('route', { meta: true }), { kind: 'think', text: 'Reading the conversation' });
  assert.deepEqual(foldNarrative('retrieve', { n: 5 }), { kind: 'read', text: 'Read 5 passages from the record' });
  assert.deepEqual(foldNarrative('retrieve', { n: 1 }), { kind: 'read', text: 'Read 1 passage from the record' });
  assert.deepEqual(foldNarrative('fold', {}), { kind: 'fold', text: 'Folded the reading' });
  assert.deepEqual(foldNarrative('fold', { surf: { stops: 3 } }), { kind: 'fold', text: 'Folded the reading — 3 stops' });
  assert.deepEqual(foldNarrative('fold', { surf: { stops: [2, 4, 5] } }), { kind: 'fold', text: 'Folded the reading — 3 stops' },
    'surf.stops as a cursor array reads as its count, not "2,4,5 stops"');
  assert.deepEqual(foldNarrative('fold', { surf: { stops: [] } }), { kind: 'fold', text: 'Folded the reading' });
  assert.deepEqual(foldNarrative('llm', {}), { kind: 'phrase', text: 'Phrasing the answer' });
  assert.deepEqual(foldNarrative('bind', { cited: 2 }), { kind: 'bind', text: 'Bound 2 citations' });
  assert.deepEqual(foldNarrative('predict', { draft: 'the dolphin…', confident: true }),
    { kind: 'fold', text: 'Drafted a grounded answer' });
  assert.deepEqual(foldNarrative('predict', { draft: 'x' }), { kind: 'fold', text: 'Drafted an answer' });
  assert.equal(foldNarrative('predict', {}), null, 'no draft → no beat');
});

test('audit the surf — the fold beat carries the reading path when one was assembled', () => {
  const beat = foldNarrative('fold', { surf: {
    stops: [2, 4], anchor: 0, peak: 4, rode: 'bayesian-figure',
    atmosphere: { verdict: 'coheres', tone: 'measured' },
    stance: { guard: true },
    path: [
      { idx: 0, bayes: 0.10, text: 'It opens here.',  anchor: true,  stop: false, peak: false },
      { idx: 2, bayes: 0.40, text: 'The turn.',        anchor: false, stop: true,  peak: false },
      { idx: 4, bayes: 0.91, text: 'The crisis lands.', anchor: false, stop: true,  peak: true  },
    ],
  } });
  assert.equal(beat.kind, 'fold');
  assert.equal(beat.text, 'Folded the reading — 2 stops', 'the line is unchanged — the audit rides beside it');
  assert.ok(beat.surf, 'the reading path rides on the beat');
  assert.equal(beat.surf.path.length, 3, 'anchor + two stops (the peak is one of them)');
  assert.equal(beat.surf.path[2].peak, true);
  assert.match(beat.surf.rode, /surprise/, 'the discipline it rode is humanised');
  assert.match(beat.surf.read, /coheres/, 'the interpretive read folds in the atmosphere verdict');
  assert.match(beat.surf.read, /guard held/, '…and whether the confabulation guard held');
});

test('audit the surf — no path, or a path of only empty text, adds nothing to the beat', () => {
  assert.equal(foldNarrative('fold', { surf: { stops: [2, 4] } }).surf, undefined, 'no path → no audit payload');
  assert.equal(
    foldNarrative('fold', { surf: { stops: [1], path: [{ idx: 1, text: '' }] } }).surf, undefined,
    'a textless path is nothing to audit',
  );
  // and the interpretive read stays silent on the plain structural surf (no atmosphere/stance)
  const bare = foldNarrative('fold', { surf: { stops: [1], path: [{ idx: 1, text: 'x', stop: true }] } });
  assert.equal(bare.surf.read, null);
});

test('retrieve tells the truth when the record had nothing', () => {
  assert.deepEqual(foldNarrative('retrieve', { n: 0 }), { kind: 'warn', text: 'The record had nothing close' });
});

test('factcheck reports its census and flips to warn on a contradiction', () => {
  assert.deepEqual(foldNarrative('factcheck', { corroborated: 3 }),
    { kind: 'check', text: 'Checked against the record — 3 corroborated' });
  assert.deepEqual(foldNarrative('factcheck', { corroborated: 2, contradicted: 1, unsupported: 1 }),
    { kind: 'warn', text: 'Checked against the record — 2 corroborated, 1 contradicted, 1 unsupported' });
  assert.equal(foldNarrative('factcheck', { corroborated: 0, contradicted: 0, unsupported: 0 }), null,
    'nothing checked → no beat');
});

test('veto only speaks when it fired', () => {
  assert.deepEqual(foldNarrative('veto', { fired: ['a', 'b'] }), { kind: 'warn', text: 'Flagged 2 unsupported claims' });
  assert.equal(foldNarrative('veto', { fired: [] }), null);
  assert.equal(foldNarrative('veto', {}), null);
});

test('a pass that did nothing this turn stays silent', () => {
  assert.equal(foldNarrative('inquire', { added: 0 }), null);
  assert.equal(foldNarrative('reason', { steps: 0 }), null);
  assert.equal(foldNarrative('bind', { cited: 0 }), null);
  assert.equal(foldNarrative('revise', { attempts: 0 }), null);
});

test('the book-keeping stages are not narrated', () => {
  for (const name of ['expect', 'converse', 'answerable', 'gate', 'settle', 'unknown']) {
    assert.equal(foldNarrative(name, {}), null, `${name} should stay silent`);
  }
});

test('it is total — never throws on missing or absent data', () => {
  for (const name of ['route', 'retrieve', 'inquire', 'fold', 'reason', 'prompt', 'llm', 'bind', 'factcheck', 'revise', 'veto', 'settle']) {
    assert.doesNotThrow(() => foldNarrative(name));
    assert.doesNotThrow(() => foldNarrative(name, undefined));
    const beat = foldNarrative(name);
    if (beat) { assert.equal(typeof beat.kind, 'string'); assert.equal(typeof beat.text, 'string'); }
  }
});

// ── verbose: the whole fold, openable ────────────────────────────────────────
test('verbose is opt-in — default is byte-identical to the curated view', () => {
  // the stages the curated view keeps silent stay silent without the flag
  for (const name of ['expect', 'converse', 'answerable', 'gate', 'settle']) {
    assert.equal(foldNarrative(name, {}), null);
    assert.equal(foldNarrative(name, {}, {}), null, 'an empty opts is still the curated view');
  }
  // and the ones that speak say exactly what they said before
  assert.deepEqual(foldNarrative('route', {}, { verbose: false }),
    { kind: 'think', text: 'Taking in the question' });
});

test('verbose un-silences every stage — the book-keeping passes now speak', () => {
  for (const name of ['expect', 'converse', 'answerable', 'gate', 'settle', 'absence', 'murmur', 'reflect', 'judgments']) {
    const beat = foldNarrative(name, {}, { verbose: true });
    assert.ok(beat, `${name} should speak in verbose`);
    assert.equal(typeof beat.kind, 'string');
    assert.ok(beat.text, `${name} carries a headline`);
  }
  // a genuinely unknown stage still stays silent, even verbose
  assert.equal(foldNarrative('nonsense-stage', {}, { verbose: true }), null);
});

test('verbose keeps the curated line and glyph where a stage already spoke', () => {
  const curated = foldNarrative('bind', { cited: 2 });
  const verbose = foldNarrative('bind', { cited: 2 }, { verbose: true });
  assert.equal(verbose.kind, curated.kind);
  assert.equal(verbose.text, curated.text, 'the headline is the curated line, not a generic label');
  // …but a no-op stage the curated view dropped now speaks with its data
  assert.equal(foldNarrative('bind', { cited: 0 }), null);
  const nooped = foldNarrative('bind', { cited: 0, claims: 3 }, { verbose: true });
  assert.ok(nooped, 'the no-op bind still speaks in verbose');
});

test('verbose hangs the stage data off the beat as openable detail rows', () => {
  const beat = foldNarrative('retrieve', { ms: 47, n: 6, top: 0.2857, eo: 'SEG(Field, Clearing)' }, { verbose: true });
  assert.ok(Array.isArray(beat.detail), 'detail is an array of rows');
  const byLabel = Object.fromEntries(beat.detail.map((r) => [r.label, r.value]));
  assert.equal(byLabel.n, '6');
  assert.equal(byLabel.ms, '47');
  assert.equal(byLabel.eo, 'SEG(Field, Clearing)', 'the operator notation rides as a row');
  for (const r of beat.detail) { assert.equal(typeof r.label, 'string'); assert.equal(typeof r.value, 'string'); }
});

test('verbose detail flattens one object level and joins scalar arrays', () => {
  const beat = foldNarrative('predict', {
    ms: 13, primary: 'Calderon Bay', entities: ['Vane', 'Okonkwo'],
    shape: { intent: 'lookup', confidence: 0.099 },
  }, { verbose: true });
  const byLabel = Object.fromEntries(beat.detail.map((r) => [r.label, r.value]));
  assert.equal(byLabel.primary, 'Calderon Bay');
  assert.equal(byLabel.entities, 'Vane, Okonkwo', 'a scalar array joins');
  assert.equal(byLabel['shape·intent'], 'lookup', 'an object descends one label deep');
  assert.equal(byLabel['shape·confidence'], '0.099');
});

test('verbose surfaces the built prompt VERBATIM on the prompt stage', () => {
  const promptText = 'system: You are the voice of a reader.\n\nuser: What it was: 8 sources · text.';
  const beat = foldNarrative('prompt', { ms: 1, promptLen: promptText.length, promptText }, { verbose: true });
  assert.equal(beat.text, 'Built the grounded prompt');
  assert.equal(beat.prompt, promptText, 'the exact prompt bytes ride on the beat for the surface to reveal');
  // no prompt text (older record / not threaded) → no prompt payload, but the beat still speaks
  const bare = foldNarrative('prompt', { ms: 1, promptLen: 0 }, { verbose: true });
  assert.equal(bare.prompt, undefined);
  assert.equal(bare.text, 'Built the grounded prompt');
});

test('verbose still audits the surf path on the fold beat', () => {
  const beat = foldNarrative('fold', { surf: {
    stops: [2, 4], path: [
      { idx: 2, bayes: 0.4, text: 'The turn.', stop: true },
      { idx: 4, bayes: 0.9, text: 'The crisis.', stop: true, peak: true },
    ],
  } }, { verbose: true });
  assert.equal(beat.text, 'Folded the reading — 2 stops');
  assert.ok(beat.surf, 'the reading path still rides on the verbose fold beat');
  assert.equal(beat.surf.path.length, 2);
});
