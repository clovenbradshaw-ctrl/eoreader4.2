// EO: EVA·DEF(Network → Void, Binding,Dissecting) — register firewall; single-register guard
// The register firewall — the structural separation of the two loops (§2, §10).
//
// An enacted event is tagged `register: 'enacted'`; a depicted perception is
// tagged `kind: 'phasepost'` (classify/perceptionDeposit). The two are never
// conflated in one log: the enacted loop's temporal chain is its own register,
// content lives in another, and a depicted REC in the story never triggers an
// enacted REC in the reading (§10) — structurally, because the enacted loop is
// driven by mechanical surprise and has no channel through which a phasepost
// deposit could reach it. The tag is not a flag to remember; it is the witness, the
// same way a span-witnessed event is structurally uncitable as conversation.

export const isEnacted  = (e) => e?.register === 'enacted';
export const isDepicted = (e) => e?.kind === 'phasepost';

// Guard that a log is single-register. An enacted chain must carry no depicted
// perception, and a depicted register no enacted act. Generation order is
// constitutive for the enacted loop (§8) — set, then a run of tests, then a break
// — and mixing a timeless, recomputable perception into that temporal chain
// destroys exactly the order being read. Asserted wherever the two could meet.
export const assertSingleRegister = (events, register = 'enacted') => {
  const ok = register === 'enacted' ? isEnacted : isDepicted;
  for (const e of events) {
    if (!ok(e)) {
      const foreign = e?.register || e?.kind || 'foreign';
      throw new Error(`register mix: a '${register}' log carries a '${foreign}' event (§2, §10)`);
    }
  }
  return true;
};
