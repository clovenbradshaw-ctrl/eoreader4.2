// The Matrix media client — upload/download request shaping and mxc parsing, with a
// fake fetch standing in for the media repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMediaStore, parseMxc } from '../src/rooms/archive/mxc.js';

const session = { identity: () => ({ homeserver: 'https://hs.example', token: 'TOK' }) };

test('parseMxc splits server and media id', () => {
  assert.deepEqual(parseMxc('mxc://hs.example/AbC123'), { server: 'hs.example', mediaId: 'AbC123' });
  assert.equal(parseMxc('not-an-mxc'), null);
});

test('upload POSTs raw bytes to the media endpoint and returns the content uri', async () => {
  const calls = [];
  const fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ content_uri: 'mxc://hs.example/XYZ' }) }; };
  const media = createMediaStore({ session, fetch });
  const bytes = new Uint8Array([1, 2, 3]);
  const r = await media.upload(bytes, { contentType: 'application/octet-stream', filename: 'blob.enc' });
  assert.equal(r.ok, true);
  assert.equal(r.mxc, 'mxc://hs.example/XYZ');
  assert.match(calls[0].url, /\/_matrix\/media\/v3\/upload\?filename=blob\.enc$/);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer TOK');
  assert.equal(calls[0].opts.body, bytes, 'raw bytes, not JSON');
});

test('download fetches bytes, preferring the authenticated client-v1 endpoint', async () => {
  const calls = [];
  const payload = new Uint8Array([9, 8, 7]).buffer;
  const fetch = async (url) => { calls.push(url); return { ok: true, status: 200, arrayBuffer: async () => payload }; };
  const media = createMediaStore({ session, fetch });
  const r = await media.download('mxc://hs.example/XYZ');
  assert.equal(r.ok, true);
  assert.deepEqual([...r.bytes], [9, 8, 7]);
  assert.match(calls[0], /\/_matrix\/client\/v1\/media\/download\/hs\.example\/XYZ$/);
});

test('download falls back to the legacy media-v3 path on a client-v1 error', async () => {
  const calls = [];
  const payload = new Uint8Array([5]).buffer;
  const fetch = async (url) => {
    calls.push(url);
    if (url.includes('/client/v1/media/download')) return { ok: false, status: 404, json: async () => ({ errcode: 'M_UNRECOGNIZED' }) };
    return { ok: true, status: 200, arrayBuffer: async () => payload };
  };
  const media = createMediaStore({ session, fetch });
  const r = await media.download('mxc://hs.example/OLD');
  assert.equal(r.ok, true);
  assert.deepEqual([...r.bytes], [5]);
  assert.equal(calls.length, 2, 'tried v1 then v3');
  assert.match(calls[1], /\/_matrix\/media\/v3\/download\/hs\.example\/OLD$/);
});

test('a signed-out client returns a value, not a throw', async () => {
  const media = createMediaStore({ session: { identity: () => null }, fetch: async () => ({}) });
  const r = await media.upload(new Uint8Array([1]));
  assert.equal(r.ok, false);
});
