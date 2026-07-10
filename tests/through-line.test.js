import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSanctionLadder, controlledDeath, RUNGS, createHomeostat } from '../src/metabolism/index.js';

// The metabolism through-line (sanction.js + homeostat.js): the analysis found select.js/population.js
// jump straight to death and hold the population off neither wall. These are the three-as-one fix —
// a graduated ladder with a path back (1), a clean resource-returning death (2), and a diversity
// homeostat that keeps the population near criticality (3). Each transition is a logged event, so the
// selection is fully auditable — never silent. Named falsifiers.

test('sanctions: a failing unit is graduated (demote → shed → probation → cull), with a path back', () => {
  const L = createSanctionLadder();
  let r;
  for (let i = 0; i < 4; i++) r = L.assess('a', { failing: true, hasGrownOrgan: true });
  assert.equal(r.rung, 'cull', 'sustained failure walks the whole ladder to cull');
  assert.deepEqual(RUNGS, ['ok', 'demote', 'shed', 'probation', 'cull'], 'the rungs escalate with an off-ramp at each');
  // one good period FORGIVES — a rung back, not death. One bad famine no longer ends a lineage.
  const back = L.assess('a', { failing: false, hasGrownOrgan: true });
  assert.equal(back.action, 'forgive');
  assert.equal(back.rung, 'probation', 'recovery de-escalates — the path back Ostrom found governs better');
  // every transition is a logged, auditable event.
  assert.ok(L.records().length >= 4, 'each rung change is recorded — no silent sanction');
});

test('sanctions: the `shed a limb` rung exists only for a unit with a body to shed', () => {
  const bodied = createSanctionLadder();
  let r; for (let i = 0; i < 2; i++) r = bodied.assess('a', { failing: true, hasGrownOrgan: true });
  assert.equal(r.rung, 'shed', 'an agent with a grown organ sheds a limb before quarantine — a real recovery move');
  const bodiless = createSanctionLadder();
  let r2; for (let i = 0; i < 2; i++) r2 = bodiless.assess('b', { failing: true, hasGrownOrgan: false });
  assert.equal(r2.rung, 'probation', 'a bodiless unit skips shed — you cannot shed what you do not have');
});

test('death: controlled, not necrotic — the ration returns, grown organs are released, lineage kept', () => {
  const d = controlledDeath({
    id: 'x', energy: 6.4, cause: 'cull', period: 9,
    organs: [{ kind: 'void-keeper', origin: 'grown', cells: ['NUL_Clearing_Void'] }, { kind: 'sense', origin: 'founder' }],
    genotype: { modelGate: 0.5, soma: {} },
  });
  assert.equal(d.energyReturned, 6.4, 'the remaining ration returns to the pool — niche construction, not loss');
  assert.equal(d.organsReleased.length, 1, 'grown organs become standing variation (the founder is not "released")');
  assert.ok(d.lineage && d.lineage.modelGate === 0.5, 'the lineage is preserved, inherited-from, not dropped');
  assert.equal(d.event.op, 'CON', 'death is a CON back to the commons — a logged, auditable event');
  // a unit that died in deficit returns nothing (you cannot give back what you overspent).
  assert.equal(controlledDeath({ id: 'y', energy: -3 }).energyReturned, 0);
});

test('homeostat: it holds diversity in a critical band — relaxes when freezing, tightens when churning', () => {
  const H = createHomeostat({ target: 0.15, band: 0.05, minPressure: 0.35 });
  const frozen = H.observe(0.02);
  assert.equal(frozen.band, 'freezing');
  assert.ok(frozen.pressure <= 0.5 && frozen.reservoir > 2, 'monoculture → relax selection AND widen the reservoir to protect standing variation');
  const churn = H.observe(0.5);
  assert.equal(churn.band, 'churning');
  assert.equal(churn.pressure, 1, 'runaway diversity → tighten selection to the ceiling');
  const crit = H.observe(0.15);
  assert.ok(crit.inBand && crit.band === 'critical', 'inside the band it reports critical — the productive operating point');
  assert.ok(H.records().length >= 2, 'band transitions are logged — the governor is auditable');
});
