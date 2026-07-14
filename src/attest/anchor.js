// EO: SYN·EVA·SIG(Network → Network,Lens, Composing,Tracing,Binding) — Merkle-anchor the ledger
// Anchor — "I held this hash before date T and haven't altered it since" (docs/attestation-
// spec.md §6). The custody pin proves nothing on its own: you could have fabricated the bytes
// this morning and computed the hash after. An anchor is the timestamp that makes custody
// unforgeable.
//
// The design is Certificate Transparency's, applied to a newsroom (§6.2): do NOT timestamp spans
// one by one (a network round-trip per span). Instead hash every ledger event into a Merkle leaf,
// build ONE root per batch, and anchor the root. Inclusion of any single event is then provable
// with a log₂(n) sibling path — a few hundred bytes — verifiable against the published root with
// no trust in us. This module is the pure core: canonicalize → leaves → root → inclusion proof →
// verify. The two timestamp services (RFC 3161 TSA, OpenTimestamps) and the publish target are
// seams (§6.3, §6.4) — they fail differently on purpose, so we use both.
//
// The tree follows RFC 6962 (CT): a leaf is H(0x00 ‖ data) and an internal node H(0x01 ‖ l ‖ r),
// the domain-separating prefixes that stop a leaf being passed off as a subtree. The hasher is
// injectable and hex-valued (retrieve/pin.js sha256Hex), so the prefixes ride as "00:" / "01:"
// over hex digests — the same structure and the same second-preimage separation, in the hex
// domain this codebase already hashes in.

import { sha256Hex } from '../surfer/retrieve/index.js';

// ── canonicalization ─────────────────────────────────────────────────────────────
// A stable string for an event: JSON with keys sorted at every depth, so two structurally equal
// events hash identically regardless of key order. The leaf is hashed over THIS, so the root is a
// deterministic function of the event set — a prerequisite for a reproducible, checkable anchor.
export const canonicalJson = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
};

// ── RFC 6962 hashing ─────────────────────────────────────────────────────────────
const leafHash = (data, hash) => hash(`00:${typeof data === 'string' ? data : canonicalJson(data)}`);
const nodeHash = (l, r, hash) => hash(`01:${l}:${r}`);

// largest power of two STRICTLY less than n (n ≥ 2) — the CT split point.
const splitPoint = (n) => { let k = 1; while (k * 2 < n) k *= 2; return k; };

// Precompute all leaf hashes, then memoize subtree roots so both the root and every audit path
// reuse them (O(n) hashes, not O(n log n)). Returns { leaves, mth(lo,hi) }.
const buildMth = async (events, hash) => {
  const leaves = await Promise.all(events.map((e) => leafHash(e, hash)));
  const memo = new Map();
  const mth = async (lo, hi) => {                    // [lo, hi)
    const key = `${lo},${hi}`;
    if (memo.has(key)) return memo.get(key);
    const size = hi - lo;
    let out;
    if (size === 1) out = leaves[lo];
    else { const k = splitPoint(size); out = await nodeHash(await mth(lo, lo + k), await mth(lo + k, hi), hash); }
    memo.set(key, out);
    return out;
  };
  return { leaves, mth };
};

// merkleRoot(events, hash?) → the hex root over the event set. The empty tree hashes the empty
// string (RFC 6962), so an empty batch still yields a well-defined, distinguishable root.
export const merkleRoot = async (events = [], hash = sha256Hex) => {
  if (events.length === 0) return hash('00:');
  const { mth } = await buildMth(events, hash);
  return mth(0, events.length);
};

// inclusionProof(events, index, hash?) → { leaf_index, tree_size, leaf_hash, audit_path } — the
// RFC 6962 audit path (PATH(m, D)): the sibling hashes from the leaf up to the root.
export const inclusionProof = async (events, index, hash = sha256Hex) => {
  const n = events.length;
  if (index < 0 || index >= n) throw new Error(`anchor: leaf index ${index} out of range [0,${n})`);
  const { leaves, mth } = await buildMth(events, hash);
  const path = [];
  const walk = async (lo, hi, m) => {
    if (hi - lo === 1) return;
    const k = splitPoint(hi - lo);
    if (m < lo + k) { await walk(lo, lo + k, m); path.push(await mth(lo + k, hi)); }
    else { await walk(lo + k, hi, m); path.push(await mth(lo, lo + k)); }
  };
  await walk(0, n, index);
  return { leaf_index: index, tree_size: n, leaf_hash: leaves[index], audit_path: path };
};

// verifyInclusion({ leafHash | data, index, treeSize, auditPath, root, hash? }) → boolean.
// The RFC 6962 §2.1.1 verification: fold the audit path with the leaf, tracking (fn, sn) to know
// left/right at each step, and accept only if the recomputed root equals the anchored root. This
// is what a critic runs — no trust in us, just the leaf, the path, and the published root.
export const verifyInclusion = async ({ leafHash: lh, data, index, treeSize, auditPath = [], root, hash = sha256Hex } = {}) => {
  if (index < 0 || index >= treeSize) return false;
  let r = lh || await leafHash(data, hash);
  let fn = index, sn = treeSize - 1;
  for (const p of auditPath) {
    if (sn === 0) return false;                       // path longer than the tree — reject
    if ((fn & 1) === 1 || fn === sn) {
      r = await nodeHash(p, r, hash);                 // sibling on the left
      // entered on fn==sn with fn even: climb past the trailing zero bits first…
      while ((fn & 1) === 0 && fn !== 0) { fn >>= 1; sn >>= 1; }
    } else {
      r = await nodeHash(r, p, hash);                 // sibling on the right
    }
    fn >>= 1; sn >>= 1;                                // …then the one mandatory step up (RFC 6962 §2.1.1)
  }
  return sn === 0 && r === root;
};

// ── the anchor record (§6.3, §6.4) ───────────────────────────────────────────────
// One per batch. `prev` chains it to the previous published root — the append-only history that
// means you cannot fork your own tape (§6.4). `rfc3161` and `ots` are the two timestamp tokens
// (filled by the seams below); `published` is where the root was appended (git / Matrix). Times
// are stamped by the caller, never minted here.
export const mkAnchor = ({ root, tree_size = 0, prev = null, rfc3161 = null, ots = null, published = null, anchored_at = null } = {}) => Object.freeze({
  schema: 'anchor/1', kind: 'anchor',
  root: root || null, tree_size,
  prev: prev || null,
  rfc3161, ots, published,
  anchored_at,
});

// verifyChain(anchors) → does this published root history hold together (§6.4)? Each anchor's
// `prev` must equal the previous anchor's `root`; a break means a root was inserted, removed, or
// quietly rewritten — a forked tape. Returns { ok, brokenAt }.
export const verifyChain = (anchors = []) => {
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].prev !== anchors[i - 1].root) return { ok: false, brokenAt: i };
  }
  return { ok: true, brokenAt: -1 };
};

// ── the timestamp + publish seams (§6.3, §6.4) ───────────────────────────────────
// Both services are used because they fail differently (§6.3): RFC 3161 is instant and legally
// recognized but is a trusted third party (subpoenable); OpenTimestamps has nothing to subpoena
// but takes hours to confirm on Bitcoin. Each is an injected client; nothing here reaches a TSA.
export const requestRfc3161 = async (root, client) => {
  if (!client || typeof client.stamp !== 'function') return null;
  const token = await client.stamp(root);              // { tsa, token } — the signed timestamp
  return token ? { service: 'rfc3161', ...token } : null;
};
export const requestOts = async (root, client) => {
  if (!client || typeof client.stamp !== 'function') return null;
  const ots = await client.stamp(root);                // { ots } — the .ots proof, Bitcoin-anchored
  return ots ? { service: 'opentimestamps', ...ots } : null;
};

// publishRoot(anchor, publisher) → append the root to a public, append-only location (git repo,
// Matrix room). Returns the location ref recorded on the anchor. A published root history is a
// commitment a later, quietly-different ledger cannot satisfy (§6.4).
export const publishRoot = async (anchor, publisher) => {
  if (!publisher || typeof publisher.append !== 'function') return null;
  return publisher.append(anchor.root);                // e.g. "matrix:!ledger:hyphae.social$…"
};

// anchorRootSig(anchor) → the EOT SYN line §9 assembly 4 writes: a root synthesized from many
// leaves. The full assembly (with rfc3161/ots/published attributes) is rendered in eot.js.
export const anchorRootSig = (rootId, batchRef) => `!SYN ${rootId} = ${batchRef}`;
