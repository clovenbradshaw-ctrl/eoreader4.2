// EO: EVA(Lens → Lens, Binding,Tending) — a grammar rule held & tested (the write-side EVA)
// A grammar rule, held and tested — the write-side twin of the conventions ledger's EVA.
//
// Every grammar rule is a CONVENTION, not a hard transform: it is applied speculatively, its
// output is read back, and it commits only while it keeps earning its place. A hold (the
// read-back recovered the intent) relaxes strain; a break (the read-back would mislead)
// accrues it; when strain overtakes support the rule is DEFEATED and TOGGLES OFF — the
// generator falls back to the safe surface (a name instead of a pronoun, separate sentences
// instead of a compound). A later run of holds relaxes strain and the rule comes back on.
// Same shape as the coref gender ledger, so all grammar is governed alike.

export const createRule = ({ support = 1 } = {}) => {
  let s = Math.max(1, support), strain = 0;
  return {
    get on() { return strain <= s; },        // not yet defeated
    hold() { if (strain > 0) strain -= 1; else s += 1; },
    break() { strain += 1; },
    get state() { return { support: s, strain, on: strain <= s }; },
  };
};
