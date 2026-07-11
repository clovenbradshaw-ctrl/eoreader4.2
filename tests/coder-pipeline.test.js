import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  build, constrainedEmit, repair, checkpoint, createBuildLedger,
  reportCatalogGaps, CATALOG,
} from '../src/coder/index.js';

// The full coder pipeline (docs/eot-coder-roadmap.md): emit (Stage 1) → checkpoint
// (§4) → repair (Stage 3) → signed ledger (Stage 4). A deterministic clock so the
// signatures are reproducible.
const counter = () => { let n = 0; return () => n++; };
const TOKEN = new Set(['grain-mixed', 'desert-cell', 'contract-violation']);

// ── Stage 1 (operational): the model proposes, the mask disposes ──────────────

test('constrainedEmit — an adversarial intent yields token-block-clean EOT', () => {
  const adversarial = {
    id: 'adv',
    contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [
      { op: 'SYN', grain: 'Ground' },                       // reaches for the desert cell
      { op: 'DEF', terrain: 'Lens', stance: 'Dissecting' }, // reaches outside the region
      { op: 'INS', grain: 'Ground', stance: 'Making' },     // reaches for a grain clash
    ],
  };
  const { assembly, emissions } = constrainedEmit(adversarial, {});
  const bad = checkpoint(assembly, {}).findings.filter((f) => TOKEN.has(f.error));
  assert.deepEqual(bad, [], 'the emitted assembly carries no grain/desert/contract defect');
  assert.ok(emissions.length >= 3, 'every reach past the wall is logged as a divergence');
  // the log names what the model wanted and what it was given instead
  assert.ok(emissions.some((e) => e.wanted === 'SYN' && e.chosen !== 'SYN'));
});

test('constrainedEmit — a reference the known set cannot ground is logged, not masked away', () => {
  const { assembly, emissions } = constrainedEmit(
    { id: 'l', contract: { ops: ['CON'], terrains: ['Link'], stances: ['Binding'] },
      events: [{ op: 'CON', terrain: 'Link', stance: 'Binding', ref: 'ghost' }] },
    {},
  );
  assert.equal(assembly.events[0].ref, 'ghost', 'the reference is carried for the helix to resolve');
  assert.ok(emissions.some((e) => e.face === 'ref' && e.wanted === 'ghost'));
});

// ── Stage 3: the repair agent — typed errors consumed, cap, veto ──────────────

test('repair — terrain-mismatch is mended by adding the surface home to the room', () => {
  const r = repair({ id: 'b', kind: 'surface', surface: 'board', room: { terrains: ['Entity'] } }, {});
  assert.equal(r.ok, true);
  assert.ok(r.assembly.room.terrains.includes('Field'));
  assert.equal(r.revisions.length, 1);
});

test('repair — contract-violation is mended by a logged !REC widening', () => {
  const ledger = createBuildLedger({ now: counter() });
  const r = repair({
    id: 'p', contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
    events: [{ op: 'DEF', terrain: 'Lens', stance: 'Dissecting' }], closed: true,
  }, {}, { ledger });
  assert.equal(r.ok, true);
  assert.ok(r.assembly.contract.ops.includes('DEF'), 'the contract was widened to admit the event');
  assert.ok(ledger.entries().some((e) => e.kind === 'repair' && e.rec === true), 'the widening is a logged !REC');
});

test('repair — closure-violation is mended by recomputing the envelope', () => {
  const r = repair({
    id: 'app', kind: 'app',
    contract: { ops: ['INS', 'CON', 'SYN'], terrains: ['Entity', 'Link'], stances: ['Making', 'Binding'] },
    parts: [
      { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
      { ops: ['CON'], terrains: ['Link'], stances: ['Binding'] },
    ],
  }, {});
  assert.equal(r.ok, true);
  assert.ok(!r.assembly.contract.ops.includes('SYN'), 'the invented SYN was recomputed away');
});

test('repair — narrowing-violation is mended by widening the container upward', () => {
  const r = repair({
    id: 'part',
    contract: { ops: ['INS', 'DEF', 'SEG'], terrains: ['Entity'], stances: ['Making'] },
    container: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
  }, {});
  assert.equal(r.ok, true);
  assert.ok(r.assembly.container.ops.includes('SEG'));
});

test('repair — an unrepairable defect vetoes with a legible message', () => {
  const r = repair({
    id: 'chart1', kind: 'surface', surface: 'chart', room: { terrains: ['Network', 'Lens'] },
    events: [{ op: 'INS', terrain: 'Entity', stance: 'Making', id: 'click' }],
  }, {});
  assert.equal(r.ok, false);
  assert.match(r.veto.message, /cannot be built as asked/);
  assert.match(r.veto.message, /stance-violation/);
});

test('repair — an unknown surface vetoes (a catalog gap, never invented)', () => {
  const r = repair({ id: 'k', kind: 'surface', surface: 'kanban', room: { terrains: ['Entity'] } }, {});
  assert.equal(r.ok, false);
  assert.match(r.veto.message, /unknown-surface/);
});

// ── Stage 4: the signed build ledger ──────────────────────────────────────────

test('the ledger is a signed chain — deterministic, and self-verifying', () => {
  const mk = () => {
    const l = createBuildLedger({ now: counter() });
    l.recordOpen({ id: 'r', kind: 'room' });
    l.recordEmission('r', { op: 'INS', terrain: 'Entity', stance: 'Making', id: 'x' });
    l.recordVerdict('r', { ok: true, findings: [] });
    return l;
  };
  const a = mk(), b = mk();
  assert.equal(a.verifyChain(), true);
  assert.equal(a.head, b.head, 'same clock + same events → same signature (content-addressed)');
  assert.match(a.buildReport(), /BUILD REPORT/);
  assert.match(a.buildReport(), /chain OK/);
});

// ── The whole pipeline, end to end ────────────────────────────────────────────

test('build — a coherent app ships ok, provisioned, with a clean signed report', () => {
  const intents = [
    { id: 'cases', kind: 'room',
      contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
      events: [{ op: 'INS', id: 'case', terrain: 'Entity', stance: 'Making' }] },
    { id: 'case_board', kind: 'surface', surface: 'board', room: { terrains: ['Entity', 'Field'] } },
  ];
  const out = build(intents, {}, { now: counter() });
  assert.equal(out.ok, true);
  assert.ok(out.provisioned.instances.includes('case') && out.provisioned.rooms.includes('cases'));
  assert.equal(out.ledger.verifyChain(), true);
  assert.match(out.report, /checkpoint passed/);
});

test('build — a repairable defect is mended in-loop and recorded', () => {
  const intents = [
    { id: 'board_only', kind: 'surface', surface: 'board', room: { terrains: ['Entity'] } }, // missing Field
  ];
  const out = build(intents, {}, { now: counter() });
  assert.equal(out.ok, true, 'terrain-mismatch is repaired within the cap');
  assert.ok(out.ledger.entries().some((e) => e.kind === 'repair' && e.error === 'terrain-mismatch'));
  assert.match(out.report, /repair terrain-mismatch/);
});

test('build — an adversarial intent over a real surface still ships clean', () => {
  const intents = [
    { id: 'r', kind: 'room',
      contract: { ops: ['INS'], terrains: ['Entity'], stances: ['Making'] },
      events: [{ op: 'SYN', grain: 'Ground' }, { op: 'INS', id: 'row', terrain: 'Entity', stance: 'Making' }] },
    { id: 's', kind: 'surface', surface: 'list', room: { terrains: ['Entity'] } },
  ];
  const out = build(intents, {}, { now: counter() });
  assert.equal(out.ok, true, 'the mask made the desert reach unrepresentable; the rest checkpoints clean');
});

test('build — a vetoed set-down does not provision downstream', () => {
  const intents = [
    { id: 'ghost', kind: 'surface', surface: 'kanban', room: { terrains: ['Entity'] } }, // unknown surface → veto
  ];
  const out = build(intents, {}, { now: counter() });
  assert.equal(out.ok, false);
  assert.equal(out.vetoes.length, 1);
  assert.match(out.report, /veto/);
});

// ── Stage 2: the catalog widens; gaps are reported, never invented ────────────

test('reportCatalogGaps ranks the surfaces the coder could not build', () => {
  const findings = [
    { error: 'unknown-surface', address: 'a.kanban' },
    { error: 'unknown-surface', address: 'b.kanban' },
    { error: 'unknown-surface', address: 'c.swimlane' },
    { error: 'terrain-mismatch', address: 'd.board' },
  ];
  const gaps = reportCatalogGaps(findings);
  assert.deepEqual(gaps.map((g) => g.surface), ['kanban', 'swimlane']);
  assert.equal(gaps[0].requests, 2, 'kanban was reached for twice — top of the backlog');
});

test('the catalog widened without loosening the algebra (Stage 2)', () => {
  assert.ok(CATALOG.timeline && CATALOG.gallery, 'the two new surfaces are present');
});
