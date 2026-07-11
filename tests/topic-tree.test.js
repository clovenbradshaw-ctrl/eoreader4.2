import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReaderApp } from '../src/rooms/reader/app.js';

// TOPICS ARE A NESTED TREE WITHIN A WORKSPACE (rooms/reader/app.js). A workspace is the
// top-level container (Notion's workspace/teamspace); inside it topics nest by parentId,
// arbitrarily deep, and fold away under a collapsed parent. This pins the tree ops —
// create/move/collapse/delete and the workspace scoping — that the sidebar renders.

// restore() sets up the seed workspace + first topic on a microtask; wait for `ready`.
const freshApp = async () => {
  const app = createReaderApp({ audit: { turns: [] } });
  if (!app.state.ready) {
    await new Promise((res) => { const un = app.subscribe((k) => { if (k === 'ready') { un(); res(); } }); });
  }
  return app;
};

test('a fresh session opens with one "Personal" workspace and a root topic', async () => {
  const app = await freshApp();
  assert.equal(app.state.workspaces.length, 1, 'exactly one workspace');
  assert.equal(app.state.workspaces[0].name, 'Personal', 'named Personal');
  assert.equal(app.activeWorkspace().id, app.state.activeWorkspaceId, 'the active workspace resolves');
  const rows = app.topicRows();
  assert.equal(rows.length, 1, 'one topic row');
  assert.equal(rows[0].depth, 0, 'at the root');
  assert.equal(rows[0].topic.workspaceId, app.state.activeWorkspaceId, 'homed in the active workspace');
  assert.equal(rows[0].topic.parentId, null, 'no parent');
});

test('a sub-topic nests under its parent and carries the parent depth + 1', async () => {
  const app = await freshApp();
  const root = app.topic();
  const child = app.topicNew('Child', { parentId: root.id });
  const grand = app.topicNew('Grandchild', { parentId: child.id });

  const tree = app.topicTree();
  assert.equal(tree.length, 1, 'one root node');
  assert.equal(tree[0].children.length, 1, 'root has one child');
  assert.equal(tree[0].children[0].children[0].topic.id, grand.id, 'the grandchild sits two deep');

  const rows = app.topicRows();
  assert.deepEqual(rows.map((r) => r.depth), [0, 1, 2], 'depths increase down the branch');
  assert.equal(rows[0].hasChildren, true, 'the root reports children');
  assert.equal(rows[2].hasChildren, false, 'the leaf reports none');
});

test('collapsing a topic hides its subtree from the sidebar walk', async () => {
  const app = await freshApp();
  const root = app.topic();
  const child = app.topicNew('Child', { parentId: root.id });
  app.topicNew('Grandchild', { parentId: child.id });

  assert.equal(app.topicRows().length, 3, 'all three show when open');
  app.topicToggleCollapse(root.id);
  const rows = app.topicRows();
  assert.equal(rows.length, 1, 'the whole subtree folds away');
  assert.equal(rows[0].collapsed, true, 'the root reads as collapsed');

  app.topicToggleCollapse(root.id);
  assert.equal(app.topicRows().length, 3, 'un-folding brings them back');
});

test('a new sub-topic un-folds its collapsed ancestors so it is visible', async () => {
  const app = await freshApp();
  const root = app.topic();
  app.topicToggleCollapse(root.id);
  assert.equal(app.topicRows().length, 1, 'collapsed to just the root');
  app.topicNew('Fresh child', { parentId: root.id });
  assert.equal(app.topicRows().length, 2, 'the root re-opened to reveal the new child');
});

test('topicMove re-parents, and refuses a cycle into its own descendant', async () => {
  const app = await freshApp();
  const a = app.topic();
  const b = app.topicNew('B', { parentId: a.id });
  const c = app.topicNew('C');   // a second root

  app.topicMove(c.id, a.id);      // C becomes a child of A
  assert.equal(app.topicTree()[0].children.length, 2, 'A now has two children');

  app.topicMove(a.id, b.id);      // A under its own child B — a cycle, rejected
  assert.equal(app.state.topics.find((t) => t.id === a.id).parentId, null, 'A stays at the root — the cycle was refused');

  app.topicMove(b.id, null);      // lift B back to the root
  assert.equal(app.state.topics.find((t) => t.id === b.id).parentId, null, 'B is a root again');
});

test('deleting a topic lifts its children up one level, never dropping the subtree', async () => {
  const app = await freshApp();
  const a = app.topic();
  const b = app.topicNew('B', { parentId: a.id });
  const c = app.topicNew('C', { parentId: b.id });

  app.topicDelete(b.id);
  const bGone = !app.state.topics.find((t) => t.id === b.id);
  assert.ok(bGone, 'B is gone');
  assert.equal(app.state.topics.find((t) => t.id === c.id).parentId, a.id, 'C rose to A, its grandparent');
});

test('workspaces scope their own topic trees, and switching lands on a topic inside', async () => {
  const app = await freshApp();
  const personalTopic = app.topic().id;
  const ws = app.workspaceNew('Team');
  assert.equal(app.state.activeWorkspaceId, ws.id, 'the new workspace is active');
  assert.notEqual(app.topic().id, personalTopic, 'it opened onto its own fresh topic');
  assert.equal(app.topicRows().length, 1, 'the new workspace shows only its own topic');
  assert.ok(app.topic().workspaceId === ws.id, 'the active topic lives in the new workspace');

  const firstWs = app.state.workspaces[0].id;
  app.setWorkspace(firstWs);
  assert.equal(app.topic().id, personalTopic, 'switching back restores the Personal topic');
});

test('deleting a workspace re-homes its topics rather than losing them', async () => {
  const app = await freshApp();
  const personal = app.state.workspaces[0].id;
  const ws = app.workspaceNew('Team');
  const teamTopic = app.topic().id;

  app.workspaceDelete(ws.id);
  assert.equal(app.state.workspaces.length, 1, 'back to one workspace');
  const rehomed = app.state.topics.find((t) => t.id === teamTopic);
  assert.ok(rehomed, 'the topic survived the delete');
  assert.equal(rehomed.workspaceId, personal, 're-homed into Personal');
  assert.equal(rehomed.parentId, null, 'flattened to the root');
});

test('the last workspace can never be deleted', async () => {
  const app = await freshApp();
  const only = app.state.workspaces[0].id;
  app.workspaceDelete(only);
  assert.equal(app.state.workspaces.length, 1, 'the shell keeps its one workspace');
});
