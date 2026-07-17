// EO: SEG·EVA(Network → Entity, Dissecting,Tracing) — cast presence + gate wiring
// (docs/omnimodal-waveform.md §3.5). Two products per referent, from `sightings`
// alone: a presence lane (a run-length encoding of role over ordinals, the lane
// the render draws) and a gate type (emanon/protogon/holon/field/void), read off
// exactly the individuation gate already ships (src/perceiver/individuation.js) —
// this module does not retype a referent, it only feeds the gate's MASS × COUPLING
// axes from the omnimodal sighting vocabulary instead of text-specific admission.
//
// The load-bearing rule (§2.1/§3.5): LATENT contributes COUPLING, never MASS.
// `roleWeight` below is what makes an unstated-but-awaited referent (the creature,
// Kurtz, an incoming airmass, a theme heard only harmonically) land as a protogon
// — low mass, high coupling — with zero modality-specific code: the same formula
// runs whether the sightings came from a text, audio, or tabular perceiver.

import { createLog, projectGraph } from '../../core/index.js';
import { couplingByNode, classifyReferents } from '../../perceiver/index.js';

const ROLE_WEIGHT = { FOREGROUND: 1, PRESENT: 0.5, LATENT: 0 };

// Synthesize the coupling substrate: a CON edge between every pair of DISTINCT
// referents co-sighted at the same ordinal, weighted by their evidence. This is
// the one new wiring the spec calls for (§3.5) — projectGraph itself, and
// couplingByNode's per-node aggregation, are reused verbatim, unmodified.
const buildCouplingGraph = (sightings) => {
  const log = createLog({ docId: 'waveform-cast' });
  const byOrdinal = new Map();
  for (const s of sightings) {
    if (!byOrdinal.has(s.ordinal)) byOrdinal.set(s.ordinal, []);
    byOrdinal.get(s.ordinal).push(s);
  }
  for (const [ordinal, group] of byOrdinal) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (a.referent === b.referent) continue;
        const w = (a.evidence ?? 1) * (b.evidence ?? 1);
        if (w <= 0) continue;
        log.append({ op: 'CON', src: a.referent, tgt: b.referent, via: 'co-sight', sentIdx: ordinal, w });
      }
    }
  }
  return projectGraph(log);
};

// mass(r) and subjShare(r) are both pure folds of r's own sightings — no graph
// needed. subjShare reuses the FOREGROUND fraction as the agency signal: FOREGROUND
// is defined (contract.js) as "the identity the unit is of", the direct omnimodal
// analogue of grammatical subject-hood text's admission.signals already measures.
const foldSightings = (sightings) => {
  const byReferent = new Map();
  for (const s of sightings) {
    const acc = byReferent.get(s.referent) || { mass: 0, foreground: 0, total: 0 };
    acc.mass += (ROLE_WEIGHT[s.role] ?? 0) * (s.evidence ?? 1);
    if (s.role === 'FOREGROUND') acc.foreground += 1;
    acc.total += 1;
    byReferent.set(s.referent, acc);
  }
  return byReferent;
};

// buildCast — referents + sightings → { cast: CastLane[] }. `cast[i].gateType` is
// exactly REFERENT_TYPES from individuation.js; `cast[i].presence` is the RLE the
// render draws.
export const buildCast = (referents, sightings) => {
  const folded = foldSightings(sightings);
  const graph = buildCouplingGraph(sightings);
  const coupling = couplingByNode(graph);

  const cands = referents.map((r) => {
    const f = folded.get(r.key) || { mass: 0, foreground: 0, total: 0 };
    const rho = coupling.get(r.key);
    return {
      id: r.key,
      label: r.display_name || r.key,
      ins: !!r.ins,
      mass: f.mass,
      rho: rho ? rho.rho : 0,
      subjShare: f.total ? f.foreground / f.total : 0,
    };
  });
  const typed = classifyReferents(cands);
  const typeById = new Map(typed.map((t) => [t.id, t]));

  const presenceByReferent = new Map();
  for (const s of [...sightings].sort((a, b) => a.ordinal - b.ordinal)) {
    if (!presenceByReferent.has(s.referent)) presenceByReferent.set(s.referent, []);
    presenceByReferent.get(s.referent).push(s);
  }

  const cast = referents.map((r) => {
    const t = typeById.get(r.key) || { type: 'void', onCast: false, mass: 0, rho: 0, salience: 0 };
    const sights = presenceByReferent.get(r.key) || [];
    const presence = [];
    for (const s of sights) {
      const last = presence[presence.length - 1];
      if (last && last.role === s.role && last.end === s.ordinal) { last.end += 1; continue; }
      presence.push({ start: s.ordinal, end: s.ordinal + 1, role: s.role });
    }
    return {
      referent: r.key,
      display: r.display_name || r.key,
      gateType: t.type,
      onCast: t.onCast,
      salience: t.salience,
      presence,
    };
  });
  // Salience-descending, same as typeReferents — the render's default lane order.
  cast.sort((a, b) => b.salience - a.salience);
  return cast;
};
