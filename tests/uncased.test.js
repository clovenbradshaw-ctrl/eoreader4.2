import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discoverUncasedReferents, discoverUncasedRelations } from '../src/perceiver/parse/uncased.js';
import { parseText } from '../src/perceiver/parse/pipeline.js';
import { segmentSentences } from '../src/perceiver/parse/sentences.js';

// A controlled Japanese passage reused across the relation and pipeline tests: 清盛 (Kiyomori) and
// 重盛 (Shigemori) recur as agents; the two-figure clauses are 清盛が重盛を呼ぶ and 重盛は清盛に従う.
const JP = ['清盛が館を建てる。', '清盛は兵を集める。', '重盛が父を諫める。', '重盛は都に上る。',
            '清盛が重盛を呼ぶ。', '重盛は清盛に従う。', '清盛が政を執る。', '重盛が寺を建てる。',
            '清盛は敵を討つ。', '重盛は民を助ける。', '庭に花が咲く。'].join('');

// UNCASED REFERENT DISCOVERY. Japanese and Chinese carry no case, so the capital-anchored name
// scanner is blind to their figures (平清盛 has no capital). The figures are found the other way the
// reader already knows — by GRAVITY: induce the closed (particle) class from the characters, take the
// content runs between particles, and admit the runs that RECUR and mostly stand in ARGUMENT position
// (before a particle — where an agent goes). No dictionary, no case, no per-script ranges.

test('discovers the recurring agents of a Japanese passage, drops the one-off (by gravity)', () => {
  // 清盛 (Kiyomori) and 重盛 (Shigemori) recur as agents (before が/は/を/に); 花 (flower) once.
  const jp = [
    '清盛が館を建てる。', '清盛は兵を集める。', '重盛が父を諫める。', '重盛は都に上る。',
    '清盛が重盛を呼ぶ。', '重盛は清盛に従う。', '清盛が政を執る。', '重盛が寺を建てる。',
    '清盛は敵を討つ。', '重盛は民を助ける。', '庭に花が咲く。',
  ].join('');
  const { functors, referents } = discoverUncasedReferents(jp, { minCount: 2, minFreq: 3 });
  const forms = referents.map((r) => r.form);

  // The particles are induced as the closed class (no list given).
  assert.ok(['は', 'が', 'を'].every((p) => functors.includes(p)), 'the case particles are the closed class');
  // The two recurring agents are found as figures.
  assert.ok(forms.includes('清盛'), '清盛 (a recurring agent) is discovered');
  assert.ok(forms.includes('重盛'), '重盛 (a recurring agent) is discovered');
  // A one-off content run is not a figure.
  assert.ok(!forms.includes('花'), '花 (seen once) is not minted as a figure');
});

test('gravity ranks the figures by argument-position recurrence', () => {
  const jp = ['清盛が来た。'.repeat(5), '重盛が来た。'.repeat(2), '維盛が来た。'].join('');
  const { referents } = discoverUncasedReferents(jp, { minCount: 2, minFreq: 2 });
  assert.equal(referents[0]?.form, '清盛', 'the most-recurrent agent leads');
  assert.ok(referents[0].gravity >= (referents[1]?.gravity ?? 0), 'gravity is non-increasing down the ranking');
});

test('a run that never stands in argument position is not a figure (position, not mere recurrence)', () => {
  // 大変 ("very"/"terrible") recurs but always as a modifier mid-clause, never before a particle.
  const jp = ['清盛が大変疲れた。', '清盛は大変喜んだ。', '清盛が大変急いだ。', '重盛が大変怒った。'].join('');
  const { referents } = discoverUncasedReferents(jp, { minCount: 3, minArgRate: 0.6, minFreq: 2 });
  const forms = referents.map((r) => r.form);
  assert.ok(!forms.includes('大変'), 'a recurring non-argument modifier is not a figure');
});

test('empty / letterless input is safe', () => {
  assert.deepEqual(discoverUncasedReferents(''), { functors: [], referents: [] });
  assert.deepEqual(discoverUncasedReferents('。、！？ 123 …'), { functors: [], referents: [] });
});

// ── RELATIONS (one rung up) ──────────────────────────────────────────────────
// In an SOV clause with exactly two figures, the first is the agent, the second the patient, and the
// content run trailing the last figure is the predicate that bonds them — src --verb--> tgt, by the
// same gravity read, no dependency grammar.

test('reads the SVO relation of a two-figure clause (agent → verb → patient)', () => {
  // The two-figure clauses here are 清盛が重盛を呼ぶ and 重盛は清盛に従う; the rest carry one figure
  // (館/兵/父… are one-offs, not figures) so bond nothing — the extraction is exact, not noisy.
  const edges = discoverUncasedRelations(JP, { minCount: 2, minFreq: 3 });
  const has = (s, v, t) => edges.some((e) => e.src === s && e.via === v && e.tgt === t);
  assert.ok(has('清盛', '呼ぶ', '重盛'), '清盛 calls 重盛');
  assert.ok(has('重盛', '従う', '清盛'), '重盛 follows 清盛');
  // Only figures bond — a one-off object is never an endpoint.
  assert.ok(edges.every((e) => e.src !== e.tgt), 'no self-edges');
  assert.ok(!edges.some((e) => e.tgt === '館' || e.tgt === '兵'), 'a non-figure is not an endpoint');
});

test('empty / figureless input yields no edge (conservative by construction)', () => {
  assert.deepEqual(discoverUncasedRelations(''), []);
  assert.deepEqual(discoverUncasedRelations('。。。'), []);
});

// ── WIRED INTO THE PIPELINE ──────────────────────────────────────────────────
// parseText discovers uncased figures automatically (default on) but ONLY on a genuinely uncased
// document — most letters caseless (\p{Lo}). A cased read never triggers it, so it stays byte-
// identical; an uncased document, which the capital scan leaves empty, now reads its figures.

test('CJK sentence-final marks are boundaries (。 splits an unspaced passage)', () => {
  const s = segmentSentences('清盛が来た。重盛は去った。維盛が笑った。', { isAbbreviation: () => false });
  assert.equal(s.length, 3, 'three 。-terminated units, though the script has no spaces');
});

test('parseText reads a Japanese cast by gravity (default on), and its mentions accrue', () => {
  const doc = parseText(JP, { docId: 'jp' });
  const admitted = [...doc.admission.admitted.keys()];
  assert.ok(admitted.includes('清盛') && admitted.includes('重盛'), 'the two agents are read as figures');
  assert.ok((doc.admission.mentions.get(doc.admission.idOf('清盛')) || []).length >= 4,
    '清盛 accrues a mention per sentence it acts in (CJK segmentation working)');
  assert.ok(doc.log.events.some((e) => e.op === 'INS' && e.label === '清盛'), 'it reaches the log as an INS');
});

test('uncasedReferents:false is a no-op — the uncased document reads empty as before', () => {
  const doc = parseText(JP, { docId: 'jp', uncasedReferents: false });
  assert.equal(doc.admission.admitted.size, 0, 'off → the capital-anchored read finds nothing');
});

test('a cased document is byte-identical whether the flag is on or off (the guard holds)', () => {
  const en = 'Pierre arrived. Pierre spoke to Andrew. Andrew left.';
  const on  = [...parseText(en, { docId: 'en' }).admission.admitted.keys()].sort();
  const off = [...parseText(en, { docId: 'en', uncasedReferents: false }).admission.admitted.keys()].sort();
  assert.deepEqual(on, off, 'the uncased pass never fires on Latin text');
  assert.ok(on.includes('Pierre') && on.includes('Andrew'), 'the capital scan is unchanged');
});
