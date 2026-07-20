// surfer/terrain.js — site typing by operators. siteTerrain stays a pure label function;
// siteTerrainAt now MEASURES recurrence (Kind via kinds.js, Network via holons.js) instead
// of defaulting every Pattern-grain cell to false forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLog } from '../src/core/log.js';
import { siteTerrain, siteTerrainAt, bondTerrain, arcTerrain } from '../src/surfer/terrain.js';
import { OPS } from '../src/surfer/structure-basis.js';

test('siteTerrain: pure label function, unchanged by the measurement wiring', () => {
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

test('siteTerrainAt: an explicit recurrent override bypasses measurement', () => {
  const log = createLog({ docId: 'd' });
  log.append({ op: 'CON', src: 'a', tgt: 'b', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0, { recurrent: false }), 'Link');
  assert.equal(siteTerrainAt(doc, 0, { recurrent: true }), 'Network');
});

test('siteTerrainAt: a lone bond with no document-wide holonic structure reads as a Link, not a Network', () => {
  const log = createLog({ docId: 'd' });
  log.append({ op: 'CON', src: 'a', tgt: 'b', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Link', 'one bond, one cast, no real multi-holon split — the honest default');
});

test('siteTerrainAt: a genuinely recurring bond structure measures as Network', () => {
  const log = createLog({ docId: 'd' });
  const castA = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const castB = ['b1', 'b2', 'b3', 'b4', 'b5'];
  let u = 0;
  for (let r = 0; r < 15; r++) { for (const id of castA) log.append({ op: 'INS', id, sentIdx: u }); u++; }
  for (let r = 0; r < 15; r++) { for (const id of castB) log.append({ op: 'INS', id, sentIdx: u }); u++; }
  // a CON bond sitting inside the clean two-cast document — its locus should now measure
  // as Network (a real holonic partition exists) rather than defaulting to a bare Link.
  log.append({ op: 'CON', src: 'a1', tgt: 'a2', sentIdx: 5 });
  const doc = { log, units: new Array(u).fill(0) };
  assert.equal(siteTerrainAt(doc, 5), 'Network');
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

test('siteTerrainAt: the Interpretation row holds at Lens — Paradigm needs a meaning prior this reader does not have', () => {
  const log = createLog({ docId: 'd' });
  log.append({ op: 'INS', id: 'x', sentIdx: 0 });   // inscribed content, so grain is not Ground
  log.append({ op: 'REC', id: 'x', sentIdx: 0 });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Lens', 'no synchronous measurement claims Paradigm off the log alone');
});

test('siteTerrainAt: a thin locus (no inscribed content) is Void, regardless of recurrence', () => {
  const log = createLog({ docId: 'd' });
  const doc = { log, units: [0] };
  assert.equal(siteTerrainAt(doc, 0), 'Void');
});
