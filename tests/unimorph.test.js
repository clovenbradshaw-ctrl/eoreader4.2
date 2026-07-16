import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseUnimorph, createMorphology, warmMorphology, unimorphUrl } from '../src/organs/ingest/index.js';
import { toPast, learnIrregular } from '../src/weave/write/morph.js';

// UniMorph as an on-demand morphology lookup (organs/ingest/unimorph.js). The parse is offline and
// pure; the fetch is an injected seam, so the whole organ is exercised headlessly with a fake
// language file — no network. A UniMorph row is `lemma <TAB> form <TAB> feature-bundle`.
const SAMPLE = [
  'eat\teats\tV;PRS;3;SG',
  'eat\teating\tV;V.PTCP;PRS',
  'eat\tate\tV;PST',                 // the simple past — what we want
  'eat\teaten\tV;V.PTCP;PST',        // the participle — bundle CONTAINS PST but is not it
  'eat\teats\tN;PL',
  'bring\tbrought\tV;PST',
  'go\twent\tV;PST',
  'smite\tsmote\tV;PST',             // an irregular (also in the seed dump — see the note below)
  'smite\tsmitten\tV;V.PTCP;PST',
  'zorp\tzurp\tV;PST',               // a SYNTHETIC irregular, deliberately absent from the seed
  'zorp\tzorped\tV;V.PTCP;PST',      // so it isolates the learned overlay from the packaged table
  '',
  'malformed line with no tabs',
].join('\n');

test('parseUnimorph extracts the SIMPLE PAST and rejects the participle', () => {
  const map = parseUnimorph(SAMPLE, { tag: 'V;PST' });
  assert.equal(map.get('eat'), 'ate');
  assert.equal(map.get('bring'), 'brought');
  assert.equal(map.get('go'), 'went');
  assert.equal(map.get('smite'), 'smote');
  // "eaten"/"smitten" carry V;V.PTCP;PST, not the exact V;PST bundle — never folded in.
  assert.ok(![...map.values()].includes('eaten'));
  assert.ok(![...map.values()].includes('smitten'));
});

test('parseUnimorph tolerates blank and malformed lines', () => {
  const map = parseUnimorph(SAMPLE, { tag: 'V;PST' });
  assert.equal(map.size, 5);   // eat, bring, go, smite, zorp — nothing spurious
});

test('createMorphology.pastOf looks a verb up, and caches the language file', async () => {
  let fetches = 0;
  const fetchUrl = (url) => { fetches += 1; assert.equal(url, unimorphUrl('eng')); return { text: SAMPLE }; };
  const m = createMorphology({ fetchUrl });

  assert.equal(await m.pastOf('smite'), 'smote');
  assert.equal(await m.pastOf('bring'), 'brought');
  assert.equal(await m.pastOf('walk'), null);   // not in the sample → a clean miss
  assert.equal(fetches, 1, 'the 18MB language file is fetched ONCE, then served from the session cache');
  assert.equal(m.loaded(), true);
});

test('a concurrent first lookup awaits ONE in-flight load, not two fetches', async () => {
  let fetches = 0;
  const fetchUrl = async (_url) => { fetches += 1; await Promise.resolve(); return { text: SAMPLE }; };
  const m = createMorphology({ fetchUrl });
  const [a, b] = await Promise.all([m.pastOf('go'), m.pastOf('eat')]);
  assert.equal(a, 'went');
  assert.equal(b, 'ate');
  assert.equal(fetches, 1);
});

test('a failed or timed-out fetch degrades to null and does not block', async () => {
  const m = createMorphology({ fetchUrl: () => { throw new Error('network down'); } });
  assert.equal(await m.pastOf('bring'), null);
  assert.equal(m.loaded(), true, 'the failure is settled, so callers do not refetch on every miss');

  const slow = createMorphology({
    fetchUrl: () => new Promise((res) => setTimeout(() => res({ text: SAMPLE }), 50)),
    timeoutMs: 5,
  });
  assert.equal(await slow.pastOf('bring'), null);
});

test('a POS-gated pronoun/noun homograph never fabricates a past', async () => {
  // The caller passes only known verbs; UniMorph would carry no V;PST for "it" anyway.
  const m = createMorphology({ fetchUrl: () => ({ text: SAMPLE }) });
  assert.equal(await m.pastOf('it'), null);
  assert.equal(await m.pastOf(''), null);
});

test('warmMorphology feeds the realizer: an UniMorph-only irregular reaches toPast()', async () => {
  // "zorp" is absent from both the seed dump and the productive rules, so before warming toPast
  // regularizes it to "zorped"; after warming, the learned overlay supplies the true "zurp".
  assert.equal(toPast('zorp'), 'zorped');
  const learned = await warmMorphology({ fetchUrl: () => ({ text: SAMPLE }), learn: learnIrregular, lang: 'eng' });
  assert.ok(learned >= 1);
  assert.equal(toPast('zorp'), 'zurp', 'the learned overlay now supplies the irregular past');
  assert.equal(toPast('zorping'), 'zurp', 'and through the gerund path too');
});

test('the learned overlay never shadows a curated seed form', async () => {
  // Poison the overlay with a wrong past for a seed verb; the seed must still win.
  learnIrregular([['go', 'goed']]);
  assert.equal(toPast('go'), 'went');
});
