import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatSpanId, parseSpanId, spanId,
  localSource, wikiSource, webSource, scrapeSource, matrixSource,
  sha256Hex, pinLocalDoc, expectedDigest, integritySig, verifyOnResolve,
} from '../src/surfer/retrieve/pin.js';

// Source pinning (docs/retrieval-spec.md §5) — the provenance contract. Every span
// carries an immutable address; the address, not the text, is cited. Build-order
// step 1, "the assembly that matters": if pinning is wrong nothing downstream can
// be fixed. These pin the grammar, the source classes, and verify-on-resolve.

// ── the grammar (§5) ─────────────────────────────────────────────────────────

test('formats and round-trips the full grammar: uri@revision#holon[start:end]', () => {
  const id = formatSpanId({ uri: 'enwiki:Fusus', revision: 'oldid=1194837261', holonPath: 'sec-1.para-2', byteStart: 40, byteEnd: 128 });
  assert.equal(id, 'enwiki:Fusus@oldid=1194837261#sec-1.para-2[40:128]');
  assert.deepEqual(parseSpanId(id), {
    uri: 'enwiki:Fusus', revision: 'oldid=1194837261', holonPath: 'sec-1.para-2', byteStart: 40, byteEnd: 128,
  });
});

test('revision and byte range are optional at the seams the spec leaves them optional', () => {
  const id = formatSpanId({ uri: 'sha256:9f2ac41b', holonPath: 'sec-4.para-2' });
  assert.equal(id, 'sha256:9f2ac41b#sec-4.para-2', 'a content-addressed uri needs no @revision, a holon path no byte range');
  assert.deepEqual(parseSpanId(id), { uri: 'sha256:9f2ac41b', revision: null, holonPath: 'sec-4.para-2', byteStart: null, byteEnd: null });
});

test('NO SPAN WITHOUT A PIN — minting refuses a missing uri or holon path (§5 rule 1)', () => {
  assert.throws(() => formatSpanId({ holonPath: 'sec-1' }), /no source uri/);
  assert.throws(() => formatSpanId({ uri: 'sha256:abc' }), /no holon path/);
});

test('parse degrades to null on a malformed address rather than throwing (fail safe at read)', () => {
  assert.equal(parseSpanId('no-hash-here'), null);
  assert.equal(parseSpanId(''), null);
  assert.equal(parseSpanId(42), null);
  assert.equal(parseSpanId('uri@rev#'), null, 'an empty holon path is not an address');
});

test('parses structurally from the right — a URI holding @ or # does not fool it', () => {
  // A web URL carrying a fragment, then the address seam and the capture pin.
  const id = 'https://ex.gov/page#top@abcdef0123456789abcdef0123456789#sec-2.para-9';
  const p = parseSpanId(id);
  assert.equal(p.holonPath, 'sec-2.para-9', 'the LAST # is the address seam');
  assert.equal(p.revision, 'abcdef0123456789abcdef0123456789', 'the LAST @ delimits the revision');
  assert.equal(p.uri, 'https://ex.gov/page#top');
});

// ── the source classes (§5 table) ────────────────────────────────────────────

test('each source class mints the pin the table specifies', () => {
  assert.deepEqual(localSource('9f2a'), { uri: 'sha256:9f2a', revision: null });
  assert.deepEqual(wikiSource('Fusus', 1194837261), { uri: 'enwiki:Fusus', revision: 'oldid=1194837261' });
  assert.deepEqual(webSource('https://ex.gov/rfp', 'cap0abc'), { uri: 'https://ex.gov/rfp', revision: 'cap0abc' });
  assert.deepEqual(scrapeSource('23CV-4471', '2026-04-02T10:00Z', 'row9f'), { uri: 'caselink:23CV-4471', revision: '2026-04-02T10:00Z+row9f' });
  assert.deepEqual(matrixSource('$evt:server'), { uri: 'matrix:$evt:server', revision: null });
});

test('spanId composes a source class with a holon path into one citable address', () => {
  const id = spanId(wikiSource('Fusus', 42), 'sec-1.para-1');
  assert.equal(id, 'enwiki:Fusus@oldid=42#sec-1.para-1');
  const local = spanId(localSource('deadbeef'), 'sec-4.para-2', { byteStart: 0, byteEnd: 12 });
  assert.equal(local, 'sha256:deadbeef#sec-4.para-2[0:12]');
});

// ── content addressing + verify-on-resolve (§5.1) ─────────────────────────────

test('sha256Hex content-addresses bytes and pinLocalDoc uses it as the identity', async () => {
  const bytes = new TextEncoder().encode('NDP Board Minutes 2025-03-11');
  const digest = await sha256Hex(bytes);
  assert.match(digest, /^[0-9a-f]{64}$/);
  const src = await pinLocalDoc(bytes);
  assert.equal(src.uri, `sha256:${digest}`, 'the digest of the bytes IS the identity (§5 rule 2)');
});

test('verify on resolve: unchanged bytes match, integrity holds', async () => {
  const bytes = new TextEncoder().encode('the exact passage');
  const src = await pinLocalDoc(bytes);
  const id = spanId(src, 'sec-1.para-1');
  const v = await verifyOnResolve({ spanId: id, bytes });
  assert.equal(v.ok, true);
  assert.equal(v.integrity, 'match');
});

test('verify on resolve: a source changed under you is INFORMATION — flagged, not swallowed (§5.1)', async () => {
  const original = new TextEncoder().encode('the original passage');
  const src = await pinLocalDoc(original);
  const id = spanId(src, 'sec-1.para-1');
  const tampered = new TextEncoder().encode('the passage, quietly edited');
  const v = await verifyOnResolve({ spanId: id, bytes: tampered });
  assert.equal(v.ok, false);
  assert.equal(v.integrity, 'mismatch');
  assert.equal(v.sig, `!SIG span.${id}.integrity = "mismatch"`, 'emits the exact EOT signal §5.1 specifies');
});

test('verify on resolve: web capture hash is re-checked against the resolved bytes', async () => {
  const bytes = new TextEncoder().encode('<html>the captured page</html>');
  const capture = await sha256Hex(bytes);
  const id = spanId(webSource('https://ex.gov/page', capture), 'sec-2.para-9');
  assert.equal(expectedDigest(id), capture, 'the capture sha is what a resolve must reproduce');
  assert.equal((await verifyOnResolve({ spanId: id, bytes })).integrity, 'match');
  assert.equal((await verifyOnResolve({ spanId: id, bytes: new TextEncoder().encode('changed') })).integrity, 'mismatch');
});

test('verify on resolve: a remote/event-pinned span is immutable by construction, nothing to re-hash', async () => {
  const wiki = spanId(wikiSource('Fusus', 42), 'sec-1');
  assert.equal(expectedDigest(wiki), null, 'an oldid pin has no local content to re-hash');
  const v = await verifyOnResolve({ spanId: wiki, bytes: new TextEncoder().encode('anything') });
  assert.equal(v.ok, true);
  assert.equal(v.integrity, 'immutable');

  const matrix = spanId(matrixSource('$evt:server'), 'body');
  assert.equal((await verifyOnResolve({ spanId: matrix, bytes: new Uint8Array() })).integrity, 'immutable');
});

test('verify on resolve: an unparseable pin is itself a fault worth surfacing', async () => {
  const v = await verifyOnResolve({ spanId: 'not-a-span-id', bytes: new Uint8Array() });
  assert.equal(v.ok, false);
  assert.equal(v.integrity, 'unpinned');
});

test('hashing is injectable — the module is testable with a stub, no live crypto needed', async () => {
  const stub = async (input) => (typeof input === 'string' ? input : new TextDecoder().decode(input)).length.toString(16).padStart(32, '0');
  const src = await pinLocalDoc('abcd', stub);
  assert.equal(src.uri, `sha256:${'4'.padStart(32, '0')}`);
  const id = spanId(src, 'p1');
  assert.equal((await verifyOnResolve({ spanId: id, bytes: 'abcd', hash: stub })).integrity, 'match');
  assert.equal((await verifyOnResolve({ spanId: id, bytes: 'abcde', hash: stub })).integrity, 'mismatch');
});

test('integritySig renders the typed signal for any value', () => {
  assert.equal(integritySig('sha256:x#p', 'mismatch'), '!SIG span.sha256:x#p.integrity = "mismatch"');
});
