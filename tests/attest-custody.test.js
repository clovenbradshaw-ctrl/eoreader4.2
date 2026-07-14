import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PATHS, PROVENANCE_CLASSES,
  formatContainer, parseContainer,
  computePayloadSha256, wasAuthenticated, captureId,
  mkCapture, capturePin, captureSpanId, verifyCustody, admissible, scopeAdmits,
  createCustodyStore,
} from '../src/attest/custody.js';
import { webSource, parseSpanId } from '../src/surfer/retrieve/pin.js';

// Custody (docs/attestation-spec.md §3) — "these are the bytes I read." The one function
// you never outsource. Build-order step 1: prove the pin is stable and resolvable, and that
// it IS the capture_sha256 the retrieval spec's web-page row reserves.

// A byte-length hash stub — deterministic, no live crypto — mirroring the pin.js tests.
const stub = async (input) => {
  const s = typeof input === 'string' ? input : new TextDecoder().decode(input);
  return (s.length.toString(16)).padStart(64, '0');
};

// ── the pin (§3.2) ─────────────────────────────────────────────────────────────

test('payload_sha256 is the SHA-256 of the body as received — hex, stable on the bytes', async () => {
  const a = await computePayloadSha256('the exact response body');
  assert.match(a, /^[0-9a-f]{64}$/);
  const b = await computePayloadSha256(new TextEncoder().encode('the exact response body'));
  assert.equal(a, b, 'a string body and its utf-8 bytes pin identically');
});

test('the pin is STABLE under re-containerisation — container / fetched_at do not touch it', async () => {
  const body = '<html>board minutes 2025-03-11</html>';
  const one = await mkCapture({ url: 'https://ex.gov/m', body, container: 'wacz:aaaa#rec-1', fetched_at: '2026-04-02T14:11:07Z' }, { hash: stub });
  const two = await mkCapture({ url: 'https://ex.gov/m', body, container: 'wacz:bbbb#rec-9', fetched_at: '2026-09-01T00:00:00Z' }, { hash: stub });
  assert.equal(one.payload_sha256, two.payload_sha256, 'same bytes → same pin, regardless of the WARC/WACZ that wraps them (§3.2)');
  assert.equal(one.id, two.id, 'and the capture id follows the pin');
});

test('the pin IS the retrieval-spec capture_sha256 — a capture composes into a §5 span_id', async () => {
  const cap = await mkCapture({ url: 'https://ex.gov/rfp', body: 'the captured page', path: 'C' }, { hash: stub });
  assert.deepEqual(capturePin(cap), webSource('https://ex.gov/rfp', cap.payload_sha256),
    'custody pins through the very same webSource() the retrieval spec defines — no competing address');
  const id = captureSpanId(cap, 'sec-2.para-9');
  assert.equal(parseSpanId(id).uri, 'https://ex.gov/rfp');
  assert.equal(parseSpanId(id).revision, cap.payload_sha256, 'the URL is metadata; the capture hash is the pin (§5 rule 4)');
  assert.equal(parseSpanId(id).holonPath, 'sec-2.para-9');
});

// ── the record (§3.2, §3.3) ──────────────────────────────────────────────────────

test('mkCapture mints the §3.2 record; path is one of A|B|C', async () => {
  const cap = await mkCapture({ url: 'https://ex.gov/x', body: 'b', path: 'B', response_status: 200, renderer: 'chrome/126' }, { hash: stub });
  assert.equal(cap.schema, 'capture/1');
  assert.equal(cap.path, PATHS.B);
  assert.equal(cap.response_status, 200);
  assert.equal(cap.renderer, 'chrome/126');
  const bad = await mkCapture({ url: 'https://ex.gov/x', body: 'b', path: 'Z' }, { hash: stub });
  assert.equal(bad.path, null, 'an unknown path is dropped, not stored as a lie');
});

test('NO CLAIM WITHOUT CUSTODY — a capture with no bytes and no pin refuses to mint (§3.3 rule 1)', async () => {
  await assert.rejects(() => mkCapture({ url: 'https://ex.gov/x' }, { hash: stub }), /no body to pin/);
  await assert.rejects(() => mkCapture({ body: 'orphan bytes' }, { hash: stub }), /no span_source/);
});

test('auth is marked from header PRESENCE, never its secret (§3.3.3, §5.4 paywall)', async () => {
  assert.equal(wasAuthenticated({ Cookie: 'session=abc' }), true);
  assert.equal(wasAuthenticated({ authorization: 'Bearer x' }), true);
  assert.equal(wasAuthenticated({ 'User-Agent': 'eo' }), false);
  const cap = await mkCapture({ url: 'https://paywall.example/a', body: 'full text', request_headers: { Cookie: 'sid=1' } }, { hash: stub });
  assert.equal(cap.authenticated, true, 'a logged-in capture is EXPECTED to diverge from IA — marked, not mysterious');
});

test('an explicit authenticated flag wins over header sniffing', async () => {
  const cap = await mkCapture({ url: 'https://x', body: 'b', authenticated: true }, { hash: stub });
  assert.equal(cap.authenticated, true);
});

// ── the two-category axis: intentional vs peripheral ─────────────────────────────

test('provenance_class defaults to peripheral and takes intentional for user-added sources', async () => {
  assert.deepEqual([...PROVENANCE_CLASSES], ['intentional', 'peripheral']);
  const ambient = await mkCapture({ url: 'https://x', body: 'b' }, { hash: stub });
  assert.equal(ambient.provenance_class, 'peripheral');
  const added = await mkCapture({ url: 'https://x', body: 'b' }, { hash: stub, provenanceClass: 'intentional' });
  assert.equal(added.provenance_class, 'intentional');
  const perPayload = await mkCapture({ url: 'https://x', body: 'b', provenance_class: 'intentional' }, { hash: stub });
  assert.equal(perPayload.provenance_class, 'intentional', 'the payload can carry the class directly');
});

test('scopeAdmits honours the peripheral toggle without touching custody', async () => {
  const peripheral = await mkCapture({ url: 'https://x', body: 'b' }, { hash: stub });
  const intentional = await mkCapture({ url: 'https://y', body: 'b2' }, { hash: stub, provenanceClass: 'intentional' });
  assert.equal(scopeAdmits(peripheral, { peripheralOn: true }), true);
  assert.equal(scopeAdmits(peripheral, { peripheralOn: false }), false, 'peripheral is filtered from scope when the toggle is off');
  assert.equal(scopeAdmits(intentional, { peripheralOn: false }), true, 'an intentional source always enters scope');
});

// ── verify-on-resolve — custody that cannot reproduce its pin is not custody ──────

test('verifyCustody matches held bytes and flags a drift as INFORMATION (§5.1)', async () => {
  const cap = await mkCapture({ url: 'https://ex.gov/x', body: 'the held bytes' }, { hash: stub });
  assert.equal((await verifyCustody({ capture: cap, bytes: 'the held bytes', hash: stub })).integrity, 'match');
  const drift = await verifyCustody({ capture: cap, bytes: 'quietly changed', hash: stub });
  assert.equal(drift.integrity, 'mismatch');
  assert.equal(drift.ok, false, 'a source that changed under you is flagged, never swallowed');
});

test('admissible gates on a resolvable pin + a source (§3.3 rule 1)', async () => {
  const cap = await mkCapture({ url: 'https://ex.gov/x', body: 'b' }, { hash: stub });
  assert.equal(admissible(cap), true);
  assert.equal(admissible({ ...cap, payload_sha256: '' }), false);
  assert.equal(admissible({ ...cap, span_source: '' }), false);
  assert.equal(admissible(null), false);
});

// ── the WACZ container reference (§3.1) ──────────────────────────────────────────

test('container ref formats and parses; the file hash is NOT the pin', () => {
  assert.equal(formatContainer({ fileSha256: '7e1d', recordId: 'rec-0041' }), 'wacz:7e1d#rec-0041');
  assert.equal(formatContainer({ fileSha256: '7e1d' }), 'wacz:7e1d');
  assert.equal(formatContainer({}), null);
  assert.deepEqual(parseContainer('wacz:7e1d#rec-0041'), { scheme: 'wacz', fileSha256: '7e1d', recordId: 'rec-0041' });
  assert.deepEqual(parseContainer('wacz:7e1d'), { scheme: 'wacz', fileSha256: '7e1d', recordId: null });
  assert.equal(parseContainer('not-a-container'), null);
});

test('captureId derives a short stable handle from the pin', () => {
  assert.equal(captureId('abcdef0123456789abcdef0123456789'), 'cap:abcdef0123456789');
  assert.equal(captureId('sha256:abcdef0123456789ff'), 'cap:abcdef0123456789', 'a namespaced hash is stripped first');
});

// ── the custody store — append-only, dedupes by pin, never overwrites ────────────

test('the store holds a capture once per pin and never overwrites', async () => {
  const store = createCustodyStore();
  const cap = await mkCapture({ url: 'https://ex.gov/x', body: 'bytes' }, { hash: stub });
  const first = store.hold(cap);
  assert.equal(first.fresh, true);
  const again = store.hold(cap);
  assert.equal(again.fresh, false);
  assert.equal(again.reason, 'already-held', 'the same bytes captured twice are ONE custody');
  assert.equal(store.byPayload(cap.payload_sha256).id, cap.id);
  assert.equal(store.all().length, 1);
});

test('the store refuses an inadmissible capture', () => {
  const store = createCustodyStore();
  const r = store.hold({ span_source: '', payload_sha256: '' });
  assert.equal(r.held, null);
  assert.equal(r.reason, 'inadmissible');
});
