// EO: SYN·CON·EVA·REC(Network,Lens → Lens,Network, Composing,Binding,Tracing) — the pipeline
// The coder's mouth: the whole watchmaker loop of docs/eot-coder-roadmap.md, closed
// on itself. Given a sequence of INTENTS (a model's structured proposal — the one
// arrow that needs a model, kept a named seam), it emits each assembly through the
// mask, checkpoints it, repairs the typed errors within the cap, threads what each
// set-down leaves behind, and records the whole assembly to a signed ledger that
// renders a human-readable build report.
//
//   intents (model)
//     │  constrainedEmit — the mask disposes what the model proposed   (Stage 1)
//     ▼
//   assemblies      grain/desert/contract-clean by construction
//     │  checkpoint — the remaining typed errors, with addresses        (§4)
//     ▼
//   verdicts        + repair — typed errors consumed, cap 2, else veto  (Stage 3)
//     │  ledger — every emission, verdict, widening, veto, signed        (Stage 4)
//     ▼
//   build report    a skeptical outsider can read it and check the chain
//
// Interruptible by construction (§1, the watchmaker property): each intent is a
// set-down; stopping after any one leaves the assemblies built so far valid,
// provisioned, and recorded. Downstream is never started early.

import { constrainedEmit } from './emit.js';
import { checkpoint } from './checkpoint.js';
import { repair } from './repair.js';
import { createBuildLedger } from './ledger.js';
import { CATALOG } from './catalog.js';

// build(intents, context?, opts?) → { ok, assemblies, vetoes, ledger, report }
// context = { catalog?, instances?, rooms? }
// opts    = { cap?, ledger?, now? }
export const build = (intents, context = {}, opts = {}) => {
  const ledger = opts.ledger ?? createBuildLedger({ now: opts.now });
  const cap = opts.cap ?? 2;
  const catalog = context.catalog ?? CATALOG;
  const instances = new Set(context.instances ?? []);
  const rooms = new Set(context.rooms ?? []);

  const assemblies = [];
  const vetoes = [];
  let ok = true;

  for (const intent of intents ?? []) {
    // Stage 1 — the model proposes, the mask disposes.
    const { assembly, emissions } = constrainedEmit(intent, { instances, rooms });
    ledger.recordOpen(assembly);
    for (const ev of assembly.events) ledger.recordEmission(assembly.id, ev);
    for (const d of emissions) ledger.recordDivergence(assembly.id, d);

    const ctx = { catalog, instances, rooms };

    // §4 + Stage 3 — checkpoint, then repair the typed errors within the cap.
    const rep = repair(assembly, ctx, { cap, ledger });
    ledger.recordVerdict(assembly.id, checkpoint(rep.assembly, ctx));

    assemblies.push(rep.assembly);
    if (!rep.ok) {
      ok = false;
      vetoes.push(rep.veto);
      // a vetoed set-down does not provision downstream (its instances/rooms are
      // NOT threaded) — the honest boundary, not a silent partial build.
      continue;
    }
    // thread what this valid set-down leaves behind (the helix, operational).
    for (const ev of rep.assembly.events) if ((ev.op === 'INS' || ev.op === 'SIG') && ev.id != null) instances.add(ev.id);
    if (rep.assembly.kind === 'room' && rep.assembly.id != null) rooms.add(rep.assembly.id);
  }

  return Object.freeze({
    ok,
    assemblies: Object.freeze(assemblies),
    vetoes: Object.freeze(vetoes),
    ledger,
    report: ledger.buildReport(),
    provisioned: Object.freeze({ instances: [...instances], rooms: [...rooms] }),
  });
};
