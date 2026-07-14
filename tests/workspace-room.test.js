import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// A shared workspace is a Matrix room. The engine (rooms/reader/app.js) stays network-free
// — it only records the pairing (roomId + a members hint) and flips `shared`; the actual
// room create / invite and the encrypted, hash-chained sync live in boot's `spaces`
// membrane. This pins that pure binding so the collaborative case has a stable hook.

const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a fresh workspace is private (not shared, no room)', async () => {
  const app = await freshApp();
  const ws = app.state.workspaces[0];
  assert.equal(ws.shared, false);
  assert.equal(ws.roomId ?? null, null, 'no room bound yet');
});

test('binding a room makes a workspace shared and findable by its room id', async () => {
  const app = await freshApp();
  const ws = app.workspaceNew('Team');
  const bound = app.workspaceBindRoom(ws.id, { roomId: '!team:hs.test', members: ['@alice:hs.test', '@bob:hs.test'] });
  assert.equal(bound.roomId, '!team:hs.test');
  assert.equal(bound.shared, true, 'sharing is on once a room is bound');
  assert.deepEqual(bound.members, ['@alice:hs.test', '@bob:hs.test']);
  assert.equal(app.workspaceByRoom('!team:hs.test').id, ws.id, 'reverse lookup by room id');
});

test('unbinding a room makes the workspace private again', async () => {
  const app = await freshApp();
  const ws = app.workspaceNew('Team');
  app.workspaceBindRoom(ws.id, { roomId: '!team:hs.test' });
  app.workspaceBindRoom(ws.id, { roomId: null });
  assert.equal(app.state.workspaces.find((w) => w.id === ws.id).shared, false);
  assert.equal(app.workspaceByRoom('!team:hs.test'), null);
});

test('the room binding is part of the persisted workspace record', async () => {
  const app = await freshApp();
  const ws = app.workspaceNew('Team');
  app.workspaceBindRoom(ws.id, { roomId: '!team:hs.test', members: ['@alice:hs.test'] });
  // workspaces are serialized verbatim, so the roomId rides along into storage.
  const persisted = app.state.workspaces.find((w) => w.id === ws.id);
  assert.equal(persisted.roomId, '!team:hs.test');
  assert.deepEqual(persisted.members, ['@alice:hs.test']);
});
