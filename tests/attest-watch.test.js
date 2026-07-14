import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WATCH_CADENCE, pollCadence, mkWatch,
  latestCapture, digestChanged, detectWithdrawal,
  scanForScrubs, watchScan,
  digestChangedSig, scrubbedSig, removedFromLiveSig, withdrawnSig,
} from '../src/attest/watch.js';

// Watch (docs/attestation-spec.md §7) — the archive as an instrument. Build-order step 8, the
// scrub detector. Pure core: the CDX poll and id_ re-fetch are seams; here we diff the capture
// history and re-attest the spans.

// ── cadence (§7.3) ─────────────────────────────────────────────────────────────

test('cadence follows the source class', () => {
  assert.equal(pollCadence('cited'), 'weekly');
  assert.equal(pollCadence('active'), 'daily');
  assert.equal(pollCadence('near-miss'), 'quarterly');
  assert.equal(pollCadence('encountered'), 'never');
  assert.equal(pollCadence('never-reached'), 'n/a');
  assert.equal(WATCH_CADENCE['collapsed-unpublished'], 'monthly');
  assert.equal(mkWatch({ url: 'https://x', source_class: 'active' }).cadence, 'daily');
});

// ── CDX diff ─────────────────────────────────────────────────────────────────────

test('latestCapture and digestChanged detect a moved source regardless of row order', () => {
  const rows = [
    { timestamp: '20261108031400', digest: 'ZZZ9' },
    { timestamp: '20260402141352', digest: 'PJK3' },
  ];
  assert.equal(latestCapture(rows).digest, 'ZZZ9');
  assert.equal(digestChanged(rows, 'PJK3').changed, true, 'digest moved since we last saw PJK3');
  assert.equal(digestChanged(rows, 'ZZZ9').changed, false, 'unchanged when the latest matches last-seen');
  assert.equal(digestChanged([], 'PJK3').changed, false, 'no captures → nothing changed');
});

test('detectWithdrawal finds a verified capture that vanished from CDX (§7.2)', () => {
  const known = [{ timestamp: '20260402141352', digest: 'PJK3' }, { timestamp: '20260501000000', digest: 'AAAA' }];
  const cdxNow = [{ timestamp: '20260501000000', digest: 'AAAA' }];   // the 0402 capture is gone
  const gone = detectWithdrawal({ known, cdxRows: cdxNow });
  assert.equal(gone.length, 1);
  assert.equal(gone[0].timestamp, '20260402141352');
  assert.deepEqual(detectWithdrawal({ known, cdxRows: known }), [], 'nothing withdrawn when all still present');
});

// ── span-level scrub (§7.1) ──────────────────────────────────────────────────────

test('a span attested earlier and absent now is SCRUBBED; a still-present span is stable', () => {
  const latestWitnessText = 'The board met. Unrelated boilerplate about parking and permits remains.';
  const spans = [
    { id: 'cap:9f2a#sec-4.para-2', text: 'the board approved the vendor contract', priorState: 'attested' },
    { id: 'cap:9f2a#sec-1.para-1', text: 'The board met.', priorState: 'attested' },
  ];
  const findings = scanForScrubs({ spans, latestWitnessText });
  const scrubbed = findings.find((f) => f.id.endsWith('sec-4.para-2'));
  const stable = findings.find((f) => f.id.endsWith('sec-1.para-1'));
  assert.equal(scrubbed.scrubbed, true, 'the quoted sentence is gone from the later capture');
  assert.equal(scrubbed.before, 'attested');
  assert.equal(scrubbed.after, 'divergent');
  assert.equal(stable.scrubbed, false);
  assert.equal(stable.stable, true);
});

test('a span that was already divergent is not a scrub', () => {
  const findings = scanForScrubs({ spans: [{ id: 's', text: 'never was there', priorState: 'divergent' }], latestWitnessText: 'anything' });
  assert.equal(findings[0].scrubbed, false);
});

// ── the whole pass ─────────────────────────────────────────────────────────────

test('watchScan re-scans only when the digest moved, and emits the §9-assembly-5 signals', () => {
  const watch = mkWatch({ url: 'https://ex.gov/minutes', source_class: 'cited', span_ids: ['cap:9f2a#sec-4.para-2'], last_seen_digest: 'PJK3' });
  const cdxRows = [{ timestamp: '20260402141352', digest: 'PJK3' }, { timestamp: '20261108031400', digest: 'ZZZ9' }];
  const spans = [{ id: 'cap:9f2a#sec-4.para-2', text: 'the board approved the vendor contract', priorState: 'attested' }];
  const report = watchScan(watch, { cdxRows, latestWitnessText: 'The page now says something else entirely about zoning.', spans });

  assert.equal(report.changed, true);
  assert.equal(report.latestDigest, 'ZZZ9');
  assert.deepEqual(report.scrubbed, ['cap:9f2a#sec-4.para-2']);
  assert.equal(report.next.last_seen_digest, 'ZZZ9', 'the watch advances its last-seen digest');
  assert.ok(report.sigs.includes('!SIG https://ex.gov/minutes.digest_changed = "2026-11-08T03:14:00Z"'));
  assert.ok(report.sigs.includes('!EVA cap:9f2a#sec-4.para-2 @ https://ex.gov/minutes.latest = "SCRUBBED"'));
  assert.ok(report.sigs.includes('!SIG cap:9f2a#sec-4.para-2.status = "removed-from-live-source"'));
});

test('watchScan on an unchanged digest does no span work', () => {
  const watch = mkWatch({ url: 'https://x', last_seen_digest: 'ZZZ9' });
  const report = watchScan(watch, { cdxRows: [{ timestamp: '20261108031400', digest: 'ZZZ9' }], latestWitnessText: 'x', spans: [{ id: 's', text: 't', priorState: 'attested' }] });
  assert.equal(report.changed, false);
  assert.deepEqual(report.scrubbed, []);
  assert.deepEqual(report.scrubs, []);
});

test('watchScan reports a withdrawal independently of a digest change', () => {
  const watch = mkWatch({ url: 'https://x', last_seen_digest: 'AAAA' });
  const report = watchScan(watch, {
    cdxRows: [{ timestamp: '20260501000000', digest: 'AAAA' }],
    known: [{ timestamp: '20260402141352', digest: 'PJK3' }, { timestamp: '20260501000000', digest: 'AAAA' }],
  });
  assert.deepEqual(report.withdrawn, ['20260402141352']);
  assert.ok(report.sigs.some((s) => s.startsWith('!SIG source.witness.web_archive_org = "withdrawn"')));
});

// ── EOT signals (§9 assembly 5) ──────────────────────────────────────────────────

test('the watch signals match §9 assembly 5', () => {
  assert.equal(digestChangedSig('w_ia_0311', '2026-11-08T03:14:00Z'), '!SIG w_ia_0311.digest_changed = "2026-11-08T03:14:00Z"');
  assert.equal(scrubbedSig('cap:9f2a#sec-4.para-2', 'w_ia_0311'), '!EVA cap:9f2a#sec-4.para-2 @ w_ia_0311.latest = "SCRUBBED"');
  assert.equal(removedFromLiveSig('cap:9f2a#sec-4.para-2'), '!SIG cap:9f2a#sec-4.para-2.status = "removed-from-live-source"');
  assert.match(withdrawnSig('web.archive.org'), /^!SIG source\.witness\.web_archive_org = "withdrawn"/);
});
