// EO: EVA(Network, Tracing) — the greatest-fixpoint check on an irreducible core
// A cycle that survives refold.js (a real, declaration-grain circle, not a file-
// boundary artifact) is not automatically a defect. `isEven` calling `isOdd` calling
// `isEven` is a strongly-connected pair too, and it is fine — GENUINE mutual
// recursion, each side grounded by something outside the pair (a base case). What is
// NOT fine is A-because-B-because-A with nothing else backing either claim: a pure
// definitional circle, offering no content, that a naive "no order exists" reading
// cannot tell apart from the legitimate case.
//
// THE CONCRETE CHECK (documented, not hidden, because the distinction is intentionally
// open to engineering judgment — see Assembly 3 of docs/logic-gaps.md): this codebase's
// event graph does not carry a decreasing measure or a base-case marker, so the
// signal available to read is EXTERNAL GROUNDING — does the strongly-connected set,
// as a whole, touch anything OUTSIDE itself? `isEven`/`isOdd` in real code eventually
// bottom out at a literal or an externally-defined predicate; a pure circularity
// touches nothing but its own members, forever.
//
// This is the coinductive GREATEST FIXPOINT read concretely: start by assuming every
// member of the scc is COHERENT (the top of the lattice — "innocent until it cannot
// be grounded"), and the assumption survives for the whole set the moment ANY member
// has a witness reaching outside the set — that witness is the BISIMULATION: the
// external anchor every member can be shown consistent against, directly or through
// its within-set neighbors. If NO member ever reaches outside the set, there is
// nothing to ground the assumption against and the greatest fixpoint collapses to
// the empty set — every member is a BREACH, because none of their relations can be
// jointly satisfied by anything but each other.
//
// coherenceOf(events, scc) → { verdict, witness, breach }
//   scc       the (irreducible) strongly-connected member set — module signs
//             ('mod:…', from helix.js) or declaration signs ('dcl:…', from
//             refold.js's irreducibleCore) both work; the edge reader below is
//             chosen by which shape `scc` carries.
//   verdict   'coherent' | 'incoherent'
//   witness   coherent only: Map<member, externalAnchor> — the external node that
//             grounds each member (directly, or via its within-scc neighbors) —
//             the bisimulation the members are jointly consistent against.
//   breach    incoherent only: the member set — none has an external witness, so
//             none of their mutual justification is jointly satisfiable.

import { moduleGraphOf } from './helix.js';
import { declGraphOf } from './refold.js';

const isModuleSign = (s) => String(s).startsWith('mod:');

export const coherenceOf = (events, scc) => {
  const members = [...new Set(scc)];
  if (members.length === 0) return Object.freeze({ verdict: 'coherent', witness: new Map(), breach: null });

  const edgesOf = isModuleSign(members[0])
    ? moduleGraphOf(events).edgesOf
    : (m) => declGraphOf(events, members).get(m) ?? new Set();

  const memberSet = new Set(members);
  const externalTargets = new Map();   // member -> first external target it directly reaches
  for (const m of members) {
    for (const t of edgesOf(m)) if (!memberSet.has(t)) { externalTargets.set(m, t); break; }
  }

  if (externalTargets.size === 0) {
    // nothing in the whole strongly-connected set ever touches anything outside it —
    // the greatest fixpoint is empty. Every member is a breach: A-because-B-because-A.
    return Object.freeze({ verdict: 'incoherent', witness: null, breach: members });
  }

  // propagate the external anchor to the rest of the set — BFS over the within-scc
  // edges, seeded from the members with a direct external witness — so a member two
  // hops from the anchor still reads as grounded THROUGH its neighbor (the
  // bisimulation: consistent with the anchor by way of the chain that reaches it).
  const witness = new Map(externalTargets);
  let frontier = [...witness.keys()];
  while (frontier.length) {
    const next = [];
    for (const m of frontier) {
      for (const t of edgesOf(m)) {
        if (memberSet.has(t) && !witness.has(t)) { witness.set(t, witness.get(m)); next.push(t); }
      }
    }
    frontier = next;
  }
  // any member the BFS never reached (grounded members exist, but this one's within-scc
  // neighbors never lead to one) is still ungrounded on its own — but the verdict is
  // read at the scc grain (the spec's coinductive check is on the SET, not per-member):
  // the set is coherent because a witness for it exists, full stop. Ungrounded stragglers
  // are visible in `witness` (absent) for a caller that wants the finer read.
  return Object.freeze({ verdict: 'coherent', witness, breach: null });
};
