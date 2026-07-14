import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTEST_STATES, DIVERGENCE_CAUSES,
  normalize, charDice, runLadder, triageDivergence, attest,
  attestationSig, humanReviewSig,
} from '../src/attest/ladder.js';

// Attestation ladder (docs/attestation-spec.md §5) — does the span survive in the witness's
// copy? Build-order step 6. Per span, never per page (§5.1). The id_ fetch is a seam; the
// comparison — the four rungs and the divergence triage — is pure and tested here.

// ── normalization (§5.3 rung 2) ──────────────────────────────────────────────────

test('normalize collapses whitespace, folds smart quotes, decodes entities, strips soft hyphens', () => {
  assert.equal(normalize('the   deal\n\twas  final'), 'the deal was final');
  assert.equal(normalize('he said “yes” and ‘no’'), 'he said "yes" and \'no\'');
  assert.equal(normalize('Jones &amp; Co. &lt;tag&gt; &#39;q&#39;'), 'Jones & Co. <tag> \'q\'');
  assert.equal(normalize('sub­divide'), 'subdivide', 'soft hyphen removed');
});

test('charDice is 1 on identity, high on a one-char typo, low on unrelated text', () => {
  assert.equal(charDice('approved', 'approved'), 1);
  assert.ok(charDice('the board approved the merger', 'the board approvd the merger') > 0.9);
  assert.ok(charDice('the mayor signed it', 'zoning permits and parking') < 0.3);
});

// ── the four rungs (§5.3) ─────────────────────────────────────────────────────────

test('rung 1: an exact substring in the witness is attested', () => {
  const v = runLadder('the deal was final', 'He said the deal was final, on the record.');
  assert.equal(v.state, 'attested');
  assert.equal(v.similarity, 1);
  assert.equal(v.escalate, false);
});

test('rung 2: a match after normalization is attested_normalized', () => {
  const v = runLadder('the deal was final', 'He said the deal   was final.');   // extra whitespace only
  assert.equal(v.state, 'attested_normalized');
  const q = runLadder('he said "yes"', 'the memo: he said “yes” clearly');  // smart quotes only
  assert.equal(q.state, 'attested_normalized');
});

test('rung 3: a near-match ≥0.95 is attested_fuzzy and FLAGGED for human review (never auto-passed)', () => {
  const v = runLadder(
    'the board approved the merger on tuesday morning',
    'Council notes: the board approvd the merger on tuesday morning, pending review.');   // one dropped letter
  assert.equal(v.state, 'attested_fuzzy');
  assert.ok(v.similarity >= 0.95);
  assert.equal(v.human, true, 'tier 3 never auto-passes (§5.3)');
  assert.equal(v.escalate, false);
});

test('rung 4: no match is divergent and ESCALATES', () => {
  const v = runLadder('the mayor personally signed the contract', 'An unrelated paragraph about zoning permits and parking rules.');
  assert.equal(v.state, 'divergent');
  assert.equal(v.escalate, true);
  assert.ok(v.similarity < 0.95);
});

test('an empty span is divergent (nothing to attest) and does not trigger triage', () => {
  const v = runLadder('   ', 'anything');
  assert.equal(v.state, 'divergent');
  assert.equal(v.reason, 'empty-span');
  assert.deepEqual([...ATTEST_STATES], ['attested', 'attested_normalized', 'attested_fuzzy', 'divergent']);
});

// ── divergence triage (§5.4) — a divergence must have a cause ─────────────────────

test('paywall: an authenticated capture vs an interstitial is expected, not escalated', () => {
  const t = triageDivergence({ capture: { authenticated: true }, witnessText: 'Subscribe to continue reading this article.' });
  assert.equal(t.cause, 'paywall');
});

test('edited: witness captured after the fetch with an earlier capture in CDX', () => {
  const t = triageDivergence({
    capture: { authenticated: false },
    witnessCapturedAt: '2026-05-01T00:00:00Z',
    fetchedAt: '2026-04-02T14:11:07Z',
    cdxRows: [{ timestamp: '20260401000000' }],   // a capture that predates our fetch
  });
  assert.equal(t.cause, 'edited');
});

test('render: a JS-rendered capture whose witness DOM diverged', () => {
  const t = triageDivergence({ capture: { renderer: 'chrome/126' }, signals: { renderDiverged: true } });
  assert.equal(t.cause, 'render');
});

test('cloaked is the loud one — contemporaneous, material difference, no benign explanation', () => {
  const t = triageDivergence({
    capture: { authenticated: false },
    witnessCapturedAt: '2026-04-02T14:20:00Z',
    fetchedAt: '2026-04-02T14:11:07Z',   // same day, no earlier capture, no paywall/render
  });
  assert.equal(t.cause, 'cloaked');
  assert.deepEqual([...DIVERGENCE_CAUSES], ['paywall', 'geo', 'edited', 'cloaked', 'render']);
});

test('geo: a caller hint, or a non-contemporaneous difference, reads as regional variance', () => {
  assert.equal(triageDivergence({ capture: {}, signals: { geoHint: true } }).cause, 'geo');
  assert.equal(triageDivergence({ capture: {}, witnessCapturedAt: '2026-06-01T00:00:00Z', fetchedAt: '2026-04-02T00:00:00Z' }).cause, 'geo');
});

// ── the whole verdict + EOT signals (§9 assembly 3) ──────────────────────────────

test('attest() runs the ladder and types the cause when divergent', () => {
  const cloak = attest({
    spanText: 'the vendor confirmed the partnership',
    witnessText: 'A totally different page about parking meters and permit fees downtown.',
    witnessCapturedAt: '2026-04-02T14:20:00Z', fetchedAt: '2026-04-02T14:11:07Z',
  });
  assert.equal(cloak.state, 'divergent');
  assert.equal(cloak.cause, 'cloaked');

  const ok = attest({ spanText: 'the deal was final', witnessText: 'he said the deal was final today' });
  assert.equal(ok.state, 'attested');
  assert.equal(ok.cause, undefined, 'an attested span carries no divergence cause');
});

test('the EOT signals match §9 assembly 3', () => {
  assert.equal(attestationSig('cap:9f2a#sec-4.para-2', 'w_ia_0311', 'attested'),
    '!EVA cap:9f2a#sec-4.para-2 @ w_ia_0311 = "attested"');
  assert.equal(humanReviewSig('cap:9f2a#sec-7.para-1'), '!SIG cap:9f2a#sec-7.para-1.review = "human"');
});
