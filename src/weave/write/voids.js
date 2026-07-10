// EO: SIG·EVA(Entity,Network → Void, Tending,Binding) — open-Resolution ledger; idle fuel (§15,§16)
// write/voids.js — the open-Resolution query: the fuel and the "Open" ledger. (SPEC §15, §16)
//
// The idle loop walks the OPEN RESOLUTIONS — the void-set: referents INS'd but not
// DEF'd, deferred identities, hedged claims, threads left open (§1–§2). These are
// exactly the points where more thinking can still PAY — where the model is not yet
// committed, so a fresh document can still produce compression progress (§14).
// Re-narrating the FIRM log is rumination (no new likelihood); chasing pure noise is
// dreaming (incompressible). The voids are the fuel; the firm record is not.
//
// The same query feeds the §16 UX: "Open" is the centerpiece — the instrument's
// standing not-knowing, made legible. An entry is { rid, head, text, band, reason }
// with band ∈ { void, hedged }, the form the prototype (idle-ux.html) renders.

import { isVoid } from '../../core/index.js';

// Below this firm probability a commitment is HEDGED, not settled (§10): proper-
// scorable but not yet confident enough to leave the open set. The candidate /
// duty-cycle threshold (open question §13.6) lives one level up, in idle.js.
export const HEDGE_BELOW = 0.7;

// openLedger — read the open-Resolution set off a fold (write/fold.js). Three ways a
// referent is open:
//   VOID identity  — appeared but carries unsettled (void) attributes, OR appeared
//                    with no firm descriptor at all (INS without DEF).
//   HEDGED         — firm but low-p (resolution map), proper-scorable yet uncommitted.
// A referent with firm, confident descriptors and no void attrs is SETTLED and is
// not in the ledger. `resolution` is the optional per-referent Resolution map.
export const openLedger = (fold, { t = Infinity, resolution = null, hedgeBelow = HEDGE_BELOW } = {}) => {
  if (!fold || !fold.refs) return [];
  const entries = [];
  for (const [rid, r] of fold.refs) {
    const appeared = fold.has ? fold.has(rid) : true;
    if (!appeared) continue;                                  // not yet on the frontier — not an open question, a non-appearance
    const d = fold.dossierOf ? fold.dossierOf(rid, t) : { descriptors: [], open: [] };
    const res = resolution?.get ? resolution.get(rid) : null;

    if (d.open && d.open.length) {
      entries.push(openEntry(rid, r.head, 'void', `unsettled: ${d.open.map(x => x.attr ?? x).join('; ')}`));
    } else if (!d.descriptors || d.descriptors.length === 0) {
      entries.push(openEntry(rid, r.head, 'void', 'appeared but not yet characterized (INS without DEF)'));
    } else if (res && !isVoid(res) && Number.isFinite(res.p) && res.p < hedgeBelow) {
      entries.push(openEntry(rid, r.head, 'hedged', `committed at p=${res.p.toFixed(2)} — proper-scorable, not yet confident`));
    }
  }
  return entries;
};

// openResolutions — the same query off a flat list of {hash, head, res, hasDef,
// open?} items (or scheduler cells), for callers that do not hold a fold. void
// dominates: a void resolution OR open attributes → void; a firm low-p item →
// hedged. Settled items are omitted.
export const openResolutions = (items, { hedgeBelow = HEDGE_BELOW } = {}) => {
  const out = [];
  for (const it of items || []) {
    const rid = it.hash ?? it.rid ?? it.id;
    const head = it.head ?? it.name ?? rid;
    const open = it.open && it.open.length;
    if (isVoid(it.res) || open) {
      out.push(openEntry(rid, head, 'void', open ? `unsettled: ${[].concat(it.open).join('; ')}` : 'void identity'));
    } else if (it.hasDef === false) {
      out.push(openEntry(rid, head, 'void', 'appeared but not yet characterized (INS without DEF)'));
    } else if (it.res && Number.isFinite(it.res.p) && it.res.p < hedgeBelow) {
      out.push(openEntry(rid, head, 'hedged', `committed at p=${it.res.p.toFixed(2)}`));
    }
  }
  return out;
};

const openEntry = (rid, head, band, reason) =>
  Object.freeze({ rid, head, text: head, band, reason });

export const isOpen = (entry) => entry && (entry.band === 'void' || entry.band === 'hedged');

// pickVoid — choose WHICH open void to attend next. Seeded randomness plays only the
// humble correct role (§15, I5): it varies which void gets attention so attention
// does not lock — it never manufactures content. `rng` is a function → [0,1); a
// deterministic seed makes the walk reproducible. Returns null on an empty ledger
// (nothing open → nothing to think about).
export const pickVoid = (ledger, rng = Math.random) => {
  const open = (ledger || []).filter(isOpen);
  if (!open.length) return null;
  return open[Math.floor(rng() * open.length) % open.length];
};
