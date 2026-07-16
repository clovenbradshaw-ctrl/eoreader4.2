import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// THE SOURCE EXPLORER'S DRIVE (rooms/reader/app.js). A workspace owns a nested tree of
// FOLDERS, and every top-level source carries a `folderId` naming the folder it is filed
// under (null = the drive root). Folders are workspace-scoped so the whole library — every
// topic's sources — organises into one navigable Drive; grounding stays topic-scoped. This
// pins the folder ops the explorer renders: create/nest/move/delete, filing, and the paths.

// restore() sets up the seed workspace + first topic on a microtask; wait for `ready`.
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a fresh session has an empty Drive', async () => {
  const app = await freshApp();
  assert.deepEqual(app.state.folders, [], 'no folders yet');
  assert.deepEqual(app.workspaceFolders(), [], 'the active workspace has none');
});

test('folderNew creates a folder in the active workspace at the root', async () => {
  const app = await freshApp();
  const f = app.folderNew('Research');
  assert.equal(f.name, 'Research');
  assert.equal(f.parentId, null, 'at the drive root');
  assert.equal(f.workspaceId, app.state.activeWorkspaceId, 'scoped to the active workspace');
  assert.equal(app.workspaceFolders().length, 1, 'the workspace lists it');
});

test('a sub-folder nests under its parent, and folderPath walks root → leaf', async () => {
  const app = await freshApp();
  const a = app.folderNew('A');
  const b = app.folderNew('B', { parentId: a.id });
  const c = app.folderNew('C', { parentId: b.id });

  assert.equal(c.parentId, b.id, 'C nests under B');
  const path = app.folderPath(c.id);
  assert.deepEqual(path.map((f) => f.name), ['A', 'B', 'C'], 'the breadcrumb runs from the root down');
});

test('folderNew ignores a parent from another workspace (falls back to the root)', async () => {
  const app = await freshApp();
  const personalFolder = app.folderNew('Personal folder');
  app.workspaceNew('Team');   // switches active workspace to Team
  const teamFolder = app.folderNew('Team child', { parentId: personalFolder.id });
  assert.equal(teamFolder.parentId, null, 'a cross-workspace parent is refused — filed at the root');
  assert.equal(teamFolder.workspaceId, app.state.activeWorkspaceId, 'created in the active (Team) workspace');
});

test('folderMove re-parents, and refuses a cycle into its own descendant', async () => {
  const app = await freshApp();
  const a = app.folderNew('A');
  const b = app.folderNew('B', { parentId: a.id });
  const c = app.folderNew('C');   // a second root

  app.folderMove(c.id, a.id);      // C becomes a child of A
  assert.equal(app.folderById(c.id).parentId, a.id, 'C moved under A');

  app.folderMove(a.id, b.id);      // A under its own descendant B — a cycle, rejected
  assert.equal(app.folderById(a.id).parentId, null, 'A stays at the root — the cycle was refused');

  app.folderMove(b.id, null);      // lift B back to the root
  assert.equal(app.folderById(b.id).parentId, null, 'B is a root again');
});

test('folderRename changes the name; a blank name is ignored', async () => {
  const app = await freshApp();
  const f = app.folderNew('Old');
  app.folderRename(f.id, 'New');
  assert.equal(app.folderById(f.id).name, 'New');
  app.folderRename(f.id, '   ');
  assert.equal(app.folderById(f.id).name, 'New', 'a blank rename is a no-op');
});

test('deleting a folder lifts its sub-folders and filed sources to the parent — nothing is lost', async () => {
  const app = await freshApp();
  const a = app.folderNew('A');
  const b = app.folderNew('B', { parentId: a.id });
  const grand = app.folderNew('Grand', { parentId: b.id });

  const src = app.ingestText('a body of text to record as a source', 'Doc');
  app.sourceMove(src.sn, b.id);
  assert.equal(app.sourceBySn(src.sn).folderId, b.id, 'the source is filed in B');

  app.folderDelete(b.id);
  assert.ok(!app.folderById(b.id), 'B is gone');
  assert.equal(app.folderById(grand.id).parentId, a.id, 'the sub-folder rose to A');
  assert.equal(app.sourceBySn(src.sn).folderId, a.id, 'the filed source rose to A too');
});

test('sourceMove files a source into a folder and back to the root', async () => {
  const app = await freshApp();
  const f = app.folderNew('Folder');
  const src = app.ingestText('another body of recorded text', 'Doc2');
  assert.equal(app.sourceBySn(src.sn).folderId, null, 'a new source lands at the root');

  app.sourceMove(src.sn, f.id);
  assert.equal(app.sourceBySn(src.sn).folderId, f.id, 'moved into the folder');

  app.sourceMove(src.sn, null);
  assert.equal(app.sourceBySn(src.sn).folderId, null, 'moved back to the root');
});

test('workspaceSources returns every top-level source across the workspace\'s topics', async () => {
  const app = await freshApp();
  const t1 = app.topic();
  app.ingestText('first document text here', 'One');
  const t2 = app.topicNew('Second topic');
  app.setTopic(t2.id);
  app.ingestText('second document text here', 'Two');

  const all = app.workspaceSources().map((s) => s.title).sort();
  assert.deepEqual(all, ['One', 'Two'], 'both topics\' sources appear in the one Drive');
  // and the per-topic scoping is untouched
  app.setTopic(t1.id);
  assert.deepEqual(app.topicSources().map((s) => s.title), ['One'], 'topicSources stays topic-scoped');
});

test('folderId rides into the persisted source (an underscore-free field)', async () => {
  const app = await freshApp();
  const f = app.folderNew('Kept');
  const src = app.ingestText('text that should keep its folder across reload', 'Persisted');
  app.sourceMove(src.sn, f.id);

  assert.equal(app.folderById(f.id).name, 'Kept');
  assert.equal(app.sourceBySn(src.sn).folderId, f.id);
  // serialize() strips only `_`-prefixed (derived) fields, so folderId is persisted with the source.
  const persistedKeys = Object.keys(app.sourceBySn(src.sn)).filter((k) => k[0] !== '_');
  assert.ok(persistedKeys.includes('folderId'), 'folderId survives the snapshot');
});

test('deleting a workspace re-homes its Drive folders so filed sources stay valid', async () => {
  const app = await freshApp();
  const personal = app.state.workspaces[0].id;
  const ws = app.workspaceNew('Team');   // now active
  const f = app.folderNew('Team folder');
  app.ingestText('team document text', 'TeamDoc');
  const src = app.workspaceSources().find((s) => s.title === 'TeamDoc');
  app.sourceMove(src.sn, f.id);

  app.workspaceDelete(ws.id);
  assert.equal(app.folderById(f.id).workspaceId, personal, 'the folder re-homed into Personal');
  assert.equal(app.sourceBySn(src.sn).folderId, f.id, 'the source keeps a valid folderId');
});

test('sourceRename changes a source title while preserving folder and corpus membership', async () => {
  const app = await freshApp();
  const f = app.folderNew('Folder');
  const src = app.ingestText('renameable source body', 'Original title');
  app.sourceMove(src.sn, f.id);

  const renamed = app.sourceRename(src.sn, '  Renamed source  ');

  assert.equal(renamed.title, 'Renamed source');
  assert.equal(app.sourceBySn(src.sn).title, 'Renamed source');
  assert.equal(app.sourceBySn(src.sn).folderId, f.id, 'renaming does not move the source');
  assert.deepEqual(app.topicSources().map((s) => s.sn), [src.sn], 'renaming keeps the source in the topic corpus');

  app.sourceRename(src.sn, '   ');
  assert.equal(app.sourceBySn(src.sn).title, 'Renamed source', 'a blank rename is a no-op');
});
