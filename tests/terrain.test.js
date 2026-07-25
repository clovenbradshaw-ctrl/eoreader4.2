// surfer/terrain.js — site typing by operators. siteTerrain stays a pure label function.
// siteTerrainAt's Network/Paradigm recurrence (cheap log-repetition checks) is covered by
// tests/terrain-recurrence.test.js.
// Three fixes applied:
//   1. Kind membership no longer overrides locus grain — stored on entity, not on terrain.
//   2. Field (Structure×Ground) detected when Structure ops present without specific CON bond.
//   3. Domain determined by specificity (most informative operator), not by count vote.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { siteTerrain, siteTerrainAt, bondTerrain, arcTerrain } from '../src/surfer/terrain.js';
import { detectKinds } from '../src/surfer/kinds.js';
import { OPS } from '../src/surfer/structure-basis.js';

test('siteTerrain: pure label function, unaffected by the recurrence wiring', () => {
  assert.equal(siteTerrain({ ops: ['INS'] }), 'Entity');
  assert.equal(siteTerrain({ ops: ['CON'] }), 'Link');
  assert.equal(siteTerrain({ ops: ['DEF'] }), 'Lens');
  assert.equal(siteTerrain({ ops: ['INS'], recurrent: true }), 'Kind');
  assert.equal(siteTerrain({ ops: ['CON'], recurrent: true }), 'Network');
  assert.equal(siteTerrain({ ops: ['DEF'], recurrent: true }), 'Paradigm');
  assert.equal(siteTerrain({ ops: [], thin: true }), 'Void');
  assert.equal(bondTerrain(), 'Link');
  assert.equal(arcTerrain(), 'Network');
});

test('siteTerrain: domain from specificity, not count — a single CON beats many INS', () => {
  // Before fix 3, 3 INS + 1 CON would vote Existence (count 3 vs 1).
  // Now CON determines Structure regardless of INS count.
  assert.equal(siteTerrain({ ops: ['INS', 'INS', 'INS', 'CON'] }), 'Link');
});

test('siteTerrain: a single DEF beats many INS for domain', () => {
  // Before fix 3, 5 INS + 1 DEF would vote Existence (count 5 vs 1).
  // Now DEF determines Interpretation regardless of INS count.
  assert.equal(siteTerrain({ ops: ['INS', 'INS', 'INS', 'INS', 'INS', 'DEF'] }), 'Lens');
});

test('siteTerrain: domain priority — CON beats SEG, DEF beats REC', () => {
  assert.equal(siteTerrain({ ops: ['SEG', 'CON'] }), 'Link');          // CON → Structure
  assert.equal(siteTerrain({ ops: ['REC', 'DEF'] }), 'Lens');          // DEF → Interpretation
  assert.equal(siteTerrain({ ops: ['NUL'] }), 'Entity');               // NUL → Existence, Figure grain
  assert.equal(siteTerrain({ ops: ['NUL'], thin: true }), 'Void');     // NUL + thin → Ground
});

test('siteTerrain: SEG without recurrence is Link (Figure), with recurrence is Network (Pattern)', () => {
  assert.equal(siteTerrain({ ops: ['SEG'] }), 'Link');                 // Figure grain (no recurrent flag)
  assert.equal(siteTerrain({ ops: ['SEG'], recurrent: true }), 'Network');  // Pattern grain
});

test('siteTerrainAt: a thin locus (no inscribed content) is Void, regardless of recurrence', () => {
  const log = createLog({ docId: 'd' });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Void');
});

test('siteTerrainAt: an explicit recurrent override still wins over the computed read', () => {
  const log = createLog({ docId: 'd' });
  log.append({ op: 'INS', id: 'a', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0, { recurrent: false }), 'Entity');
  assert.equal(siteTerrainAt(doc, 0, { recurrent: true }), 'Kind');
});

test('siteTerrainAt: an entity in a genuinely recurring behavioral class stays Entity at its locus', () => {
  // Fix 1: Kind membership no longer overrides locus grain.
  // An entity that belongs to a detected Kind cluster is still Entity (Figure grain)
  // at its own locus. Kind membership is stored on the entity referent, not on the terrain.
  const log = createLog({ docId: 'd' });
  const classes = {
    noticed: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
    bonded: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'],
    argued: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
  };
  const signature = { noticed: 'SIG', bonded: 'CON', argued: 'EVA' };
  let u = 0;
  for (const [cls, ids] of Object.entries(classes)) {
    for (const id of ids) {
      for (const op of OPS) {
        const reps = op === signature[cls] ? 10 : 1;
        for (let r = 0; r < reps; r++) { log.append({ op, id, sentIdx: u }); u++; }
      }
    }
  }

  // Entity 'n1' is a member of the 'noticed' class (SIG-dominant).
  // INS event for n1: domain=Existence, grain=Figure → Entity
  const firstInsIdx = log.snapshot().findIndex((e) => e.op === 'INS' && e.id === 'n1');
  const doc = { log, units: new Array(u).fill(0) };

  // Locus terrain: Entity (not Kind — Kind membership is no longer a grain override)
  assert.equal(siteTerrainAt(doc, firstInsIdx), 'Entity');

  // Kind membership: queryable via detectKinds, not via terrain
  const kinds = detectKinds(doc);
  assert.equal(kinds.abstain, false, 'must detect real behavioral classes');
  assert.ok(kinds.kindOf('n1') != null, 'n1 belongs to a detected Kind');
});

test('siteTerrainAt: a flat entity population (no real behavioral distinction) stays Entity, not Kind', () => {
  const log = createLog({ docId: 'd' });
  const ids = ['x1', 'x2', 'x3', 'x4', 'x5'];
  let u = 0;
  for (let r = 0; r < 10; r++) for (const id of ids) { log.append({ op: 'INS', id, sentIdx: u }); u++; }
  const doc = { log, units: new Array(u).fill(0) };
  assert.equal(siteTerrainAt(doc, 0), 'Entity');
});

test('siteTerrainAt: Field detected when Structure ops present without specific CON bond', () => {
  // Fix 2: Structure domain + no specific (src,tgt) CON bond → Ground grain → Field
  const log = createLog({ docId: 'd' });
  // SEG at this locus but no CON with specific (src,tgt) — ambient relational structure
  log.append({ op: 'SEG', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Field');
});

test('siteTerrainAt: SYN without CON bond is Field, not Network', () => {
  // Fix 2: SYN is Structure domain, no specific bond → Field
  const log = createLog({ docId: 'd' });
  log.append({ op: 'SYN', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Field');
});

test('siteTerrainAt: CON with specific bond is Link (not Field)', () => {
  // Having a specific (src,tgt) CON bond makes it Link, not Field
  const log = createLog({ docId: 'd' });
  log.append({ op: 'CON', id: 'bond', src: 'a', tgt: 'b', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Link');
});

test('siteTerrainAt: SEG + INS without CON is Field', () => {
  // SEG (Structure) + INS (Existence) — domain from SEG → Structure, no specific bond → Field
  const log = createLog({ docId: 'd' });
  log.append({ op: 'SEG', sentIdx: 0 });
  log.append({ op: 'INS', id: 'x', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Field');
});

test('siteTerrainAt: DEF + INS is Lens (not Entity)', () => {
  // Fix 3: DEF present → Interpretation domain, regardless of INS count
  const log = createLog({ docId: 'd' });
  log.append({ op: 'DEF', key: 'predicate', value: 'great', id: 'a', sentIdx: 0 });
  log.append({ op: 'INS', id: 'a', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Lens');
});
