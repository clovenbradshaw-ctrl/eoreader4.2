# Element / Matrix E2EE chat — the `chat` holon

EO Reader gained an **optional, end-to-end-encrypted chat room** that reuses the
Matrix identity the app already had (`rooms/archive/matrix.js`, the login that gates
Archive.org deposits). Signed out, the reader is unchanged; signing in — the same
single login — now also unlocks encrypted chat. The homeserver stays hosted
(`hyphae.social` by default, whatever the login points at), so the *service* is kept
running by whoever operates the homeserver — the app ships no server.

## Why not embed the whole Element app

Element Web is a large React application that blocks being iframed and would have to
be self-hosted — the opposite of "reuse a hosted homeserver, ship nothing to run."
Instead we integrate at the **protocol** level, in this codebase's own hand-rolled,
injectable, zero-heavy-dependency idiom, and take on exactly one vendored dependency:
`libolm`, the small (~150 KB wasm) **audited** Olm/Megolm primitive — the same crypto
core Element itself used for years. We do not hand-roll cryptography; we hand-roll the
thin Matrix plumbing around it.

## Storage: OPFS, by design

The keystore lives in the **Origin Private File System**, not IndexedDB. Because the
secrets are libolm *pickle strings* whose serialization we own, a plain file-per-key
in OPFS is the simplest durable home for them (`rooms/chat/opfs-store.js`). The store
falls back to an in-memory map when OPFS is absent (Node, private mode), so the whole
holon runs identically under `node --test`; it just doesn't persist there.

> This was the deliberate answer to "we prefer OPFS": the modern Matrix crypto WASM
> only ships an IndexedDB store on the web and isn't swappable from JS, so honoring
> OPFS for the *keys* is exactly why we drive libolm directly rather than pulling in
> `matrix-js-sdk`.

## The four parts (one holon, one entrance)

| module | face | role |
|---|---|---|
| `opfs-store.js` | `CON·INS(Field → Link)` | OPFS key/value persistence, memory fallback, never throws |
| `crypto.js` | `INS·CON(Void,Field → Entity,Link)` | libolm wrapper: Olm account, Olm 1:1 sessions, Megolm in/out — every secret pickled to the store |
| `client.js` | `SIG·CON(Network,Field → Link)` | hand-rolled Matrix transport: `/sync`, send, `/keys/{upload,query,claim}`, `/sendToDevice` |
| `index.js` | `CON·SIG(Network,Field → Link,Entity)` | the reactive room controller composing the three; the send/receive/key-share choreography |
| `mount.js` | `SIG·INS(Field → Entity)` | the DOM panel + a floating launcher `boot.js` drops into the page |

`Olm` is **injected** (the browser passes the vendored `window.Olm` after
`Olm.init()`; tests load the same artifact), so nothing imports libolm at module load
and the controller is fully testable.

## The message loop

- **Send** (`sendMessage`): ensure a Megolm session for the room → for each member
  device not yet keyed, claim a one-time key and open an Olm session → ship the room
  key to those devices as an `m.room.encrypted` (Olm) **to-device** message → `PUT`
  the `m.room.encrypted` (Megolm) event.
- **Receive** (`/sync`): decrypt inbound Olm to-device messages, importing any
  `m.room_key` → decrypt `m.room.encrypted` timeline events → fold into the timeline.
  A message we hold no key for shows a 🔒 placeholder instead of throwing.

## Tested against real crypto

`tests/chat-crypto.test.js`, `tests/chat-client.test.js`, and
`tests/chat-integration.test.js` run the **real vendored libolm** (loaded by
`tests/helpers/load-olm.js`). The integration test stands up an in-memory homeserver
(`tests/helpers/fake-homeserver.js`) and drives two full controllers — Alice sends an
encrypted message, Bob claims a key, receives the room key over Olm, and decrypts it —
plus a persistence test proving the device identity survives an OPFS reload.

## Deliberately not here yet (follow-ups)

This is the transport + message E2EE core with durable OPFS storage. Still to build:

- **Device verification UX** (SAS/emoji) and trust display — today key sharing is
  trust-on-first-use to every claimed device.
- **Cross-signing** and a verified-device model.
- **Encrypted key backup / secure secret storage** (server-side key backup), so keys
  survive losing the one browser profile.
- **Room creation / invite UI** — the panel lists and uses rooms the account already
  joined; starting new conversations is still done in another client for now.
- A first-class **dc-surface screen** (the current entry is an isolated floating
  launcher, chosen to avoid surgery on the generated surface).
