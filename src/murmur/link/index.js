// EO: INS·SIG·NUL(Void,Entity,Atmosphere → Entity,Field, Making,Tending,Clearing) — barrel
// murmur/link — the connective nominator (spec §9.4, phase 4). The peripheral sense's `recognition`
// register fires when this reading sits on top of an earlier one; phase-1 measured only the
// similarity, phase-4 keeps the earlier LOCUS (sense/centroid.js `pushReading` → `priors()`), so a
// recognition can name the specific earlier event it echoes. This holon turns that pointed-at echo
// into a CANDIDATE connection.
//
// The discipline is the whole point (spec §9, restated as the §8 provenance type law): a candidate
// is REAFFERENT by construction (`fromEnactor`), so `canWitness(cand.prov) === false`. murmur may
// POINT at a connection; it can never assert one. Only the document — via the idle promotion gate,
// which corroborates the bridging entity-relation edge against EXAFFERENT text (checkClaim) —
// promotes a candidate to a grounded graph edge. The candidate rides a READ side-channel
// (createMurmur `nominations()` / `subscribe`), never the append-only log: `canAppendLog` stays
// false. This is the same firewall the live-feel broadcast holds; a candidate is worthless as a
// fact and perfect as a "look here — this connects."

import { fromEnactor, canWitness } from '../../core/provenance.js';

export const CONNECTION_ENACTMENT = 'murmur';

// buildConnection — a candidate connection between two reading loci. Reafferent by construction:
// `canWitness(prov) === false`. `grounded:false`. NEVER a graph write — the promotion gate is the
// only path to the log, and only through the exafferent witness it finds.
//   from   the CURRENT reading locus { turnId, docId, sentIdxs, cursor, t } (signal.ref)
//   to     the EARLIER locus this reading echoes (the matched recognitionRef)
//   sim    the cosine that fired it (audit legibility only)
//   phrase the narrator's mutter if one woke (voicing only — never a fact, spec §9.5)
export const buildConnection = ({
  from = null, to = null, sim = null, phrase = null,
  enactment = CONNECTION_ENACTMENT, at = null,
} = {}) => Object.freeze({
  kind: 'candidate',              // NEVER 'assertion' / 'claim' / 'event' — a pointer, audit-only
  relation: 'recognition',        // the register that nominated it
  from, to, sim,
  phrase: phrase || null,
  prov: fromEnactor(enactment),   // reafferent — the firewall is the TYPE, not a flag (§8)
  grounded: false,
  at,
});

// connectionKey — nomination identity: one candidate per (from-locus → to-locus) pair, so a
// recognition that stays live across fold stops is nominated ONCE, not every pass (anti-rumination,
// spec §8). Keyed on the doc + cursor of each end (falls back to the first sentIdx, then turnId).
export const connectionKey = (c) => {
  const end = (e) => e
    ? `${e.docId ?? '?'}#${e.cursor ?? (Array.isArray(e.sentIdxs) ? e.sentIdxs[0] : undefined) ?? '?'}@${e.turnId ?? '?'}`
    : '?';
  return `${end(c && c.from)}::${end(c && c.to)}`;
};

// nominateFromFeel — scan the working feel for fresh `recognition` impressions that carry a `link`
// back to an earlier locus, and turn each into a candidate connection. Pure: it returns the
// candidates; the caller owns the queue + dedup. `from` is the CURRENT reading locus (signal.ref).
export const nominateFromFeel = (impressions = [], { from = null, enactment = CONNECTION_ENACTMENT, now = () => 0 } = {}) => {
  const out = [];
  for (const imp of impressions || []) {
    if (!imp || imp.register !== 'recognition' || !imp.link || !imp.link.ref) continue;
    out.push(buildConnection({
      from, to: imp.link.ref, sim: imp.link.sim ?? null, phrase: imp.phrase || null, enactment, at: now(),
    }));
  }
  return out;
};

// The firewall predicate, surfaced at this seam (mirror of idle.js `canGround`): a candidate can
// NEVER ground itself — its reafferent type bars it. The promotion gate MUST find an exafferent
// document witness; this is the assertion that proves it can't shortcut that.
export const canGroundConnection = (c) => canWitness(c?.prov ?? null);
