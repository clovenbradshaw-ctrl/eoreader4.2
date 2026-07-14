// EO: REC·EVA(Lens,Network → Network, Composing,Binding) — the repair agent
// Stage 3 of the roadmap (docs/eot-coder-roadmap.md): an agentic loop that consumes
// the checkpoint's TYPED errors as structured repair targets, keyed to Appendix B's
// fix column, with the two-revision cap and the honest veto.
//
// The asymmetry the loop exploits: a general agent's repair signal is a runtime
// traceback — post-hoc, distant, sometimes absent. Ours is a typed error with an
// ADDRESS, produced statically, scoped to one assembly. So the repair action space
// is small and each fix is mechanical:
//
//   terrain-mismatch    → add the surface's missing home terrains to the room
//   closure-violation   → recompute the app contract as the envelope of its parts
//   narrowing-violation → widen the container upward with a logged !REC
//   contract-violation  → widen this part's contract to admit the event (logged !REC)
//   grain-mixed         → re-align each incoherent event to a single grain
//   unassembled         → close the assembly with !EVA
//
// The rest — stance-violation, dependency, unknown-surface, desert-cell — cannot be
// mended without inventing an engagement, reordering across assemblies, or widening
// the trusted catalog. Those VETO: surfaced to the person as "this part cannot be
// built as asked, and here is exactly what failed." Never a silent degradation. The
// cap is two revisions, and it is the feature, not conservatism — resist raising it.

import { checkpoint } from './checkpoint.js';
import { contract, isContract } from '../core/index.js';
import { OPERATORS } from '../core/index.js';
import { terrainOf, stanceOf, grainOfTerrain, grainOfStance } from '../core/index.js';
import { CATALOG } from './catalog.js';

const asContract = (c) => (c == null ? null : isContract(c) ? c : contract(c));
const uniq = (xs) => [...new Set(xs)];

// Each strategy: (assembly, finding, context) → a revised assembly, or null when it
// cannot mend this defect (which pushes the assembly toward the veto). `rec` marks a
// deliberate widening — a logged !REC, attributable in the ledger (§Stage 4).
export const STRATEGIES = Object.freeze({
  'terrain-mismatch': { rec: false, apply: (a) => {
    const surf = CATALOG[a.surface]; if (!surf) return null;
    return { ...a, room: { ...(a.room ?? {}), terrains: uniq([...(a.room?.terrains ?? []), ...surf.home]) } };
  } },
  'closure-violation': { rec: false, apply: (a) => {
    const parts = (a.parts ?? []).map(asContract).filter(Boolean);
    if (!parts.length) return null;
    return { ...a, contract: {
      ops: uniq(parts.flatMap((p) => p.ops)),
      terrains: uniq(parts.flatMap((p) => p.terrains)),
      stances: uniq(parts.flatMap((p) => p.stances)),
    } };
  } },
  'narrowing-violation': { rec: true, apply: (a, _f, ctx) => {
    const cont = asContract(a.container ?? ctx?.container);
    const c = asContract(a.contract);
    if (!cont || !c) return null;
    const widened = { ops: uniq([...cont.ops, ...c.ops]), terrains: uniq([...cont.terrains, ...c.terrains]), stances: uniq([...cont.stances, ...c.stances]) };
    return { ...a, container: widened };
  } },
  'contract-violation': { rec: true, apply: (a) => {
    const c = asContract(a.contract); if (!c) return null;
    const ops = new Set(c.ops), terrains = new Set(c.terrains), stances = new Set(c.stances);
    for (const ev of a.events ?? []) { if (ev.op) ops.add(ev.op); if (ev.terrain) terrains.add(ev.terrain); if (ev.stance) stances.add(ev.stance); }
    return { ...a, contract: { ops: [...ops], terrains: [...terrains], stances: [...stances] } };
  } },
  'grain-mixed': { rec: false, apply: (a) => ({
    ...a,
    events: (a.events ?? []).map((ev) => {
      const o = OPERATORS[ev.op]; if (!o) return ev;
      const g = ev.grain ?? grainOfTerrain(ev.terrain) ?? grainOfStance(ev.stance) ?? 'Figure';
      const fixed = { ...ev };
      if (ev.terrain != null) fixed.terrain = terrainOf(o.domain, g);
      if (ev.stance != null) fixed.stance = stanceOf(o.mode, g);
      if (ev.grain != null) fixed.grain = g;
      return fixed;
    }),
  }) },
  'unassembled': { rec: false, apply: (a) => ({ ...a, closed: true }) },
});

// The errors a strategy exists for. Everything else is a veto by design.
export const REPAIRABLE = Object.freeze(Object.keys(STRATEGIES));

const makeVeto = (assembly, findings) => Object.freeze({
  assembly: assembly.id,
  findings: Object.freeze(findings.slice()),
  // legible to a non-EO-literate person: what failed, where, and the fix that did
  // not apply — never EO jargon alone.
  message: `part '${assembly.id}' cannot be built as asked:\n` +
    findings.map((f) => `  · ${f.error} at ${f.address} — ${f.fix}`).join('\n'),
});

// repair(assembly, context, { cap = 2, ledger }) →
//   { ok, assembly, revisions, veto }
// Strict scoping: only the assembly in hand is touched. Completed assemblies are
// never re-opened; downstream is never started. The cap is two, then veto.
export const repair = (assembly, context = {}, opts = {}) => {
  const cap = opts.cap ?? 2;
  const ledger = opts.ledger ?? null;
  let current = assembly;
  const revisions = [];

  for (let attempt = 0; attempt <= cap; attempt++) {
    const v = checkpoint(current, context);
    if (v.ok) return Object.freeze({ ok: true, assembly: current, revisions: Object.freeze(revisions), veto: null });

    const errorGrade = v.findings.filter((f) => f.severity === 'error');
    const applicable = errorGrade.filter((f) => STRATEGIES[f.error]);

    // out of revisions, or nothing here is repairable → veto, honestly.
    if (attempt === cap || applicable.length === 0) {
      const veto = makeVeto(current, errorGrade);
      ledger?.recordVeto?.(current.id, veto);
      return Object.freeze({ ok: false, assembly: current, revisions: Object.freeze(revisions), veto });
    }

    // one revision: apply every applicable strategy once, over the current assembly.
    let next = current;
    const applied = [];
    for (const f of applicable) {
      const strat = STRATEGIES[f.error];
      const res = strat.apply(next, f, context);
      if (res) {
        next = res;
        applied.push(f.error);
        ledger?.recordRepair?.(current.id, f, strat.rec ? '!REC' : `mend ${f.error}`);
      }
    }
    // no strategy actually changed anything → further attempts are futile; veto now.
    if (next === current) {
      const veto = makeVeto(current, errorGrade);
      ledger?.recordVeto?.(current.id, veto);
      return Object.freeze({ ok: false, assembly: current, revisions: Object.freeze(revisions), veto });
    }
    revisions.push(Object.freeze({ attempt: attempt + 1, applied: Object.freeze(applied), errors: Object.freeze(errorGrade.map((f) => f.error)) }));
    current = next;
  }

  // unreachable — the loop returns inside — but keep the shape total.
  return Object.freeze({ ok: false, assembly: current, revisions: Object.freeze(revisions), veto: makeVeto(current, checkpoint(current, context).findings) });
};
