// EO: SEG·EVA·CON(Network,Lens → Network,Link, Dissecting·Tracing·Binding) — multi-level selection
// metabolism/demes.js — the accountant that makes enriching the commons PAY. Niche construction
// (commons.js) creates a positive externality: a contributor lowers everyone's future cost but
// bears the cost alone, so WITHIN any one group a free-rider that spends nothing on the commons
// out-competes it. Individual selection therefore erodes the very cooperation the ecosystem runs
// on — the parasite ecosystem, arrived at with no villain, just gradient.
//
// Multi-level selection (D.S. Wilson) internalizes the externality. Partition the population into
// DEMES — the CON(Pattern) nesting, a deme is a holon of organisms — and let a deme's PRODUCTIVITY
// (the commons its members built) weight its members' reproduction. A deme of contributors
// out-produces a deme of parasites, so contributors rise BETWEEN groups even as they lose WITHIN
// every one: altruism selected against in every deme is selected FOR in the population. That is
// not a paradox to explain away; it is Simpson's paradox, and it is the principled cure for the
// parasite — no moralizing, only the nested structure the faculty already commits to. Selfish
// genomes beat altruists within a group; altruist groups beat selfish groups.
//
// Pure and deterministic — no RNG, so a replayed log reproduces the same demographics.

// demeProductivity — the between-group signal: the commons a deme's members built (their total
// contribution). The externality, made a GROUP-LEVEL trait that selection can finally see.
export const demeProductivity = (deme) =>
  (deme && deme.members ? deme.members : []).reduce((s, m) => s + Math.max(0, Number(m.contribution) || 0), 0);

// multiLevelSelect — reproduction weights under two-level selection. `lambda` ∈ [0,1] is how much
// BETWEEN-deme productivity counts against WITHIN-deme individual fitness: 0 is pure individual
// selection (the free-rider wins — the tragedy), higher leans on the group's built commons. Each
// member's weight = individualFitness × (1 + lambda × demeShare × nDemes) — a boost that is
// mean-preserving when every deme is equally productive and tilts toward the demes that built
// more. Returns every member with its deme index and weight. Deterministic.
export const multiLevelSelect = (demes = [], { lambda = 0.5 } = {}) => {
  const prods = demes.map(demeProductivity);
  const totalProd = prods.reduce((s, p) => s + p, 0);
  const n = demes.length || 1;
  const out = [];
  demes.forEach((deme, di) => {
    const share = totalProd > 0 ? prods[di] / totalProd : 1 / n;    // this deme's share of all commons built
    const groupBoost = 1 + lambda * share * n;                       // >1 for productive demes, <1+lambda for poor ones
    for (const m of (deme.members || [])) {
      const fit = Math.max(0, Number(m.individualFitness) || 0);
      out.push(Object.freeze({ ...m, deme: di, weight: round(fit * groupBoost) }));
    }
  });
  return Object.freeze(out);
};

// traitFrequency — the frequency of a trait (by predicate) in the selection-weighted next
// generation. This is where Simpson's paradox shows: a trait can FALL in frequency within every
// deme yet RISE here, because contributor-heavy demes reproduce more as whole groups.
export const traitFrequency = (weighted = [], predicate = () => false) => {
  let num = 0, den = 0;
  for (const m of weighted) { den += m.weight; if (predicate(m)) num += m.weight; }
  return den > 0 ? round(num / den) : 0;
};

// partition — split a flat population into `k` demes deterministically (round-robin by index, so
// no RNG). A convenience for wiring the ecology's organisms into groups the between-level sees.
export const partition = (members = [], k = 2) => {
  const kk = Math.max(1, k | 0);
  const demes = Array.from({ length: kk }, () => ({ members: [] }));
  members.forEach((m, i) => demes[i % kk].members.push(m));
  return demes;
};

const round = (x) => Math.round(x * 1000) / 1000;
