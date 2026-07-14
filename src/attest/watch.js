// EO: SIG·EVA·NUL(Entity,Lens → Entity,Lens,Void, Binding,Tracing,Dissecting,Clearing) — CDX watch
// Watch — the archive as an INSTRUMENT (docs/attestation-spec.md §7). This is the part that turns
// attestation from insurance into reporting. CDX returns every capture of a URL with a digest;
// poll it on a schedule and two findings fall out that a human could only catch by remembering
// what a page used to say:
//
//   • SCRUB (§7.1) — the digest changed; re-run the ladder per pinned span; a span that was
//     ATTESTED in an earlier capture and is ABSENT from the later one was edited or deleted, and
//     you are holding both versions with third-party timestamps on each.
//   • WITHDRAWAL (§7.2) — a capture that EXISTED at T₁ is gone at T₂. Internet Archive honours
//     retroactive exclusion requests, and does so most often for exactly the organisations worth
//     investigating. Because custody is yours, this does not destroy your evidence: it leaves a
//     hole in the tape with their name on it, and the hole is itself a dated, witnessed finding.
//
// Pure core: the CDX poll and the id_ re-fetch are seams (witness.js builds those requests); here
// we diff the capture history and re-attest the spans. Same-holon reuse of the ladder — a scrub is
// literally the attestation ladder run again, later, and finding the span gone.

import { runLadder } from './ladder.js';
import { waybackToIso } from './witness.js';

// ── watch cadence (§7.3) — how often a class of source is re-polled ──────────────
export const WATCH_CADENCE = Object.freeze({
  cited: 'weekly',                 // cited in published work — weekly, forever
  active: 'daily',                 // active investigation
  'collapsed-unpublished': 'monthly',
  'near-miss': 'quarterly',        // witnessed, no custody — a scrub here says it SHOULD have collapsed
  encountered: 'never',            // NUL'd, no capture to watch — re-collapse first
  'never-reached': 'n/a',          // outside the envelope (§8.7)
});
export const pollCadence = (sourceClass) => WATCH_CADENCE[sourceClass] || 'monthly';

// ── the watch record ─────────────────────────────────────────────────────────────
// One watched URL: the spans pinned to it, the digest we last saw, and the source class that
// sets its cadence. `last_scanned_at` is stamped by the poller, never minted here.
export const mkWatch = ({ url, source_class = 'collapsed-unpublished', span_ids = [], last_seen_digest = null, last_scanned_at = null } = {}) => Object.freeze({
  schema: 'watch/1', kind: 'watch',
  url: url || null,
  source_class,
  cadence: pollCadence(source_class),
  span_ids: Object.freeze([...span_ids]),
  last_seen_digest,
  last_scanned_at,
});

// ── CDX diff ─────────────────────────────────────────────────────────────────────
// latestCapture(cdxRows) → the most recent capture (max 14-digit timestamp). CDX is usually
// ascending, but we do not rely on order.
export const latestCapture = (cdxRows = []) =>
  cdxRows.reduce((best, r) => (!best || String(r.timestamp) > String(best.timestamp) ? r : best), null);

// digestChanged(cdxRows, lastSeenDigest) → { changed, latest, latestDigest }. The signal that a
// source moved since we last looked — the trigger for a scrub re-scan.
export const digestChanged = (cdxRows = [], lastSeenDigest = null) => {
  const latest = latestCapture(cdxRows);
  const latestDigest = latest ? latest.digest : null;
  return { changed: !!latestDigest && latestDigest !== lastSeenDigest, latest, latestDigest };
};

// detectWithdrawal({ known, cdxRows }) → the captures we had VERIFIED that are no longer in CDX
// (§7.2). `known` is a list of prior captures ({ timestamp, digest }) we logged as existing; a
// withdrawal is one whose timestamp has vanished from the live capture history. Returns the
// withdrawn entries — each a finding, not a failure.
export const detectWithdrawal = ({ known = [], cdxRows = [] } = {}) => {
  const live = new Set(cdxRows.map((r) => String(r.timestamp)));
  return known.filter((k) => !live.has(String(k.timestamp)));
};

// ── span-level scrub scan (§7.1) ─────────────────────────────────────────────────
const ATTESTED = new Set(['attested', 'attested_normalized', 'attested_fuzzy']);

// scanForScrubs({ spans, latestWitnessText, fuzzyThreshold }) → per-span findings. Each span is
// { id, text, priorState } — its earlier attestation verdict. Re-run the ladder against the
// latest capture; a span that WAS attested and is now divergent is SCRUBBED. A span that was
// already divergent, or is still present, is not a scrub. Custody is untouched — the claim still
// stands on the pinned bytes; the scrub is a NEW fact about the live source.
export const scanForScrubs = ({ spans = [], latestWitnessText = '', fuzzyThreshold = 0.95 } = {}) =>
  spans.map((s) => {
    const before = s.priorState;
    const after = runLadder(s.text, latestWitnessText, { fuzzyThreshold }).state;
    const scrubbed = ATTESTED.has(before) && after === 'divergent';
    return { id: s.id, before, after, scrubbed, stable: !scrubbed && ATTESTED.has(after) };
  });

// ── the whole watch pass ─────────────────────────────────────────────────────────
// watchScan(watch, { cdxRows, latestWitnessText, spans, known }) → a report + the EOT signals to
// append. Only re-scans spans when the digest actually moved (a stable page costs one CDX read,
// not an id_ fetch). Withdrawals are reported independently of the digest change.
export const watchScan = (watch, { cdxRows = [], latestWitnessText = null, spans = [], known = [] } = {}) => {
  const { changed, latest, latestDigest } = digestChanged(cdxRows, watch?.last_seen_digest);
  const withdrawn = detectWithdrawal({ known, cdxRows });
  const scrubs = (changed && latestWitnessText != null) ? scanForScrubs({ spans, latestWitnessText }) : [];
  const scrubbed = scrubs.filter((r) => r.scrubbed);

  const sigs = [];
  if (changed && latest) sigs.push(digestChangedSig(watch?.url, waybackToIso(latest.timestamp) || latest.timestamp));
  for (const r of scrubbed) { sigs.push(scrubbedSig(r.id, watch?.url)); sigs.push(removedFromLiveSig(r.id)); }
  for (const w of withdrawn) sigs.push(withdrawnSig('web.archive.org', w.timestamp));

  return {
    changed, latestDigest,
    scrubbed: scrubbed.map((r) => r.id),
    withdrawn: withdrawn.map((w) => w.timestamp),
    scrubs,
    next: { ...(watch || {}), last_seen_digest: latestDigest ?? watch?.last_seen_digest },
    sigs,
  };
};

// ── the EOT signals (§9 assembly 5, §7.2) ────────────────────────────────────────
export const digestChangedSig = (witnessId, at) => `!SIG ${witnessId}.digest_changed = ${JSON.stringify(at)}`;
export const scrubbedSig = (spanId, witnessId) => `!EVA ${spanId} @ ${witnessId}.latest = "SCRUBBED"`;
export const removedFromLiveSig = (spanId) => `!SIG ${spanId}.status = "removed-from-live-source"`;
export const withdrawnSig = (service, at = null) =>
  `!SIG source.witness.${service.replace(/\W+/g, '_')} = "withdrawn"${at ? `   # was present at ${at}` : ''}`;
