# Shared, room-encrypted, hash-chained vault — `rooms/archive/room-vault`

"Save anything — as binary — into a room, so that **only the people in that room** can
read it, and let the room agree on the order." This is the private media vault
([`docs/media-vault.md`](media-vault.md)) made **collective**: a workspace becomes a real,
invitable **Matrix room**, and everything saved into it is stored as an **encrypted,
hash-linked blockchain**, in **binary**, in **Matrix** — decryptable by exactly the room's
members and no one else (not even the homeserver).

It answers three things at once:

- **everything can be stored as a blockchain, in binary, in Matrix** — each save is a
  tamper-evident block; the content is ciphertext bytes in the media repo;
- **encrypted so only people in the room can access** — the block's key rides inside a
  Megolm room event, so Megolm's guarantee *is* the access rule: whoever is in the room
  when it is saved can read it, no one else;
- **room messages carry the updates and the signals** — a save *is* a room event, and
  lightweight nudges (`sendSignal`) travel the same encrypted rail.

## Where it sits

```
rooms/chat/       the encrypted room BUS — Olm/Megolm, key-sharing, sync, room lifecycle
  index.js          sendRoomEvent · onRoomEvent · sendSignal · createRoom · invite · join
rooms/archive/
  room-vault.js     the entrance: save / open / list / verify over a room
  room-chain.js     the room-ordered hash-linked ledger (folded from the timeline)
  mxc.js            binary ciphertext ↔ the Matrix media repository
  file-crypto.js    per-file AES-256-CTR (the Matrix EncryptedFile scheme) + SHA-256
```

The shared vault **reuses the chat holon as its transport** — the same device identity,
the same sync loop, the same Megolm key distribution the E2EE chat already runs
([`docs/element-e2ee.md`](element-e2ee.md)). It adds no second login and no second crypto
stack; a vault block is just another kind of event on the room bus.

## The pipeline

```
save(roomId, bytes):
  encrypt (per-file key)      file-crypto.js       → ciphertext + an EncryptedFile manifest
  upload the CIPHERTEXT       mxc.js               → mxc://…  (binary, in the media repo)
  publish the block record    chat.sendRoomEvent   → a Megolm-encrypted org.eoreader.vault.block
                                                     event carrying { contentHash, mxc, enc }

receive (every member, on the chat sync loop):
  decrypt the room event      chat.onRoomEvent     → only members hold the Megolm key
  fold onto the room's chain  room-chain.js        → timeline order = chain order

open(roomId, block):
  download ← mxc → decrypt + verify sha256(ciphertext) → verify sha256(plaintext) == contentHash
```

The block record — the thing that carries the per-file decryption key — is **itself
Megolm-encrypted to the room**. The ciphertext in the media repo is meaningless without
that record. So reading a block requires the room key, which only the room's members have.

## The chain, in a room with many writers

A private chain has one writer; a room has many. The **Matrix room timeline is the
ordering authority** (as it already is for every message): every member receives the same
block events in the same order and folds them into an **identical** hash-linked chain. The
hash-linking is what makes that agreed order **tamper-evident** — reorder, drop, or edit a
block and its hash (and every later block's `prev`) no longer checks out.

Determinism is the whole game, so **nothing local enters a block**:

| field | source | same for everyone because |
|---|---|---|
| `contentHash`, `size`, `mime`, `name`, `mxc`, `enc` | the decrypted event content | it is one authenticated Megolm payload |
| `at` | the event's `origin_server_ts` | the homeserver stamps it once |
| `author` | the event's `sender` | authenticated by Matrix |
| `src.eventId` | the Matrix event id | assigned once, globally |
| `index`, `prev`, `hash` | assigned on fold | receive order is the timeline order |

Two members therefore compute the **same head hash** — compare heads to detect a
misbehaving server. Folding is **idempotent by `src.eventId`**, so a re-sync or a reload
that replays the timeline never double-appends.

## What is (and isn't) guaranteed

- **Confidentiality** — the homeserver stores only opaque ciphertext (the content) and
  opaque Megolm envelopes (the block records). It can read neither.
- **Access = membership at save time** — this is exactly Megolm's guarantee. A member can
  read everything saved **while they are in the room**. History from *before* they joined
  needs Megolm key backup/sharing, which — as in the E2EE chat today — is a deliberate
  follow-up. ("Only people in the room it was uploaded" is the literal shape of this.)
- **Integrity** — a corrupted ciphertext blob is caught on `open` (the ciphertext SHA-256
  mismatches); a reordered/edited block is caught by `verify` (a broken hash link).
- **Ordering** — the homeserver orders the timeline; it cannot forge or silently edit a
  block (Megolm MAC + content addressing), but a server that drops or reorders events makes
  members' heads diverge — which is **detectable**, not silent. This is honest ordering, not
  byzantine consensus.

## Using it

Exposed on the engine bridge as `window.EO.spaces` (rides the optional Matrix login):

```js
// Turn a local workspace into a shared, invitable room, inviting two people.
const { roomId } = await EO.spaces.shareWorkspace(workspaceId, ['@bob:hs.social', '@carol:hs.social']);

// Save anything into it — encrypted, binary, hash-chained, room-only.
await EO.spaces.save(workspaceId, fileBytes, { name: 'minutes.pdf', mime: 'application/pdf' });

// A member opens the newest block back (after a sync folds it).
const list = EO.spaces.list(workspaceId);
const { bytes } = await EO.spaces.open(workspaceId, list[0].index);

await EO.spaces.verify(workspaceId);            // → { ok: true, length: N }
await EO.spaces.invite(workspaceId, '@dave:hs.social');
EO.spaces.sendSignal(workspaceId, 'saved', { name: 'minutes.pdf' });   // a nudge on the same bus
```

The chat controller exposes the primitives directly, too: `createRoom`, `invite`, `join`,
`members`, `sendRoomEvent`, `onRoomEvent`, `sendSignal`.

## "Sync to Matrix" — the opt-in that backs a whole workspace

Saving one item at a time is the low-level verb. The **"sync to Matrix" option**
(`rooms/archive/space-sync`, exposed as `EO.spaces.sync` / `EO.spaces.setSync`) is the
switch most people want: flip it on for a workspace and **all of that workspace's content
is mirrored into its room's encrypted blockchain** — and kept in sync as you add more.

```js
await EO.spaces.setSync(workspaceId, true);    // opens the room if needed, then syncs now
// …add sources; a debounced pass mirrors each new one into the room automatically…
EO.spaces.sync.state.byWorkspace[workspaceId]; // { enabled, synced, pending, lastAt, error }
await EO.spaces.setSync(workspaceId, false);   // stop syncing (nothing is deleted)
```

It carries the genome-autosave discipline so automatic syncing never spams the homeserver:

- **content-addressed** — each source is addressed by the SHA-256 of its bytes, so an
  unchanged source is never re-uploaded (a per-session guard here, plus the room vault's
  own content dedup once a block folds);
- **debounced** — a burst of edits collapses into one sync pass once it settles;
- **opt-in, per workspace, default OFF** — it never turns itself on and never prompts.

Turning it on for a workspace that isn't shared yet **opens its room first** (solo — invite
people later), so "sync to Matrix" doubles as "make this a Matrix workspace." The engine
(`rooms/reader/app.js`) only records the flag (`workspaceSetSync`); the encrypt-and-publish
lives in boot's `spaces` membrane, keeping app state network-free.

## Guarantees, proven by tests

- `tests/room-vault.test.js` — the whole loop through two real libolm members and the fake
  homeserver: Alice saves into a shared room; Bob (a member) folds the block and opens the
  bytes; their chains **converge on the same head hash**; a binary payload round-trips
  byte-for-byte; the media repo holds **only ciphertext**; a user who was **not in the room**
  when it was saved cannot read it; re-saving identical bytes **dedupes**; a corrupted blob
  is caught; a **signal** rides the same encrypted bus; and the create/invite/join lifecycle.
- `tests/room-chain.test.js` — the ledger in isolation: fold **determinism** (two members
  converge), **idempotency** by event id, `verify`, reload from OPFS, and per-room isolation.
- `tests/space-sync.test.js` — the "sync to Matrix" opt-in: default OFF, opening the room on
  enable, mirroring every source, **content dedup** across passes, picking up new sources,
  and an **end-to-end** pass where a workspace Alice syncs is read back source-for-source by
  Bob in the room.

## Deliberately follow-up

- **Reading history from before you joined** — Megolm key backup / key sharing, so an
  invitee can decrypt blocks saved before their join (the same gap the E2EE chat has today).
- A **panel** surface for shared workspaces (invite UI, the chain newest-first, a live
  head-hash convergence badge) — the engine (`save`/`open`/`verify`/`members`) is what the
  tests exercise.
- **Auto-signal** on save ("Alice saved minutes.pdf") wired into the workspace switcher.
