import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkpoint, checkpointChain,
  ERROR_TAXONOMY, detectionPoint, MIGRATES_TO_DECODER, STAYS_AT_CHECKPOINT,
  CATALOG, hasSurface,
} from '../src/coder/index.js';

// The defect corpus (docs/eot-coder-roadmap.md Stage 0): every Appendix B error
// type gets one minimal assembly that triggers exactly it, and a clean twin that
// triggers none. This is both the corpus and the regression gate — the checkpoint
// is the wedge (§4), so it must fire on each typed defect and stay silent on the
// coherent app beside it.

const errorsOf = (r) => r.findings.map((f) => f.error);
const has = (r, e) => errorsOf(r).includes(e);

// ── The taxonomy is the single source of truth (roadmap §4 table) ─────────────

test('detectionPoint classifies every error; the two blocks partition the taxonomy', () => {
  const all = Object.keys(ERROR_TAXONOMY);
  assert.equal(all.length, 10, 'ten typed errors, per Appendix B');
  for (const e of all) assert.ok(detectionPoint(e), `${e} has a detection point`);
  // The top block migrates to the decoder; the bottom block stays at the checkpoint.
  assert.deepEqual(
    [...MIGRATES_TO_DECODER].sort(),
    ['contract-violation', 'dependency', 'desert-cell', 'grain-mixed', 'unassembled', 'unknown-surface'].sort(),
  );
  assert.deepEqual(
    [...STAYS_AT_CHECKPOINT].sort(),
    ['closure-violation', 'narrowing-violation', 'stance-violation', 'terrain-mismatch'].sort(),
  );
  // The partition is exact — nothing is both, nothing is neither.
  assert.equal(MIGRATES_TO_DECODER.length + STAYS_AT_CHECKPOINT.length, all.length);
});

test('every finding carries a face, an address, and a fix', () => {
  const r = checkpoint({
    id: 'x', contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'DEF', terrain: 'Lens', stance: 'Dissecting' }], closed: true,
  });
  assert.ok(r.findings.length >= 1);
  for (const f of r.findings) {
    assert.ok(f.face && f.address && f.fix, 'face + address + fix');
    assert.equal(f.address.startsWith('x'), true, 'address is scoped to the assembly');
  }
});

// ── One triggering fixture per error (the corpus, positive side) ──────────────

test('grain-mixed — a Figure move at Ground grain', () => {
  // INS asserting grain Ground while its Making stance is Figure — the faces disagree.
  const r = checkpoint({ id: 'gm', events: [{ op: 'INS', grain: 'Ground', stance: 'Making' }], closed: true });
  assert.ok(has(r, 'grain-mixed'));
  assert.equal(r.ok, false);
});

test('desert-cell — SYN resolving at Ground', () => {
  const r = checkpoint({ id: 'dc', events: [{ op: 'SYN', grain: 'Ground' }], closed: true });
  assert.ok(has(r, 'desert-cell'));
});

test('dependency — a reference before its INS', () => {
  const r = checkpoint({ id: 'dep', events: [{ op: 'CON', terrain: 'Link', stance: 'Binding', ref: 'room_b' }], closed: true });
  assert.ok(has(r, 'dependency'));
});

test('contract-violation — a coherent event outside the declared region', () => {
  const r = checkpoint({
    id: 'cv', contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'DEF', terrain: 'Lens', stance: 'Dissecting' }], closed: true,
  });
  assert.ok(has(r, 'contract-violation'));
  assert.ok(!has(r, 'grain-mixed'), 'the event itself is coherent — only the contract is violated');
});

test('unknown-surface — a surface the catalog lacks', () => {
  const r = checkpoint({ id: 'us', surface: 'kanban', room: { terrains: ['Entity'] }, closed: true });
  assert.ok(has(r, 'unknown-surface'));
  assert.equal(hasSurface('kanban'), false);
});

test('unassembled — events past a boundary with no !EVA', () => {
  const r = checkpoint({ id: 'ua', events: [{ op: 'INS', id: 't', terrain: 'Entity', stance: 'Making' }], closed: false });
  assert.ok(has(r, 'unassembled'));
});

test('terrain-mismatch — a surface whose home terrain has no data in its room', () => {
  const r = checkpoint({ id: 'tm', surface: 'chart', room: { terrains: ['Entity'] }, closed: true });
  assert.ok(has(r, 'terrain-mismatch'), 'chart needs Network, Lens; the room has only Entity');
});

test('stance-violation — a chart cannot receive Making', () => {
  const r = checkpoint({
    id: 'sv', surface: 'chart', room: { terrains: ['Network', 'Lens'] },
    events: [{ op: 'INS', terrain: 'Entity', stance: 'Making', id: 'click' }], closed: true,
  });
  assert.ok(has(r, 'stance-violation'));
  assert.ok(!has(r, 'terrain-mismatch'), 'the room provides the surface home — only the stance is wrong');
});

test('narrowing-violation — a part claims what its container forbids', () => {
  const r = checkpoint({
    id: 'nv',
    contract: { ops: ['INS', 'DEF', 'SEG'], terrains: ['Entity'], stances: ['Making'] },
    container: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
  });
  assert.ok(has(r, 'narrowing-violation'));
});

test('closure-violation — the app contract is not the envelope of its parts', () => {
  const r = checkpoint({
    id: 'app', kind: 'app',
    contract: { ops: ['INS', 'CON', 'SYN'], terrains: ['Entity', 'Link'], stances: ['Making', 'Binding'] },
    parts: [
      { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
      { ops: ['CON'], terrains: ['Link'], stances: ['Binding'] },
    ],
  });
  assert.ok(has(r, 'closure-violation'), 'the app invented SYN its parts never claimed');
});

// ── The clean twins — the same shapes, built coherently, fire nothing ─────────

test('a coherent room checkpoints clean', () => {
  const r = checkpoint({
    id: 'tickets', kind: 'room',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'INS', id: 'ticket', terrain: 'Entity', stance: 'Making' }],
    closed: true,
  });
  assert.deepEqual(r.findings, []);
  assert.equal(r.ok, true);
  assert.deepEqual([...r.introduced], ['ticket']);
});

test('a coherent surface over a matching room checkpoints clean', () => {
  const r = checkpoint({ id: 'board1', kind: 'surface', surface: 'board', room: { terrains: ['Entity', 'Field'] }, closed: true });
  assert.deepEqual(r.findings, []);
});

test('a closure-correct app checkpoints clean', () => {
  const parts = [
    { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    { ops: ['CON'], terrains: ['Link'], stances: ['Binding'] },
  ];
  const r = checkpoint({
    id: 'app2', kind: 'app',
    contract: { ops: ['INS', 'CON'], terrains: ['Entity', 'Link'], stances: ['Making', 'Binding'] },
    parts,
  });
  assert.deepEqual(r.findings, []);
});

// ── The watchmaker chain — order is the helix, made operational ───────────────

test('checkpointChain — a link after its room is clean; before it, a dependency', () => {
  const room = {
    id: 'tickets', kind: 'room',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'INS', id: 'ticket', terrain: 'Entity', stance: 'Making' }], closed: true,
  };
  const link = {
    id: 'l1', kind: 'link',
    contract: { ops: ['CON'], terrains: ['Link'], stances: ['Binding'] },
    events: [{ op: 'CON', terrain: 'Link', stance: 'Binding', ref: 'tickets' }], closed: true,
  };

  const inOrder = checkpointChain([room, link]);
  assert.equal(inOrder.ok, true, 'room then link — the reference is grounded');
  assert.deepEqual(inOrder.results.flatMap(errorsOf), []);

  const reversed = checkpointChain([link, room]);
  assert.equal(reversed.ok, false, 'link before room — the reference dangles');
  assert.ok(reversed.results[0].findings.some((f) => f.error === 'dependency'));
});

test('checkpointChain — a valid prefix survives an invalid tail (interruptibility)', () => {
  const good = {
    id: 'r', kind: 'room',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'INS', id: 'a', terrain: 'Entity', stance: 'Making' }], closed: true,
  };
  const bad = { id: 'b', surface: 'nonesuch', room: { terrains: [] }, closed: true };
  const { results } = checkpointChain([good, bad]);
  assert.equal(results[0].ok, true, 'the completed set-down stays valid');
  assert.equal(results[1].ok, false, 'the failure is scoped to the tail');
});

// ── The catalog is closed and its regions are real cube coordinates ───────────

test('the catalog is a set of pre-built surfaces, each fully contracted', () => {
  assert.ok(Object.keys(CATALOG).length >= 10, 'at least the roadmap\'s ten surfaces');
  for (const [name, surf] of Object.entries(CATALOG)) {
    assert.ok(surf.home.length && surf.ops.length && surf.stances.length, `${name} has a full contract region`);
  }
});
