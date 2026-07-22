// surfer/terrain.js — site typing by operators. siteTerrain stays a pure label function.
// siteTerrainAt's Network/Paradigm recurrence (cheap log-repetition checks) is covered by
// tests/terrain-recurrence.test.js; this file covers what this branch adds — Kind, via
// kinds.js's Born-rule entity clustering, the one Pattern cell the log's cheap repetition
// checks cannot shortcut (no membership-criterion edge exists at this layer).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { siteTerrain, siteTerrainAt, bondTerrain, arcTerrain } from '../src/surfer/terrain.js';
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

test('siteTerrainAt: an explicit recurrent override still wins over the Kind measurement', () => {
  const log = createLog({ docId: 'd' });
  log.append({ op: 'INS', id: 'a', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0, { recurrent: false }), 'Entity');
  assert.equal(siteTerrainAt(doc, 0, { recurrent: true }), 'Kind');
});

test('siteTerrainAt: an entity in a genuinely recurring behavioral class measures as Kind', () => {
  const log = createLog({ docId: 'd' });
  // Three classes, not two — a clean two-way split can (correctly) collapse to a single
  // populated cluster after mean-centering (kinds.test.js's own "not every entity collapses"
  // guard exists for exactly this), so the regression fixture needs the same three-class
  // shape kinds.test.js validates against, not a simpler one that happens to be degenerate.
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
  // an INS locus for one of the profiled entities — should measure Kind if that entity
  // belongs to a real (non-abstaining) recurring class.
  const firstInsIdx = log.snapshot().findIndex((e) => e.op === 'INS' && e.id === 'n1');
  const doc = { log, units: new Array(u).fill(0) };
  assert.equal(siteTerrainAt(doc, firstInsIdx), 'Kind');
});

test('siteTerrainAt: a flat entity population (no real behavioral distinction) stays Entity, not Kind', () => {
  const log = createLog({ docId: 'd' });
  const ids = ['x1', 'x2', 'x3', 'x4', 'x5'];
  let u = 0;
  for (let r = 0; r < 10; r++) for (const id of ids) { log.append({ op: 'INS', id, sentIdx: u }); u++; }
  const doc = { log, units: new Array(u).fill(0) };
  assert.equal(siteTerrainAt(doc, 0), 'Entity');
});

test('siteTerrainAt: a thin locus (no inscribed content) is Void, regardless of recurrence', () => {
  const log = createLog({ docId: 'd' });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Void');
});
