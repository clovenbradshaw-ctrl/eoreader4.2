// "Sync to Matrix" — the per-workspace opt-in that mirrors a workspace's sources into its
// room's shared, encrypted blockchain. The unit tests drive the sync LOGIC against a fake
// spaces membrane (opt-in gating, open-the-room-if-needed, content dedup); the integration
// test wires the REAL room vault + two libolm members through a fake homeserver, so a
// workspace Alice syncs is readable, source-for-source, by Bob in the room.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSpaceSync, workspaceSources } from '../src/rooms/archive/space-sync.js';
import { loadOlm } from './helpers/load-olm.js';
import { createFakeHomeserver } from './helpers/fake-homeserver.js';
import { createChatRoom } from '../src/rooms/chat/index.js';
import { createRoomVault } from '../src/rooms/archive/room-vault.js';

// A minimal reader-app stand-in: workspaces, topics, sources, and the accessors space-sync
// uses. Sources are scoped to topics via sourceSns; topics to a workspace via workspaceId.
const fakeApp = () => {
  const state = {
    workspaces: [{ id: 'ws1', name: 'Team', roomId: null, syncToMatrix: false }],
    topics: [{ id: 't1', workspaceId: 'ws1', sourceSns: ['S1', 'S2'] }],
    sources: [
      { sn: 'S1', reg: 'S-0001', title: 'Minutes', text: 'the vote passed 4-1' },
      { sn: 'S2', reg: 'S-0002', title: 'Agenda', text: 'item one: the budget' },
    ],
  };
  const subs = new Set();
  return {
    state,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    sourceBySn: (sn) => state.sources.find((s) => s.sn === sn) || null,
    workspaceSetSync: (id, on) => { const w = state.workspaces.find((w) => w.id === id); if (w) w.syncToMatrix = !!on; },
  };
};

// A fake spaces membrane that records saves and opens a room by stamping the workspace.
const fakeSpaces = (app) => {
  const saves = [];
  return {
    saves,
    shareCalls: { n: 0 },
    async shareWorkspace(workspaceId) {
      this.shareCalls.n += 1;
      const w = app.state.workspaces.find((x) => x.id === workspaceId);
      if (w && !w.roomId) w.roomId = `!${workspaceId}:hs.test`;
      return { ok: true, roomId: w.roomId };
    },
    async save(workspaceId, bytes, meta) { saves.push({ workspaceId, text: String(bytes), meta }); return { ok: true, eventId: 'e' + saves.length }; },
  };
};

test('workspaceSources collects every source under a workspace\'s topics', () => {
  const app = fakeApp();
  const srcs = workspaceSources(app, 'ws1');
  assert.deepEqual(srcs.map((s) => s.sn), ['S1', 'S2']);
  assert.deepEqual(workspaceSources(app, 'nope'), []);
});

test('sync is OFF by default and does nothing until opted in', () => {
  const app = fakeApp();
  const spaces = fakeSpaces(app);
  const sync = createSpaceSync({ app, spaces });
  assert.equal(sync.isEnabled('ws1'), false);
  assert.equal(spaces.saves.length, 0, 'nothing synced while off');
});

test('enabling sync opens the room and mirrors every source into it', async () => {
  const app = fakeApp();
  const spaces = fakeSpaces(app);
  const sync = createSpaceSync({ app, spaces });

  const r = await sync.setEnabled('ws1', true);
  assert.equal(r.ok, true);
  assert.equal(r.saved, 2, 'both sources pushed');
  assert.equal(spaces.shareCalls.n, 1, 'the room was opened once');
  assert.equal(app.state.workspaces[0].syncToMatrix, true, 'the flag is recorded on the workspace');
  assert.deepEqual(spaces.saves.map((s) => s.text), ['the vote passed 4-1', 'item one: the budget']);
  assert.equal(spaces.saves[0].meta.name, 'Minutes', 'the source title rides as the block name');
});

test('an unchanged source is not re-uploaded on the next sync pass', async () => {
  const app = fakeApp();
  const spaces = fakeSpaces(app);
  const sync = createSpaceSync({ app, spaces });
  await sync.setEnabled('ws1', true);
  assert.equal(spaces.saves.length, 2);

  const again = await sync.syncNow('ws1');
  assert.equal(again.saved, 0, 'nothing new to push');
  assert.equal(again.deduped, 2, 'both recognised as already-synced by content');
  assert.equal(spaces.saves.length, 2, 'no duplicate uploads');
  assert.equal(spaces.shareCalls.n, 1, 'the room is not re-created');
});

test('a newly added source is picked up by the next sync', async () => {
  const app = fakeApp();
  const spaces = fakeSpaces(app);
  const sync = createSpaceSync({ app, spaces });
  await sync.setEnabled('ws1', true);

  app.state.sources.push({ sn: 'S3', reg: 'S-0003', title: 'Note', text: 'a fresh source' });
  app.state.topics[0].sourceSns.push('S3');
  const r = await sync.syncNow('ws1');
  assert.equal(r.saved, 1, 'only the new source uploads');
  assert.equal(r.total, 3);
  assert.equal(spaces.saves[2].text, 'a fresh source');
});

test('disabling sync records the flag and stops syncing', async () => {
  const app = fakeApp();
  const spaces = fakeSpaces(app);
  const sync = createSpaceSync({ app, spaces });
  await sync.setEnabled('ws1', true);
  const off = await sync.setEnabled('ws1', false);
  assert.equal(off.disabled, true);
  assert.equal(app.state.workspaces[0].syncToMatrix, false);
  assert.equal(sync.isEnabled('ws1'), false);
});

test('end to end: a workspace Alice syncs to Matrix is readable, source-for-source, by Bob', async () => {
  const Olm = await loadOlm();
  const hs = createFakeHomeserver();

  // Two members, each a chat bus + a real room vault.
  const aliceSession = hs.sessionFor('@alice:hs.test', 'ALICEDEV', 'tok-a');
  const bobSession = hs.sessionFor('@bob:hs.test', 'BOBDEV', 'tok-b');
  const aliceChat = createChatRoom({ matrix: aliceSession, Olm, fetch: hs.fetch, navigator: null, autoSync: false });
  const bobChat = createChatRoom({ matrix: bobSession, Olm, fetch: hs.fetch, navigator: null, autoSync: false });
  const aliceVault = createRoomVault({ chat: aliceChat, matrix: aliceSession, fetch: hs.fetch, navigator: null });
  const bobVault = createRoomVault({ chat: bobChat, matrix: bobSession, fetch: hs.fetch, navigator: null });
  await aliceVault.start(); await bobVault.start();

  const app = fakeApp();

  // A thin spaces shim over Alice's real room vault (what boot's `spaces` does, minus DOM):
  // shareWorkspace opens a real room and invites Bob; save publishes an encrypted block.
  let roomId = null;
  const spaces = {
    async shareWorkspace(workspaceId) {
      const created = await aliceChat.createRoom({ name: 'Team', invite: ['@bob:hs.test'] });
      roomId = created.roomId;
      const w = app.state.workspaces.find((x) => x.id === workspaceId); if (w) w.roomId = roomId;
      await bobChat.join(roomId); await bobVault.pump();
      return { ok: true, roomId };
    },
    async save(workspaceId, bytes, meta) { return aliceVault.save(roomId, bytes, meta); },
  };

  const sync = createSpaceSync({ app, spaces });
  const r = await sync.setEnabled('ws1', true);
  assert.equal(r.ok, true);
  assert.equal(r.saved, 2, 'both of the workspace\'s sources were pushed');

  // Alice folds her own blocks; Bob receives the keys + blocks and folds them.
  await aliceVault.pump(); await bobVault.pump();

  const blocks = bobVault.list(roomId);
  assert.equal(blocks.length, 2, 'Bob sees both synced sources as blocks');
  const texts = [];
  for (const b of blocks) { const o = await bobVault.open(roomId, b.index); assert.equal(o.ok, true); texts.push(o.text); }
  assert.deepEqual(texts.sort(), ['item one: the budget', 'the vote passed 4-1'], 'Bob reads the workspace content back');

  aliceChat.stop(); bobChat.stop();
});
