import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discoverUncasedReferents } from '../src/perceiver/parse/uncased.js';

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
