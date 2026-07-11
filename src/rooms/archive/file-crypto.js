// EO: INS·CON(Void,Field → Entity,Link, Making,Binding) — encrypted-attachment crypto
// archive/file-crypto.js — client-side file encryption for the media vault, using the
// SAME scheme Matrix defines for encrypted attachments (the `EncryptedFile` object):
// AES-256-CTR with a per-file random key, plus a SHA-256 of the ciphertext for
// integrity. This is deliberately NOT Megolm — an attachment gets its own one-shot
// key so it can be stored on the (untrusted) homeserver media repo as opaque bytes,
// with the key kept by us (OPFS) and never uploaded. Web Crypto (SubtleCrypto) does
// the work; it is present in the browser and in Node ≥ 20, so this is testable.
//
// The produced manifest is a Matrix `EncryptedFile` minus its `url` (the vault fills
// `url` with the mxc after upload). Decryption verifies the SHA-256 before returning a
// single byte is handed back, so a tampered or truncated blob fails loudly instead of
// yielding garbage.

const subtle = () => {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  if (!c || !c.subtle) throw new Error('Web Crypto (SubtleCrypto) unavailable');
  return c.subtle;
};
const randomBytes = (n) => { const b = new Uint8Array(n); globalThis.crypto.getRandomValues(b); return b; };

// base64 helpers that work in the browser (btoa/atob) and Node (Buffer), for the
// standard, unpadded, and url-safe unpadded variants Matrix uses.
const bytesToBin = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; };
const binToBytes = (bin) => { const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const b64encode = (bytes) => (typeof btoa === 'function' ? btoa(bytesToBin(bytes)) : Buffer.from(bytes).toString('base64'));
const b64decode = (s) => (typeof atob === 'function' ? binToBytes(atob(s)) : new Uint8Array(Buffer.from(s, 'base64')));
const unpad = (s) => s.replace(/=+$/, '');
const urlsafe = (s) => s.replace(/\+/g, '-').replace(/\//g, '_');
const unurlsafe = (s) => s.replace(/-/g, '+').replace(/_/g, '/');

export const toB64 = (bytes) => unpad(b64encode(bytes));
export const fromB64 = (s) => b64decode(unurlsafe(String(s || '')));

// The SHA-256 of some bytes, as unpadded base64 (the `hashes.sha256` shape) and as hex
// (used by the block chain as a content address).
export const sha256Bytes = async (bytes) => new Uint8Array(await subtle().digest('SHA-256', bytes));
export const sha256B64 = async (bytes) => toB64(await sha256Bytes(bytes));
export const sha256Hex = async (bytes) => Array.from(await sha256Bytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

const toBytes = (input) => {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === 'string') return new TextEncoder().encode(input);
  throw new Error('encrypt expects a string, Uint8Array, or ArrayBuffer');
};

// encryptFile(input) → { ciphertext: Uint8Array, file }, where `file` is a Matrix
// EncryptedFile (v2) manifest WITHOUT `url`. The key never leaves this object.
export const encryptFile = async (input) => {
  const data = toBytes(input);
  const key = await subtle().generateKey({ name: 'AES-CTR', length: 256 }, true, ['encrypt', 'decrypt']);
  // Matrix counter block: 8 random high bytes, 8 zero low bytes (a 64-bit counter).
  const iv = new Uint8Array(16); iv.set(randomBytes(8), 0);
  const ctBuf = await subtle().encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, data);
  const ciphertext = new Uint8Array(ctBuf);
  const jwk = await subtle().exportKey('jwk', key);
  const file = {
    v: 'v2',
    key: { kty: 'oct', alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'], k: urlsafe(unpad(jwk.k)) },
    iv: toB64(iv),
    hashes: { sha256: await sha256B64(ciphertext) },
  };
  return { ciphertext, file };
};

// decryptFile(ciphertext, file) → Uint8Array. Verifies the SHA-256 first; a mismatch
// (tampered or wrong bytes) throws before any plaintext is produced.
export const decryptFile = async (ciphertext, file) => {
  const bytes = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext);
  if (!file || !file.key || !file.iv || !file.hashes || !file.hashes.sha256) throw new Error('bad EncryptedFile manifest');
  const wantHash = unpad(String(file.hashes.sha256));
  const gotHash = await sha256B64(bytes);
  if (gotHash !== wantHash) throw Object.assign(new Error('ciphertext hash mismatch'), { code: 'HASH_MISMATCH' });
  const key = await subtle().importKey('jwk',
    { kty: 'oct', alg: 'A256CTR', ext: true, key_ops: ['encrypt', 'decrypt'], k: urlsafe(unpad(file.key.k)) },
    { name: 'AES-CTR', length: 256 }, false, ['decrypt']);
  const iv = fromB64(file.iv);
  const plainBuf = await subtle().decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, bytes);
  return new Uint8Array(plainBuf);
};

export const bytesToText = (bytes) => new TextDecoder().decode(bytes);
