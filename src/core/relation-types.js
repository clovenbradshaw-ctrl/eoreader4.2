// EO: DEF·EVA(Kind,Link → Kind,Lens, Dissecting,Binding) — relation typing bridge
// The typing bridge. Open-vocabulary extraction (parse/relations.js) emits
// surface descriptor nouns on the `via` of a kinship/social CON edge — sister,
// mother, captain, friend. Those are STRINGS; they carry no algebra. This maps
// each surface noun onto a small CLOSED set of primitive relation types that DO
// carry {inverse, symmetric, functional, disjointWith}. The map is the
// reconciliation: extraction stays open, the algebra operates on the projection.
//
// The gendered-projection discipline is the whole point (the symmetry you'd lose
// by collapsing to <noun>-of): sister|brother → the SYMMETRIC primitive sibling,
// with gender recovered, not baked into a non-symmetric surface label. mother|
// father → the FUNCTIONAL primitive parent, inverse child. So sister-of and
// mother-of are no longer "two unrelated strings" — they are projections of two
// primitives the algebra knows are disjoint.

import { VERDICTS } from './verdicts.js';   // imported DOWN; read stays a leaf

// The closed primitive set. Properties live HERE, keyed on type, never on nouns.
export const PRIMITIVES = Object.freeze({
  sibling: { symmetric: true,  transitive: false, functional: false, inverse: 'sibling',    prior: 0.9 },
  parent:  { symmetric: false, transitive: false, functional: true,  inverse: 'child',      prior: 0.95 },
  child:   { symmetric: false, transitive: false, functional: false, inverse: 'parent',     prior: 0.95 },
  spouse:  { symmetric: true,  transitive: false, functional: true,  inverse: 'spouse',     prior: 0.9 },
  ancestor:{ symmetric: false, transitive: true,  functional: false, inverse: 'descendant', prior: 0.9 },
  // Non-kin primitives — SAME machinery, proving this isn't a family table.
  leads:   { symmetric: false, transitive: false, functional: true,  inverse: 'led-by',     prior: 0.8 },  // captain/leader/head
  authored:{ symmetric: false, transitive: false, functional: false, inverse: 'authored-by',prior: 0.7 },
  located: { symmetric: false, transitive: true,  functional: false, inverse: 'contains',   prior: 0.85 },
  social:  { symmetric: true,  transitive: false, functional: false, inverse: 'social',     prior: 0.5 },  // friend (weak)
  // CHANGE OF STATE (§4) — "transformed into", "became", "turned into". OBJECT-functional,
  // not subject-functional: within ONE narrative reading a given resultant state is reached
  // by a single undergoer (the central transformation has one undergoer), so a claim that a
  // DIFFERENT figure reached the SAME resultant contradicts the reading. Defeasible (a modest
  // prior) — many figures can become teachers in general; this is the reading's specific,
  // definite resultant ("the vermin"), the metamorphosis the whole text turns on. Marked
  // `objectFunctional` so the clash is checked on the OBJECT slot (correspond.js), and the
  // subject `functional` flag stays false so the existing subject-clash path never fires it.
  becomes: { symmetric: false, transitive: false, functional: false, objectFunctional: true, inverse: 'became-from', prior: 0.8 },
});

// Disjointness is stated on PRIMITIVES, not nouns. parent ⟂ sibling, parent ⟂
// child, etc. A gendered conflict (mother vs father) is recovered separately via
// the projection's gender, in areDisjoint below. The table is PARTIAL by design:
// a pair not listed here is not asserted consistent — it is simply not asserted
// disjoint, and the algebra DEFERS. "No conflict" ≠ "consistent."
export const DISJOINT_PRIMITIVES = Object.freeze([
  ['parent', 'sibling'], ['parent', 'child'], ['ancestor', 'child'],
  ['spouse', 'sibling'], ['spouse', 'parent'], ['spouse', 'child'],
].map(Object.freeze));

// The surface→primitive map WITH the gendered projection recovered. Each entry:
// { type, gender }. Extend by adding nouns; the algebra never changes. The keys
// mirror parse/relations.js's KIN list where they overlap, so a kinship CON edge
// the page already logs (via = the kin noun) types without any new extraction.
const SURFACE = Object.freeze({
  sister:  { type: 'sibling', gender: 'F' }, brother: { type: 'sibling', gender: 'M' },
  sibling: { type: 'sibling', gender: null },
  mother:  { type: 'parent',  gender: 'F' }, father:  { type: 'parent',  gender: 'M' },
  parent:  { type: 'parent',  gender: null }, mom: { type: 'parent', gender: 'F' }, dad: { type: 'parent', gender: 'M' },
  son:     { type: 'child',   gender: 'M' }, daughter:{ type: 'child',   gender: 'F' }, child: { type: 'child', gender: null },
  wife:    { type: 'spouse',  gender: 'F' }, husband: { type: 'spouse',  gender: 'M' }, spouse: { type: 'spouse', gender: null },
  grandfather: { type: 'ancestor', gender: 'M' }, grandmother: { type: 'ancestor', gender: 'F' },
  // non-kin
  captain: { type: 'leads', gender: null }, leader: { type: 'leads', gender: null }, head: { type: 'leads', gender: null },
  boss: { type: 'leads', gender: null }, master: { type: 'leads', gender: null },
  author:  { type: 'authored', gender: null }, writer: { type: 'authored', gender: null },
  capital: { type: 'located', gender: null },
  friend:  { type: 'social', gender: null }, neighbour: { type: 'social', gender: null }, neighbor: { type: 'social', gender: null },
  // change-of-state surface verbs → the `becomes` primitive (§4). The verb is the `via`
  // on a CON edge (parse/relations.js), so these are looked up the same way a kin noun is.
  transform: { type: 'becomes', gender: null }, transformed: { type: 'becomes', gender: null },
  become: { type: 'becomes', gender: null }, became: { type: 'becomes', gender: null },
  'turn-into': { type: 'becomes', gender: null }, turned: { type: 'becomes', gender: null },
  changed: { type: 'becomes', gender: null }, metamorphosed: { type: 'becomes', gender: null },
});

// Type a surface descriptor noun. Open vocab in, closed primitive out (or null —
// an unmapped noun is honestly untyped and the algebra DEFERS on it, never
// guesses). This is the seam where a learned-ledger noun or a geometric reader
// could later propose a mapping; today it's the declarative table.
export const typeOf = (surfaceNoun) => {
  if (!surfaceNoun) return null;
  const e = SURFACE[String(surfaceNoun).toLowerCase().replace(/-of$/, '')];
  return e ? Object.freeze({ ...e, ...PRIMITIVES[e.type] }) : null;
};

export const isFunctional = (noun) => !!typeOf(noun)?.functional;
export const isSymmetric  = (noun) => !!typeOf(noun)?.symmetric;
// §4 — OBJECT-functional: one undergoer per resultant within a reading (the `becomes`
// change-of-state primitive). Distinct from `functional` (one filler per subject slot).
export const isObjectFunctional = (noun) => !!typeOf(noun)?.objectFunctional;
export const objectFunctionalClash = (a, b) => {
  const ta = typeOf(a), tb = typeOf(b);
  return !!(ta && tb && ta.objectFunctional && ta.type === tb.type);
};
// The calibrated typing confidence for a surface noun (1 when untyped — an
// unknown relation is not penalised). Consumed by checkRelationConflict to weigh
// a contradiction's strength and by the factcheck refusal gate; an untyped noun
// never reaches either, so the default is inert.
export const relationPrior = (noun) => typeOf(noun)?.prior ?? 1;

// Are two surface nouns disjoint? Resolve BOTH to primitives, check the
// primitive disjointness table, then the gender rule: same primitive + opposite
// known gender ⇒ disjoint (mother ⟂ father, sister ⟂ brother). Pure, no embedder.
export const areDisjoint = (a, b) => {
  const ta = typeOf(a), tb = typeOf(b);
  if (!ta || !tb) return false;                  // untyped → cannot assert disjoint
  if (ta.type === tb.type)
    return !!(ta.gender && tb.gender && ta.gender !== tb.gender); // same primitive, gender split
  return DISJOINT_PRIMITIVES.some(([x, y]) =>
    (x === ta.type && y === tb.type) || (x === tb.type && y === ta.type));
};

// A functional-slot clash between two surface nouns: the SAME functional primitive
// filled by two DIFFERENT, gender-matched roles. The gender match is what keeps it
// sound — `mother` and `father` are both the functional `parent` primitive, but a
// person has one of EACH, so a clash needs a known, equal gender on both sides
// (mother vs mother, wife vs wife). A genderless filler (the bare word "parent")
// never clashes, so the functional flag can't false-fire across the gender split.
export const functionalClash = (a, b) => {
  const ta = typeOf(a), tb = typeOf(b);
  return !!(ta && tb && ta.functional && ta.type === tb.type
    && ta.gender && tb.gender && ta.gender === tb.gender);
};

// ── The attribute conflict oracle (spec §5.3 ID-4 / EM-3) ───────────────────
//
// Generalises rolesConflict/areDisjoint into the one place the conflict semantics
// for ANY attribute live, so the identity code (coref, the asterisk's evaluateSameAs)
// CONSULTS conflict, never CONTAINS it — "a leaf claims no knowledge it wasn't
// handed." Given an attribute type and two value-sets, it answers how strongly they
// are incompatible, in [0,1]:
//
//   match            any shared value → 0 (a match never conflicts).
//   role-disjoint    the values are typed roles the algebra knows cannot co-occur on
//                    one bearer (sister ⟂ mother, mother ⟂ father) → 1. This is the
//                    areDisjoint generalisation.
//   functional-clash a SINGLE-VALUED attribute filled by non-overlapping values — one
//                    birth date, one spouse, one licence — is positive evidence of TWO
//                    entities → 1. Whether the type is single-valued is INJECTED, not
//                    declared here: a kinship/social relation reads its functionality
//                    from the primitive table; a biographical key (bornOn, licence,
//                    qid) is flagged by the caller via `functional`/`functionalVias`,
//                    the seam where the spec's LEARNED functionality (ID-1) enters.
//   soft / unknown   nationality, an untyped attribute → 0. The oracle DEFERS rather
//                    than guess ("no conflict" ≠ "consistent"), exactly as the rest of
//                    the algebra defers on an unmapped noun.
//
// Itself defeasible: it is a function the assembly layer can replace or wrap (the
// `attributesConflict` opt threads through evaluateSameAs), the same discipline as
// the injected rolesConflict.
const toValueSet = (v) => {
  const arr = Array.isArray(v) ? v : [v];
  return new Set(arr.map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean));
};
export const attributesConflict = (attrType, a, b, opts = {}) => {
  const A = toValueSet(a), B = toValueSet(b);
  if (!A.size || !B.size) return { conflict: 0, reason: 'insufficient' };
  for (const x of A) if (B.has(x)) return { conflict: 0, reason: 'match' };   // a shared value never conflicts
  // Typed-role disjointness — pairwise, since the values themselves are the roles.
  for (const x of A) for (const y of B) if (areDisjoint(x, y)) return { conflict: 1, reason: 'role-disjoint' };
  // Single-valued attribute, non-overlapping fillers. Functionality is the relation
  // table's where it knows the type, plus whatever the caller injects (learned keys).
  const functional = opts.functional
    ?? (isFunctional(attrType) || !!(opts.functionalVias && opts.functionalVias.has(attrType)));
  if (functional) return { conflict: 1, reason: 'functional-clash' };
  return { conflict: 0, reason: 'soft' };                                     // nationality / unknown → defer
};

// ── The symbolic verdict, embedder-free ────────────────────────────────────
//
// Returns a VERDICTS-tagged result, or null when the claim is outside the algebra
// (so the caller DEFERS to the geometric check, never false-fires). Two catches:
//
//   disjoint-axiom   — the same ordered pair (src→tgt) already carries a relation
//                      disjoint with the claim's (Gregor -> Grete : sister vs a
//                      claimed Gregor -> Grete : mother). Hard contradiction.
//   functional-axiom — a functional, gender-matched slot on src is already filled
//                      by a DIFFERENT target. Requires at least one WITNESSED
//                      filler (`!e.derived`) so two derived guesses never refuse —
//                      the provenance guard.
//
// `e.derived` is honoured if present; the projection does not mint derived edges
// today, so every current edge reads as witnessed — the guard is forward-armed.
export const checkRelationConflict = (graph, claim) => {
  const noun = claim?.via;
  if (!typeOf(noun)) return null;                  // outside the algebra → defer
  const rep = graph?.representative || ((id) => id);
  const src = rep(claim.src), tgt = rep(claim.tgt);
  const fromSrc = (graph?.edges || []).filter(e => rep(e.from) === src);

  for (const e of fromSrc) {
    if (rep(e.to) === tgt && areDisjoint(noun, e.via)) {
      return Object.freeze({
        verdict: VERDICTS.CONTRADICTED, reason: 'disjoint-axiom',
        claimRel: noun, docRel: e.via, witnessed: !e.derived,
        // The likelihood the contradiction is REAL, not a boolean: how confident
        // the typing of BOTH relations is (relationPrior, calibrated per primitive
        // — sibling 0.9, parent 0.95, social 0.5). A clash between two near-certain
        // kin relations is a stronger refusal than one resting on a weakly-typed
        // noun. The downstream gate (factcheck/correspond.js) reads this; the prior
        // is no longer declared-but-unread.
        confidence: relationPrior(noun) * relationPrior(e.via),
        citation: e.sentIdx != null ? `s${e.sentIdx}` : null,
      });
    }
  }
  if (isFunctional(noun)) {
    const filled = fromSrc.find(e => !e.derived && rep(e.to) !== tgt && functionalClash(noun, e.via));
    if (filled) return Object.freeze({
      verdict: VERDICTS.CONTRADICTED, reason: 'functional-axiom',
      claimRel: noun, existing: rep(filled.to),
      confidence: relationPrior(noun) * relationPrior(filled.via),
      citation: filled.sentIdx != null ? `s${filled.sentIdx}` : null,
    });
  }
  return null;
};

// The symbolic CORROBORATION axiom — the mirror of checkRelationConflict. Where that catches a
// claimed relation the document DENIES (a disjoint or functional clash), this confirms one it
// WITNESSES: the same ordered pair (or, for a symmetric primitive, the reverse pair) already
// carries a relation that types to the SAME primitive and is not gender-disjoint. It is
// embedder-free — the typing is symbolic — so a kinship claim ("Gregor's sister is Grete")
// corroborates and EARNS the witnessing sentence's citation even under the hash organ, where the
// geometric corroboration path (correspond.js) degrades to indeterminate. Returns null outside
// the algebra so the geometric path runs unchanged; the caller runs the CONTRADICTION check
// first, so a disjoint pair is a contradiction, never silently read as agreement.
export const checkRelationAgree = (graph, claim) => {
  const t = typeOf(claim?.via);
  if (!t) return null;                             // outside the algebra → defer to geometry
  const rep = graph?.representative || ((id) => id);
  const src = rep(claim.src), tgt = rep(claim.tgt);
  for (const e of (graph?.edges || [])) {
    const f = rep(e.from), o = rep(e.to);
    const direct  = f === src && o === tgt;
    const reverse = t.symmetric && f === tgt && o === src;   // sibling/spouse: order-free
    if (!direct && !reverse) continue;
    const u = typeOf(e.via);
    if (!u || u.type !== t.type) continue;         // a different primitive is not agreement
    if (areDisjoint(claim.via, e.via)) continue;   // sister vs brother on one pair → the conflict path owns it
    return Object.freeze({
      verdict: VERDICTS.CORROBORATED, reason: 'relation-agrees',
      claimRel: claim.via, docRel: e.via,
      confidence: relationPrior(claim.via) * relationPrior(e.via),
      citation: e.sentIdx != null ? `s${e.sentIdx}` : null, sentIdx: e.sentIdx ?? null,
    });
  }
  return null;
};

// §4 — the OBJECT-functional clash, the mirror of checkRelationConflict's functional-axiom:
// where that looks at edges OUT of the subject (one filler per subject slot), this looks at
// edges INTO the object (one undergoer per resultant). A `becomes` claim — "the father
// transformed into the vermin" — contradicts the reading when the SAME resultant (the
// vermin) was already reached from a DIFFERENT undergoer (Gregor). Kept SEPARATE from
// checkRelationConflict so that function stays byte-identical; correspond.js calls this only
// behind the §4 flag, and it returns null for every non-`becomes` relation, so nothing else
// is touched. Requires a WITNESSED filler (`!e.derived`), the same provenance guard.
export const checkObjectFunctionalConflict = (graph, claim) => {
  const noun = claim?.via;
  if (!isObjectFunctional(noun)) return null;     // only change-of-state primitives → defer
  const rep = graph?.representative || ((id) => id);
  const src = rep(claim.src), tgt = rep(claim.tgt);
  const intoTgt = (graph?.edges || []).filter(e => rep(e.to) === tgt);
  for (const e of intoTgt) {
    if (rep(e.from) !== src && !e.derived && objectFunctionalClash(noun, e.via)) {
      return Object.freeze({
        verdict: VERDICTS.CONTRADICTED, reason: 'object-functional-axiom',
        claimRel: noun, docRel: e.via, existing: rep(e.from), witnessed: !e.derived,
        confidence: relationPrior(noun) * relationPrior(e.via),
        citation: e.sentIdx != null ? `s${e.sentIdx}` : null,
      });
    }
  }
  return null;
};
