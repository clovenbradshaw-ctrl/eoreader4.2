# Encrypted, hash-chained media vault — `rooms/archive/vault`

"Save things, encrypted, hash-chained, into the media store." The vault lets the app
store arbitrary content **encrypted client-side**, keep only the **ciphertext** on the
homeserver's **media repository**, and record every save as a **block in a
tamper-evident, hash-linked ledger** — the app's content-addressed spirit
(`checkpoints.js`) sharpened into an append-only chain on a cryptographic hash.

It reuses the Matrix identity the app already has (`rooms/archive/matrix.js`) and needs
no libolm — attachment encryption is Web Crypto AES-256-CTR, the scheme Matrix defines
for encrypted files.

## The pipeline

```
save(bytes):   encrypt (per-file key)  →  upload ciphertext → mxc://  →  append block
               file-crypto.js             mxc.js                        chain.js

open(block):   download ← mxc://  →  decrypt + verify sha256  →  verify content address
```

| module | role |
|---|---|
| `file-crypto.js` | AES-256-CTR + SHA-256 → a Matrix `EncryptedFile` manifest; per-file random key; decrypt verifies the ciphertext hash first |
| `mxc.js` | Matrix media-repository client: raw-bytes upload/download on the session token; `mxc://` parsing; auth client-v1 download with a media-v3 fallback |
| `chain.js` | the block chain: each block carries the SHA-256 of the previous block; `verify()` walks it and flags any content edit, reorder, or broken link |
| `vault.js` | the entrance: `save` / `open` / `list` / `verify`, composing the three; content-addressed dedupe; persisted to OPFS |

## What a block holds

A block never holds the plaintext or the ciphertext — it holds the **content address**
(SHA-256 of the plaintext), the **`mxc://`** where the ciphertext lives, and the
**`EncryptedFile` manifest** (the per-file key) needed to decrypt it:

```
{ index, prev, at, contentHash, size, mime, name, mxc, enc: {v,key,iv,hashes,url}, hash }
```

`hash = sha256(canonical(block − hash))` and `prev = previous block's hash`, so any
tampering downstream breaks `verify()`. Because the block carries the key, **the chain
is the keyring** — it is persisted to OPFS (`rooms/chat/opfs-store.js`, root `eo-vault`),
one record per block plus a head pointer, append-only.

## Guarantees, proven by tests

- **Confidentiality:** `tests/vault-integration.test.js` asserts the homeserver's media
  store never contains the plaintext needle — only ciphertext leaves the client.
- **Integrity:** a corrupted blob is caught on `open` (ciphertext hash mismatch); an
  edited or re-pointed block is caught by `verify` (`hash-mismatch` / `prev-mismatch`).
- **Idempotence:** re-saving identical bytes returns the existing block — one upload.
- **Durability:** the chain reloads from OPFS and still verifies and opens old blocks.

`tests/vault-file-crypto.test.js`, `tests/vault-mxc.test.js`, and
`tests/vault-chain.test.js` cover the parts; the integration test runs the whole
pipeline through the in-memory homeserver (`tests/helpers/fake-homeserver.js`, now with
a media store).

## Using it

Exposed on the engine bridge as `window.EO.vault`:

```js
await EO.vault.start();                              // lazy; needs a Matrix login
const { block } = await EO.vault.save('hello', { name: 'note', mime: 'text/plain' });
const { text }  = await EO.vault.open(block.index);  // → 'hello'
await EO.vault.verify();                             // → { ok: true, length: N }
```

## Deliberately follow-up

- A surface entry (a "Save to encrypted vault" action in the reader / a vault panel) —
  the engine membrane is wired and tested; the UI hook is next.
- Key backup: today losing the OPFS chain loses the keys. A future step can wrap the
  chain itself as an encrypted item and pin its head (via `deposit.js`) for recovery.
- Sharing a vault item with another user (re-encrypting the per-file key to their device
  over the existing Olm channel).
