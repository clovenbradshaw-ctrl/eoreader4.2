import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VERDICTS } from '../src/core/verdicts.js';
import { makeDef, createJudgmentLog, GRAINS } from '../src/core/def.js';
import {
  shapeAudit, normalizeOf, matchGold, scoreVerdicts, classifyTransition,
  scoreStability, mergeRuns, scoreSpecimen, scoreboard,
} from '../src/metabolism/defscore.js';
import { runSpecimen, runBattery } from '../src/metabolism/defharness.js';
import { createDefOracle, buildWitnessAuditRequest, parseWitnessAudit } from '../src/metabolism/def-oracle.js';
import { SPECIMENS } from './fixtures/judgment-specimens.js';

// The evaluator (docs "The Work, v2" #1) — falsifiers for the scoreboard itself. The
// scoreboard's law: it measures CONFIDENT-AND-WRONG, never raw hit rate; a correct suspension
// (gold says "indeterminate is correct here") scores as correct, a confident guess against
// that gold is the fatal outcome, and an honest suspension where a commitment was available is
// reported but NEVER penalized. Each test fails if the metric inverts that — if it punishes
// correct suspension or rewards confident guessing.

const proj = (defs) => new Map(defs.map((d) => [d.of, d]));
const def = (verdict, grain, of, witness = { why: 'test' }) => makeDef({ verdict, grain, of, witness });

// ── 1 · metric math: the trap, both directions ─────────────────────────────────

test('a confident verdict against a suspension gold is CONFIDENT-WRONG — the trap', () => {
  const rows = matchGold(
    proj([def(VERDICTS.CORROBORATED, GRAINS.REFERENT, 'referent:mention:elvis')]),
    [{ grain: GRAINS.REFERENT, match: 'elvis', accept: [VERDICTS.INDETERMINATE] }],
  );
  assert.equal(rows[0].outcome, 'confident-wrong');
  const s = scoreVerdicts(rows);
  assert.equal(s.overall.confidentWrong, 1);
  assert.equal(s.overall.cwr, 1, 'confident guessing against correct suspension IS the failure');
});

test('an honest suspension where a commitment was acceptable is reported, never penalized', () => {
  const rows = matchGold(
    proj([def(VERDICTS.INDETERMINATE, GRAINS.CLAIM, 'claim:dolphins live in pods')]),
    [{ grain: GRAINS.CLAIM, match: 'pods', accept: [VERDICTS.CORROBORATED] }],
  );
  assert.equal(rows[0].outcome, 'underconfident');
  const s = scoreVerdicts(rows);
  assert.equal(s.overall.cwr, 0, 'underconfidence never enters the CWR numerator');
  assert.equal(s.overall.underconfidence, 1, '…but it is visible, not hidden');
});

test('accept-set membership scores correct — including "indeterminate is correct here"', () => {
  const rows = matchGold(
    proj([
      def(VERDICTS.UNSUPPORTED, GRAINS.CLAIM, 'claim:best dolphin'),
      def(VERDICTS.INDETERMINATE, GRAINS.REFERENT, 'referent:mention:bush'),
    ]),
    [
      { grain: GRAINS.CLAIM, match: 'best', accept: [VERDICTS.UNSUPPORTED, VERDICTS.INDETERMINATE] },
      { grain: GRAINS.REFERENT, match: 'bush', accept: [VERDICTS.INDETERMINATE] },
    ],
  );
  assert.deepEqual(rows.map((r) => r.outcome), ['correct', 'correct']);
});

test('wrong-grain and unjudged are shape gaps — reported beside, excluded from judged', () => {
  const rows = matchGold(
    proj([def(VERDICTS.CORROBORATED, GRAINS.CLAIM, 'claim:the pods claim')]),
    [
      { grain: GRAINS.REFERENT, match: 'pods', accept: [VERDICTS.CORROBORATED] },  // judged, wrong grain
      { grain: GRAINS.FIELD, match: 'nothing-matches', accept: [VERDICTS.UNSUPPORTED] },  // unjudged
    ],
  );
  assert.deepEqual(rows.map((r) => r.outcome), ['wrong-grain', 'unjudged']);
  const s = scoreVerdicts(rows);
  assert.equal(s.overall.judged, 0);
  assert.equal(s.overall.cwr, null, 'no judged rows → an honest blank, not a zero');
  assert.equal(s.overall.wrongGrain, 1);
  assert.equal(s.overall.unjudged, 1);
});

test('a wildcard matcher grades every DEF at its grain and keeps the worst outcome', () => {
  const rows = matchGold(
    proj([
      def(VERDICTS.INDETERMINATE, GRAINS.REFERENT, 'referent:mention:a'),
      def(VERDICTS.CORROBORATED, GRAINS.REFERENT, 'referent:mention:b'),
    ]),
    [{ grain: GRAINS.REFERENT, match: '*', accept: [VERDICTS.INDETERMINATE] }],
  );
  assert.equal(rows[0].outcome, 'confident-wrong', 'one confident guess among honest abstentions still counts');
  assert.equal(rows[0].of, 'referent:mention:b', 'the offending subject is named');
});

// ── 2 · the transition table ───────────────────────────────────────────────────

test('classifyTransition — the five-way table, polarity-flip is the only overturn', () => {
  const V = VERDICTS;
  assert.equal(classifyTransition(V.CORROBORATED, V.CORROBORATED), 'stable');
  assert.equal(classifyTransition(V.INDETERMINATE, V.CORROBORATED), 'strengthened');
  assert.equal(classifyTransition(V.CORROBORATED, V.INDETERMINATE), 'retreated');
  assert.equal(classifyTransition(V.CORROBORATED, V.CONTRADICTED), 'overturned');
  assert.equal(classifyTransition(V.UNSUPPORTED, V.CORROBORATED), 'overturned',
    'a premature confident negative overturned by the full read counts — the correct partial verdict was suspension');
  assert.equal(classifyTransition(V.UNSUPPORTED, V.CONTRADICTED), 'drifted');
});

test('scoreStability — overturn rate over the partial read\'s commitments only', () => {
  const V = VERDICTS;
  const prev = proj([
    def(V.CORROBORATED, GRAINS.CLAIM, 'claim:a'),   // → contradicted: OVERTURN
    def(V.INDETERMINATE, GRAINS.CLAIM, 'claim:b'),  // → corroborated: strengthened (not committed)
    def(V.UNSUPPORTED, GRAINS.CLAIM, 'claim:c'),    // → unsupported: stable (committed)
    def(V.CORROBORATED, GRAINS.CLAIM, 'claim:gone'),// dropped
  ]);
  const next = proj([
    def(V.CONTRADICTED, GRAINS.CLAIM, 'claim:a'),
    def(V.CORROBORATED, GRAINS.CLAIM, 'claim:b'),
    def(V.UNSUPPORTED, GRAINS.CLAIM, 'claim:c'),
    def(V.CORROBORATED, GRAINS.CLAIM, 'claim:new'), // emergent
  ]);
  const st = scoreStability(prev, next);
  assert.equal(st.overturned, 1);
  assert.equal(st.strengthened, 1);
  assert.equal(st.stable, 1);
  assert.equal(st.committed, 2, 'commitments = subjects the partial read typed confidently AND the full read still holds — a dropped subject cannot be classified');
  assert.equal(st.overturnRate, 0.5);
  assert.equal(st.emergent, 1);
  assert.equal(st.dropped, 1);
  assert.deepEqual(st.overturns[0], { of: 'claim:a', prev: V.CORROBORATED, next: V.CONTRADICTED });
});

// ── 3 · shape ──────────────────────────────────────────────────────────────────

test('shapeAudit — the oracle trap made countable; a clean log counts zero', () => {
  const dirty = [
    def(VERDICTS.CORROBORATED, GRAINS.CLAIM, 'claim:ok'),
    makeDef({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:oracle' }),  // no witness
    makeDef({ verdict: 'supported:0.87', of: 'x', witness: {} }),                          // scalar stamp
    makeDef({ verdict: VERDICTS.UNSUPPORTED, witness: { k: 1 } }),                          // anonymous, legal
  ];
  const a = shapeAudit(dirty);
  assert.equal(a.total, 4);
  assert.equal(a.malformed, 2);
  assert.equal(a.noWitness, 1);
  assert.equal(a.unknownVerdict, 1);
  assert.equal(a.anonymous, 1);
  const clean = shapeAudit([def(VERDICTS.CORROBORATED, GRAINS.CLAIM, 'claim:ok')]);
  assert.equal(clean.malformed + clean.noWitness + clean.unknownVerdict + clean.unknownGrain, 0);
});

test('normalizeOf — per-parse referent ids compare by label; term-keyed subjects pass through', () => {
  const labelOf = (id) => ({ 7: 'Elvis Presley' }[id]);
  const idDef = makeDef({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.REFERENT, of: 'referent:7', witness: { id: 7 } });
  assert.equal(normalizeOf(idDef, { labelOf }), 'referent:elvis presley');
  const mention = makeDef({ verdict: VERDICTS.INDETERMINATE, grain: GRAINS.REFERENT, of: 'referent:mention:elvis', witness: {} });
  assert.equal(normalizeOf(mention, { labelOf }), 'referent:mention:elvis');
  const anchorless = makeDef({ verdict: VERDICTS.INDETERMINATE, grain: GRAINS.REFERENT, of: 'referent:∅', witness: {} });
  assert.equal(normalizeOf(anchorless, { labelOf }), 'referent:∅');
  assert.equal(normalizeOf(idDef, {}), 'referent:7', 'no labelOf → the raw key, never a throw');
});

// ── 4 · the merge — revise()'s first exercise ──────────────────────────────────

test('mergeRuns — the full read revises the partial on one log; nothing is erased', () => {
  const V = VERDICTS;
  const partial = createJudgmentLog();
  partial.judge({ verdict: V.INDETERMINATE, grain: GRAINS.CLAIM, of: 'claim:a', witness: { pass: 1 } });
  partial.judge({ verdict: V.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:b', witness: { pass: 1 } });
  const full = createJudgmentLog();
  full.judge({ verdict: V.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:a', witness: { pass: 2 } });
  full.judge({ verdict: V.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:b', witness: { pass: 2 } });
  full.judge({ verdict: V.UNSUPPORTED, grain: GRAINS.CLAIM, of: 'claim:new', witness: { pass: 2 } });

  const merged = mergeRuns(partial, full);
  assert.equal(merged.size, 5, '2 judged + 2 revised + 1 emergent — all appended, none overwritten');

  // The merged projection equals the full run's.
  const mp = merged.project();
  assert.equal(mp.get('claim:a').verdict, V.CORROBORATED);
  assert.equal(mp.get('claim:new').verdict, V.UNSUPPORTED);
  assert.equal(mp.size, full.project().size);

  // The revise chain is a linked list back to the partial DEFs.
  const events = merged.all();
  const revisedA = events.find((e) => e.of === 'claim:a' && e.revises != null);
  assert.ok(revisedA, 'the full read\'s claim:a landed as a revision');
  assert.equal(events[revisedA.revises].of, 'claim:a', 'revises points at the partial DEF it supersedes');
  const emergent = events.find((e) => e.of === 'claim:new');
  assert.equal(emergent.revises, null, 'an emergent subject is a first judgment, not a revision');
});

test('scoreboard — aggregate rates recomputed over sums, per-specimen rows kept', () => {
  const mk = (id, outcome) => scoreSpecimen({
    id,
    shape: shapeAudit([]),
    rows: matchGold(
      proj([def(outcome === 'cw' ? VERDICTS.CORROBORATED : VERDICTS.UNSUPPORTED, GRAINS.CLAIM, 'claim:x')]),
      [{ grain: GRAINS.CLAIM, match: 'x', accept: [VERDICTS.UNSUPPORTED] }],
    ),
    stability: scoreStability(proj([]), proj([])),
  });
  const agg = scoreboard([mk('one', 'cw'), mk('two', 'ok')]);
  assert.equal(agg.specimens, 2);
  assert.equal(agg.overall.judged, 2);
  assert.equal(agg.overall.cwr, 0.5, 'one confident-wrong of two judged, summed then rated');
  assert.equal(agg.perSpecimen[0].id, 'one');
  assert.equal(agg.perSpecimen[0].confidentWrong, 1);
  assert.equal(agg.perSpecimen[1].confidentWrong, 0);
});

// ── 5 · the harness, end to end and offline ────────────────────────────────────

const comparable = (r) => ({ shape: r.shape, rows: r.rows, stability: r.stability, verdicts: r.verdicts });

test('the dolphins specimen drives the real pipeline offline, deterministically, clean-shaped', async () => {
  const dolphins = SPECIMENS.find((s) => s.id === 'dolphins-unsupported-predicate');
  const a = await runSpecimen(dolphins);
  const b = await runSpecimen(dolphins);
  assert.deepEqual(comparable(a), comparable(b), 'two drives, one score — nothing in the loop is stochastic');
  assert.equal(a.shape.malformed, 0, 'every DEF the turn mints carries its witness');
  assert.ok(a.rows.every((r) => r.outcome !== 'unjudged'), 'every gold matcher found a DEF to grade');
  const pods = a.rows.find((r) => r.match === 'pods');
  assert.notEqual(pods.projected, VERDICTS.CORROBORATED,
    'the pods claim is NOT corroborated — sharing the subject\'s words is not support (the ratchet)');
  assert.equal(a.verdicts.overall.confidentWrong, 0, 'the ratchet specimen is clean today');
});

test('the merged log replays partial-then-full through revise() — the chain survives the real pipeline', async () => {
  const dolphins = SPECIMENS.find((s) => s.id === 'dolphins-unsupported-predicate');
  const r = await runSpecimen(dolphins);
  const events = r.merged.all();
  assert.ok(events.length > 0);
  const revised = events.filter((e) => e.revises != null);
  assert.ok(revised.length > 0, 'the full read landed as revisions of the partial read\'s subjects');
  for (const e of revised) {
    assert.equal(events[e.revises].of, e.of, 'every revises pointer names the same subject it supersedes');
  }
  assert.equal(r.merged.project().size, r.turns.full.judgmentLog.project().size,
    'the merged projection carries exactly the full read\'s subjects');
});

// ── 6 · the battery and the ratchet ────────────────────────────────────────────

test('the battery runs every specimen; ratchet:true specimens stay clean — the regression floor', async () => {
  const { perSpecimen, scoreboard: agg, errors } = await runBattery(SPECIMENS);
  assert.equal(errors.length, 0, `no specimen drive may throw: ${JSON.stringify(errors)}`);
  assert.equal(perSpecimen.length, SPECIMENS.length);
  for (const s of perSpecimen) {
    if (!s.ratchet) continue;
    assert.equal(s.verdicts.overall.confidentWrong, 0, `${s.id}: a ratchet specimen regressed to confident-wrong`);
    assert.equal(s.verdicts.overall.wrongGrain, 0, `${s.id}: a ratchet specimen regressed to wrong-grain`);
    assert.equal(s.verdicts.overall.unjudged, 0, `${s.id}: a ratchet specimen lost a judged subject`);
    assert.equal(s.shape.malformed, 0, `${s.id}: a ratchet specimen minted a malformed DEF`);
  }
  // The recorded baseline: the un-ratcheted specimens carry the defects the retyping
  // (v2 #2–#4) must convert. If one goes clean, a judge changed — flip its ratchet bit
  // via the battery, deliberately, and update this pin.
  //   elvis-referent-diffuse: CONVERTED by #3 (typed reference) — it now ratchets above,
  //   and tests/typed-reference.test.js pins the ask that replaced the confident bind.
  //   unstated-evaluation (claim side): CONVERTED by #2 (typed binding) — the copular
  //   evaluation types EVA, no span ranks the subject, the claim ships uncited UNSUPPORTED;
  //   pinned below and in tests/typed-binding.test.js. The FIELD side stays the baseline:
  const unstated = perSpecimen.find((s) => s.id === 'unstated-evaluation');
  assert.equal(unstated.verdicts.overall.confidentWrong, 0,
    'converted by #2: the unstated superlative is no longer corroborated off a shared figure');
  assert.ok(unstated.verdicts.overall.unjudged >= 1,
    'baseline: no void DEF measures the missing ranking (v2 #4\'s target)');
  // The aggregate covers the three golded grains; predication stays thin until a classifier
  // rides in the harness (an honest edge, recorded in the battery doc).
  for (const g of ['claim', 'referent', 'field']) {
    assert.ok(agg.byGrain[g], `aggregate reports the ${g} grain`);
  }
  assert.equal(agg.shape.malformed, 0, 'no judge mints an oracle-shaped DEF anywhere on the battery');
});

// ── 7 · the oracle stays dry ───────────────────────────────────────────────────

test('the witness-audit oracle is offline by default — requests form, nothing sends, budget unspent', async () => {
  const oracle = createDefOracle({});
  const defs = [makeDef({ verdict: VERDICTS.CORROBORATED, grain: GRAINS.CLAIM, of: 'claim:x', witness: { score: 1 } })];
  const audits = await oracle.audit({ question: 'q', document: 'the source', defs });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].audit, null, 'dry-run: no verdict is invented');
  assert.equal(oracle.requests().length, 1, 'the request was formed and is inspectable');
  assert.equal(oracle.budget().calls.spent, 0, 'nothing was spent');
  assert.equal(oracle.armed(), false);
  const req = buildWitnessAuditRequest({ question: 'q', document: 'the source', def: defs[0] });
  assert.ok(req.messages[0].content.includes('the source'), 'the auditor holds the complete source — hard oracle, eval only');
  assert.ok(req.messages[0].content.includes('claim:x'), 'and the DEF it audits, witness included');
  assert.match(req.system, /INDETERMINATE is a legitimate verdict/i, 'correct suspension is protected in the rubric itself');
});

test('parseWitnessAudit — typed re-judgment in, clamped audit out; garbage is null, never a throw', () => {
  const ok = parseWitnessAudit({ content: [{ type: 'text', text: JSON.stringify({ supports: false, shouldBe: 'indeterminate', rationale: 'r' }) }] });
  assert.deepEqual(ok, { supports: false, shouldBe: 'indeterminate', rationale: 'r' });
  assert.equal(parseWitnessAudit({ content: [{ type: 'text', text: 'not json' }] }), null);
  assert.equal(parseWitnessAudit(null), null);
  const badEnum = parseWitnessAudit({ parsed_output: { supports: true, shouldBe: 'supported:0.87', rationale: 'r' } });
  assert.equal(badEnum.shouldBe, null, 'a scalar-shaped verdict does not pass the enum — the anti-oracle line holds');
});
