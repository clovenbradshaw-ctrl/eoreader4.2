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

// ── FOLLOWER-COMPANY REFINEMENTS — glue, kind, the paradigm gate ─────────────
// Within the closed class, a TRUE PARTICLE attaches to many distinct stems (that is what a case
// marker IS); a member following only a few is a BOUND MORPHEME, and its attachment rate tells
// which: obligatory → part of a compound NAME the induction over-cut (glue); optional across ≥2
// stems → grammatical number on a countable base (a KIND). And a nominal ALTERNATES through ≥2
// particles — a form frozen onto one (a verb stem, an adverbial) is gated out. The closed class
// here is HANDED IN (sediment from a prior read) so the tests pin the mechanics, not the sweep.
const CC = [...'がはをにのてでと達寺し'];

test('glue: an obligatory bound suffix repairs the over-cut compound name', () => {
  const jp = ['延暦寺が僧兵を送る。', '延暦寺は都城を攻める。', '延暦寺が山門を閉じる。', '延暦寺は神輿を担ぐ。',
              '興福寺が僧兵を送る。', '興福寺は朝廷に訴える。', '興福寺が大鐘を鳴らす。',
              '清盛が兵士を集める。', '清盛は都城を守る。', '清盛が僧兵を叱る。',
              '重盛が兵士を率いる。', '重盛は父上を諫める。',
              '基房が政務を執る。', '基房は屋敷に住む。', '成親が謀議を巡らす。', '成親は酒宴を開く。'].join('');
  const { referents } = discoverUncasedReferents(jp, { minCount: 3, closedClass: CC });
  const forms = referents.map((r) => r.form);
  assert.ok(forms.includes('延暦寺'), '延暦→寺 is one figure, 延暦寺 — the cut is repaired');
  assert.ok(forms.includes('興福寺'), '興福寺 likewise');
  assert.ok(!forms.includes('延暦') && !forms.includes('興福'), 'the fragments do not survive beside the repair');
  assert.ok(referents.find((r) => r.form === '延暦寺')?.glued, 'the repair is marked');
});

test('kind: an optional collectivizer across ≥2 stems marks countable bases as kinds', () => {
  const jp = ['兵士が城門を守る。', '兵士は都城を歩く。', '兵士達が村里を焼く。', '兵士達は山道を越える。', '兵士が大鐘を鳴らす。',
              '百姓が米俵を運ぶ。', '百姓は村里に住む。', '百姓達が声々を上げる。', '百姓達は都城に来る。', '百姓が田畑を耕す。',
              '清盛が兵士を見る。', '清盛は百姓を集める。', '重盛が兵士を止める。', '重盛は百姓を守る。'].join('');
  const { referents } = discoverUncasedReferents(jp, { minCount: 3, closedClass: CC });
  const grainOf = (f) => referents.find((r) => r.form === f)?.grain?.value ?? null;
  assert.equal(grainOf('兵士'), 'kind', '兵士/兵士達 — number alternates, so 兵士 ranges over many');
  assert.equal(grainOf('百姓'), 'kind', '百姓 likewise');
  assert.equal(grainOf('清盛'), null, 'a name with no such alternation is HELD, not guessed');
});

test('the paradigm gate: a form frozen onto one particle is not a figure', () => {
  const jp = ['清盛が兵士を集める。', '清盛は都城を守る。', '清盛が僧兵を叱る。', '清盛は城門を開ける。',
              '重盛が兵士を率いる。', '重盛は都城に上る。', '重盛が大鐘を聞く。', '重盛は山道に迷う。',
              '基房が政務を執る。', '基房は屋敷に住む。', '基房が文書を書く。',
              '退屈して庭園を見る。', '退屈して空模様を仰ぐ。', '退屈して書物を読む。',
              '仕返しして城門を焼く。', '仕返しして村里を襲う。', '仕返しして兵士を送る。',
              '勉強して文書を書く。', '支度して都城に出る。', '掃除して庭園を整える。'].join('');
  const { referents } = discoverUncasedReferents(jp, { minCount: 3, closedClass: CC });
  const forms = referents.map((r) => r.form);
  assert.ok(!forms.some((f) => f.startsWith('退屈')), '退屈+し only — a verb stem, gated out');
  assert.ok(!forms.some((f) => f.startsWith('仕返')), '仕返 likewise');
  assert.ok(forms.includes('清盛') && forms.includes('重盛') && forms.includes('基房'),
    'the figures alternate through が/は — they decline, they stay');
});

test('parseText carries the uncased kind verdict into the log as a grain DEF', () => {
  const jp = ['兵士が城門を守る。', '兵士は都城を歩く。', '兵士達が村里を焼く。', '兵士達は山道を越える。', '兵士が大鐘を鳴らす。',
              '百姓が米俵を運ぶ。', '百姓は村里に住む。', '百姓達が声々を上げる。', '百姓達は都城に来る。', '百姓が田畑を耕す。',
              '清盛が兵士を見る。', '清盛は百姓を集める。', '重盛が兵士を止める。', '重盛は百姓を守る。'].join('');
  const doc = parseText(jp, { docId: 'jpk', uncasedReferents: { minCount: 3, closedClass: CC } });
  const grains = doc.log.events.filter((e) => e.op === 'DEF' && e.key === 'grain');
  const byId = new Map(grains.map((e) => [e.id, e]));
  assert.equal(byId.get('兵士')?.value, 'kind', '兵士 is graded a kind through the full pipeline');
  assert.equal(byId.get('兵士')?.cue, 'collectivizer');
  assert.ok(!byId.has('清盛'), '清盛 (no cased counters, no collectivizer) is HELD — no guess');
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
