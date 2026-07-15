import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INTAKE_FATES, INTAKE_REASONS,
  stripStructure, contentTokens, explanatoryGain, keepAmplitude,
  intakeCuts, intakeVerdict, contestFlag, collapseDecision, provenanceBundle, webOrgan,
} from '../src/organs/in/web.js';
import { recordIntakeDefs } from '../src/turn/intake.js';
import {
  createJudgmentLog, DEF_GRAINS as GRAINS, VERDICTS, CUT_KINDS,
} from '../src/core/index.js';
import {
  saveTriggerRequest, availabilityRequest, parseAvailability, waybackSnapshotUrl,
  isFreshCapture, newestCdxDigest, createWitnessQueue,
} from '../src/attest/index.js';

// The web organ: the open-web keep decision as a typed, witnessed, revisable INTAKE DEF. The four
// gates form the membrane; the keep-criterion (gross magnitude modulated by MDL explanatory gain,
// then a seeded sample) decides custody; source-independence separates a keystone from an echo.

// ── a shared corpus: an investigation with two independent priors ──────────────────
const PRIOR_A = { address: 'sha256:aa#memo.p1', text: 'Payment routed through Meridian Holdings on case 2019cv04431.', lineage: 'court.gov' };
const PRIOR_B = { address: 'sha256:bb#ledger.row9', text: 'Meridian Holdings received the 2019cv04431 transfer in April.', lineage: 'ledger.local' };
const world = (over = {}) => ({ priors: [PRIOR_A, PRIOR_B], held: new Set(), ...over });

// the KEYSTONE candidate — a third, independently-sourced span that bridges both priors (shares the
// rare tokens `meridian`, `2019cv04431`), asserting, resolvable, naming a ruled-out other.
const keystone = (over = {}) => ({
  address: 'sha256:cc#filing.p3',
  text: 'Meridian Holdings is the shell entity behind case 2019cv04431.',
  magnitude: 0.8, phase: 'assert', lineage: 'sec.gov',
  refs: ['meridian-holdings'], ruledOut: { other: 'meridian-trust', margin: 0.3 },
  ...over,
});

// ── gate 4: structure is stripped; formatting wins nothing ─────────────────────────
test('stripStructure removes HTML and Markdown before any judgment', () => {
  assert.equal(stripStructure('<p>Meridian <b>Holdings</b></p>'), 'Meridian Holdings');
  assert.equal(stripStructure('## [Meridian](http://x) **Holdings**'), 'Meridian Holdings');
  assert.equal(contentTokens('<div></div> ** __ ## || ').size, 0, 'pure structure has no content tokens');
});

test('gate 4 — a span that is nothing but formatting is rejected, not kept', () => {
  const d = collapseDecision({ address: 'u#h', text: '<hr/> ** ## ||', magnitude: 0.9 }, world());
  assert.equal(d.fate, INTAKE_FATES.REJECTED);
  assert.equal(d.reason, INTAKE_REASONS.FORMATTING_ONLY);
});

// ── gate 3: no pin, no index ───────────────────────────────────────────────────────
test('gate 3 — a span we cannot cite (no pin) is rejected', () => {
  const d = collapseDecision({ address: 'no-hash-here', text: 'Meridian Holdings.', magnitude: 0.9 }, world());
  assert.equal(d.fate, INTAKE_FATES.REJECTED);
  assert.equal(d.reason, INTAKE_REASONS.NO_PIN);
});

// ── gate 1: already have it → a NUL ────────────────────────────────────────────────
test('gate 1 — a span we already hold is a NUL (encountered), not a drop and not a re-collapse', () => {
  const held = new Set([stripStructure(keystone().text).toLowerCase().replace(/\s+/g, ' ').trim()]);
  const d = collapseDecision(keystone(), world({ held }));
  assert.equal(d.fate, INTAKE_FATES.ENCOUNTERED);
  assert.equal(d.reason, INTAKE_REASONS.ALREADY_HELD);
  assert.equal(d.nul, true);
});

// ── gate 2: not salient ────────────────────────────────────────────────────────────
test('gate 2 — a span below candidacy is encountered, not collapsed', () => {
  const d = collapseDecision(keystone({ magnitude: 0 }), world());
  assert.equal(d.fate, INTAKE_FATES.ENCOUNTERED);
  assert.equal(d.reason, INTAKE_REASONS.NOT_SALIENT);
});

// ── the keep-criterion (b): MDL explanatory gain ───────────────────────────────────
test('explanatoryGain rewards a bridge across independent priors and discounts the ubiquitous', () => {
  const g = explanatoryGain(keystone(), [PRIOR_A, PRIOR_B]);
  assert.ok(g.back > 0, 'it compresses the independent record');
  assert.ok(g.bridges.includes('meridian') || g.bridges.includes('2019cv04431'), 'the rare shared token is a bridge across ≥2 priors');
  assert.deepEqual(g.independentPriors.sort(), [PRIOR_A.address, PRIOR_B.address].sort());
});

test('a surprising span that repays nothing is noise — amplitude collapses toward zero', () => {
  const noise = keystone({ text: 'An unrelated sentence about migratory butterflies in Oaxaca.', magnitude: 0.9 });
  const g = explanatoryGain(noise, [PRIOR_A, PRIOR_B]);
  assert.equal(g.back, 0, 'shares no content with the independent record');
  assert.equal(keepAmplitude(0.9, g.gain), 0, 'salient but repaying nothing → ~0 amplitude');
  assert.ok(keepAmplitude(0.9, explanatoryGain(keystone(), [PRIOR_A, PRIOR_B]).gain) > 0, 'the keystone keeps its amplitude');
});

test('ΔL_fwd is measured, not narrated — foreBits adds to the gain', () => {
  const g0 = explanatoryGain(keystone({ foreBits: 0 }), [PRIOR_A, PRIOR_B]);
  const g1 = explanatoryGain(keystone({ foreBits: 3 }), [PRIOR_A, PRIOR_B]);
  assert.equal(g1.gain - g0.gain, 3);
});

// ── the witness (§3): the decomposition, and the verdict fold ──────────────────────
test('the intake witness is the sub-cut chain — presence, argument, predicate', () => {
  const g = explanatoryGain(keystone(), [PRIOR_A, PRIOR_B]);
  const cuts = intakeCuts(keystone(), g);
  const kinds = cuts.map((c) => c.kind);
  assert.ok(kinds.includes(CUT_KINDS.PRESENCE) && kinds.includes(CUT_KINDS.ARGUMENT) && kinds.includes(CUT_KINDS.PREDICATE));
  const pred = cuts.find((c) => c.kind === CUT_KINDS.PREDICATE);
  assert.equal(pred.verdict, VERDICTS.CORROBORATED, 'it compresses the independent record');
});

test('the keystone collapses as CORROBORATED, carrying its ruled-out other', () => {
  const d = collapseDecision(keystone(), world(), { seed: 'keystone-seed' });
  // find a seed under which the draw collapses (deterministic per seed+address)
  let collapsed = d;
  for (let i = 0; !collapsed || collapsed.fate !== INTAKE_FATES.COLLAPSED; i++) {
    collapsed = collapseDecision(keystone(), world(), { seed: `s${i}` });
    if (i > 50) break;
  }
  assert.equal(collapsed.fate, INTAKE_FATES.COLLAPSED);
  assert.equal(collapsed.verdict, VERDICTS.CORROBORATED);
  assert.equal(collapsed.ruledOut.other, 'meridian-trust');
});

// ── F-indep (§5): no CORROBORATED intake resting only on same-lineage spans ─────────
test('F-indep — a span corroborated only by its own lineage downgrades to INDETERMINATE (the echo)', () => {
  const sameLineage = keystone({ lineage: 'court.gov' });   // same lineage as PRIOR_A; PRIOR_B differs
  const echoWorld = world({ priors: [{ ...PRIOR_A }, { ...PRIOR_B, lineage: 'court.gov' }] });   // both now same lineage as candidate
  const g = explanatoryGain(sameLineage, echoWorld.priors);
  assert.equal(g.independentPriors.length, 0, 'no independent-lineage prior remains');
  const v = intakeVerdict(sameLineage, g, echoWorld);
  assert.equal(v.verdict, VERDICTS.INDETERMINATE);
  assert.equal(v.downgraded, 'no-independent-prior');
});

// ── §4: a contradiction is a keep, not a drop ──────────────────────────────────────
test('an opposed-phase span against a kept claim is CONTRADICTED — retained and flagged', () => {
  const denial = keystone({ phase: 'deny' });
  const g = explanatoryGain(denial, [PRIOR_A, PRIOR_B]);
  const v = intakeVerdict(denial, g, world());
  assert.equal(v.verdict, VERDICTS.CONTRADICTED);
});

// ── §4: OFF_DIAGONAL — a Figure claim where the log holds only Void ─────────────────
test('a specific claim asserted over a Void terrain is OFF_DIAGONAL — rejected, never corroborated', () => {
  const d = collapseDecision(
    keystone({ claimsFigure: true, subject: 'void-subject' }),
    world({ voidTerrain: new Set(['void-subject']) }));
  assert.equal(d.fate, INTAKE_FATES.REJECTED);
  assert.equal(d.verdict, VERDICTS.OFF_DIAGONAL);
});

// ── F-contested (§4): a contradicting pair surfaces CONTESTED, not summed away ──────
test('F-contested — high magnitude + both phases present flags CONTESTED, not one blended number', () => {
  const phasesBySubject = new Map([['meridian', new Set(['assert', 'deny'])]]);
  assert.equal(contestFlag(keystone({ subject: 'meridian', magnitude: 0.8 }), { phasesBySubject }), 'contested');
  assert.equal(contestFlag(keystone({ subject: 'meridian', magnitude: 0.1 }), { phasesBySubject }), 'thin', 'low magnitude is THIN');
  assert.equal(contestFlag(keystone({ subject: 'solo', magnitude: 0.8 }), { phasesBySubject }), null, 'no cancellation, no contest');
});

// ── F-seed (§8.5): the partition is reproducible from the logged seed ──────────────
test('F-seed — re-running with the logged seed reproduces the keep/pass partition', () => {
  const cands = Array.from({ length: 30 }, (_, i) => keystone({ address: `sha256:x${i}#p`, magnitude: 0.6 }));
  const run1 = webOrgan(cands, world(), { seed: 'fixed-seed' });
  const run2 = webOrgan(cands, world(), { seed: 'fixed-seed' });
  assert.deepEqual(run1.collapsed.map((d) => d.address), run2.collapsed.map((d) => d.address));
  const other = webOrgan(cands, world(), { seed: 'other-seed' });
  assert.notDeepEqual(run1.collapsed.map((d) => d.address), other.collapsed.map((d) => d.address), 'a different seed draws a different partition');
});

// ── F-anomaly (§7): the anomaly budget keeps a nonzero low-amplitude keep-rate ─────
test('F-anomaly — raising temperature funds low-amplitude spans (a nonzero keep-rate)', () => {
  const faint = Array.from({ length: 60 }, (_, i) => keystone({ address: `sha256:f${i}#p`, magnitude: 0.12 }));
  const cold = webOrgan(faint, world(), { seed: 'anom', temperature: 1 });
  const warm = webOrgan(faint, world(), { seed: 'anom', temperature: 4 });
  assert.ok(warm.collapsed.length > cold.collapsed.length, 'the anomaly temperature explores what the field argues against');
});

// ── F-prov (§6): a witness that does not contain the span is WITNESS_INCOMPLETE ────
test('F-prov — a capture that does not contain the collapsed span is flagged, never shipped', () => {
  const good = provenanceBundle(keystone(), { myHash: 'sha256:deadbeef', witness: { status: 'success', snapshot: 'https://web.archive.org/web/2026/x', wayback_timestamp: '20260714000000', cdx_digest: 'ABC' }, spanPresentInCapture: true });
  assert.equal(good.status, 'witnessed');
  assert.equal(good.cdx_digest, 'ABC');
  const bad = provenanceBundle(keystone(), { myHash: 'sha256:deadbeef', witness: { status: 'success', snapshot: 'https://x' }, spanPresentInCapture: false });
  assert.equal(bad.status, 'WITNESS_INCOMPLETE');
  assert.equal(bad.incomplete_reason, 'span-not-in-capture');
  const none = provenanceBundle(keystone(), { myHash: 'sha256:deadbeef', witness: null });
  assert.equal(none.status, 'WITNESS_INCOMPLETE');
});

// ── recordIntakeDefs: the decisions fold onto the judgment log (§10) ───────────────
test('recordIntakeDefs writes an INTAKE DEF for collapsed, a rejection DEF for rejected, a frontier line otherwise', () => {
  const log = createJudgmentLog();
  const decisions = [
    ...Array.from({ length: 20 }, (_, i) => collapseDecision(keystone({ address: `sha256:c${i}#p` }), world(), { seed: `s${i}` })),
    collapseDecision({ address: 'bad', text: 'x', magnitude: 0.9 }, world()),       // rejected: no-pin
    collapseDecision(keystone({ magnitude: 0 }), world()),                          // encountered
  ];
  const { defs, frontier } = recordIntakeDefs(log, decisions);
  assert.ok(defs.length >= 1, 'at least the rejection DEF is logged');
  const intakeDefs = log.all().filter((e) => e.grain === GRAINS.INTAKE);
  assert.equal(intakeDefs.length, defs.length, 'every logged DEF is at the INTAKE grain');
  assert.ok(intakeDefs.every((d) => !d.malformed), 'every intake DEF carries a witness (no oracle)');
  const rejection = log.all().find((e) => e.witness && e.witness.rejected === INTAKE_REASONS.NO_PIN);
  assert.ok(rejection, 'the no-pin span is a rejection DEF with a stated reason');
  assert.ok(frontier.some((f) => f.reason === INTAKE_REASONS.NOT_SALIENT), 'the not-salient span is a frontier line, not a DEF');
});

test('an INTAKE DEF grades through the defscore machinery (grain-agnostic)', async () => {
  const { matchGold, scoreVerdicts } = await import('../src/metabolism/defscore.js');
  const log = createJudgmentLog();
  const d = (() => { for (let i = 0; i < 60; i++) { const x = collapseDecision(keystone(), world(), { seed: `g${i}` }); if (x.fate === INTAKE_FATES.COLLAPSED) return x; } })();
  recordIntakeDefs(log, [d]);
  const rows = matchGold(log.project(), [{ grain: GRAINS.INTAKE, match: '*', accept: [VERDICTS.CORROBORATED] }]);
  const score = scoreVerdicts(rows);
  assert.ok(score.byGrain.intake, 'the intake grain appears in the scoreboard');
  assert.equal(score.byGrain.intake.correct, 1);
});

// ── the no-key Wayback witness flow (§6, corrected) ────────────────────────────────
test('the no-key witness path is three keyless GETs', () => {
  assert.equal(saveTriggerRequest('https://ex.gov/x').url, 'https://web.archive.org/save/https://ex.gov/x');
  assert.equal(saveTriggerRequest('https://ex.gov/x').headers, undefined, 'no Authorization, no S3 key');
  assert.match(availabilityRequest('https://ex.gov/x').url, /^https:\/\/archive\.org\/wayback\/available\?url=/);
  const snap = parseAvailability({ archived_snapshots: { closest: { available: true, url: 'https://web.archive.org/web/20260714/x', timestamp: '20260714120000', status: '200' } } });
  assert.equal(snap.wayback_timestamp, '20260714120000');
  assert.equal(snap.captured_at, '2026-07-14T12:00:00Z');
  assert.equal(parseAvailability({ archived_snapshots: {} }), null, 'no closest → null');
  assert.equal(waybackSnapshotUrl('20260714120000', 'https://ex.gov/x'), 'https://web.archive.org/web/20260714120000/https://ex.gov/x');
  assert.equal(newestCdxDigest([['timestamp', 'digest'], ['20260101', 'OLD'], ['20260714', 'NEW']]), 'NEW');
});

test('isFreshCapture accepts a contemporaneous timestamp and rejects a stale one', () => {
  const now = Date.parse('2026-07-14T12:30:00Z');
  assert.equal(isFreshCapture('20260714120000', { now }), true, 'half an hour old — fresh');
  assert.equal(isFreshCapture('20250101000000', { now }), false, 'a year old — the API had it already');
});

test('the witness queue drives the no-key flow to success with a stub client', async () => {
  const q = createWitnessQueue();
  q.request({ serviceKey: 'IA', url: 'https://ex.gov/x' });
  const client = {
    triggered: 0, polls: 0,
    async trigger() { this.triggered += 1; },
    async available() { this.polls += 1; return this.polls >= 2 ? { wayback_timestamp: '20260714120000', captured_at: '2026-07-14T12:00:00Z', snapshot_url: 'https://web.archive.org/web/20260714120000/https://ex.gov/x' } : null; },
    async cdx() { return [['timestamp', 'digest'], ['20260714120000', 'ZZZ']]; },
  };
  await q.advance(client);   // requested → queued (trigger fired)
  await q.advance(client);   // queued → poll (not yet)
  await q.advance(client);   // queued → success
  const w = q.forUrl('https://ex.gov/x')[0];
  assert.equal(w.status, 'success');
  assert.equal(w.cdx_digest, 'ZZZ');
  assert.equal(w.snapshot, 'https://web.archive.org/web/20260714120000/https://ex.gov/x');
  assert.equal(client.triggered, 1, 'the save is fired once');
});

test('a rate-limited trigger is retryable, not failed', async () => {
  const q = createWitnessQueue();
  q.request({ serviceKey: 'IA', url: 'https://ex.gov/y' });
  let calls = 0;
  const client = {
    async trigger() { calls += 1; if (calls === 1) throw new Error('429'); },
    async available() { return null; },
  };
  await q.advance(client);   // first trigger 429s → stays 'requested'
  assert.equal(q.forUrl('https://ex.gov/y')[0].status, 'requested', '429 is retry-later, never a terminal failure');
  await q.advance(client);   // retries the trigger → queued
  assert.equal(q.forUrl('https://ex.gov/y')[0].status, 'queued');
});
