// EO: EVA·SEG(Network → Entity, Dissecting,Tracing) — the absolute-descriptor intake
// absolute-descriptors.js — ownerless definite descriptions ("the emperor", "the owner",
// "the marshal") as ¬INS candidates for the individuation gate (individuation.js).
//
// coref.js's descriptor channel only sees POSSESSED role epithets ("his sister",
// "Gregor's sister" — scanDescriptors in parse/relations.js). An absolute definite
// description has no owner and no name, so it never enters that channel: the gate
// receives zero candidates for it, and the referent its docstring is written to catch
// (the orbited absolute description, e.g. Napoleon as "the emperor") falls through to
// the default type instead of being diagnosed.
//
// mass = standing sightings (head-noun folded: "the emperor" and a later bare "emperor"
// are one candidate); subjShare = fraction in subject position, the agency signal that
// lets the gate split emanon (acts) from protogon (orbited); rho = incident coupling to
// the named cast, read as DEGREE (distinct co-present entities), not summed co-occurrence,
// so it sits on the same scale as couplingByNode rather than inflating the null. Requires
// ≥2 sightings: a one-shot "the door" is scenery, left for VOID/discard, not minted.
//
// Returns bare candidates (roleKey/label/mass/rho/subjShare) — individuation.js stamps
// the provisional id and shape, keeping this module free of a circular import back to it.
import { scanAbsoluteDescriptors } from './parse/index.js';

export const scanAbsoluteDescriptorCands = (doc) => {
  const sents = doc.sentences || doc.units || [];
  const idsBySent = sents.map(() => new Set());
  const mentions = (doc.mentions instanceof Map)
    ? doc.mentions : new Map(Object.entries((doc.mentions) || {}));
  for (const [id, idxs] of mentions)
    for (const i of (idxs || [])) if (idsBySent[i]) idsBySent[i].add(id);
  const acc = new Map();
  sents.forEach((s, i) => {
    for (const d of scanAbsoluteDescriptors(s)) {
      const a = acc.get(d.roleKey) || { label: d.phrase, mass: 0, subjN: 0, neighbors: new Set() };
      a.mass += 1;
      if (d.subj) a.subjN += 1;
      // coupling on the cast's scale: DISTINCT named entities it stands beside (degree),
      // not summed co-occurrences — so ρ is comparable to couplingByNode, not inflated.
      if (idsBySent[i]) for (const id of idsBySent[i]) a.neighbors.add(id);
      acc.set(d.roleKey, a);
    }
  });
  const out = [];
  for (const [roleKey, a] of acc) {
    if (a.mass < 2) continue;
    out.push({ roleKey, label: a.label, mass: a.mass, rho: a.neighbors.size,
      subjShare: a.mass ? a.subjN / a.mass : 0 });
  }
  return out;
};
