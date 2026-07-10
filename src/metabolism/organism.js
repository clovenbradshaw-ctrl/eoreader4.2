// EO: REC·SEG·INS·DEF(Paradigm,Network → Paradigm,Network, Composing·Making·Dissecting) — the whole individual
// metabolism/organism.js — the heritable individual: a regulatory GENOME (weights, genome.js)
// and a structural SOMA (organs + substrate, soma.js), varying as ONE thing under the
// constitution's guard. This is what lets the SAME selection loop (select.js, population.js)
// evolve the body plan and not just its dial settings — the organism conforms to the genome
// interface (express / vary / distanceTo / get / genotype / notation), so wherever the loop
// used a genome it can now hold an organism, and structure comes under selection for free.
//
// vary() is REC pointed at BOTH levels, DIRECTED by strain and replay-stable (no RNG):
//   · weight-tuning — REC on the parameters inside the body (the dials). The existing move.
//   · organogenesis — REC on the SET of organs (grow / prune / fuse). The new move, and the
//     one that breaks the clerk's fixed-body-plan ceiling. It fires when evaluation BREAKS on
//     a resource the body has no organ to serve — the leap the system cannot make is exactly
//     the cell no organ occupies, so a strain on an unserved resource GROWS the missing sense.
//
// Every proposed mutation names the constitutional locus it would touch (`weights` or `organs`,
// both open) and is checked by the constitution before it is applied. A mutation whose target
// is frozen is REFUSED — the guard has teeth even though the ordinary dispatch never aims at a
// frozen locus. And a growth that fails its developmental checkpoint (isolation or body
// re-closure) is refused by the soma and the organism falls back to tuning, so vary() always
// returns a well-formed, admitted mutation — the body never grows a part that would not stand.

import { createGenome, GENE_NAMES } from './genome.js';
import { createSoma } from './soma.js';
import { CONSTITUTION } from './constitution.js';

const round = (x) => Math.round(x * 1000) / 1000;

export const createOrganism = ({ genome = createGenome(), soma = createSoma(), constitution = CONSTITUTION } = {}) => {
  const g = typeof genome.express === 'function' ? genome : createGenome(genome);
  const s = typeof soma.grow === 'function' ? soma : createSoma(soma);

  // express — the phenotype the turn spends against: the weight allocation AT TOP LEVEL (so a
  // consumer that only reads modelGate/maxTokens/… is unchanged) PLUS the body and its upkeep.
  const express = () => Object.freeze({ ...g.express(), soma: s.express(), upkeep: s.upkeep() });

  const withParts = (ng, ns) => createOrganism({ genome: ng, soma: ns, constitution });

  // tune — delegate to the weight genome (REC on the dials). Tags the mutation `weights`.
  const tune = (opts) => {
    const { genome: ng, mutation } = g.vary(opts);
    const adm = constitution.admits('weights');
    if (!adm.ok) return { genome: self, mutation: refused(adm.reason) };
    return { genome: withParts(ng, s), mutation: Object.freeze({ ...mutation, target: 'weights', level: 'weight' }) };
  };

  // structural — apply a soma move (grow/prune/fuse/revert). If the soma refuses it (checkpoint
  // or capacity), fall back to tuning so vary() always yields an admitted, well-formed mutation.
  const structural = (result, kindHint, opts) => {
    if (!result || result.refused) return tune(opts);   // the body could not grow it — tune instead
    const adm = constitution.admits('organs');
    if (!adm.ok) return { genome: self, mutation: refused(adm.reason) };
    const m = result.mutation;
    return {
      genome: withParts(g, result.soma),
      mutation: Object.freeze({
        op: m.op, target: 'organs', level: 'organ', kind: m.kind, gene: `organ:${m.organ || kindHint}`,
        before: s.count(), after: result.soma.count(), organ: m.organ, cell: m.cell, species: m.species || null,
        route: m.route, from: m.from, note: m.note,
      }),
    };
  };

  // vary — the dispatch. `strain` = { resource, magnitude }. Directed, replay-stable.
  const vary = ({ strain = null, pick = null, revert = null, bias = 1 } = {}) => {
    // REVERT (path-dependence escape): shed an accreted organ first if any, else pull a weight
    // back toward its default. No adaptation — of body or of dial — is permanent.
    if (revert) {
      if (s.grownCount() > 0) return structural(s.revert(), 'revert', { revert, bias });
      return tune({ revert, bias });
    }

    if (strain && strain.resource) {
      const mag = strain.magnitude || 1;
      const canGrow = s.count() < s.maxOrgans && s.desert().length > 0;
      // OVERSPEND (cost pressure): the body is straining its budget. Relieve upkeep by fusing two
      // organs into a cheaper symbiont (keep the capability) or, failing that, pruning the costliest
      // limb the season cannot afford — thrift on STRUCTURE, not just the dials. The season turned.
      if (mag >= 1.5 && s.grownCount() >= 1) {
        const relief = s.grownCount() >= 2 ? s.fuse({ at: bias | 0 }) : s.prune({ strain });
        return structural(relief, relief && relief.mutation && relief.mutation.kind, { strain, bias });
      }
      // GROW (capability pressure, with surplus to spend): a strain the body has slack to answer
      // grows an organ. If the resource is UNSERVED, grow the missing sense — the leap weight-tuning
      // can never make, because no organ was there to tune. If it IS served, duplicate a specialist
      // into a sparse niche (frequency-dependent: the empty Ground/Pattern cell is worth taking
      // precisely because it is empty). Structure only STAYS if selection finds it earns its upkeep.
      if (canGrow) return structural(s.grow({ strain, at: bias | 0 }), 'grow', { strain, bias });
      // no room / no desert left — tune the dial governing the strained resource (the existing move).
      return tune({ strain, bias });
    }

    // IDLE: no break — tune the weights (structural growth is strain-directed, as REC is).
    return tune({ pick, bias });
  };

  // distanceTo — blended distance: weights + structure. Falls back to weight-only when compared
  // against a bare genome (so a mixed population of organisms and genomes still measures).
  const distanceTo = (other) => {
    const otherW = other && typeof other.weights === 'function' ? other.weights() : other;
    const wd = g.distanceTo(otherW);
    const otherB = other && typeof other.body === 'function' ? other.body() : null;
    if (!otherB) return wd;
    return round(0.5 * wd + 0.5 * s.distanceTo(otherB));
  };

  const genotype = () => Object.freeze({ ...g.genotype(), soma: s.genotype() });
  const notation = () => `${g.notation()} :: ${s.notation()}`;
  const signature = () => `${g.notation()}/${s.signature()}`;

  // rebuild — reconstruct a full organism from a genotype (weights + soma). The heritability
  // hook the population uses to carry an organism champion forward across periods.
  const rebuild = (gt = {}) => {
    const { soma: somaGt, ...weights } = gt;
    return createOrganism({ genome: createGenome(weights), soma: createSoma({ organs: somaGt?.organs, maxOrgans: somaGt?.maxOrgans, reservoir: somaGt?.reservoir }), constitution });
  };

  const self = {
    express, vary, distanceTo, genotype, notation, signature, rebuild,
    get: (name) => g.get(name),
    weights: () => g,          // the regulatory genome (for a peer's distance / spread)
    body: () => s,             // the structural soma (organs, desert, upkeep)
    upkeep: () => s.upkeep(),
    isOrganism: true,
  };
  return Object.freeze(self);
};

const refused = (reason) => Object.freeze({ op: 'NUL', kind: 'refused', target: null, gene: 'refused', before: 0, after: 0, reason, note: `refused: ${reason}` });

// A plain genome carries GENE_NAMES; an organism carries those PLUS a soma. This predicate lets
// the population feature-detect structure without importing the organism type.
export const hasSoma = (unit) => !!(unit && typeof unit.body === 'function');
export { GENE_NAMES };
