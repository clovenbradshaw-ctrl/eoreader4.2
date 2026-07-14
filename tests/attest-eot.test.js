import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  custodyAssembly, witnessAssembly, attestationAssembly,
  anchorAssembly, watchAssembly, frontierAssembly, emitAttestation,
} from '../src/attest/eot.js';
import { mkCapture } from '../src/attest/custody.js';
import { mkWitness, SERVICES } from '../src/attest/witness.js';
import { mkAnchor } from '../src/attest/anchor.js';
import { mkFrontier } from '../src/attest/frontier.js';

// The EOT layer (docs/attestation-spec.md §9) — attestation records rendered to the tape's own
// surface. Build-order §9. Pure string building; asserted against the exact assembly shapes §9
// specifies, driven by real records from the sibling modules.

const stub = async (input) => (typeof input === 'string' ? input : new TextDecoder().decode(input)).length.toString(16).padStart(64, '0');

// ── assembly 1: custody ──────────────────────────────────────────────────────────

test('custodyAssembly renders the §9 capture block; booleans ride bare, strings quoted', async () => {
  const cap = await mkCapture({ url: 'https://ex.gov/minutes-2025-03-11', body: 'the minutes', fetched_at: '2026-04-02T14:11:07Z', container: 'wacz:7e1d#rec-0041' }, { hash: stub });
  const s = custodyAssembly(cap, { ref: 'cap_ndp_0311' });
  assert.match(s, /^cap_ndp_0311 : capture$/m);
  assert.match(s, /^cap_ndp_0311\.source = "https:\/\/ex\.gov\/minutes-2025-03-11"$/m);
  assert.match(s, /^cap_ndp_0311\.payload_sha256 = "[0-9a-f]{64}"$/m);
  assert.match(s, /^cap_ndp_0311\.authenticated = false$/m, 'a boolean is unquoted');
  assert.match(s, /^!EVA cap_ndp_0311$/m);
});

// ── assembly 2: witness + link ─────────────────────────────────────────────────

test('witnessAssembly renders the witness Lens and the capture -> witness link', () => {
  const w = mkWitness({ service: SERVICES.IA.id, requested_at: '2026-04-02T14:11:09Z', job: 'spn2-xyz', captured_at: '2026-04-02T14:13:52Z', cdx_digest: 'PJK3', replay: 'https://web.archive.org/web/20260402141352id_/https://ex.gov/m' });
  const s = witnessAssembly(w, { ref: 'w_ia_0311', captureRef: 'cap_ndp_0311' });
  assert.match(s, /^w_ia_0311 : witness$/m);
  assert.match(s, /^w_ia_0311\.service = "web\.archive\.org"$/m);
  assert.match(s, /^w_ia_0311\.replay = "https:\/\/web\.archive\.org\/web\/20260402141352id_\/https:\/\/ex\.gov\/m"$/m);
  assert.match(s, /^cap_ndp_0311 -> w_ia_0311$/m);
  assert.match(s, /^!EVA cap_ndp_0311, w_ia_0311$/m, 'the joint EVA reads CON(Link, Binding)');
});

// ── assembly 3: attestation, per span ──────────────────────────────────────────

test('attestationAssembly renders per-span EVA; a fuzzy verdict adds the human-review SIG', () => {
  const s = attestationAssembly([
    { spanId: 'cap_ndp_0311#sec-4.para-2', witnessRef: 'w_ia_0311', state: 'attested' },
    { spanId: 'cap_ndp_0311#sec-7.para-1', witnessRef: 'w_ia_0311', state: 'attested_fuzzy' },
  ]);
  assert.match(s, /^!EVA cap_ndp_0311#sec-4\.para-2 @ w_ia_0311 = "attested"$/m);
  assert.match(s, /^!EVA cap_ndp_0311#sec-7\.para-1 @ w_ia_0311 = "attested_fuzzy"$/m);
  assert.match(s, /^!SIG cap_ndp_0311#sec-7\.para-1\.review = "human"$/m, 'tier 3 never auto-passes');
});

// ── assembly 4: anchor ─────────────────────────────────────────────────────────

test('anchorAssembly renders the SYN root and its attributes', () => {
  const a = mkAnchor({ root: 'b41c', rfc3161: { token: 'tsa:freetsa#…' }, ots: { ots: 'ots:…' }, published: 'matrix:!ledger:hyphae.social$…' });
  const s = anchorAssembly(a, { rootRef: 'root_20260402', batchRef: 'ledger.events["2026-04-02"]' });
  assert.match(s, /^!SYN root_20260402 = ledger\.events\["2026-04-02"\]$/m);
  assert.match(s, /^root_20260402\.sha256 = "b41c"$/m);
  assert.match(s, /^root_20260402\.rfc3161 = "tsa:freetsa#…"$/m);
  assert.match(s, /^!EVA root_20260402$/m);
});

// ── assembly 5: the watch, months later ────────────────────────────────────────

test('watchAssembly renders the scrub — a new dated fact, not a retraction', () => {
  const s = watchAssembly({ witnessRef: 'w_ia_0311', digestChangedAt: '2026-11-08T03:14:00Z', scrubbedSpanIds: ['cap_ndp_0311#sec-4.para-2'], captureRef: 'cap_ndp_0311' });
  assert.match(s, /^!SIG w_ia_0311\.digest_changed = "2026-11-08T03:14:00Z"$/m);
  assert.match(s, /^!EVA cap_ndp_0311#sec-4\.para-2 @ w_ia_0311\.latest = "SCRUBBED"$/m);
  assert.match(s, /^!SIG cap_ndp_0311#sec-4\.para-2\.status = "removed-from-live-source"$/m);
});

// ── the frontier record (§8.3) ───────────────────────────────────────────────────

test('frontierAssembly renders the NUL\'d address + decision; amplitude rides as a number', () => {
  const f = mkFrontier({ id: '8814', uri: 'https://ex.gov/board-packet-2025-09.pdf#p14', amplitude: 0.31, phase: 'neutral', seed: 'crawl-0417:0x8f2c', reason: 'below-draw' });
  const s = frontierAssembly(f);
  assert.match(s, /^!NUL frontier\.h-8814$/m);
  assert.match(s, /^frontier\.h-8814\.uri = "https:\/\/ex\.gov\/board-packet-2025-09\.pdf#p14"$/m);
  assert.match(s, /^frontier\.h-8814\.amplitude = 0\.31$/m, 'a number is unquoted');
  assert.match(s, /^frontier\.h-8814\.seed = "crawl-0417:0x8f2c"$/m);
  assert.match(s, /^!EVA frontier\.h-8814$/m);
});

// ── the whole section ──────────────────────────────────────────────────────────

test('emitAttestation composes only the assemblies whose records are present', async () => {
  const cap = await mkCapture({ url: 'https://ex.gov/m', body: 'x', fetched_at: '2026-04-02T14:11:07Z' }, { hash: stub });
  const w = mkWitness({ service: SERVICES.IA.id, status: 'success', captured_at: '2026-04-02T14:13:52Z' });
  const full = emitAttestation({ capture: cap, witnesses: [w], attestations: [{ spanId: 'x#s1', witnessRef: 'w_web_archive_org_0', state: 'attested' }] });
  assert.match(full, /: capture$/m);
  assert.match(full, /: witness$/m);
  assert.match(full, /!EVA x#s1 @ w_web_archive_org_0 = "attested"/);
  const capOnly = emitAttestation({ capture: cap });
  assert.ok(!/: witness/.test(capOnly), 'no witness block when there are no witnesses');
});
