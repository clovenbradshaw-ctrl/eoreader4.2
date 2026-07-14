// The durable-substrate checkpoint — proves the database's persistence tier
// (src/store/) works end to end in Node: passphrase vault → encrypted append-only
// store → rehydrated log that folds byte-identically to the original. Runs the
// SAME encrypted code path the browser runs; only the byte backend differs
// (in-memory here, OPFS in a tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { projectGraph } from '../src/core/project.js';
import {
  Vault, configureVaultStorage,
  packEvent, packBatch, unpackAll, unpackSince, scanMeta,
  memoryBackend,
  EventStore,
  attachStore, openPersistentLog,
  generateWorkspaceKey, wrapWorkspaceKey, unwrapWorkspaceKey,
  generateIdentityKeyPair, encryptPayload, decryptPayload,
  createDatabase,
} from '../src/store/index.js';

// A tiny synchronous KV so each test's vault metadata is isolated & deterministic.
const freshMetaStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

// A representative reading log — the same operators projectGraph reads.
const SAMPLE = [
  { op: 'INS', id: 'dolphin', label: 'Dolphin' },
  { op: 'INS', id: 'boat', label: 'Boat' },
  { op: 'DEF', id: 'dolphin', key: 'species', value: 'mammal' },
  { op: 'CON', src: 'dolphin', tgt: 'boat', via: 'near', sentIdx: 0 },
  { op: 'SIG', src: 'dolphin', tgt: 'water', via: 'in', sentIdx: 1 },
  { op: 'INS', id: 'mirror', label: 'Mirror' },
  { op: 'CON', src: 'dolphin', tgt: 'mirror', via: 'recognizes-self-in', sentIdx: 2 },
];

// Stable serialization of a fold, for equivalence assertions.
const snapshot = (g) => JSON.stringify({
  rev: g.rev,
  entities: [...g.entities.values()]
    .map((e) => ({ id: e.id, label: e.label, sightings: e.sightings, props: e.props }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  edges: g.edges
    .map((e) => ({ from: e.from, to: e.to, kind: e.kind, via: e.via }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
});

// ── pack: native event ⇄ bytes ──────────────────────────────────────────────

test('pack: packBatch/unpackAll round-trips arbitrary event fields losslessly', () => {
  const log = createLog({ docId: 'd' });
  const sealed = SAMPLE.map((e) => log.append(e));
  const bytes = packBatch(sealed);
  const back = unpackAll(bytes);
  assert.equal(back.length, sealed.length);
  assert.deepEqual(back, sealed, 'every field, including seq/t/eo, survives the round-trip');
});

test('pack: unpackSince(seq) yields only newer events; scanMeta reads the header only', () => {
  const log = createLog({ docId: 'd' });
  const sealed = SAMPLE.map((e) => log.append(e));
  const bytes = packBatch(sealed);
  const after3 = unpackSince(bytes, 3);
  assert.deepEqual(after3.map((e) => e.seq), [4, 5, 6]);
  const meta = scanMeta(bytes);
  assert.equal(meta.count, 7);
  assert.equal(meta.maxSeq, 6);
  assert.equal(packEvent(sealed[0]).length > 0, true);
});

// ── vault: passphrase → key, seal/open ──────────────────────────────────────

test('vault: unlock round-trips bytes; wrong passphrase fails; lock seals', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  assert.equal(await v.open('reader@local', 'correct horse'), true);
  assert.equal(v.isUnlocked(), true);

  const blob = await v.encryptBytes(new TextEncoder().encode('privileged'));
  const back = await v.decryptBytes(blob);
  assert.equal(new TextDecoder().decode(back), 'privileged');

  v.lock();
  assert.equal(v.isUnlocked(), false);
  await assert.rejects(() => v.encryptBytes(new Uint8Array([1])), /locked/);

  // A second vault sharing the same metadata store unlocks with the right pass…
  const v2 = new Vault();
  assert.equal(await v2.unlock('reader@local', 'correct horse'), true);
  // …and rejects the wrong one.
  const v3 = new Vault();
  assert.equal(await v3.unlock('reader@local', 'battery staple'), false);
});

// ── envelope: multi-user key sharing (B3) ────────────────────────────────────

test('envelope: a workspace key ECIES-wraps to a recipient and unwraps back', async () => {
  const recipient = await generateIdentityKeyPair();
  const wck = generateWorkspaceKey();
  const grant = await wrapWorkspaceKey(recipient.publicKey, wck);
  const opened = await unwrapWorkspaceKey(recipient.privateKey, grant);
  assert.deepEqual(opened, wck);

  const env = await encryptPayload(wck, 0, 'INS', { id: 'x', label: 'X' });
  const { op, content } = await decryptPayload(wck, env);
  assert.equal(op, 'INS');
  assert.deepEqual(content, { id: 'x', label: 'X' });
});

// ── event-store: encrypted append-only persistence ───────────────────────────

test('event-store: append + getAll round-trip through an unlocked vault', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const backend = memoryBackend();
  const store = await new EventStore({ roomId: 'topic:x', vault: v, backend }).open();

  const log = createLog({ docId: 'topic:x' });
  const sealed = SAMPLE.map((e) => log.append(e));
  await store.append(sealed);

  const got = await store.getAll();
  assert.deepEqual(got, sealed);
  assert.equal(store.getCount(), 7);
  assert.equal(store.getMaxSeq(), 6);
});

test('event-store: bytes on the backend are ciphertext, not plaintext', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const backend = memoryBackend();
  const store = await new EventStore({ roomId: 'secret', vault: v, backend }).open();
  const log = createLog({ docId: 'secret' });
  await store.append([log.append({ op: 'DEF', id: 'client', key: 'name', value: 'Jane Privileged' })]);

  const raw = await backend.read();
  const asText = new TextDecoder().decode(raw);
  assert.equal(asText.includes('Jane Privileged'), false, 'the plaintext value never appears on disk');
  assert.equal(asText.includes('EOEV'), true, 'the file magic is present in the clear');
});

test('event-store: a second store over the same backend recovers the log', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const backend = memoryBackend();

  const a = await new EventStore({ roomId: 'r', vault: v, backend }).open();
  const log = createLog({ docId: 'r' });
  const sealed = SAMPLE.map((e) => log.append(e));
  await a.append(sealed);

  const b = await new EventStore({ roomId: 'r', vault: v, backend }).open();
  assert.equal(b.getCount(), 7, 'cursor/count rebuilt from the header scan on open');
  assert.equal(b.getMaxSeq(), 6);
  assert.deepEqual(await b.getAll(), sealed);
});

test('event-store: dedup by seq — replaying the same events writes nothing new', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const backend = memoryBackend();
  const store = await new EventStore({ roomId: 'r', vault: v, backend }).open();
  const log = createLog({ docId: 'r' });
  const sealed = SAMPLE.map((e) => log.append(e));

  const first = await store.append(sealed);
  assert.equal(first.length, 7);
  const again = await store.append(sealed);
  assert.equal(again.length, 0, 'already-stored seqs are skipped');
  assert.equal(store.getCount(), 7);
});

test('event-store: a tampered ciphertext chunk fails AES-GCM auth and is dropped', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const backend = memoryBackend();
  const store = await new EventStore({ roomId: 'r', vault: v, backend }).open();
  const log = createLog({ docId: 'r' });
  await store.append([log.append({ op: 'INS', id: 'a', label: 'A' })]);

  const raw = await backend.read();
  raw[raw.length - 1] ^= 0xff;          // flip a tag byte in the ciphertext
  await backend.clear();
  await backend.append(raw);

  const reopened = await new EventStore({ roomId: 'r', vault: v, backend }).open();
  assert.deepEqual(await reopened.getAll(), [], 'the tampered chunk is refused, not silently trusted');
});

test('event-store: locked vault keeps working in memory but writes nothing', async () => {
  const v = new Vault();                 // never unlocked
  const backend = memoryBackend();
  const store = await new EventStore({ roomId: 'r', vault: v, backend }).open();
  const log = createLog({ docId: 'r' });
  const accepted = await store.append([log.append({ op: 'INS', id: 'a', label: 'A' })]);
  assert.equal(accepted.length, 1, 'the event is accounted for in memory');
  assert.equal(await backend.size(), 0, 'but nothing reached the (encrypted) backend');
});

test('event-store: checkpoint save/load round-trips folded state', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const store = await new EventStore({
    roomId: 'r', vault: v, backend: memoryBackend(), checkpointBackend: memoryBackend(),
  }).open();
  const log = createLog({ docId: 'r' });
  await store.append(SAMPLE.map((e) => log.append(e)));

  assert.equal(await store.saveCheckpoint({ entities: 3, savedAt: 42 }), true);
  const cp = await store.loadCheckpoint();
  assert.equal(cp.state.entities, 3);
  assert.equal(cp.maxSeq, 6);
});

// ── persistent-log: THE integration proof — durable, then folds identically ──

test('persistent-log: attachStore persists appends; a reopened log folds identically', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('reader@local', 'pw');
  const backend = memoryBackend();

  // First session: a fresh log, made durable, filled by "reading".
  const logA = createLog({ docId: 'topic:dolphins' });
  const storeA = await new EventStore({ roomId: 'topic:dolphins', vault: v, backend }).open();
  const { flush } = await attachStore(logA, storeA);
  for (const e of SAMPLE) logA.append(e);
  await flush();
  const foldA = projectGraph(logA);

  // Second session: nothing in memory — rehydrate straight from the encrypted store.
  const { log: logB } = await openPersistentLog({ roomId: 'topic:dolphins', vault: v, backend });
  assert.equal(logB.length, SAMPLE.length, 'every event replayed back into the log');
  const foldB = projectGraph(logB);

  assert.equal(snapshot(foldB), snapshot(foldA), 'the rehydrated log folds byte-identically');
  assert.equal(foldB.entities.size, 3, 'the three INS entities (dolphin, boat, mirror) come back');
});

test('persistent-log: appends after reopen continue to persist and stay ordered', async () => {
  const v = new Vault();
  configureVaultStorage(freshMetaStore());
  await v.open('u', 'pw');
  const backend = memoryBackend();

  const s1 = await openPersistentLog({ roomId: 'r', vault: v, backend });
  s1.log.append({ op: 'INS', id: 'a', label: 'A' });
  await s1.flush();

  const s2 = await openPersistentLog({ roomId: 'r', vault: v, backend });
  s2.log.append({ op: 'INS', id: 'b', label: 'B' });
  await s2.flush();

  const s3 = await openPersistentLog({ roomId: 'r', vault: v, backend });
  assert.deepEqual(s3.log.snapshot().map((e) => e.id), ['a', 'b']);
  assert.deepEqual(s3.log.snapshot().map((e) => e.seq), [0, 1]);
});

// ── the database front door ──────────────────────────────────────────────────

test('createDatabase: one vault, many tables (rooms), durable logs', async () => {
  configureVaultStorage(freshMetaStore());
  const db = createDatabase();
  assert.equal(await db.unlock('firm@local', 'pw'), true);

  const clients = await db.openLog('table:clients');
  clients.log.append({ op: 'INS', id: 'c1', label: 'Client One' });
  await clients.flush();

  const notes = await db.table('table:notes');
  const nlog = createLog({ docId: 'table:notes' });
  await notes.append([nlog.append({ op: 'INS', id: 'n1', label: 'Note One' })]);

  assert.equal((await db.table('table:clients')).getCount(), 1);
  assert.equal((await db.table('table:notes')).getCount(), 1);
  assert.notEqual(await db.table('table:clients'), await db.table('table:notes'), 'each room is its own table');
});
