// EO: INS·SIG(Entity → Entity, Making,Binding) — span addressing + pinning
// Source pinning — the provenance contract of the retrieval spec (docs/retrieval-
// spec.md §5). Every embedded span carries an immutable ADDRESS, and it is the
// address, not the text, that the ledger cites. This module is the one place that
// address is minted (INS — the span's identity), formatted, parsed, and — on every
// resolve — re-verified (SIG — its integrity attribute).
//
// The grammar (§5):
//
//   span_id := <source_uri>@<revision>#<holon_path>[<byte_start>:<byte_end>]
//
// Revision and byte range are optional at the seams the spec leaves them optional:
// a content-addressed local doc needs no separate @revision (the sha256 in the URI
// IS the revision, §5 rule 2), and a holon path is often precise enough that no
// byte range is owed (the EOT examples in §10 pin `src#sec-4.para-2` with neither).
//
// The load-bearing rule (§5 rule 1): NO SPAN WITHOUT A PIN. Minting refuses a span
// whose source cannot be named and whose holon path is missing — if you can't cite
// it stably, you don't index it. So `formatSpanId` throws on a missing uri or
// holon path (fail loud at construction), while `parseSpanId` degrades to null on a
// malformed string (fail safe at read) — mint is a promise, resolve is a lookup.
//
// Verification (§5.1): the resolver re-hashes on every resolve and compares to the
// pin. A source that changed under you is INFORMATION, not an error to swallow —
// `verifyOnResolve` returns a typed verdict and, on mismatch, the exact EOT signal
// `!SIG span.<id>.integrity = "mismatch"`, so the span is flagged and the claim
// depending on it marked unverified. Never silently dropped, never silently used.

// ── the address grammar ──────────────────────────────────────────────────────

// formatSpanId({ uri, revision?, holonPath, byteStart?, byteEnd? }) → span_id.
// Throws on a missing uri or holonPath — a span with no stable address is not
// admissible (§5 rule 1), so this fails at the mint rather than shipping a pin that
// cannot resolve. A byte range is written only when BOTH ends are given.
export const formatSpanId = ({ uri, revision = null, holonPath, byteStart = null, byteEnd = null } = {}) => {
  if (!uri || typeof uri !== 'string') throw new Error('pin: no source uri — a span with no source cannot be embedded (§5 rule 1)');
  if (!holonPath || typeof holonPath !== 'string') throw new Error('pin: no holon path — a span with no address cannot be embedded (§5 rule 1)');
  const rev = revision != null && revision !== '' ? `@${revision}` : '';
  const range = (byteStart != null && byteEnd != null) ? `[${byteStart}:${byteEnd}]` : '';
  return `${uri}${rev}#${holonPath}${range}`;
};

// parseSpanId(span_id) → { uri, revision, holonPath, byteStart, byteEnd } | null.
// Non-throwing (a bad address is a null read, never a crash). Parses structurally
// from the right so the ambiguous characters inside a URI cannot fool it:
//   1. an optional trailing `[start:end]` byte range;
//   2. the holon path after the LAST `#` (holon paths carry no `#`, so the last
//      one is always the address seam even when a URI holds a fragment);
//   3. the revision after the LAST `@`, if any (a bare content-addressed URI —
//      `sha256:…`, `matrix:…` — has none, and revision comes back null).
export const parseSpanId = (spanId) => {
  if (typeof spanId !== 'string' || !spanId.includes('#')) return null;
  let rest = spanId;
  let byteStart = null, byteEnd = null;
  const range = rest.match(/\[(\d+):(\d+)\]$/);
  if (range) {
    byteStart = Number(range[1]);
    byteEnd = Number(range[2]);
    rest = rest.slice(0, -range[0].length);
  }
  const hash = rest.lastIndexOf('#');
  if (hash < 0) return null;
  const holonPath = rest.slice(hash + 1);
  const left = rest.slice(0, hash);
  if (!left || !holonPath) return null;
  const at = left.lastIndexOf('@');
  const uri = at >= 0 ? left.slice(0, at) : left;
  const revision = at >= 0 ? left.slice(at + 1) : null;
  if (!uri) return null;
  return { uri, revision, holonPath, byteStart, byteEnd };
};

// ── the source classes (§5 table) ────────────────────────────────────────────
// Each returns a { uri, revision } pin the caller composes with a holon path via
// `spanId`. `revision: null` marks a URI that IS its own revision (content- or
// event-addressed) — nothing more is needed to make it replayable.

// Local document — the sha256 of the bytes is the identity (§5 rule 2). Rename,
// move, or mirror the file; the span still resolves.
export const localSource = (digestHex) => ({ uri: `sha256:${digestHex}`, revision: null });

// Wikipedia — a title is a moving target; an oldid is a fact (§5 rule 3).
export const wikiSource = (title, oldid) => ({ uri: `enwiki:${title}`, revision: `oldid=${oldid}` });

// Web page — the URL is metadata; the capture hash is the pin (§5 rule 4). You
// must archive the bytes and hash them; a bare URL is not a pin.
export const webSource = (url, captureSha256) => ({ uri: url, revision: captureSha256 });

// Scraped record — a court/permit row, pinned by fetch time and the row's hash.
export const scrapeSource = (caseNo, fetchTs, rowSha256) => ({ uri: `caselink:${caseNo}`, revision: `${fetchTs}+${rowSha256}` });

// Email / Matrix — event IDs are already immutable; the ID is the pin.
export const matrixSource = (eventId) => ({ uri: `matrix:${eventId}`, revision: null });

// spanId(source, holonPath, { byteStart?, byteEnd? }) → the full pinned address for
// one span of a source. The single composition point: a source class + a holon
// path + an optional byte range become one immutable, citable span_id.
export const spanId = (source, holonPath, range = {}) =>
  formatSpanId({ uri: source?.uri, revision: source?.revision, holonPath, byteStart: range.byteStart ?? null, byteEnd: range.byteEnd ?? null });

// ── content addressing + verify-on-resolve (§5.1) ────────────────────────────

const HEX = /^[0-9a-f]+$/i;
const isDigest = (s) => typeof s === 'string' && s.length >= 32 && HEX.test(s);

// The default hasher: WebCrypto SHA-256, present in Node ≥20 and every modern
// browser (the substrate this ships on). Accepts a string (utf-8 encoded) or raw
// bytes. Every pin helper takes an injectable `hash` so the module stays pure and
// testable without a live crypto (pass a stub), and so a caller on an exotic
// runtime can supply its own.
export const sha256Hex = async (input) => {
  const subtle = (globalThis.crypto && globalThis.crypto.subtle) || null;
  if (!subtle) throw new Error('pin: no WebCrypto SHA-256 — pass a hash function');
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
};

// pinLocalDoc(bytes, hash?) → a content-addressed local source (§5 rule 2). The
// digest of the bytes IS the identity; compose it with a holon path via `spanId`.
export const pinLocalDoc = async (bytes, hash = sha256Hex) => localSource(await hash(bytes));

// expectedDigest(pin) → the hex digest a resolve should reproduce, or null when the
// pin is immutable BY CONSTRUCTION and has no local content to re-hash. A local
// `sha256:<d>` URI reproduces `<d>`; a web capture (`@<capture_sha256>`) reproduces
// its revision. A wiki oldid, a matrix event, a caselink row are pinned to a remote
// immutable revision — there is nothing local to re-hash, so integrity is a given.
export const expectedDigest = (pin) => {
  const p = typeof pin === 'string' ? parseSpanId(pin) : pin;
  if (!p || !p.uri) return null;
  const local = p.uri.match(/^sha256:([0-9a-f]+)$/i);
  if (local) return local[1].toLowerCase();
  if (isDigest(p.revision)) return p.revision.toLowerCase();
  return null;
};

// integritySig(id, value) → the exact EOT signal §5.1 specifies. Used to FLAG a
// span whose source changed under us, so the discard is typed and the dependent
// claim is marked unverified — not silently dropped, not silently used.
export const integritySig = (id, value) => `!SIG span.${id}.integrity = ${JSON.stringify(value)}`;

// verifyOnResolve({ spanId, bytes, hash? }) → a typed integrity verdict (§5.1).
//   { ok, integrity, ... }
//     integrity: 'match'     — re-hash equals the pin. ok:true.
//                'mismatch'   — the source changed under you. ok:false, carries the
//                               `!SIG …integrity = "mismatch"` line to flag it.
//                'immutable'  — pinned to a remote/event revision with no local
//                               content to re-hash; integrity holds by construction.
//                'unpinned'   — not a parseable span_id. ok:false — a resolve
//                               against no pin is itself a fault worth surfacing.
// Never throws on a mismatch — a changed source is information (§5.1), returned, not
// raised. Only a missing hasher (a runtime with no crypto and no injected hash)
// raises, because then verification cannot be performed at all.
export const verifyOnResolve = async ({ spanId: id, bytes, hash = sha256Hex } = {}) => {
  const pin = parseSpanId(id);
  if (!pin) return { ok: false, integrity: 'unpinned', id };
  const expected = expectedDigest(pin);
  if (expected == null) return { ok: true, integrity: 'immutable', id, revision: pin.revision };
  const actual = (await hash(bytes)).toLowerCase();
  if (actual === expected) return { ok: true, integrity: 'match', id, digest: actual };
  return { ok: false, integrity: 'mismatch', id, expected, actual, sig: integritySig(id, 'mismatch') };
};
