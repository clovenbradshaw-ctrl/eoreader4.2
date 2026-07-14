import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SERVICES, WITNESS_STATUS,
  idReplayUrl, waybackToIso,
  spnSaveRequest, spnStatusRequest, parseSaveResponse, parseStatusResponse,
  cdxRequest, parseCdxRows,
  mkWitness, createWitnessQueue, nearMissRequest, witnessDiversity, witnessed,
} from '../src/attest/witness.js';

// Witness (docs/attestation-spec.md §4) — a neutral party saw the same thing. Build-order
// steps 3 (SPN fire-and-forget), 4 (near-miss), 10 (second witness). The send is a seam; the
// record-minting, the queue, and the diversity are pure and tested here with a stub client.

// ── the id_ flag (§4.2) — get this wrong and every comparison is false ───────────

test('idReplayUrl always carries the id_ (raw) flag', () => {
  assert.equal(idReplayUrl('20260402141352', 'https://ex.gov/m'),
    'https://web.archive.org/web/20260402141352id_/https://ex.gov/m');
  assert.equal(idReplayUrl(null, 'https://x'), null);
});

test('waybackToIso converts the 14-digit UTC stamp with no clock', () => {
  assert.equal(waybackToIso('20260714192311'), '2026-07-14T19:23:11Z');
  assert.equal(waybackToIso('nonsense'), null);
});

// ── SPN2 shapes (§4.1) — template only, no credential minted here ────────────────

test('spnSaveRequest builds the POST body; no Authorization header is minted', () => {
  const req = spnSaveRequest('https://ex.gov/rfp');
  assert.equal(req.method, 'POST');
  assert.equal(req.url, 'https://web.archive.org/save');
  assert.match(req.body, /url=https%3A%2F%2Fex\.gov%2Frfp/);
  assert.match(req.body, /capture_all=1/);
  assert.equal(req.headers.Authorization, undefined, 'the LOW accesskey:secret is the caller’s, injected by the client seam');
});

test('spnStatusRequest and the save/status parsers', () => {
  assert.equal(spnStatusRequest('spn2-abc').url, 'https://web.archive.org/save/status/spn2-abc');
  assert.deepEqual(parseSaveResponse({ job_id: 'spn2-abc' }), { job_id: 'spn2-abc' });
  assert.equal(parseSaveResponse({}), null);
  const ok = parseStatusResponse({ status: 'success', timestamp: '20260402141352' }, 'https://ex.gov/m');
  assert.equal(ok.status, 'success');
  assert.equal(ok.captured_at, '2026-04-02T14:13:52Z');
  assert.equal(ok.replay, 'https://web.archive.org/web/20260402141352id_/https://ex.gov/m');
  assert.equal(parseStatusResponse({ status: 'pending' }).status, 'queued');
  assert.equal(parseStatusResponse({ status: 'error', message: 'blocked' }).status, 'failed');
});

// ── CDX (§4.3) ───────────────────────────────────────────────────────────────────

test('cdxRequest targets the CDX endpoint; parseCdxRows keys rows by the header', () => {
  assert.match(cdxRequest('https://ex.gov/m').url, /cdx\/search\/cdx\?url=https%3A%2F%2Fex\.gov%2Fm&output=json/);
  const rows = parseCdxRows([
    ['timestamp', 'digest', 'statuscode'],
    ['20260402141352', 'PJK3ABC', '200'],
    ['20261108031400', 'ZZZ9XYZ', '200'],
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { timestamp: '20260402141352', digest: 'PJK3ABC', statuscode: '200' });
  assert.deepEqual(parseCdxRows([]), []);
});

// ── the fire-and-forget queue (§4.1, step 3) ─────────────────────────────────────

// A stub witness client — deterministic, no network. It hands out job ids and reports success.
const stubClient = (overrides = {}) => ({
  saved: [],
  async save(service, url) { this.saved.push([service, url]); return overrides.save ? overrides.save(service, url) : { job_id: `job-${this.saved.length}` }; },
  async status(service, job) { return overrides.status ? overrides.status(service, job) : { status: 'success', timestamp: '20260402141352' }; },
});

test('request is non-blocking and deduped; advance drives requested -> queued -> success', async () => {
  const q = createWitnessQueue();
  const first = q.request({ serviceKey: 'IA', url: 'https://ex.gov/m', requested_at: '2026-04-02T14:11:09Z' });
  assert.equal(first.fresh, true);
  assert.equal(first.witness.status, 'requested');
  assert.equal(q.request({ serviceKey: 'IA', url: 'https://ex.gov/m' }).reason, 'already-requested', 'not re-fired while in flight');

  const client = stubClient();
  await q.advance(client);
  assert.equal(q.get('web.archive.org', 'https://ex.gov/m').status, 'queued');
  await q.advance(client);
  const w = q.get('web.archive.org', 'https://ex.gov/m');
  assert.equal(w.status, 'success');
  assert.equal(w.captured_at, '2026-04-02T14:13:52Z');
  assert.equal(w.replay, 'https://web.archive.org/web/20260402141352id_/https://ex.gov/m');
});

test('a save the service refuses is typed unarchived, not silently dropped (§10)', async () => {
  const q = createWitnessQueue();
  q.request({ serviceKey: 'IA', url: 'https://blocked.example/x' });
  await q.advance(stubClient({ save: () => null }));
  assert.equal(q.get('web.archive.org', 'https://blocked.example/x').status, 'unarchived');
});

test('a client error settles the witness to failed with the reason', async () => {
  const q = createWitnessQueue();
  q.request({ serviceKey: 'IA', url: 'https://x' });
  await q.advance({ async save() { throw new Error('rate-limited'); } });
  const w = q.get('web.archive.org', 'https://x');
  assert.equal(w.status, 'failed');
  assert.equal(w.error, 'rate-limited');
});

test('an unknown service is refused', () => {
  const q = createWitnessQueue();
  assert.equal(q.request({ service: 'evil.example', url: 'https://x' }).reason, 'unknown-service');
});

// ── near-miss (§8.2, step 4) ─────────────────────────────────────────────────────

test('nearMissRequest fires a witness with no custody, tier near-miss', () => {
  const q = createWitnessQueue();
  const { witness } = nearMissRequest(q, { url: 'https://ex.gov/board-packet.pdf', requested_at: '2026-04-02T14:11:09Z' });
  assert.equal(witness.tier, 'near-miss');
  assert.equal(witness.capture_id, null, 'a near-miss preserves the address, not the bytes');
});

// ── two witnesses, uncorrelated failure (§4.4, step 10) ──────────────────────────

test('witnessDiversity: two services that captured are two voices -> corroborated', () => {
  const ws = [
    mkWitness({ service: SERVICES.IA.id, status: 'success' }),
    mkWitness({ service: SERVICES.AT.id, status: 'success' }),
  ];
  const d = witnessDiversity(ws);
  assert.equal(d.voices, 2);
  assert.equal(d.tier, 'corroborated');
  const report = witnessed(ws);
  assert.equal(report.corroborated, true);
  assert.deepEqual(report.services, ['archive.today', 'web.archive.org']);
});

test('witnessDiversity: one witness is single-source; a failed one does not count', () => {
  const one = witnessDiversity([mkWitness({ service: SERVICES.IA.id, status: 'success' }), mkWitness({ service: SERVICES.AT.id, status: 'failed' })]);
  assert.equal(one.voices, 1);
  assert.equal(one.tier, 'single-source');
  assert.equal(witnessed([]).corroborated, false);
});

test('the two services declare uncorrelated failure modes (§4.4)', () => {
  assert.equal(SERVICES.IA.withdrawable, true, 'IA honours retroactive removal (§7.2)');
  assert.equal(SERVICES.AT.withdrawable, false, 'archive.today is what is left when IA is scrubbed');
  assert.notEqual(SERVICES.IA.ignoresRobots, SERVICES.AT.ignoresRobots);
  assert.equal(WITNESS_STATUS.includes('withdrawn'), true);
});
