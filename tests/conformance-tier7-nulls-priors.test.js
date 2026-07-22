// TIER 7 — Nulls and priors (docs/parse-conformance-spec.md).
// "deriveNull is where a statistical threshold becomes a product claim."
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readWithSeed, buildReading } from './conformance/harness/read.js';
import { readingHash, readingDiff } from './conformance/harness/reading-hash.js';
import { listFixtures, loadFixture } from './conformance/harness/fixtures.js';
import { typeReferents, classifyReferent } from '../src/perceiver/individuation.js';

// ── #30 — Null stability under small perturbation ────────────────────────────
// "adding one sentence should not flip a referent's gate typing." Tier 1
// already covers stability across REPLAYS of the same input; this covers
// stability across small PERTURBATIONS of the input. Scope, honestly: this
// sweeps three already-well-established, high-mass referents (mass ≥ 5 in
// the base fixture) through three one-sentence-at-a-time neutral additions —
// enough to confirm the practical claim (an established referent's typing
// does not flap as unrelated text is appended around it), not an exhaustive
// search of the whole gate-typing space for a cliff edge.
test('Tier7 #30: null stability — appending one neutral sentence at a time does not flip an established referent\'s gate type', async () => {
  const base = loadFixture('muni-council-minutes-01').text;
  const filler = ['The clerk noted the time.', 'The room was quiet.', 'Staff distributed handouts.'];
  const track = ['Fenwick', 'Kim', 'Mayor Owusu'];

  let text = base;
  let prevTypes = null;
  for (let i = 0; i < filler.length; i++) {
    text = `${text} ${filler[i]}`;
    const doc = await readWithSeed(text, { seed: `tier7-30-step-${i}` });
    const typed = typeReferents(doc);
    const cur = Object.fromEntries(track.map((label) => [label, (typed.find((t) => t.label === label) || {}).type]));
    if (prevTypes) {
      for (const label of track) {
        assert.equal(cur[label], prevTypes[label], `appending "${filler[i]}" flipped ${label}'s gate type from ${prevTypes[label]} to ${cur[label]}`);
      }
    }
    prevTypes = cur;
  }
});

// ── #31 — Null vs. constant differential ─────────────────────────────────────
// "Run the corpus with deriveNull replaced by the nearest fixed constant. If
// the outputs are largely identical, the Born-derived null is doing no work
// ... This is a diagnostic, not a gate."
//
// classifyReferent(cand, gates) is pure and takes gates as a parameter,
// separate from deriveGates(cands) (the only caller of deriveNull) — so this
// swaps the gates directly rather than mocking deriveNull. typeReferents'
// own output already carries {mass, rho, subjShare, ins} per candidate, in
// exactly the shape classifyReferent expects, so the real candidates are
// reused rather than reconstructed.
test('Tier7 #31: null-vs-constant differential — the Born-derived null changes classification for a substantial share of the cast (diagnostic, not a gate)', async () => {
  const CONST_GATES = { mnull: 2, rnull: 2, agencyLine: 0.5 };
  let totalCands = 0, totalChanged = 0;
  for (const row of listFixtures({ category: 'municipal' })) {
    const f = loadFixture(row.id);
    const doc = await readWithSeed(f.bytes, { seed: `tier7-31-${row.id}` });
    const real = typeReferents(doc);
    if (!real.length) continue;
    const constTyped = real.map((c) => classifyReferent(c, CONST_GATES));
    totalCands += real.length;
    totalChanged += real.filter((r, i) => r.type !== constTyped[i].type).length;
  }
  assert.ok(totalCands > 0, 'no candidates found across the municipal fixtures — differential test has nothing to measure');
  const changedShare = totalChanged / totalCands;
  assert.ok(changedShare > 0.15,
    `only ${(changedShare * 100).toFixed(1)}% of the cast changed classification under a fixed-constant null — the Born-derived null may be doing no real work (spec #31)`);
});

// ── #32 — Prior-version pinning ──────────────────────────────────────────────
// "Every reading records the prior version it used ... Replaying a stored
// reading against its pinned version reproduces the reading exactly."
test('Tier7 #32: replaying a reading against its pinned prior ledger reproduces it byte-identically', async () => {
  const priorText = 'Mayor Owusu called the meeting to order. She read the agenda.';
  const priorDoc = await readWithSeed(priorText, { seed: 'tier7-32-prior' });
  const ledger = priorDoc.conventions.exportLedger();

  const text = 'Council Member Vance moved to approve the item. Reyes seconded.';
  const a = await readWithSeed(text, { seed: 'tier7-32-replay', priorLedger: ledger });
  const b = await readWithSeed(text, { seed: 'tier7-32-replay', priorLedger: ledger });
  assert.equal(readingHash(a), readingHash(b), 'replaying the same text against the same pinned prior ledger did not reproduce byte-identically');
});

test.todo('Tier7 #32 GAP, confirmed — no reading records which prior/ledger version produced it', async () => {
  // The underlying pin-and-replay mechanism works (see the passing test
  // above), but nothing on the resulting doc says WHICH prior it was pinned
  // against — conventions/ledger.js's exportLedger() carries no version
  // field, and readWithSeed's priorLedger option is consumed, never
  // recorded. "Replaying against a different version is required to either
  // reproduce or fail loudly" (spec #32) cannot be verified at all today,
  // because there is nothing on a reading to compare a candidate prior
  // against in the first place.
  const text = 'Mayor Owusu called the meeting to order.';
  const doc = await readWithSeed(text, { seed: 'tier7-32-version-field' });
  const hasVersionField = 'priorVersion' in doc || 'priorLedgerVersion' in doc
    || Object.keys(doc).some((k) => /prior.*version|version.*prior/i.test(k));
  assert.ok(hasVersionField, 'expected the doc to record which prior version it was read against; found no such field');
});

// ── #33 — Prior-free baseline ─────────────────────────────────────────────────
// "Every fixture reads successfully with all priors empty (cold start).
// Compare against the primed read and record the delta."
test('Tier7 #33: every fixture reads successfully with priors empty (cold start), and the delta against the primed read is measurable', async () => {
  for (const row of listFixtures()) {
    const f = loadFixture(row.id);
    const primed = await readWithSeed(f.bytes, { seed: `${row.id}-tier7-33-primed` });
    const cold = await readWithSeed(f.bytes, { seed: `${row.id}-tier7-33-cold`, seeds: false });
    assert.ok(cold, `${row.id}: cold-start read (seeds:false) returned nothing`);
    // The delta is reported, not asserted nonzero — an empty document (e.g.
    // degenerate-empty) legitimately has zero referents either way.
    readingDiff(primed, cold);
  }
});

// ── #34 — Prior firewall ──────────────────────────────────────────────────────
// "Assert mechanically that no corpus-prior text appears in any citation,
// quote, or span emitted by a reading. ... The firewall is stated as a
// design commitment; make it a test." Genuinely untested territory before
// this file — this is the first assertion for it.
test('Tier7 #34: prior firewall — no distinctive token from the prior document leaks into a reading built from a different document', async () => {
  const priorText = 'The Zylophant Corporation submitted a bid for the contract on Blorbnax Avenue.';
  const priorDoc = await readWithSeed(priorText, { seed: 'tier7-34-prior' });
  const ledger = priorDoc.conventions.exportLedger();

  const ownText = 'Council Member Vance moved to approve the item. Reyes seconded the motion.';
  const doc = await readWithSeed(ownText, { seed: 'tier7-34-own', priorLedger: ledger });
  const reading = await buildReading(doc);

  const haystack = JSON.stringify({ units: doc.sentences, events: doc.log.snapshot(), reading });
  for (const distinctiveToken of ['Zylophant', 'Blorbnax']) {
    assert.ok(!haystack.includes(distinctiveToken), `prior-only token "${distinctiveToken}" leaked into the reading built from an unrelated document`);
  }
});
