// !EVA prompt — the input-side checkpoint (src/model/prompt-checkpoint.js,
// docs/prompt-as-site.md §4). The coder checkpoint judges what the model EMITS;
// this one judges what it is HANDED. Same verdict shape ({ id, ok, findings } over
// a frozen taxonomy), advisory by design: only a structural error (a band off the
// nine-terrain catalog, or outside the declared width) makes ok false, because the
// projection makes those unrepresentable — they mean the assembly did not come
// from the catalog. The measured verdicts (desert-cell, grain-mixed,
// ground-inflation) name today's known conditions, typed and visible.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  judgePrompt, terrainShares, deriveWidth,
  PROMPT_ERROR_TAXONOMY, STANCE_GRAIN, GRADIENT_BACKGROUND,
} from '../src/model/prompt-checkpoint.js';
import { projectGroundedBands } from '../src/model/bands.js';
import { STANCES } from '../src/core/cube.js';
import { GRAINS } from '../src/core/operators.js';
import { stages } from '../src/turn/stages.js';

const SPANS = [{ text: 'The survey counted ninety-two individuals.', score: 0.9 }];

test('prompt-checkpoint: a default grounded assembly passes (ok) with no structural finding', () => {
  const v = judgePrompt(projectGroundedBands({ question: 'What did the survey find?', spans: SPANS }));
  assert.equal(v.ok, true);
  assert.ok(!v.findings.some(f => f.severity === 'error'));
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.findings));
});

test('prompt-checkpoint: STANCE_GRAIN mirrors the kernel Stance face', () => {
  for (const [, row] of Object.entries(STANCES))
    for (const grain of GRAINS)
      assert.equal(STANCE_GRAIN[row[grain]], grain, `${row[grain]} should engage at ${grain}`);
});

test('prompt-checkpoint: closure-violation — a band off the nine-terrain catalog fails the verdict', () => {
  const bands = [
    { key: 'rogue', terrain: 'Vibes', grain: null, role: 'user', cell: null, text: 'trust me' },
  ];
  const v = judgePrompt(bands);
  assert.equal(v.ok, false);
  const f = v.findings.find(x => x.error === 'closure-violation');
  assert.ok(f);
  assert.equal(f.address, 'rogue');
  assert.equal(f.severity, 'error');
});

test('prompt-checkpoint: contract-violation — a band outside the declared width fails the verdict', () => {
  const bands = projectGroundedBands({ question: 'q', spans: SPANS });
  // Declare the width of the assembly minus Entity: the spans band is now foreign.
  const width = { terrains: deriveWidth(bands).terrains.filter(t => t !== 'Entity') };
  const v = judgePrompt(bands, { width });
  assert.equal(v.ok, false);
  const f = v.findings.find(x => x.error === 'contract-violation');
  assert.ok(f);
  assert.equal(f.address, 'excerpts');
});

test('prompt-checkpoint: desert-cell — the steer band is flagged, advisorily, as SYN·Cultivating', () => {
  const v = judgePrompt(projectGroundedBands({
    question: 'Tell me about dolphins.',
    spans: SPANS,
    steer: 'They want a plain overview of the dolphins themselves.',
  }));
  const f = v.findings.find(x => x.error === 'desert-cell');
  assert.ok(f, 'the steer must be flagged as the desert-cell occupant');
  assert.equal(f.address, 'steer');
  assert.equal(f.severity, 'advisory');
  assert.equal(v.ok, true, 'advisory findings never fail the verdict');
  // No steer → no desert-cell finding.
  const bare = judgePrompt(projectGroundedBands({ question: 'q', spans: SPANS }));
  assert.ok(!bare.findings.some(x => x.error === 'desert-cell'));
});

test('prompt-checkpoint: grain-mixed — the summary guard over bare spans, silenced by Pattern material', () => {
  // The canonical mix (docs/prompt-as-site.md §4): Composing instructed over
  // Entity-grain material only.
  const mixed = judgePrompt(projectGroundedBands({
    question: 'Summarize it.', spans: SPANS, task: 'summary',
  }));
  const f = mixed.findings.find(x => x.error === 'grain-mixed');
  assert.ok(f, 'summary guard over bare spans must be grain-mixed');
  assert.equal(f.address, 'summary-guard');
  assert.equal(f.severity, 'advisory');
  assert.equal(mixed.ok, true);

  // P3's remedy: hand the summary turn Pattern-grain material (the fold) and the
  // stance has something at its own grain to land on — the finding goes silent.
  const matched = judgePrompt(projectGroundedBands({
    question: 'Summarize it.', spans: SPANS, task: 'summary',
    graph: 'The reading kept joining the dolphins to the estuary.',
  }));
  assert.ok(!matched.findings.some(x => x.error === 'grain-mixed'));
});

test('prompt-checkpoint: ground-inflation — measured against the population gradient, not a magic number', () => {
  // Today's default assembly leads with the ~1.1k-char Atmosphere voice: the Ground
  // row's share of handed text sits far past the corpus gradient (~6% of language).
  // The checkpoint says so, advisorily, with the measured share and threshold.
  const v = judgePrompt(projectGroundedBands({ question: 'What did the survey find?', spans: SPANS }));
  const f = v.findings.find(x => x.error === 'ground-inflation');
  assert.ok(f, 'the known inflation must be named');
  assert.equal(f.severity, 'advisory');
  assert.ok(f.share > f.threshold);
  assert.equal(v.ok, true);

  // A material-heavy assembly (long excerpts) sinks the Ground share below the
  // null — the finding is a measurement, so it can go quiet.
  const fat = Array.from({ length: 40 }, (_, i) => ({
    text: `Line ${i}: the survey logged another pod of dolphins moving upriver past the estuary marker.`,
    score: 1 - i / 100,
  }));
  const quiet = judgePrompt(projectGroundedBands({ question: 'q', spans: fat }));
  // Ground here is the system voice only; with ~4k chars of Entity material the
  // share may or may not clear the null — assert the DIRECTION, not a constant.
  const gv = quiet.findings.find(x => x.error === 'ground-inflation');
  const groundOf = (verdict) => (verdict.shares.Void || 0) + (verdict.shares.Field || 0) + (verdict.shares.Atmosphere || 0);
  assert.ok(groundOf(quiet) < groundOf(v), 'more material must deflate the Ground share');
  if (gv) assert.ok(gv.share < f.share);
});

test('prompt-checkpoint: terrainShares sums to one over non-empty assemblies', () => {
  const { shares, total } = terrainShares(projectGroundedBands({ question: 'q', spans: SPANS }));
  assert.ok(total > 0);
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('prompt-checkpoint: taxonomy is data — every finding carries its taxonomy fields', () => {
  for (const [name, t] of Object.entries(PROMPT_ERROR_TAXONOMY)) {
    assert.ok(['site', 'stance'].includes(t.face), name);
    assert.ok(['error', 'advisory'].includes(t.severity), name);
    assert.ok(['band', 'assembly'].includes(t.detectableAt), name);
    assert.ok(t.fix.length > 10, name);
  }
  assert.ok(Math.abs(Object.values(GRADIENT_BACKGROUND).reduce((a, b) => a + b, 0) - 1) < 0.01,
    'the corpus gradient shares must sum to ~1');
});

test('prompt-checkpoint: the prompt stage rides the verdict on ctx, advisorily', async () => {
  // A minimal grounded ctx through the real prompt stage: the verdict must ride
  // ctx.promptVerdict without altering the messages the talker gets.
  const ctx = {
    route: 'grounded',
    question: 'What did the survey find?',
    spans: SPANS.map(s => ({ ...s })),
    task: 'answer',
    doc: null,
  };
  const out = await stages.prompt(ctx);
  assert.ok(out.promptVerdict, 'the grounded prompt stage must judge the assembly');
  assert.equal(out.promptVerdict.ok, true);
  assert.ok(Array.isArray(out.promptVerdict.findings));
  assert.ok(out.messages?.length === 2);

  // A chat turn carries no grounded assembly to judge.
  const chat = await stages.prompt({ route: 'chat', question: 'hello', task: 'answer' });
  assert.equal(chat.promptVerdict, null);
});
