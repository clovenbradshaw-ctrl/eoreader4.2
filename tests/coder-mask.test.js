import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  maskField, maskEvent, admits, legalRefs, TOKEN_EVENT_ERRORS, OP_IDS, FIELD_VOCAB,
} from '../src/coder/mask.js';
import { checkpoint } from '../src/coder/checkpoint.js';

// Stage 1 (docs/eot-coder-roadmap.md): the semantic mask makes the four token-block
// errors UNSAMPLABLE. The load-bearing invariant is that the mask never drifts from
// the checkpoint — so the central test is the executable no-drift theorem: across
// the WHOLE cube, a value is mask-legal iff the checkpoint admits the event.

const TOKEN = new Set(TOKEN_EVENT_ERRORS);
const tokenErrorsOf = (assembly) => checkpoint(assembly, {}).findings.filter((f) => TOKEN.has(f.error));

// ── The no-drift theorem — exhaustive over op × terrain × stance ──────────────

test('no-drift: stance ∈ mask(stance | op, terrain) ⟺ the checkpoint admits it (no contract)', () => {
  let checked = 0;
  for (const op of OP_IDS)
    for (const terrain of FIELD_VOCAB.terrain)
      for (const stance of FIELD_VOCAB.stance) {
        const draft = { op, terrain };
        const masked = maskField('stance', draft, {}).includes(stance);
        const admitted = admits({}, { op, terrain, stance }, {});
        assert.equal(masked, admitted, `disagreement at ${op}(${terrain}, ${stance})`);
        checked++;
      }
  assert.equal(checked, OP_IDS.length * FIELD_VOCAB.terrain.length * FIELD_VOCAB.stance.length);
});

test('no-drift: the same theorem holds under a declared contract', () => {
  const partial = { id: 'p', contract: { ops: ['INS', 'CON', 'DEF'], terrains: ['Entity', 'Link', 'Lens'], stances: ['Making', 'Binding', 'Dissecting'] } };
  for (const op of OP_IDS)
    for (const terrain of FIELD_VOCAB.terrain)
      for (const stance of FIELD_VOCAB.stance) {
        const masked = maskField('stance', { op, terrain }, partial).includes(stance);
        const admitted = admits(partial, { op, terrain, stance }, {});
        assert.equal(masked, admitted, `disagreement at ${op}(${terrain}, ${stance}) under contract`);
      }
});

test('no-drift: op is symmetric — op ∈ mask(op | terrain, stance) ⟺ admitted', () => {
  for (const terrain of FIELD_VOCAB.terrain)
    for (const stance of FIELD_VOCAB.stance)
      for (const op of OP_IDS) {
        const masked = maskField('op', { terrain, stance }, {}).includes(op);
        const admitted = admits({}, { op, terrain, stance }, {});
        assert.equal(masked, admitted, `op disagreement at ${op}(${terrain}, ${stance})`);
      }
});

test('anything the mask permits, the checkpoint passes clean of token errors', () => {
  for (const op of OP_IDS)
    for (const terrain of maskField('terrain', { op }, {}))
      for (const stance of maskField('stance', { op, terrain }, {})) {
        const bad = tokenErrorsOf({ id: 'm', events: [{ op, terrain, stance }], closed: true });
        assert.deepEqual(bad, [], `${op}(${terrain}, ${stance}) was masked-legal but the checkpoint flagged it`);
      }
});

// ── The structural properties the roadmap claims (Stage 1) ────────────────────

test('once two faces are fixed, the third is constrained to a computable set (≤1)', () => {
  for (const op of OP_IDS)
    for (const terrain of maskField('terrain', { op }, {})) {
      const stances = maskField('stance', { op, terrain }, {});
      assert.ok(stances.length <= 1, `${op}(${terrain}) should pin the stance, got [${stances}]`);
    }
});

test('the desert cell is unreachable — SYN at Ground (Field) has no legal stance', () => {
  assert.deepEqual([...maskField('stance', { op: 'SYN', terrain: 'Field' }, {})], []);
  assert.deepEqual([...maskField('stance', { op: 'SYN', grain: 'Ground' }, {})], []);
  // and SYN can never take the Cultivating stance at all
  assert.equal(maskField('stance', { op: 'SYN' }, {}).includes('Cultivating'), false);
});

test('grain-mixed is unrepresentable — a Figure operator cannot land at a Ground terrain', () => {
  // INS is Existence; its Ground terrain is Void. A Figure stance (Making) at Void…
  assert.equal(maskField('terrain', { op: 'INS', stance: 'Making' }, {}).includes('Void'), false);
  // …but Entity (the Figure terrain) is legal with Making.
  assert.equal(maskField('terrain', { op: 'INS', stance: 'Making' }, {}).includes('Entity'), true);
});

test('contract membership masks op/terrain/stance to the declared region', () => {
  const partial = { contract: { ops: ['INS', 'CON'], terrains: ['Entity', 'Link'], stances: ['Making', 'Binding'] } };
  assert.deepEqual([...maskField('op', {}, partial)].sort(), ['CON', 'INS']);
  assert.ok(maskField('terrain', {}, partial).every((t) => ['Entity', 'Link'].includes(t)));
  assert.ok(maskField('stance', {}, partial).every((s) => ['Making', 'Binding'].includes(s)));
});

test('legalRefs is exactly the known set — a bond outside it would be a dependency', () => {
  const refs = legalRefs({ knownRefs: ['ticket'] }, { rooms: ['cases'] });
  assert.deepEqual([...refs].sort(), ['cases', 'ticket']);
  // a ref inside the set admits; outside, it does not
  assert.equal(admits({ knownRefs: ['cases'] }, { op: 'CON', terrain: 'Link', stance: 'Binding', ref: 'cases' }, {}), true);
  assert.equal(admits({ knownRefs: ['cases'] }, { op: 'CON', terrain: 'Link', stance: 'Binding', ref: 'ghost' }, {}), false);
});

test('maskEvent returns a per-face mask, pinning fixed faces to singletons', () => {
  const m = maskEvent({ op: 'INS' }, {});
  assert.deepEqual([...m.op], ['INS']);
  assert.ok(m.terrain.length >= 1 && m.stance.length >= 1);
  // a fully-drafted coherent event pins every face
  const full = maskEvent({ op: 'INS', terrain: 'Entity', stance: 'Making', grain: 'Figure' }, {});
  for (const f of ['op', 'terrain', 'stance', 'grain']) assert.equal(full[f].length, 1);
});
