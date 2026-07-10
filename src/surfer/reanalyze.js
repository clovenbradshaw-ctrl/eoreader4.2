// EO: REC(Link,Entity → Lens,Link, Making) — garden-path reanalysis
// Bond-level reanalysis — the garden-path recovery, as the engine's own loop one level down.
//
// Reading runs under the arrow of time, so it commits a bond before the evidence is in. In
// "Beauty ran past the barn fell" the reader commits "Beauty ran [fell]" — grabbing the verb
// "fell" into the object slot — and then "fell" turns out to be the main verb: the horse
// [that was] raced past the barn / FELL. Recovering that is REANALYSIS, and reanalysis is the
// same predict→error→reconsolidate loop the basis already runs (REC), applied to the
// syntactic bond. Nothing new is invented here; it COMPOSES pieces the engine already has:
//
//   • SURPRISAL (the trigger): a committed bond whose object slot holds a PREDICATE, not a
//     referent, is the prediction error — objects are not verbs. That anomaly is the spike.
//     (The "is it a verb" oracle is the corpus HOW-conventions / the ledger's isRelation —
//     the relation vocabulary, never any content.)
//   • CUE-BASED RE-RETRIEVAL (the search): the orphaned verb needs a subject, so we re-search
//     the entity field by γ-recency — the same kernel coref uses — for the most available
//     antecedent (Lewis & Vasishth: reanalysis is re-retrieval).
//   • RECONSOLIDATION (the commit): a REC event SUPERSEDES the mis-bond and FORMS the new one,
//     demoting the original verb to a modifier. Append-only — the mis-bond stays on the trail,
//     so the garden path is auditable: bond formed → contradicted → dissolved → recomposed.
//     (Memory reconsolidation: retrieval makes a bond labile, then it re-stabilises. The brain
//     does this destructively and so confabulates; the append-only log keeps the reaction
//     history, so the reanalysis can be watched, not lost.)
//
// reanalyze is a pure pass over a parsed doc — it returns the reconsolidation trail; it does
// not mutate the log. A caller may append the REC events to make the reanalysis part of the record.

export const reanalyze = (doc, { isVerb = null } = {}) => {
  const events = typeof doc?.log?.snapshot === 'function' ? doc.log.snapshot() : (doc?.log?.events || []);
  const label = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && !label.has(e.id)) label.set(e.id, e.label);
  // the verb oracle: explicit, else the document's own relation conventions (corpus prior /
  // learned vocabulary). It is the HOW — relation verbs — never content.
  const known = isVerb || ((w) => !!doc?.conventions?.isRelation?.(String(w).toLowerCase()));

  // entity recency: the last sentence each entity was instantiated by (the γ-recency cue).
  const lastSeen = new Map();
  for (const e of events) if (e.op === 'INS' && e.id != null && e.sentIdx != null) lastSeen.set(e.id, Math.max(lastSeen.get(e.id) ?? -1, e.sentIdx));

  const reanalyses = [];
  for (const b of events) {
    if (!((b.op === 'CON' || b.op === 'SIG') && b.via && b.src != null && b.tgt != null)) continue;
    if (label.has(b.tgt)) continue;                       // object is a real entity — no anomaly
    const tgt = String(b.tgt).toLowerCase();
    if (!known(tgt)) continue;                            // object slot holds a NON-verb — fine
    // GARDEN PATH: the object slot holds a predicate. Re-retrieve a subject for the orphaned
    // verb — the most recently instantiated entity at or before this bond (γ-recency).
    const cands = [...lastSeen.entries()].filter(([, si]) => si <= b.sentIdx).sort((a, b2) => b2[1] - a[1]);
    const subj = cands[0]?.[0] ?? b.src;
    reanalyses.push(Object.freeze({
      trigger: { kind: 'predicate-in-object-slot', verb: tgt, of: b.via },   // the surprisal source
      superseded: { src: b.src, via: b.via, tgt: b.tgt },                     // the mis-bond, left on the trail
      formed: { src: subj, via: tgt },                                       // orphaned verb → main predicate
      demoted: { modifierOf: b.src, via: b.via },                            // original verb → modifier
      // the reconsolidation event, ready to append — the auditable record of the re-grounding.
      // A garden-path reanalysis RE-READS one sentence under a corrected frame: that is a REC
      // at the LENS terrain (Interpretation × Figure, stance Making — the legal cell
      // REC_Making_Lens), not the off-cube 'Bond' it used to name. The Structure-row
      // consequence — the corrected bond, a LINK (Structure × Figure) — is carried in `forms`
      // (formsTerrain), and the mis-bond it supersedes is a Link too. So the event sits on the
      // cube: a Lens reconsolidation whose Structure footprint is a re-formed Link.
      rec: Object.freeze({ op: 'REC', kind: 'reanalysis', site: 'Lens', stance: 'Making',
        grain: 'Figure', cell: 'REC_Making_Lens', formsTerrain: 'Link',
        rode: 'garden-path', supersedes: { src: b.src, via: b.via, tgt: b.tgt },
        forms: { src: subj, via: tgt }, subjectReretrieved: subj, sentIdx: b.sentIdx }),
    }));
  }
  return Object.freeze({ reanalyses, count: reanalyses.length });
};

// applyReanalysis — make the reanalysis part of the record: APPEND each REC to the log. The
// mis-bond is not removed (append-only); the REC supersedes it, and consumers that honour REC
// (conceptToPlan) read the corrected bond instead. Returns how many reconsolidations fired.
export const applyReanalysis = (doc, opts = {}) => {
  const { reanalyses } = reanalyze(doc, opts);
  for (const a of reanalyses) doc.log.append(a.rec);
  return reanalyses.length;
};
