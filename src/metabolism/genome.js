// EO: REC·DEF(Paradigm,Network → Paradigm,Lens, Composing·Making·Tracing) — the heritable genome
// metabolism/genome.js — the allocation parameters, made a first-class heritable
// genotype, with REC as the mutation operator.
//
// The system's genome was already present, unlabeled: its ALLOCATION PARAMETERS —
// the routing thresholds that decide when to warm the model, the answerability gate,
// the overlap floor a binding must clear, the live width of the fold slice, the
// evidence budget the arc spends, the token ceilings. These numbers are not
// incidental settings. Together they are the heritable specification of how the
// system spends its scarce resources — and today they are hand-set and fixed, which
// is to say the organism cannot evolve because its genome cannot vary. This module
// makes the genome an object that can vary (mutate) and carry forward (inherit).
//
// The mutation operator is REC — the one operator that restructures a frame when
// evaluation breaks it. Pointed at the allocation parameters, REC perturbs a gene
// and writes the change to the log with the STRAIN that forced it, exactly as the
// reading's own frame-revisions are. Variation that is auditable and reversible by
// construction. Mutation is DIRECTED by strain, not random: the break points the
// direction (spend less on the resource you were starved of), which is both truer to
// REC and replay-stable — no RNG, so a replayed log reproduces the same lineage.
//
// Path-dependence guard (the essay's fourth failure mode): every gene stays
// reachable by a future REC. The genome is as defeasible as everything else the
// system holds; no adaptation is exempt from later revision, and `toward` a gene's
// default is always an available mutation, so a locked-in bad gene can be escaped.

// GENES — the curated allocation parameters the metabolism is allowed to evolve.
// Each default IS today's live constant (cited), so a genome at defaults reproduces
// today's behavior byte-for-byte: the metabolism is inert until scarcity selects a
// variant. `resource` names the currency the gene governs, so a strain on that
// resource knows which gene to perturb. `dir` is the sign of "spend less": +1 means
// RAISING the gene spends less of its resource, -1 means lowering it does.
export const GENES = Object.freeze({
  // The routing threshold — how strong the cheap answer must be before the model call
  // is skipped. Raising it makes the system EARN each model call harder (spend less
  // model). The essay's central gene. (surfer/answerable.js STRONG_SCORE = 0.5.)
  modelGate:  Object.freeze({ default: 0.5,  min: 0.2,  max: 0.9,  step: 0.05, resource: 'model',  dir: +1, note: 'earn the model call' }),
  // Output token ceiling (turn ctx.maxTokens, default 384). Lower spends fewer tokens.
  maxTokens:  Object.freeze({ default: 384,  min: 96,   max: 512,  step: 32,   resource: 'tokens', dir: -1, kind: 'int', note: 'output length' }),
  // Foraging breadth — retrieval top-k (turn/stages.js k=6). Lower forages less.
  retrieveK:  Object.freeze({ default: 6,    min: 2,    max: 12,   step: 1,    resource: 'fetch',  dir: -1, kind: 'int', note: 'forage breadth' }),
  // The overlap floor a binding must clear to CITE (enactor/ground/bind.js MIN_OVERLAP
  // = 0.25). Higher binds more strictly — fewer, surer citations, less rework.
  bindFloor:  Object.freeze({ default: 0.25, min: 0.1,  max: 0.5,  step: 0.05, resource: 'time',   dir: +1, note: 'grounding strictness' }),
  // The live width of the fold slice held under attention (weave/longgen LIVE_WIDTH=3).
  // Narrower holds fewer spans — cheaper working memory, the token economy of the fold.
  foldWidth:  Object.freeze({ default: 3,    min: 1,    max: 6,    step: 1,    resource: 'tokens', dir: -1, kind: 'int', note: 'fold slice width' }),
  // The arc's saturation stop — uncovered-mass fraction it quits at (weave/arc EPSILON
  // = 0.05). Higher quits sooner — spends less on marginal sections.
  arcEpsilon: Object.freeze({ default: 0.05, min: 0.02, max: 0.25, step: 0.02, resource: 'model',  dir: +1, note: 'evidence budget stop' }),
  // The recency horizon γ (reading.js / projection GAMMA = 0.7). Shorter forgets
  // faster — a smaller working set, less to recompute; the attention span.
  gamma:      Object.freeze({ default: 0.7,  min: 0.5,  max: 0.95, step: 0.05, resource: 'time',   dir: -1, note: 'attention horizon' }),
});

export const GENE_NAMES = Object.freeze(Object.keys(GENES));

const clampGene = (name, v) => {
  const g = GENES[name];
  let x = Math.max(g.min, Math.min(g.max, v));
  if (g.kind === 'int') x = Math.round(x);
  else x = Math.round(x * 1000) / 1000;
  return x;
};

// The default genotype — today's constants. A genome here is behaviorally invisible.
export const defaultGenotype = () => {
  const gt = {};
  for (const n of GENE_NAMES) gt[n] = GENES[n].default;
  return gt;
};

// createGenome — a genotype plus the operators that make it evolvable. Holds a value
// map gene→setting; `express()` is what consumers read; `vary()` is the REC-mutation.
export const createGenome = (initial = null) => {
  const g = { ...defaultGenotype(), ...(initial || {}) };
  for (const n of GENE_NAMES) g[n] = clampGene(n, g[n]);

  // express — the concrete allocation a turn consumes. This is the phenotype: the
  // genotype read out as the numbers the reading/turn/model actually spend against.
  const express = () => Object.freeze({ ...g });

  // vary — REC on the genome. Perturb ONE gene, DIRECTED by the strain that forced it:
  // if the organism was starved of a resource, move the gene governing that resource
  // toward spending less of it. `strain` is { resource, magnitude }; `bias` (0..1)
  // scales the step. With no strain (idle exploration), it perturbs the gene named by
  // `pick` (a deterministic rotation the caller supplies from the period index — no
  // RNG). `revert` mutates a gene back toward its default (the path-dependence escape
  // hatch: no locked-in gene is permanent). Returns a NEW genome + the mutation record.
  const vary = ({ strain = null, pick = null, revert = null, bias = 1 } = {}) => {
    let name, delta, reason;
    if (revert && GENES[revert]) {
      name = revert;
      const d = GENES[name].default;
      delta = Math.sign(d - g[name]) * GENES[name].step * bias;
      reason = 'revert-to-default';
    } else if (strain && strain.resource) {
      // find the gene governing the strained resource; move it toward "spend less".
      name = GENE_NAMES.find(n => GENES[n].resource === strain.resource) || pick || GENE_NAMES[0];
      delta = GENES[name].dir * GENES[name].step * bias * Math.max(0.5, Math.min(2, strain.magnitude || 1));
      reason = `relieve-${strain.resource}`;
    } else {
      name = (pick && GENES[pick]) ? pick : GENE_NAMES[0];
      // idle drift explores toward spending less (conserve when in doubt).
      delta = GENES[name].dir * GENES[name].step * bias;
      reason = 'explore';
    }
    const before = g[name];
    const after = clampGene(name, before + delta);
    const mutant = createGenome({ ...g, [name]: after });
    const mutation = Object.freeze({
      op: 'REC', gene: name, before, after, delta: round(after - before), reason,
      // the frozen genotype notation, for the log/trace
      note: `${name}: ${before} → ${after} (${reason})`,
    });
    return { genome: mutant, mutation };
  };

  // distance — how far two genotypes sit apart in gene-space (normalized per gene),
  // for lineage/telemetry: how much the genome has drifted from where it started.
  const distanceTo = (other) => {
    const o = other && typeof other.express === 'function' ? other.express() : (other || {});
    let d = 0;
    for (const n of GENE_NAMES) {
      const span = GENES[n].max - GENES[n].min || 1;
      d += Math.abs((g[n] - (o[n] ?? g[n])) / span);
    }
    return round(d / GENE_NAMES.length);
  };

  return Object.freeze({
    express,
    vary,
    distanceTo,
    get(name) { return g[name]; },
    genotype: () => ({ ...g }),
    // a compact one-line reading of the genome in the cube's idiom, for headers/traces
    notation: () => GENE_NAMES.map(n => `${n}=${g[n]}`).join(' · '),
  });
};

const round = (x) => Math.round(x * 1000) / 1000;
