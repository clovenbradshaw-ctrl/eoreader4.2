import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalJson, merkleRoot, inclusionProof, verifyInclusion,
  mkAnchor, verifyChain, requestRfc3161, requestOts, publishRoot, anchorRootSig,
} from '../src/attest/anchor.js';

// Anchor (docs/attestation-spec.md §6) — a timestamp that makes custody unforgeable.
// Build-order step 7. Merkle the ledger, anchor the root, prove inclusion with a log2(n)
// path — Certificate Transparency's design. Pure core; TSA/OTS/publish are seams.

// A tiny deterministic hash for the injectability test (FNV-1a, hex). Collision-prone but fine
// for a small fixed tree; the default is real WebCrypto SHA-256.
const fnv = async (s) => {
  const str = typeof s === 'string' ? s : new TextDecoder().decode(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return (h >>> 0).toString(16).padStart(8, '0');
};

// ── canonicalization ─────────────────────────────────────────────────────────────

test('canonicalJson sorts keys at every depth so equal events hash identically', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.equal(canonicalJson({ x: { d: 1, c: 2 }, a: [3, { z: 1, y: 2 }] }),
    '{"a":[3,{"y":2,"z":1}],"x":{"c":2,"d":1}}');
});

// ── the root ──────────────────────────────────────────────────────────────────────

test('merkleRoot is deterministic and content-sensitive', async () => {
  const events = [{ e: 1 }, { e: 2 }, { e: 3 }];
  const r1 = await merkleRoot(events);
  const r2 = await merkleRoot([{ e: 1 }, { e: 2 }, { e: 3 }]);
  assert.equal(r1, r2, 'same events → same root');
  const r3 = await merkleRoot([{ e: 1 }, { e: 2 }, { e: 99 }]);
  assert.notEqual(r1, r3, 'a changed event → a changed root');
  assert.match(await merkleRoot([]), /^[0-9a-f]{64}$/, 'the empty tree has a defined root');
});

// ── inclusion proofs (§6.2) — a critic re-derives the root from the leaf + path ────

test('every leaf of every tree size proves inclusion against the root (RFC 6962)', async () => {
  for (const n of [1, 2, 3, 4, 5, 7, 8, 11]) {
    const events = Array.from({ length: n }, (_, i) => ({ i, note: `event ${i}` }));
    const root = await merkleRoot(events);
    for (let m = 0; m < n; m++) {
      const proof = await inclusionProof(events, m);
      assert.equal(proof.tree_size, n);
      assert.ok(proof.audit_path.length <= Math.ceil(Math.log2(Math.max(2, n))), `path is log2(n) for n=${n}`);
      const ok = await verifyInclusion({ leafHash: proof.leaf_hash, index: m, treeSize: n, auditPath: proof.audit_path, root });
      assert.equal(ok, true, `leaf ${m}/${n} verifies`);
    }
  }
});

test('inclusion can be verified from the raw event data, not just its precomputed leaf hash', async () => {
  const events = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }];
  const root = await merkleRoot(events);
  const proof = await inclusionProof(events, 3);
  assert.equal(await verifyInclusion({ data: events[3], index: 3, treeSize: 5, auditPath: proof.audit_path, root }), true);
});

test('a tampered leaf, a wrong root, or a bad index all fail verification', async () => {
  const events = [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }];
  const root = await merkleRoot(events);
  const proof = await inclusionProof(events, 1);
  assert.equal(await verifyInclusion({ data: { a: 999 }, index: 1, treeSize: 4, auditPath: proof.audit_path, root }), false, 'tampered event');
  assert.equal(await verifyInclusion({ leafHash: proof.leaf_hash, index: 1, treeSize: 4, auditPath: proof.audit_path, root: 'deadbeef' }), false, 'wrong root');
  const bad = [...proof.audit_path]; bad[0] = 'ffff';
  assert.equal(await verifyInclusion({ leafHash: proof.leaf_hash, index: 1, treeSize: 4, auditPath: bad, root }), false, 'tampered path');
  assert.equal(await verifyInclusion({ leafHash: proof.leaf_hash, index: 9, treeSize: 4, auditPath: proof.audit_path, root }), false, 'index out of range');
  await assert.rejects(() => inclusionProof(events, 4), /out of range/);
});

test('hashing is injectable — the whole scheme runs on a stub hash', async () => {
  const events = [{ a: 1 }, { a: 2 }, { a: 3 }];
  const root = await merkleRoot(events, fnv);
  const proof = await inclusionProof(events, 2, fnv);
  assert.equal(await verifyInclusion({ leafHash: proof.leaf_hash, index: 2, treeSize: 3, auditPath: proof.audit_path, root, hash: fnv }), true);
});

// ── the anchor record + the published root chain (§6.3, §6.4) ─────────────────────

test('mkAnchor holds the root, both timestamp tokens, and the publish ref', () => {
  const a = mkAnchor({ root: 'b41c', tree_size: 8, rfc3161: { tsa: 'freetsa' }, ots: { ots: '…' }, published: 'matrix:!ledger$…', anchored_at: '2026-04-02T15:00:00Z' });
  assert.equal(a.schema, 'anchor/1');
  assert.equal(a.root, 'b41c');
  assert.equal(a.rfc3161.tsa, 'freetsa');
  assert.equal(a.published, 'matrix:!ledger$…');
});

test('verifyChain catches a forked tape — a root that does not extend the prior (§6.4)', () => {
  const a = mkAnchor({ root: 'r1' });
  const b = mkAnchor({ root: 'r2', prev: 'r1' });
  const c = mkAnchor({ root: 'r3', prev: 'r2' });
  assert.deepEqual(verifyChain([a, b, c]), { ok: true, brokenAt: -1 });
  const forked = mkAnchor({ root: 'r3', prev: 'rX' });   // does not point at r2
  assert.deepEqual(verifyChain([a, b, forked]), { ok: false, brokenAt: 2 });
});

// ── the seams (§6.3, §6.4) ─────────────────────────────────────────────────────────

test('the timestamp + publish seams call the injected client, absent one they no-op', async () => {
  const tsa = { async stamp(root) { return { tsa: 'freetsa', token: `tok(${root})` }; } };
  assert.deepEqual(await requestRfc3161('b41c', tsa), { service: 'rfc3161', tsa: 'freetsa', token: 'tok(b41c)' });
  const ots = { async stamp(root) { return { ots: `ots(${root})` }; } };
  assert.deepEqual(await requestOts('b41c', ots), { service: 'opentimestamps', ots: 'ots(b41c)' });
  assert.equal(await requestRfc3161('b41c', null), null, 'no client → no token, not a crash');
  const pub = { async append(root) { return `matrix:!ledger$${root}`; } };
  assert.equal(await publishRoot({ root: 'b41c' }, pub), 'matrix:!ledger$b41c');
});

test('anchorRootSig renders the §9 assembly 4 SYN line', () => {
  assert.equal(anchorRootSig('root_20260402', 'ledger.events["2026-04-02"]'),
    '!SYN root_20260402 = ledger.events["2026-04-02"]');
});
