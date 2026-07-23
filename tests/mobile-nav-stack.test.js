import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// MOBILE VIEW STACK — the reported failure: mobile's Back button was a single mReturnTab slot,
// set only on the FIRST hop off a root tab and never updated on a second hop between two already
// -open screens. A → open entity → open source B silently dropped A: Back from B jumped straight
// to the original root, skipping both the entity sheet and source A entirely. This exercises the
// real openViewer/openEntity/setTab/setSourceMode/mobileBack/mobileCloseEntity methods (pulled out
// of index.html's dc app script, same idiom as graph-gating.test.js) against a stubbed app, so the
// stack's push/pop/restore logic is proven against the ACTUAL implementation, not a re-description
// of it.

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const block = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(block, 'the dc app script is present in index.html');
const Component = (() => {
  class DCLogic { constructor() {} setState() {} subscribe() { return () => {}; } }
  return new Function('DCLogic', block[1] + '\nreturn Component;')(DCLogic);
})();
const proto = Component.prototype;

// A minimal mobile ctx: real state + the real navigation methods, a fake source registry, and a
// synchronous setState (Object.assign into state — the same "instant, imperative" contract the
// app's own comments describe for anything a redraw/restore depends on reading right back).
const makeCtx = (sns = ['A', 'B']) => {
  const ctx = {
    state: { isMobile: true, tab: 'topic', mReturnTab: 'topic', viewerTabs: [], viewerModes: {}, viewerFocus: {}, entitySel: null, rightOpen: false },
    _mStack: [],
    _readerCache: {},
    _app: { sourceBySn: (sn) => (sns.includes(sn) ? { sn } : null) },
    setState(patch) { Object.assign(this.state, patch); },
    _syncRoute() {}, _ensureWiki() {}, _setPref() {}, loadPage() {}, loadPdf() {}, loadImage() {},
    _mob: proto._mob, _activeSrc: proto._activeSrc,
    openViewer: proto.openViewer, openEntity: proto.openEntity, setTab: proto.setTab, setSourceMode: proto.setSourceMode,
    _mPushCurrent: proto._mPushCurrent, _mRestoreFrame: proto._mRestoreFrame,
    mobileBack: proto.mobileBack, mobileCloseEntity: proto.mobileCloseEntity,
  };
  return ctx;
};

test('mobileBack after A → entity → B restores the entity sheet over A, not the original root', () => {
  const ctx = makeCtx();
  ctx.openViewer('A');
  assert.equal(ctx.state.tab, 'A');
  ctx.openEntity('A', 'e1');
  assert.equal(ctx.state.entitySel && ctx.state.entitySel.entId, 'e1');
  ctx.openViewer('B');
  assert.equal(ctx.state.tab, 'B', 'B is open, A and the entity sheet are behind it');
  assert.equal(ctx.state.rightOpen, false, 'opening B dismisses the sheet');

  ctx.mobileBack();
  assert.equal(ctx.state.tab, 'A', 'Back from B lands on A, not the original topic root (the reported bug)');
  assert.equal(ctx.state.rightOpen, true, 'the entity sheet reopens over A');
  assert.equal(ctx.state.entitySel.entId, 'e1');

  ctx.mobileBack();
  assert.equal(ctx.state.tab, 'A');
  assert.equal(ctx.state.rightOpen, false, 'a second Back drops the sheet and leaves plain A');

  ctx.mobileBack();
  assert.equal(ctx.state.tab, 'topic', 'a third Back finally reaches the original root');
});

test('mobileBack restores the exact mode and passage focus a source was left at', () => {
  const ctx = makeCtx();
  ctx.openViewer('A', 'the first passage');
  ctx.setSourceMode('reader');
  ctx.openViewer('B');   // A is pushed with mode='reader', focus='the first passage'

  ctx.mobileBack();
  assert.equal(ctx.state.tab, 'A');
  assert.equal(ctx.state.viewerModes.A, 'reader', 'the mode A was left in comes back, not a reset to Overview');
  assert.equal(ctx.state.viewerFocus.A, 'the first passage', 'the passage it was scrolled to comes back');
});

test('bottom-tab navigation (setTab to a root screen) resets the stack — Back never resurrects a discarded chain', () => {
  const ctx = makeCtx();
  ctx.openViewer('A');
  ctx.openEntity('A', 'e1');
  ctx.setTab('search');   // e.g. tapping the Ask bottom tab — a deliberate reset, not one more hop
  assert.equal(ctx._mStack.length, 0, 'setTab to a root screen empties the stack');

  ctx.mobileBack();
  assert.equal(ctx.state.tab, ctx.state.mReturnTab, 'with nothing on the stack, Back falls back to the floor exactly as before');
});

test('closing the entity sheet (not the physical Back button) also pops its own frame', () => {
  const ctx = makeCtx();
  ctx.openViewer('A');
  ctx.openEntity('A', 'e1');
  assert.equal(ctx._mStack.length, 2, 'topic root + the screen the sheet opened over');

  ctx.mobileCloseEntity();
  assert.equal(ctx.state.rightOpen, false);
  assert.equal(ctx._mStack.length, 1, 'closing via X pops the same frame a physical Back would have');

  ctx.mobileBack();
  assert.equal(ctx.state.tab, 'topic', 'the next Back reaches the root in one hop, not a phantom extra one');
});

test('setTab between two already-open source tabs does not reset the stack', () => {
  const ctx = makeCtx();
  ctx.openViewer('A');
  ctx.openEntity('A', 'e1');
  ctx.state.viewerTabs.push('B'); ctx.state.viewerModes.B = 'overview';
  ctx.setTab('B');   // switching to an already-open source tab, not a root-screen jump
  assert.ok(ctx._mStack.length > 0, 'a plain source-tab switch is not a stack-resetting root jump');
});
