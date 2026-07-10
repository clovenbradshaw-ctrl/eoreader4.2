// EO: REC·EVA·DEF(Lens,Network → Paradigm, Composing·Tracing·Binding) — Claude as the breeder
// metabolism/proposer.js — the THIRD Claude channel. challenger.js puts Claude in two roles the
// population cannot game because they sit outside it: it POSES the challenge (the user) and GRADES
// the answer's satisfaction (the fitness anchor). This module adds the third: Claude reading the
// grader's own CRITIQUES and PROPOSING the heritable change most likely to answer them.
//
// Why a third channel at all. The mechanical mutator (genome.vary / organism.vary) is DIRECTED by
// strain — "spend less of the resource you were starved of" — so on a self-measured fitness it can
// only ever walk toward thrift: it moved one dial (modelGate 0.5→0.65) across a whole run and never
// touched the body plan, because a scalar hill-climb over a quality-per-cost signal has no gradient
// toward capability. The critiques DO ("retrieval pulled irrelevant pages"; "the answer was cut off";
// "it never honestly said the sources don't cover this"). A frontier reader can turn those sentences
// into a DIRECTION the strain-signal cannot see — most importantly a STRUCTURAL one, growing the
// organ the body lacks rather than re-weighting the organs it has. That is the dimension the audit
// found dark ("the body plan is not under selection").
//
// THE FIREWALL, kept (constitution.js FROZEN: proposer/disposer — "the judge selects and never
// writes a weight"). Claude here does neither: it PROPOSES a variation, realized as a CHALLENGER a
// mutant the tournament must still ratify against the champion. It never promotes, never writes the
// champion, never touches fitness. And every proposal is legalized before it leaves this module: a
// dial tweak is clamped to its gene's range; a structural tweak is run through the soma's own
// developmental checkpoints (organ isolation → constitution.admits('organs') → body re-closure), so
// an illegal proposal is refused here, not downstream. Claude widens WHAT is tried; selection under
// scarcity still decides what STAYS. Propose freely; the budget disposes.
//
// KEY NEVER IN THE TAB (same posture as challenger.js / judge.js): this module holds no key and
// calls no network. It BUILDS messages and hands them to an injected `generate(messages) → string`.
// No generate / not armed / out of budget → dry-run: `propose()` returns null and the loop falls
// back to the mechanical mutator, so wiring the proposer in changes nothing until it is armed.

import { GENES, GENE_NAMES, createGenome } from './genome.js';
import { createOrganism, hasSoma } from './organism.js';
import { RESOURCE_BY_OP } from './organ.js';

export const PROPOSER_MODEL = 'claude-opus-4-8';

// The legal structural moves the breeder may name. Grow routes land a NEW organ (SYN duplicates an
// organ into an unclaimed desert cell; CON recombines two); the rest reshape the standing body.
export const ORGAN_ROUTES = Object.freeze(['SYN', 'CON', 'fuse', 'prune', 'revert']);
const GROW_ROUTES = Object.freeze(new Set(['SYN', 'CON']));

// A breeder, not a cheerleader: read the USER's dissatisfaction (the grader's critiques) and name
// the ONE change most likely to raise satisfaction next season. It is told plainly what it may and
// may not do — it proposes, it does not promote; the budget decides what survives — so it spends its
// judgement on WHICH lever, not on trying to win by fiat.
const PROPOSE_SYSTEM = [
  'You are the BREEDER of an evolving document-reading system — not its author, not its judge. You are shown the system\'s current genome (its resource dials) and body (its organs), plus the CRITIQUES a demanding user left on its recent answers. Propose the ONE heritable change most likely to answer those critiques.',
  'You PROPOSE; you do not decide. Your proposal becomes a challenger that must out-compete the current champion under a scarce budget before it is kept. So do not try to win by proposing something expensive — propose the change whose CAPABILITY gain most justifies its upkeep.',
  'Two kinds of change, and prefer the one the critiques actually point at:',
  '  weight — move ONE dial within its allowed range. Cheap, reversible, but it can only re-tune organs that already exist. Use when a critique is about AMOUNT (answers cut off → more tokens; irrelevant citations → stricter binding).',
  '  organ  — grow, fuse, prune, or revert an organ. This changes what the body CAN DO, not just how much. Use when a critique points at a MISSING capability (no honest "sources don\'t cover this"; retrieval off-topic; no structure found) — no dial can add a sense the body lacks. Growing lands a new organ in an unclaimed "desert" cell; name a target cell key from the desert list, or omit it to let the body pick by the resource you name.',
  'Ground your proposal in a SPECIFIC critique. If the critiques are about answer quality that no available lever addresses, say so by proposing the smallest safe dial move and explaining why in the rationale.',
  'Return ONLY compact JSON. For a dial: {"kind":"weight","gene":"maxTokens","to":512,"rationale":"one sentence tying it to a critique"}. For an organ: {"kind":"organ","route":"SYN","target":"<desert cell key or omit>","serves":"<resource or omit>","rationale":"..."}. route is one of SYN, CON, fuse, prune, revert.',
].join('\n');

// clampGene — legalize a proposed dial value to its gene's range and grain (int genes round). Returns
// null for an unknown gene or a non-numeric value, so an off-menu weight proposal is refused, not coerced.
export const clampGene = (name, v) => {
  const g = GENES[name];
  if (!g) return null;
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  let c = Math.max(g.min, Math.min(g.max, x));
  c = g.kind === 'int' ? Math.round(c) : Math.round(c * 1000) / 1000;
  return c;
};

// mutationSurface — the legal menu handed to the breeder: the current dials with their ranges, and
// (when the unit has a body) its organs plus the DESERT — the unclaimed cells it could grow into,
// each tagged with the resource its operator would serve, so the breeder can name a target by need.
export const mutationSurface = (unit) => {
  const weights = unit && typeof unit.genotype === 'function'
    ? (hasSoma(unit) ? unit.weights().genotype() : unit.genotype())
    : {};
  const genes = GENE_NAMES.map((n) => ({
    gene: n, value: weights[n], min: GENES[n].min, max: GENES[n].max, step: GENES[n].step,
    resource: GENES[n].resource, note: GENES[n].note,
  }));
  if (!hasSoma(unit)) return { genes, body: null, desert: [] };
  const s = unit.body();
  const ex = s.express();
  const body = {
    organs: ex.organs.map((o) => ({ kind: o.kind, cell: o.cell, serves: o.serves, upkeep: o.upkeep, origin: o.origin })),
    upkeep: ex.upkeep, count: ex.count, maxOrgans: s.maxOrgans, serves: ex.serves,
  };
  const desert = s.desert().map((c) => ({ key: c.key, op: c.op, grain: c.grain, serves: RESOURCE_BY_OP[c.op] || null }));
  return { genes, body, desert };
};

// buildProposeMessages — the exact message list handed to generate(). Pure and exported so a test can
// pin the shape without a network. Carries the critiques (the signal), the legal surface (the menu),
// and the recent lineage (what has already been tried, so it does not re-propose a culled move).
export const buildProposeMessages = ({ unit, critiques = [], lineage = [], season = null } = {}) => {
  const surface = mutationSurface(unit);
  const crit = (critiques || [])
    .filter(Boolean)
    .map((c, i) => {
      if (typeof c === 'string') return `${i + 1}. ${c}`;
      const scores = [c.grounded != null ? `grounded ${c.grounded}` : '', c.satisfied != null ? `satisfied ${c.satisfied}` : '', c.resolved != null ? `resolved ${c.resolved}` : '']
        .filter(Boolean).join(', ');
      return `${i + 1}. ${c.critique || c.text || '(no critique)'}${scores ? ` [${scores}]` : ''}`;
    })
    .join('\n');
  const recent = (lineage || []).slice(-6)
    .map((e) => e && (e.note || `${e.op || ''} ${e.gene || e.organ || ''}`.trim()))
    .filter(Boolean).join('; ');
  const body = [
    `CURRENT DIALS (gene = value, allowed [min..max]):`,
    surface.genes.map((g) => `  ${g.gene} = ${g.value}  [${g.min}..${g.max}]  — ${g.note} (serves ${g.resource})`).join('\n'),
    surface.body ? `\nCURRENT BODY (${surface.body.count}/${surface.body.maxOrgans} organs, upkeep ${surface.body.upkeep}):\n` +
      surface.body.organs.map((o) => `  ${o.kind} @ ${o.cell} — serves ${(o.serves || []).join('/') || '—'}, upkeep ${o.upkeep} (${o.origin})`).join('\n') : '',
    surface.desert.length ? `\nDESERT (unclaimed cells you may grow an organ into):\n` +
      surface.desert.slice(0, 12).map((d) => `  ${d.key} — op ${d.op}, grain ${d.grain}${d.serves ? `, would serve ${d.serves}` : ''}`).join('\n') : '',
    season ? `\nSEASON: ${season.name || season} (budget pressure shapes what is affordable).` : '',
    recent ? `\nRECENTLY TRIED (do not simply re-propose a culled move):\n  ${recent}` : '',
    `\nUSER CRITIQUES to answer:\n${crit || '(none supplied)'}`,
    `\nPropose the one change now.`,
  ].join('\n');
  return [{ role: 'system', content: PROPOSE_SYSTEM }, { role: 'user', content: body }];
};

// validateProposal — legalize a parsed proposal against the menu. Returns a normalized proposal or
// null when it names nothing legal (an unknown gene, an out-of-range non-numeric, a bad route, or an
// organ move on a unit with no body). Clamping happens here so the realize step only ever sees legal input.
export const validateProposal = (unit, v) => {
  if (!v || typeof v !== 'object') return null;
  const rationale = v.rationale ? String(v.rationale).slice(0, 240) : null;
  if (v.kind === 'weight') {
    if (!GENES[v.gene]) return null;
    const to = clampGene(v.gene, v.to);
    if (to == null) return null;
    return { kind: 'weight', gene: v.gene, to, rationale };
  }
  if (v.kind === 'organ') {
    if (!hasSoma(unit)) return null;                       // no body to grow — fall back to the mutator
    const route = ORGAN_ROUTES.includes(v.route) ? v.route : 'SYN';
    // a grow route may name a target cell key (must be in the desert) or a resource to grow a sense for.
    let target = null, serves = null;
    if (GROW_ROUTES.has(route)) {
      const desert = unit.body().desert();
      if (v.target) target = desert.find((c) => c.key === v.target) || null;
      if (!target && v.serves) serves = String(v.serves);
    }
    return { kind: 'organ', route, target: target ? target.key : null, targetCell: target, serves, rationale };
  }
  return null;
};

// realize — turn a legal proposal into a CHALLENGER the tournament can run: a mutant unit + a mutation
// record shaped exactly like the mechanical mutator's (so select.js / population consume it unchanged),
// tagged origin:'claude'. A dial builds a clamped mutant genome; an organ move runs the soma's own
// checkpoints and is REFUSED here (never applied) if the body would not re-close. Reuses the sanctioned
// builders only — this constructs a CHALLENGER, never the champion, so the firewall holds.
export const realize = (unit, p) => {
  if (p.kind === 'weight') {
    const curWeights = hasSoma(unit) ? unit.weights().genotype() : unit.genotype();
    const before = curWeights[p.gene];
    const ng = createGenome({ ...curWeights, [p.gene]: p.to });
    const after = ng.get(p.gene);
    const mutant = hasSoma(unit) ? createOrganism({ genome: ng, soma: unit.body() }) : ng;
    return {
      unit: mutant,
      mutation: Object.freeze({
        op: 'REC', target: 'weights', level: 'weight', gene: p.gene, before, after,
        delta: round(after - before), reason: 'claude-propose', origin: 'claude', rationale: p.rationale,
        note: `propose ${p.gene}: ${before}→${after}`,
      }),
    };
  }
  if (p.kind === 'organ') {
    const s = unit.body();
    let res;
    if (p.route === 'fuse') res = s.grow({ route: 'fuse' });
    else if (p.route === 'prune') res = s.prune({});
    else if (p.route === 'revert') res = s.revert();
    else res = s.grow({ route: p.route, target: p.targetCell || null, strain: p.serves ? { resource: p.serves, magnitude: 1 } : null });
    if (!res || res.refused) return { refused: true, reason: res?.mutation?.reason || 'the body refused the growth' };
    const genome = hasSoma(unit) ? unit.weights() : createGenome(unit.genotype());
    const mutant = createOrganism({ genome, soma: res.soma });
    return {
      unit: mutant,
      mutation: Object.freeze({ ...res.mutation, target: 'organs', level: 'organ', origin: 'claude', rationale: p.rationale }),
    };
  }
  return { refused: true, reason: `unknown proposal kind: ${p.kind}` };
};

// createProposer — the gated, budgeted breeder. `generate(messages, opts) → Promise<string>` is the
// injected transport (the `claude` backend's phrase, a proxy, or a stub); null → dry-run. Mirrors
// createChallenger exactly, so the surface arms all three Claude channels through one transport.
export const createProposer = ({ generate = null, enabled = false, budget = {}, model = PROPOSER_MODEL } = {}) => {
  let armed = !!enabled;
  const cap = typeof budget === 'number' ? { calls: budget } : { calls: 100, ...budget };
  let spentCalls = 0;

  const affordable = () => cap.calls == null || spentCalls < cap.calls;
  const budgetState = () => Object.freeze({ calls: spentCalls, cap: cap.calls ?? null, remaining: cap.calls == null ? null : Math.max(0, cap.calls - spentCalls), exhausted: !affordable() });

  const send = async (messages) => {
    if (!armed || typeof generate !== 'function') return null;
    if (!affordable()) return null;
    spentCalls += 1;
    try { return await generate(messages, { maxTokens: 400 }); }
    catch { return null; }                 // an outage must not stall the evolve loop
  };

  return Object.freeze({
    // propose ONE heritable change from the critiques, realized as a ratifiable challenger. Returns
    // { kind, ..., origin:'claude', rationale, challenger:{ unit, mutation } } on success; a proposal
    // that legalizes but the body refuses returns { ..., challenger:null, refused:true, reason };
    // dry-run (unarmed / no transport / out of budget) or an unparseable/off-menu reply returns null.
    async propose({ unit, critiques = [], lineage = [], season = null } = {}) {
      if (!unit || typeof unit.genotype !== 'function') return null;
      const text = await send(buildProposeMessages({ unit, critiques, lineage, season }));
      if (!text) return null;
      const v = parseJSON(text);
      const p = validateProposal(unit, v);
      if (!p) return null;
      const r = realize(unit, p);
      if (!r || r.refused) return Object.freeze({ ...p, origin: 'claude', challenger: null, refused: true, reason: r?.reason || 'refused' });
      return Object.freeze({ ...p, origin: 'claude', challenger: Object.freeze({ unit: r.unit, mutation: r.mutation }) });
    },
    budget: budgetState,
    armed: () => armed,
    arm(fn) { if (typeof fn === 'function') generate = fn; armed = true; return armed; },
    disarm() { armed = false; return armed; },
    model,
  });
};

// ── helpers (mirrored from challenger.js so the two channels parse identically) ──────────────────
const round = (x) => Math.round(x * 1000) / 1000;
const parseJSON = (text) => {
  if (typeof text !== 'string') return null;
  try { return JSON.parse(text); } catch { /* fall through to extraction */ }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; } }
  return null;
};
