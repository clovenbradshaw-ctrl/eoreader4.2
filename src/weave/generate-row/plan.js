// EO: REC·DEF·EVA(Paradigm,Lens → Paradigm,Lens, Composing,Making,Binding) — composed row plans
// docs/generate-row-stance-templates.md §11: eight product-facing queries, none of them
// new machinery — each is `base` shape(s) + a `target` selector + a `slots` narrowing,
// built entirely out of stance.js/join.js/slots.js/render.js. Six are real Plan
// instances (definition, castProfile, timeline, relationshipExplainer, comparison,
// disputeDigest); two (gapReport, caption) are explicit bypasses and say so in their own
// exports rather than pretending to share the Plan shape.

import { stanceLegality, legalCellFor } from './stance.js';
import { proposeJoin } from './join.js';
import { realizeSlot } from './render.js';
import { isLensLegalShape } from './slots.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();
const sameKey = (a, b) => norm(a) === norm(b) && norm(a) !== '';
const weightOf = (p) => Math.max(1e-9, Number(p.originWeight) || (p.originIds?.length ?? 1));

// dominantProposition(propositions, { marginRatio }) -> PropositionGroup | null
// A single proposition-selection step BEFORE stanceLegality ever runs (§3's closing
// paragraph; §11.1) — not part of stanceLegality's own measurement. Returns the top
// candidate only when it out-weighs the runner-up by at least `marginRatio`; otherwise
// null, signalling "no clear winner — let the field decide instead".
export const dominantProposition = (propositions, { marginRatio = 2 } = {}) => {
  if (!propositions?.length) return null;
  const sorted = [...propositions].sort((a, b) => weightOf(b) - weightOf(a));
  if (sorted.length === 1) return sorted[0];
  const top = weightOf(sorted[0]), second = weightOf(sorted[1]);
  return top >= marginRatio * second ? sorted[0] : null;
};

const voidResult = (plan) => Object.freeze({
  plan, fallback: 'readout-void', shape: null, cell: null,
  row: realizeSlot({ role: 'void' }), propositions: [],
});

// rowSlotFor(shape, propositions, stance) -> the realizeSlot slot for a resolved shape.
// Shared by every plan below so the shape→template mapping lives in exactly one place.
const rowSlotFor = (shape, propositions, stance) => {
  switch (shape) {
    case 'readout':
      return { role: 'readout', proposition: propositions[0] };
    case 'making': {
      const sorted = [...propositions].sort((a, b) => weightOf(b) - weightOf(a));
      const causal = (stance?.relations || []).find((r) => r.kind === 'causal');
      return { role: 'making', propositions: sorted, connective: causal?.groundedBy?.connective };
    }
    case 'composing': {
      const byId = Object.fromEntries(propositions.map((p) => [p.id, p]));
      return { role: 'composing', order: stance.order, propositionsById: byId };
    }
    case 'cultivating':
      return { role: 'cultivating', propositions, relations: stance?.relations || [] };
    default:
      return { role: 'void' };
  }
};

// ── 11.1 Definition ─────────────────────────────────────────────────────────
// Base: readout → Cultivating if senses split. Never making/composing (§11.1) — a plan
// may cap which shapes it will ever surface, even when the raw field would clear a
// higher threshold, because two word senses correlating by evidence is not the same
// claim as one committed argument.
export const definitionPlan = (propositions, anchor, { spans = [] } = {}) => {
  const candidates = (propositions || []).filter((p) => sameKey(p.subject, anchor));
  if (!candidates.length) return voidResult('definition');

  const dominant = dominantProposition(candidates);
  if (dominant) {
    const row = realizeSlot({ role: 'readout', proposition: dominant });
    return Object.freeze({
      plan: 'definition', fallback: null, shape: 'readout', cell: legalCellFor('readout'),
      row, propositions: [dominant],
    });
  }

  // No dominant sense: senses split. Deliberately never calls stanceLegality here — even
  // if two overloaded senses happened to share enough evidence to clear Making or
  // Composing, Definition's own ceiling (§11.1) is Cultivating, because two word senses
  // correlating by evidence is not the same claim as one committed argument or a
  // sequenced regularity. `contest-side` attaches only when the senses actually oppose
  // (§5) — never merely because they occupy different domains (§11.1's own refusal).
  const joins = proposeJoin(candidates, { spans });
  const contestSides = joins.relations.filter((r) => r.kind === 'oppose');
  const row = realizeSlot({ role: 'cultivating', propositions: candidates, relations: contestSides });
  return Object.freeze({
    plan: 'definition', fallback: 'cultivating', shape: 'cultivating', cell: legalCellFor('cultivating'),
    row, propositions: candidates, relations: contestSides,
  });
};

// ── 11.2 Entity / cast profile ──────────────────────────────────────────────
const groupByPredicate = (props) => {
  const groups = new Map();
  for (const p of props) {
    const key = norm(p.predicate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
};

const oneLens = (aspect, shape, propositions, stance) => Object.freeze({
  aspect, shape, cell: stance?.cell ?? legalCellFor(shape),
  row: realizeSlot(rowSlotFor(shape, propositions, stance)),
  propositions,
});

export const castProfilePlan = (propositions, anchor, { spans = [], marginRatio = 2 } = {}) => {
  const involved = (propositions || []).filter((p) => sameKey(p.subject, anchor) || sameKey(p.value, anchor));
  if (!involved.length) return voidResult('castProfile');

  const lenses = [];
  for (const [aspect, group] of groupByPredicate(involved)) {
    const dominant = dominantProposition(group, { marginRatio });
    if (dominant) { lenses.push(oneLens(aspect, 'readout', [dominant])); continue; }
    if (group.length === 1) { lenses.push(oneLens(aspect, 'readout', group)); continue; }

    const stance = stanceLegality(group, { spans });
    if (isLensLegalShape(stance.shape)) {
      lenses.push(oneLens(aspect, stance.shape, group, stance));
    } else {
      // §4.2: a lens may not itself resolve to cultivating/composing — split into one
      // sibling readout lens per proposition instead of nesting a survey.
      group.forEach((p, i) => lenses.push(oneLens(`${aspect}#${i}`, 'readout', [p])));
    }
  }
  return Object.freeze({ plan: 'castProfile', fallback: null, lenses: Object.freeze(lenses), propositions: involved });
};

// ── 11.3 Timeline ────────────────────────────────────────────────────────────
// Relation-filtered to precedes/same-event: only `order` ever reaches the render
// template here — a causal/agree relation that happens to also hold between two dated
// propositions is out of THIS plan's scope (render.js's composing/cultivating templates
// never read `stance.relations` for anything but contest-sides, so no extra filtering
// is needed to keep an out-of-scope relation out of the rendered text).
export const timelinePlan = (propositions, { spans = [] } = {}) => {
  const dated = (propositions || []).filter((p) => p.date);
  if (!dated.length) return voidResult('timeline');
  const stance = stanceLegality(dated, { spans });
  const row = realizeSlot(rowSlotFor(stance.shape, dated, stance));
  return Object.freeze({
    plan: 'timeline', fallback: null, shape: stance.shape, cell: stance.cell,
    row, propositions: dated, order: stance.order,
  });
};

// ── 11.4 Relationship explainer (X ↔ Y) ─────────────────────────────────────
const involvesAnchor = (p, anchor) => sameKey(p.subject, anchor) || sameKey(p.value, anchor);

export const relationshipExplainerPlan = (propositions, from, to, { spans = [] } = {}) => {
  const path = (propositions || []).filter((p) => involvesAnchor(p, from) || involvesAnchor(p, to));
  if (!path.length) return voidResult('relationshipExplainer');

  const stance = stanceLegality(path, { spans });
  const row = realizeSlot(rowSlotFor(stance.shape, path, stance));
  // orientation is FIXED to the two named anchors (§11.4, §3's closing paragraph) — a
  // query-driven override of slot occupancy, never of which cell stanceLegality chose.
  return Object.freeze({
    plan: 'relationshipExplainer', fallback: null, shape: stance.shape, cell: stance.cell,
    orientation: { from, to }, row, propositions: path, order: stance.order,
  });
};

// ── 11.5 Comparison (X vs Y) ─────────────────────────────────────────────────
export const comparisonPlan = (propositions, x, y, { spans = [] } = {}) => {
  const xs = (propositions || []).filter((p) => sameKey(p.subject, x));
  const ys = (propositions || []).filter((p) => sameKey(p.subject, y));
  if (!xs.length || !ys.length) return voidResult('comparison');

  const usedY = new Set();
  const pairs = [];
  for (const px of xs) {
    const match = ys.find((py) => !usedY.has(py.id) && sameKey(px.predicate, py.predicate));
    if (match) { pairs.push([px, match]); usedY.add(match.id); }
  }

  const lenses = pairs.map(([px, py]) => {
    const joins = proposeJoin([px, py], { spans: [] });
    const rel = joins.relations.find((r) => r.kind === 'contrasts' || r.kind === 'qualifies');
    // Clusters into one lens only when subject/predicate/time are compatible AND a
    // groundable contrasts/qualifies relation exists (§5's alignment criteria, §11.5);
    // otherwise the pair stays atomic (two side-by-side readouts under one contest).
    if (rel?.kind === 'qualifies') {
      return Object.freeze({
        attribute: px.predicate, shape: 'making', relation: rel, propositions: [px, py],
        row: realizeSlot({ role: 'making', propositions: [px, py], connective: 'because' }),
      });
    }
    return Object.freeze({
      attribute: px.predicate, shape: 'cultivating', relation: rel ?? null, propositions: [px, py],
      row: realizeSlot({ role: 'cultivating', propositions: [px, py], relations: rel ? [rel] : [] }),
    });
  });

  const pairedIds = new Set(pairs.flat().map((p) => p.id));
  const voids = [...xs, ...ys]
    .filter((p) => !pairedIds.has(p.id))
    .map((p) => ({ subject: p.subject, predicate: p.predicate }));

  return Object.freeze({ plan: 'comparison', fallback: null, lenses: Object.freeze(lenses), voids, propositions: [...xs, ...ys] });
};

// ── 11.6 Dispute digest ──────────────────────────────────────────────────────
// `lede` and any non-contested `lens` are unconditionally suppressed — not merely
// absent because none happened to qualify (§11.6, §16's release invariant).
export const disputeDigestPlan = (propositions, { spans = [] } = {}) => {
  const contested = (propositions || []).filter((p) => p.verdict === 'contradicted');
  if (!contested.length) return voidResult('disputeDigest');
  const joins = proposeJoin(contested, { spans });
  const sides = joins.relations.filter((r) => r.kind === 'oppose' || r.kind === 'measure');
  const row = realizeSlot({ role: 'cultivating', propositions: contested, relations: sides });
  return Object.freeze({
    plan: 'disputeDigest', fallback: null, shape: 'cultivating', cell: legalCellFor('cultivating'),
    row, propositions: contested, relations: sides, suppressed: Object.freeze(['lede', 'lens']),
  });
};

// ── 11.7 Gap report — NOT a Plan instance ────────────────────────────────────
// No stanceLegality call, no REC event — a pure NUL/typed-absence filter (§11.7, §16).
export const gapReport = (propositions) => Object.freeze({
  plan: 'gapReport',
  voids: Object.freeze((propositions || []).filter((p) => p.verdict === 'silent' || p.typed === 'void')),
});

// ── 11.8 Caption / margin note — below the template layer, NOT a Plan instance ──
// One realizeSlot call, no planTemplate orchestration above it. sentenceLimit is fixed
// at 1 and enforced here, not merely documented (§11.8, §16).
export const caption = (proposition, { sentenceLimit = 1 } = {}) => {
  if (sentenceLimit !== 1) throw new Error('caption: sentenceLimit must be 1 (§11.8) — no cluster grain permitted');
  return Object.freeze({
    plan: 'caption', shape: 'readout', cell: legalCellFor('readout'),
    row: realizeSlot({ role: 'readout', proposition }), propositions: [proposition],
  });
};

// PLANS — the six real Plan instances. gapReport/caption are exported directly above,
// deliberately absent here (§11.7/§11.8 bypass this registry, and planTemplate).
export const PLANS = Object.freeze({
  definition: (scope) => definitionPlan(scope.propositions, scope.anchor, scope),
  castProfile: (scope) => castProfilePlan(scope.propositions, scope.anchor, scope),
  timeline: (scope) => timelinePlan(scope.propositions, scope),
  relationshipExplainer: (scope) => relationshipExplainerPlan(scope.propositions, scope.from, scope.to, scope),
  comparison: (scope) => comparisonPlan(scope.propositions, scope.x, scope.y, scope),
  disputeDigest: (scope) => disputeDigestPlan(scope.propositions, scope),
});

// planTemplate(planName, scope) -> PlanResult
export const planTemplate = (planName, scope) => {
  const plan = PLANS[planName];
  if (!plan) throw new Error(`planTemplate: unknown plan "${planName}" (gapReport/caption bypass planTemplate entirely — call them directly)`);
  return plan(scope);
};
