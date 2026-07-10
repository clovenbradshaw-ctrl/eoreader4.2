// EO: SEG·REC·CON(Network,Lens → Link,Network, Dissecting·Tracing·Binding) — graduated sanctions + clean death
// metabolism/sanction.js — the escalation ladder with off-ramps, and death as a resource-returning
// event rather than a silent delete.
//
// select.js / population.js are BINARY: the fit persist, "the wasteful genome dies." Nothing real
// works that way. A neuron runs LTD → synaptic tag → microglial prune → apoptosis — an escalation
// with an off-ramp at every rung — and Ostrom's fieldwork found GRADUATED sanctions out-govern
// capital-first punishment. The forgiveness clause already lives in the system, but only at the
// SOCIAL layer (reputation.js). This lifts the same forgiveness up to the SELECTION layer: a failing
// unit is DEMOTED, then (if it has a body) SHEDS a limb — a rung only agents-with-organs have, and a
// real recovery move, since a shed organ returns its upkeep — then goes to PROBATION, and only then
// is CULLED. At every rung a recovery DE-ESCALATES it back toward ok. One bad famine season no longer
// ends a lineage.
//
// And death, when it does come, is CONTROLLED. In multicellularity apoptosis is COOPERATIVE: the cell
// returns its resources cleanly and does not trash the neighborhood — which is exactly why cancer's
// refusal-to-die is a commons violation. So a culled unit's remaining ration returns to the pool, its
// grown organs become standing variation the reservoir inherits, and its lineage is preserved, not
// dropped. A CON back to the commons, not a necrotic delete. Every transition is a logged, auditable
// event — the whole point is that no selection decision is silent.

// The ladder, ok → cull, each rung a heavier sanction with a path back. `shed` is only reachable by a
// unit that HAS a grown organ to shed; a bodiless unit skips it (demote → probation → cull).
export const RUNGS = Object.freeze(['ok', 'demote', 'shed', 'probation', 'cull']);
const rank = (r) => RUNGS.indexOf(r);

// createSanctionLadder — tracks each unit's rung. `assess(id, { failing, hasGrownOrgan })` escalates
// one rung on a failing period and de-escalates (FORGIVES) one rung on a recovering one. Deterministic,
// no RNG. `records()` is the append-only sanction log the audit reads.
export const createSanctionLadder = ({ shedNeedsBody = true } = {}) => {
  const state = new Map();   // id → { strikes, rung }
  const log = [];

  // the rung for a strike count, skipping `shed` when the unit has no body to shed.
  const rungFor = (strikes, hasBody) => {
    const seq = (shedNeedsBody && !hasBody) ? RUNGS.filter((r) => r !== 'shed') : RUNGS;
    return seq[Math.max(0, Math.min(seq.length - 1, strikes))];
  };

  const assess = (id, { failing = false, hasGrownOrgan = false, period = 0 } = {}) => {
    const s = state.get(id) || { strikes: 0, rung: 'ok' };
    const from = s.rung;
    s.strikes = Math.max(0, s.strikes + (failing ? 1 : -1));   // fail escalates; recover forgives
    s.rung = rungFor(s.strikes, hasGrownOrgan);
    state.set(id, s);
    const dir = rank(s.rung) - rank(from);
    const action = dir > 0 ? 'escalate' : dir < 0 ? 'forgive' : 'hold';
    const event = Object.freeze({
      op: dir < 0 ? 'REC' : dir > 0 ? 'SEG' : 'NUL', kind: 'sanction',
      id, from, rung: s.rung, action, strikes: s.strikes, period,
      note: `${id}: ${from} → ${s.rung} (${action})`,
    });
    if (dir !== 0) log.push(event);   // only transitions are events; a hold is not noise
    return Object.freeze({
      id, from, rung: s.rung, action, strikes: s.strikes, event,
      cull: s.rung === 'cull',        // the last rung — hand to controlledDeath, do not silently drop
      shed: s.rung === 'shed',        // shed a limb this period (a recovery move, not death)
      protected: s.rung !== 'cull',   // anything short of cull survives — the off-ramp
    });
  };

  return Object.freeze({
    assess,
    rungOf: (id) => (state.get(id)?.rung ?? 'ok'),
    forgive: (id) => { const s = state.get(id); if (s) { s.strikes = Math.max(0, s.strikes - 2); s.rung = rungFor(s.strikes, true); } return s?.rung ?? 'ok'; },
    reset: (id) => state.delete(id),
    records: () => log.slice(),
    ladder: RUNGS,
  });
};

// controlledDeath — the clean exit (apoptosis, not necrosis). Given a dying unit, produce the death
// record: the ration RETURNED to the pool, the grown organs RELEASED as standing variation the
// reservoir inherits, the lineage PRESERVED. DNA-only — cells and a genotype signature, never content.
// Pure; the population applies the returns and logs the event.
export const controlledDeath = ({ id, energy = 0, organs = [], genotype = null, cause = 'cull', period = 0 } = {}) => {
  const released = (organs || []).filter((o) => o && (o.origin ? o.origin !== 'founder' : true))
    .map((o) => Object.freeze({ kind: o.kind, cells: o.cells || o.cellKeys?.() || null }));
  const returned = Math.max(0, Number(energy) || 0);   // only a positive balance returns; a deficit returns nothing
  return Object.freeze({
    id, cause, period,
    energyReturned: round(returned),                   // → back to the shared pool (niche construction, not loss)
    organsReleased: Object.freeze(released),            // → the reservoir's standing variation
    lineage: genotype ? Object.freeze({ ...genotype }) : null,   // preserved, inherited-from, not dropped
    event: Object.freeze({ op: 'CON', kind: 'death', id, cause, period, returned: round(returned), released: released.length,
      note: `${id} died (${cause}) — returned ${round(returned)} to the pool, released ${released.length} organ${released.length === 1 ? '' : 's'}` }),
  });
};

const round = (x) => Math.round(x * 1000) / 1000;
