import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../src/core/verdicts.js';
import { typeReferences, senseTopicFrame, reviseMentionsWithEvidence } from '../src/turn/reference.js';
import { createJudgmentLog } from '../src/core/def.js';
import { recordMentionReferenceDefs } from '../src/turn/judgments.js';
import { senseEntities } from '../src/turn/sense.js';
import { parseText } from '../src/perceiver/parse/index.js';
import { createHashEmbedder } from '../src/model/embed-hash.js';
import { createAuditLog } from '../src/rooms/audit/index.js';
import { runTurn } from '../src/turn/pipeline.js';

// Typed reference (docs "The Work, v2" #3) — the per-mention same-vs-other sense DEF that
// replaces the all-or-nothing referent-diffuse veto. Falsifiers: each fails if the cut
// regresses to the old shape — a mention silently bound to the loudest basin, a blanket
// refusal where a choice question was available, a verdict whose witness cannot re-derive it,
// or a fold evidence that out-ranks the mention DEF instead of revising it on the log.

// Hand-built sense rows (senseEntities shape) — the two Elvises, discriminable by place.
const ROWS = [
  { id: 'd#1', label: 'Elvis Presley', weight: 7, neighbors: ['memphis', 'sun', 'studio', 'graceland'] },
  { id: 'd#2', label: 'Elvis Costello', weight: 4, neighbors: ['london', 'attractions'] },
];

test('a discriminating term in the question resolves the sense — and carries the anchor', () => {
  const mentions = typeReferences('what did elvis record in memphis', ROWS, {});
  const elvis = mentions.find((m) => m.term === 'elvis');
  assert.equal(elvis.verdict, VERDICTS.CORROBORATED, '"memphis" cuts the collision');
  assert.equal(elvis.sense.label, 'Elvis Presley');
  assert.equal(elvis.resolvedBy, 'hint');
  assert.ok(elvis.anchor, 'the discriminating anchor rides for the retrieval tilt');
  assert.equal(elvis.ask, null);
});

test('an undiscriminated collision abstains with the ASK — never the loudest basin', () => {
  const mentions = typeReferences('what did elvis record first', ROWS, {});
  const elvis = mentions.find((m) => m.term === 'elvis');
  assert.equal(elvis.verdict, VERDICTS.INDETERMINATE,
    'Presley holds 64% of the mass and still does not win by default — salience is not sense');
  assert.equal(elvis.sense, null);
  assert.equal(elvis.resolvedBy, 'collision-unresolved');
  assert.ok(elvis.ask?.question.includes('Which'), 'the honest output is a choice question');
  assert.ok(elvis.ask.options.includes('Elvis Presley') && elvis.ask.options.includes('Elvis Costello'),
    'the ask names both recorded senses');
});

test('the two-Bushes guard: a hint landing on an ambiguity-held short form is NOT a resolution', () => {
  const rows = [
    { id: 'd#1', label: 'George Herbert Bush', weight: 5, neighbors: ['gulf'] },
    { id: 'd#2', label: 'George Walker Bush', weight: 5, neighbors: ['education'] },
    { id: 'd#3', label: 'George Bush', weight: 4, neighbors: ['nation', 'invasion'] },
  ];
  const mentions = typeReferences('what did george bush say about the invasion', rows, {});
  const bush = mentions.find((m) => m.term === 'bush');
  assert.equal(bush.verdict, VERDICTS.INDETERMINATE,
    '"invasion" points at the held short form — the ambiguity restated, not resolved (name-variants law)');
  assert.equal(bush.resolvedBy, 'ambiguous-short-form');
  assert.ok(bush.ask, 'the guard still hands back a choice');
});

test('a term naming nothing recorded yields NO mention — absence is the void judge\'s territory', () => {
  const mentions = typeReferences('what did zorblatt record', ROWS, {});
  assert.equal(mentions.find((m) => m.term === 'zorblatt'), undefined);
});

test('the witness re-derives the verdict — no oracle-shaped mention DEFs', () => {
  const log = createJudgmentLog();
  recordMentionReferenceDefs(log, typeReferences('what did elvis record first', ROWS, {}));
  const def = log.latestOf('referent:mention:elvis');
  assert.ok(def && !def.malformed, 'the DEF carries its witness');
  const w = def.witness;
  // Re-run the cut from nothing but the witness: the recorded basins + floor + hints.
  const replayRows = w.basins.map((b, i) => ({ id: `w#${i}`, label: b.label, weight: b.weight, neighbors: [] }));
  const replay = typeReferences(`${w.term} ${w.hints.join(' ')}`, replayRows, { floor: w.floor });
  const again = replay.find((m) => m.term === w.term);
  assert.equal(again.verdict, def.verdict, 'the witness alone reproduces the verdict');
});

// ── end to end: the ask replaces the blanket refusal ───────────────────────────

const ELVIS_CORPUS =
  'Elvis Presley recorded his first single at Sun Studio in Memphis in 1954. '
  + 'Elvis Costello recorded his first album in London in 1977. '
  + 'Presley toured the American South and sang on regional radio. '
  + 'Costello wrote sharp lyrics and toured with a small band. '
  + 'Elvis performed on television to great acclaim.';

const stub = (reply) => ({
  id: 'stub', kind: 'local', isLoaded: () => true,
  describe: () => ({ backend: 'stub', kind: 'local', model: 'stub', label: 'stub' }),
  async load() {}, async phrase() { return reply; },
});

const drive = (question, text, reply) => runTurn({
  question, doc: parseText(text, { docId: 'typed-ref' }), model: stub(reply),
  embedder: createHashEmbedder(), auditLog: createAuditLog({ capacity: 64 }),
});

test('e2e: an unresolved sense collision ASKS — per-mention DEF on the log, no diffuse refusal, no shipped claim', async () => {
  const r = await drive('What did Elvis record first?', ELVIS_CORPUS, 'Elvis recorded his first single in 1954.');
  assert.match(r.answer, /^Which elvis do you mean/i, 'the answer is the choice question');
  assert.ok(r.answer.includes('Elvis Presley') && r.answer.includes('Elvis Costello'));
  assert.ok(r.flags.some((f) => (f.id || f) === 'referent-ambiguous-ask'), 'the ask flag rides');
  assert.ok(!r.flags.some((f) => (f.id || f) === 'referent-diffuse'), 'the blanket refusal is retired here');
  const mention = r.judgmentLog.latestOf('referent:mention:elvis');
  assert.equal(mention?.verdict, VERDICTS.INDETERMINATE, 'the per-mention suspension is on the log');
  assert.equal(mention.witness.resolvedBy, 'collision-unresolved');
  const claims = [...r.judgmentLog.project().values()].filter((d) => d.grain === 'claim');
  assert.equal(claims.length, 0, 'no claim ships while the subject is unresolved — asked, not guessed');
});

test('e2e: a single recorded sense resolves, answers, and the fold\'s evidence REVISES the mention DEF', async () => {
  const text = 'Dolphins are kept in captivity within dolphinariums for research and conservation. '
    + 'Dolphins range in sizes from the small Maui to the orca, the apex predator. '
    + 'Some dolphins can leap nine metres and swim at great speed.';
  const r = await drive('What sizes do dolphins range in?', text,
    'Dolphins range in sizes from the small Maui to the orca, the apex predator.');
  assert.ok(!r.flags.some((f) => (f.id || f) === 'referent-ambiguous-ask'), 'one sense — nothing to ask');
  const events = r.judgmentLog.all().filter((e) => e.of === 'referent:mention:dolphins');
  assert.equal(events.length, 2, 'the retrieve-stage prior plus the fold\'s evidence — two DEFs, one subject');
  assert.equal(events[0].verdict, VERDICTS.CORROBORATED);
  assert.equal(events[0].witness.resolvedBy, 'single-basin');
  assert.equal(events[1].revises, events[0].t, 'the evidence lands as a counter-DEF on the revision rail, never an overwrite');
  assert.equal(events[1].witness.resolvedBy, 'evidence-confirmed');
  assert.ok(events[1].witness.evidence, 'the witness carries the fold\'s posterior as the evidence');
});

test('senseTopicFrame arms retrieval damping only for a RESOLVED ambiguous mention', () => {
  const doc = parseText(ELVIS_CORPUS, { docId: 'frame' });
  const entities = senseEntities([doc]);
  const resolved = typeReferences('what did elvis record in memphis', entities, {})
    .find((m) => m.term === 'elvis');
  assert.equal(resolved.verdict, VERDICTS.CORROBORATED);
  const frame = senseTopicFrame(doc, resolved);
  assert.ok(frame && frame.topicIds.size > 0, 'the resolved sense re-reads through the doc\'s own tables into a topic frame');
  assert.equal(frame.sense, 'Elvis Presley');
  const unresolved = typeReferences('what did elvis record first', entities, {})
    .find((m) => m.term === 'elvis');
  assert.equal(senseTopicFrame(doc, unresolved), null, 'an unresolved mention arms nothing — never bias toward the loudest');
});

test('reviseMentionsWithEvidence: a diverted reading is recorded as diverted, an unconcentrated fold revises nothing', () => {
  const log = createJudgmentLog();
  const mentions = typeReferences('what did elvis record in memphis', ROWS, {});
  recordMentionReferenceDefs(log, mentions);
  // The fold landed on Costello despite the Presley prior — the divergence is logged, not hidden.
  const n = reviseMentionsWithEvidence(log, mentions, { concentrated: true, id: 9, w: 0.8, margin: 0.4 }, () => 'Elvis Costello');
  assert.equal(n, 1);
  const cur = log.latestOf('referent:mention:elvis');
  assert.equal(cur.witness.diverted, true);
  assert.equal(cur.witness.sense, 'Elvis Costello');
  assert.equal(cur.witness.prior, 'Elvis Presley', 'the prior it diverted FROM stays in the witness');
  // No concentration → no evidence → no counter-DEF.
  const log2 = createJudgmentLog();
  recordMentionReferenceDefs(log2, mentions);
  const before = log2.size;
  assert.equal(reviseMentionsWithEvidence(log2, mentions, { concentrated: false, id: 9 }, () => 'x'), 0);
  assert.equal(log2.size, before);
});
