// EO: NUL·DEF(Network → Lens, Dissecting,Clearing) — typed NUL for causal edge
// Typed NUL for a causal edge — the three absences that must never collapse.
//
// "Is there evidence that X causes Y" has, when the answer is no, THREE different noes, and
// collapsing them is precisely where causal bullshit breeds — the Frankfurt move at the level
// of evidence, and Codd's NULL all over again:
//
//   • not-looked    — no reading in the corpus examined X→Y at all. The corpus is SILENT.
//                     (INS never fired on this edge.)
//   • looked-null    — a reading found X and Y examined together and the effect measured NULL
//                     (a source asserted "no effect", "no association", polarity '−'). A
//                     positive claim of absence.
//   • no-null-found  — the corpus looked at X→Y and read an effect asserted, but NO reading
//                     found a null. The absence of a null finding — which is NOT the same as a
//                     measured null, and NOT the same as silence.
//
// And the fourth, the presence:
//   • has-claim     — at least one reading proposes an effect (polarity '+').
//
// The naive collapse treats all three noes as "no evidence of effect", which reads a silent
// corpus and a measured null as the same thing. They are three different NULs; this keeps
// them apart. (docs/nul-hold-the-uncohered.md: NUL is "seen, unresolved" — held, never erased.)

export const ABSENCE = Object.freeze({
  HAS_CLAIM: 'has-claim',
  LOOKED_NULL: 'looked-null',
  NO_NULL_FOUND: 'no-null-found',
  NOT_LOOKED: 'not-looked',
});

// Classify the corpus's stance on the edge from → to, given the built edge set. `edges` is
// the asserted-DAG edge list (each with .from, .to, .claims). Returns the ABSENCE type plus
// the witnessing claims, so even a NUL is sourced (a not-looked cites nothing, honestly).
export const classifyAbsence = (edges, from, to) => {
  const e = edges.find((x) => x.from === from && x.to === to);
  if (!e || !e.claims.length) {
    return Object.freeze({ type: ABSENCE.NOT_LOOKED, from, to, claims: Object.freeze([]),
      note: `No reading in the corpus examines ${from}→${to}. The corpus is silent — this is NOT a null result.` });
  }
  const positive = e.claims.filter((c) => c.polarity === '+');
  const nulls = e.claims.filter((c) => c.polarity === '−');
  if (positive.length) {
    return Object.freeze({ type: ABSENCE.HAS_CLAIM, from, to,
      claims: Object.freeze(positive.map((c) => c.src)),
      note: `At least one reading proposes an effect ${from}→${to}.` });
  }
  // Only null claims present → the effect was looked at and measured null.
  return Object.freeze({ type: ABSENCE.LOOKED_NULL, from, to,
    claims: Object.freeze(nulls.map((c) => c.src)),
    note: `A reading found ${from}→${to} examined and the effect measured null — a positive claim of absence, not silence.` });
};

// The corpus-wide census: for every ORDERED node pair, which of the four holds. Callers use
// it to answer "what did the corpus NOT find, and in which of the three ways" without ever
// collapsing silence, a measured null, and a missing null into one "no". `no-null-found` is
// computed here: an edge with positive claims but where the REVERSE or a sibling never
// contributed a null is not itself no-null-found — that type describes a QUERIED edge the
// corpus looked at and asserted an effect for, with no null anywhere among its claims.
export const absenceCensus = (edges, nodes) => {
  const keys = nodes.map((n) => n.key);
  const out = [];
  for (const a of keys) for (const b of keys) {
    if (a === b) continue;
    const cls = classifyAbsence(edges, a, b);
    // Refine has-claim: if the edge was looked at, has an effect asserted, and no null was
    // ever recorded among its claims, that is the distinct "no null was found" state — worth
    // surfacing separately from a bare positive when a reader asks "did anyone find no effect?"
    if (cls.type === ABSENCE.HAS_CLAIM) {
      const e = edges.find((x) => x.from === a && x.to === b);
      const anyNull = e.claims.some((c) => c.polarity === '−');
      out.push(anyNull ? cls : Object.freeze({ ...cls, noNullFound: true }));
    } else {
      out.push(cls);
    }
  }
  return Object.freeze(out);
};
