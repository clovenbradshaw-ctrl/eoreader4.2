// EO: EVA·SIG(Network,Paradigm → Atmosphere,Lens, Tracing,Binding) — run audit + diagnose
// audit — a self-contained, exportable record of a generation run, and a diagnosis of
// whether it is working. `exportAudit(result)` turns a runContinuation result into a JSON
// artifact carrying the full causal chain per atom (the address, the decision internals, the
// field read, the floor verdict); `diagnose(audit)` runs the health checks and returns a
// plain verdict. Export the JSON, hand it back, and the checks say what fired and what did
// not — no need to re-run to tell if it is working.

import { trajectoryFromDoc, scoreTrajectory } from '../../surfer/flow/index.js';

const r3 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

// The FLOW REPORT for a finished piece (src/flow). Given the flow prior and the
// re-parsed doc of the whole draft, score its trajectory against the corpus and
// return a compact report to ship beside diagnose(). A structural read of the
// artifact — how it moved — not a health gate. Off by default: no prior/doc ⇒ null.
const flowReport = (flow) => {
  if (!flow) return null;
  if (typeof flow.flowScore === 'number') return flow;          // already-scored report
  if (!flow.prior || !flow.doc) return null;
  const { steps, pos } = trajectoryFromDoc(flow.doc, flow.segment || { segment: 'sections' });
  const r = scoreTrajectory(flow.prior, steps, pos);
  return {
    flowScore: r.flowScore, flowPercentile: r.flowPercentile,
    meanResidual: r.meanResidual, meanArcAdherence: r.meanArcAdherence,
    lurches: r.steps.filter((s) => s.deltaPercentile >= 90).map((s) => s.step),
    offManifold: r.steps.filter((s) => s.residualPercentile >= 95).map((s) => s.step),
  };
};

// Assemble the exportable audit from a runContinuation result. Everything needed to tell if
// the run worked, self-contained and serialisable (no functions, no cycles).
export const exportAudit = (result = {}, { config = {}, label = '', question = '', flow = null } = {}) => {
  const units = result.units || [];
  const trace = result.trace || [];
  const appends = trace.filter((t) => t.kind === 'append');

  // per-atom: the surface + WHY it was chosen (the decision) + how it was judged (the floor).
  const atoms = units.map((u, i) => {
    const a = appends.find((t) => t.move === u.move && t.step != null) || appends[i] || {};
    return {
      i: u.i ?? i,
      move: u.move,
      drew: u.drew ?? null,
      selfOp: !!u.selfOp,
      band: u.band ?? null,
      stance: u.stance ?? null,
      action: u.action ?? null,
      text: u.text ?? '',
      sources: u.sources ?? [],
      boundFraction: r3(u.boundFraction),
      vetoes: (u.vetoes || []).length,
      // the coordinate (holonic-token-confinement) — the GPS the token was confined to
      confinement: u.confinement ? {
        register: u.confinement.register,
        forbidClose: u.confinement.forbidClose,
        openness: u.confinement.openness,
        address: u.confinement.address,
        floorOn: !!(u.confinement.floor?.voidNumerals && u.confinement.floor?.voidEntities),
      } : null,
      // the decision (decision-as-relaxation OR the readout posterior) — WHY this move
      decision: a.dynamics
        ? { by: 'relaxation', winner: a.dynamics.winner, occupancy: r3(a.dynamics.occupancy), activations: a.dynamics.activations, currents: a.dynamics.currents }
        : (a.posterior ? { by: 'readout', posterior: a.posterior, sharpness: r3(a.sharpness) } : null),
      // the field read (generation-by-field-reading) — where the field turned
      field: a.field || null,
      phase: a.phase ?? null,
    };
  });

  // the field boundary trajectory over the whole run (the turns the field found)
  const lastField = [...trace].reverse().find((t) => t.field)?.field || null;

  const audit = {
    version: 1,
    label,
    question,
    config: {
      arc: !!config.arc, selfRegister: !!config.selfRegister, semanticStrain: !!config.semanticStrain,
      fieldRead: !!config.fieldRead, interleave: !!config.interleave, dynamics: !!config.dynamics,
      confine: !!config.confine, temperature: config.temperature ?? 0,
    },
    summary: {
      atoms: units.length,
      stop: result.stop ?? null,
      moves: units.map((u) => u.move),
      sources: result.sources ?? [],
      wantedType: result.wantedType ?? null,
      fieldBoundaries: lastField?.boundaries ?? [],
      fieldK: lastField?.k ?? null,
    },
    atoms,
    // the raw trace kinds, so a reader can see drops / develop-self / land-close / quiesce paths
    traceKinds: trace.map((t) => t.kind),
    answer: result.answer ?? '',
  };
  audit.checks = diagnose(audit);
  const fr = flowReport(flow);
  if (fr) audit.flow = fr;   // the whole-piece flow report, beside the health checks
  return audit;
};

// The health checks — what a working run must show, read off the audit alone. Each is a
// boolean with a one-line why, plus an overall `working` and a short verdict string.
export const diagnose = (audit = {}) => {
  const a = audit.atoms || [];
  const s = audit.summary || {};
  const cfg = audit.config || {};
  const moves = s.moves || [];
  const NODE = new Set(['DEF', 'INS', 'CON', 'SIG']);
  const EDGE = new Set(['EVA', 'REC', 'SYN', 'NUL']);

  // HONEST TERMINALS — a NUL (held uncohered ground) or a refusal (unanswerable type) is a
  // correct outcome, not a broken walk: the walk checks (opens/develops/lands) do not apply.
  // The right thing to verify is that it did NOT confabulate — it cited nothing it could not
  // ground and produced the honest hold/refusal. Report WORKING with the terminal named.
  if (s.stop === 'nul-uncohered' || s.stop === 'unanswerable') {
    const held = s.stop === 'nul-uncohered' ? 'held the uncohered ground (NUL)' : 'refused an unanswerable type (VOID)';
    const clean = a.every((x) => (x.sources || []).length === 0);   // an honest terminal cites nothing
    return {
      honest_terminal: { ok: true, why: `${held}: ${moves.join(' ') || '—'}` },
      cited_nothing_ungrounded: { ok: clean, why: clean ? 'the hold/refusal asserts and cites nothing' : 'a terminal atom cited a source it should not have' },
      working: clean,
      verdict: clean
        ? `WORKING (honest terminal) — ${held}, did not confabulate a shape the ground cannot earn`
        : `NOT WORKING — an honest terminal that still cited ungrounded material`,
    };
  }

  const has = (m) => moves.includes(m);
  const everyAtomGrounded = a.length > 0 && a.every((x) => (x.sources || []).length > 0 || x.band === 'void' || x.selfOp);
  const decisionTraced = a.length > 0 && a.every((x) => x.decision != null);
  const floorOn = !cfg.confine || a.every((x) => x.confinement?.floorOn);
  const stopsOnOwn = ['arc-closed', 'quiesce', 'quiesce-flat', 'quiesce-spent', 'saturated', 'unanswerable', 'drift'].includes(s.stop);

  const checks = {
    stops_on_own:     { ok: stopsOnOwn, why: `stop = '${s.stop}' (a token count would be 'max-steps')` },
    opens:            { ok: a.length > 0 && NODE.has(moves[0]), why: `first move '${moves[0]}' sets terms (a node op)` },
    develops:         { ok: moves.some((m) => EDGE.has(m)), why: `${moves.filter((m) => EDGE.has(m)).length} self-operations (the essay's substance)` },
    turns:            { ok: has('REC'), why: has('REC') ? `a REC fired where the field rotated (boundaries ${JSON.stringify(s.fieldBoundaries)})` : 'no REC — no turn realized' },
    lands:            { ok: s.stop === 'arc-closed' || moves[moves.length - 1] === 'SYN', why: `ends on '${moves[moves.length - 1]}' / stop '${s.stop}'` },
    grounded:         { ok: everyAtomGrounded, why: 'every atom is witnessed (sources, or a void/self-op)' },
    floor_on:         { ok: floorOn, why: cfg.confine ? 'the void floor is on for every atom' : 'confine off — floor not recorded' },
    decision_traced:  { ok: decisionTraced, why: `every atom carries WHY it was chosen (${a[0]?.decision?.by || 'none'})` },
  };

  // The core: it must stop on its own, open, develop, stay grounded, and trace its decisions.
  // turns/lands are quality signals, not gates (a thin field honestly makes a thin shape).
  const coreOk = checks.stops_on_own.ok && checks.opens.ok && checks.develops.ok && checks.grounded.ok && checks.decision_traced.ok && checks.floor_on.ok;
  const quality = [checks.turns.ok, checks.lands.ok].filter(Boolean).length;

  return {
    ...checks,
    working: coreOk,
    verdict: coreOk
      ? `WORKING — opens, develops, ${checks.grounded.ok ? 'grounded' : 'UNGROUNDED'}, stops on '${s.stop}'; quality ${quality}/2 (turn ${checks.turns.ok ? '✓' : '✗'}, land ${checks.lands.ok ? '✓' : '✗'})`
      : `NOT WORKING — failed: ${Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k).join(', ')}`,
  };
};
