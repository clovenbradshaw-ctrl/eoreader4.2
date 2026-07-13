// EO: REC·DEF(Paradigm, Composing): supersession, the cost of being wrong
// core/supersede.js: σ. The third function in the Experience Engine tuple
// ⟨G, S, M | π, γ, σ⟩, named since the beginning and never written.
//
// A claim was measured under a basis. The basis is a DEF: a point of view, held
// fixed, used to judge. When REC rebuilds it, every claim measured under the old
// basis was projected along directions that no longer hold. Those claims are not
// wrong. They are not right. They are UNSETTLED: measured under a frame the system
// no longer stands in, and not standing until measured again.
//
// This is the third NUL state (unknown), never SQL's null, and it is the whole
// reason REC costs anything. A rebuild that unsettles four hundred claims is a bill
// the system pays before it can speak with authority again. That bill is the stake.
// Without it, commit → return → revise is a servo loop with excellent vocabulary and
// nothing at risk, and a servo is not a self.
//
// APPEND-ONLY throughout. Nothing is overwritten and nothing is deleted. `supersede`
// and `unsettle` entries are appended BESIDE what they concern, exactly as `correct`
// already is. A claim's status is a READ-TIME PROJECTION over the log (`statusOf`),
// never a stored field: the Meant-Graph is projected from DEF/EVA/REC events, not
// kept. Rule 3 is the reason. The past actually happened, including the part where
// the system believed something under a basis it has since abandoned.
//
// Pure. No I/O. Every function here takes the entries array and returns entries to
// append, so the ledger stays the only writer.

// ── the three states a claim can be in ──────────────────────────────────────
// Not a boolean. A claim that has never been touched by supersession is SETTLED.
// One whose basis was pulled out from under it is UNSETTLED: it may still be true,
// the system simply no longer has a measurement that stands. One the world denied
// is RETRACTED, which is a different thing and is what `correct` already records.
export const SETTLED   = 'settled';
export const UNSETTLED = 'unsettled';
export const RETRACTED = 'retracted';

// ── the derivation edge ─────────────────────────────────────────────────────
// The reason supersession cannot propagate today is that nothing records what a
// claim was measured UNDER. `under` is that edge, and it is the only schema change
// the whole mechanism needs.
//
//   def       { id, kind, provenance, supersedes }   a basis, a frame, any held stance
//   assert    { ..., under }                          the def this claim was measured under
//
// A def may itself carry `under`: a frame is selected under a basis, so frames are
// defs derived from defs. Supersession therefore walks a graph, not a list.

// Everything that hangs off `defId`, transitively: asserts measured under it, defs
// built under it, and everything hanging off those. Breadth-first over the `under`
// edges, cycle-safe. Returns the set of seq numbers.
export const dependents = (entries, defId) => {
  const list = Array.isArray(entries) ? entries : [];
  const hit = new Set();
  const frontier = [defId];
  const seen = new Set([defId]);
  while (frontier.length) {
    const parent = frontier.shift();
    for (const e of list) {
      if (e?.under !== parent) continue;
      hit.add(e.seq);
      if (e.kind === 'def' && e.id && !seen.has(e.id)) { seen.add(e.id); frontier.push(e.id); }
    }
  }
  return hit;
};

// What a rebuild would cost, BEFORE it is paid. The system can see the bill. This is
// the number that makes REC an act: a basis change that unsettles four claims is
// cheap and a basis change that unsettles the whole standing read of the corpus is
// not, and a self that cannot tell the difference is not weighing anything.
export const costOfSuperseding = (entries, defId) => {
  const list = Array.isArray(entries) ? entries : [];
  const hit = dependents(list, defId);
  let asserts = 0, defs = 0;
  for (const e of list) {
    if (!hit.has(e.seq)) continue;
    if (e.kind === 'assert') asserts += 1;
    else if (e.kind === 'def') defs += 1;
  }
  return Object.freeze({ asserts, defs, total: asserts + defs });
};

// ── σ ───────────────────────────────────────────────────────────────────────
// The entries to append when a def is superseded. One `supersede` recording the
// replacement, then one `unsettle` beside every dependent that is currently standing.
// Already-unsettled dependents are not unsettled twice (the fold would be identical,
// and a log that repeats itself is noise, not memory). Retracted ones are left alone:
// the world already denied them and no basis change un-denies anything.
//
// Returns [] when the def has already been superseded, so σ is idempotent and a
// double REC cannot double-charge.
export const supersedeEntries = (entries, { was, now = null, why = null, turn = 0 } = {}) => {
  const list = Array.isArray(entries) ? entries : [];
  if (!was) return [];
  if (list.some((e) => e?.kind === 'supersede' && e.was === was)) return [];

  const out = [{ kind: 'supersede', turn, was, now, why: why || 'the frame no longer carries its own reading' }];
  const hit = dependents(list, was);
  for (const e of list) {
    if (!hit.has(e.seq)) continue;
    if (e.kind !== 'assert' && e.kind !== 'def') continue;
    const st = statusOf(list, e.seq);
    if (st !== SETTLED) continue;
    out.push({ kind: 'unsettle', turn, ref: e.seq, was, why: 'measured under a basis that no longer holds' });
  }
  return out;
};

// A claim returns to standing only by being MEASURED AGAIN, under a def that is
// itself standing. Not by assertion, not by the model insisting, not by time. The
// re-measurement is the payment, and this entry is the receipt.
export const resettleEntry = ({ ref, under, turn = 0, onMass = null } = {}) =>
  Object.freeze({ kind: 'resettle', turn, ref, under, onMass });

// ── the projection ──────────────────────────────────────────────────────────
// A claim's status is not stored. It is folded from the log at read time, latest
// event wins. This is the same discipline the Meant-Graph is under, applied to the
// thing the system is willing to say out loud.
// A claim measured under NO declared stance is born UNSETTLED, never settled. This
// inverts the obvious default and the inversion is the point. An assert with a null
// `under` is attached to no def, so no rebuild can ever reach it: leave it settled
// and it is SUPERSESSION-PROOF, and the cheapest way for the system to protect its
// own credit becomes to stop saying where it stands. That is the oracle hiding inside
// the machinery built to price it. So: declaring a stance is the only route to
// standing. A claim from nowhere is provisional forever, uncitable, and cannot enter
// a basis. The system pays for its judgments by naming what it judged from.
const defEntry = (list, id) => {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.kind === 'def' && list[i].id === id) return list[i];
  return null;
};
const wasSuperseded = (list, id) => list.some((e) => e?.kind === 'supersede' && e.was === id);

export const statusOf = (entries, seq, seen = new Set()) => {
  const list = Array.isArray(entries) ? entries : [];
  if (seen.has(seq)) return UNSETTLED;   // a stance that grounds itself grounds nothing
  seen.add(seq);

  const self = list.find((e) => e?.seq === seq && (e.kind === 'assert' || e.kind === 'def'));
  if (!self) return null;

  // The world denying a claim is terminal. No basis change un-denies anything, and no
  // re-measurement rehabilitates something the record contradicted.
  if (list.some((e) => e?.kind === 'retract' && e.ref === seq)) return RETRACTED;

  let last = null;
  for (const e of list) {
    if (e?.ref !== seq) continue;
    if (e.kind === 'unsettle' || e.kind === 'resettle') last = e;
  }
  if (last?.kind === 'unsettle') return UNSETTLED;

  // The def this thing currently stands on: the one it was re-measured under if it has
  // been paid for, otherwise the one it was born under.
  const under = last?.kind === 'resettle' ? (last.under ?? null) : (self.under ?? null);

  if (self.kind === 'def') {
    // A stance the system abandoned does not stand, even before its dependents are
    // walked. The supersede marker is enough; the unsettle receipts beside the
    // dependents are the audit trail, not the mechanism.
    if (wasSuperseded(list, self.id)) return UNSETTLED;
    // A root def is a POSIT: laid down, not derived, standing until abandoned. This is
    // where the regress stops, and it stops on a commitment rather than a foundation.
    if (!under) return SETTLED;
  } else if (!under) {
    // An assert with no declared stance is born unsettled. Leave it settled and it is
    // SUPERSESSION-PROOF: no rebuild can reach what hangs on nothing, and the cheapest
    // way to protect credit becomes to stop saying where you stand.
    return UNSETTLED;
  }

  // And the walk. A claim stands only if the stance it stands on stands, all the way to
  // a posit. Without this, a claim can be RESETTLED under a def that is itself unsettled:
  // the debt paid in counterfeit currency, full credit restored, no honest measurement
  // anywhere. Naming a stance is not enough. The stance has to hold.
  const parent = defEntry(list, under);
  if (!parent) return UNSETTLED;   // stands on a def that is not in the log
  return statusOf(list, parent.seq, seen) === SETTLED ? SETTLED : UNSETTLED;
};

// Everything the system currently stands behind. `credit` is the share of its own
// committed word that is still measured under a basis it still holds. It falls when
// REC fires and rises only as claims are paid for. A system running at low credit
// has been wrong a lot lately and has not done the work, and it should say so rather
// than speak as though nothing happened.
export const standing = (entries) => {
  const list = Array.isArray(entries) ? entries : [];
  let settled = 0, unsettled = 0, retracted = 0;
  for (const e of list) {
    if (e?.kind !== 'assert') continue;
    const st = statusOf(list, e.seq);
    if (st === SETTLED) settled += 1;
    else if (st === UNSETTLED) unsettled += 1;
    else if (st === RETRACTED) retracted += 1;
  }
  const total = settled + unsettled + retracted;
  return Object.freeze({
    settled, unsettled, retracted, total,
    credit: total > 0 ? settled / total : 1,
  });
};

// The claims a citing turn is NOT allowed to lean on, and the ones a basis rebuild
// is NOT allowed to be built from. This is the gated-write rule from selfline.js
// ("you cannot tickle yourself") extended one grain up: material the system has not
// re-measured cannot corroborate the thing that unsettled it.
export const unsettledRefs = (entries) => {
  const list = Array.isArray(entries) ? entries : [];
  return list
    .filter((e) => e?.kind === 'assert' && statusOf(list, e.seq) === UNSETTLED)
    .map((e) => e.seq);
};
