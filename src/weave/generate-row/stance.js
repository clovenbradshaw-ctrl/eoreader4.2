// EO: REC·CON(Lens,Link → Lens,Link, Making,Binding) — row-stance legality over ρ
// docs/generate-row-stance-templates.md §3: the row-stance chooser, a direct sibling of
// surfer/stance.js's updateStance — reads the field around a ledger row's own evidence
// and returns the ONE diagonal-legal shape that field supports, never an authored choice.
// docs/universalizing-stance-face.md: the "does this spectrum clear one component,
// several orderable ones, or none" test and the desert-cell guard now live in the one
// shared instrument, core/stance-face.js, alongside surfer/stance.js's identical test.
// This file keeps everything ROW-SPECIFIC: the join-axis construction (activationVectors)
// and the public {op, site, stance} cell shape both existing callers and tests depend on.
//
// legalCellFor's small per-shape (mode, domain, grain) table below is the ROW's own
// declared reach — every shape it can ever name — resolved through cellForGrain's real
// operator lookup instead of a hand-rolled CELLS table naming an operator directly.
// `domainHint` is accepted for backward compatibility (existing callers/tests pass it)
// but never changes the resolved domain: this caller only ever fires REC (for
// making/cultivating/composing) or CON (for readout), so it structurally cannot reach
// SYN·Field·Cultivating — the desert cell — regardless of the hint (finding #3: the
// original re-homing branch was dead code for exactly this reason). The dynamic guard
// that makes a GENUINE Structure-domain caller's desert cell impossible to construct
// lives in core/stance-face.js's cellForGrain (§6), for whichever future caller adds one.
//
// The activation vectors themselves are also this file's own construction, not
// re-derived from surfer/stance.js (which reads a genuinely continuous field over
// reading positions — no such field exists for a handful of discrete propositions).
// Each COHERENCE-CREATING join (agree/causal, and each adjacent pair of a dated
// OrderSlot) gets its own orthogonal axis; every proposition that shares such an axis
// with another proposition projects onto it; a proposition touching no coherence axis
// gets a private axis of its own. oppose/measure/contrasts/qualifies joins are recorded
// (for §6 rendering) but never merge two propositions onto one axis — two opposed
// readings must not spuriously look like one commanding reading.

import { buildDensity, eigenLenses, readStanceFace, cellForGrain, makeStanceCapability } from '../../core/index.js';
import { proposeJoin } from './join.js';

const COHERENCE_KINDS = new Set(['agree', 'causal']);

// activationVectors(propositions, joins) -> { vectors, weights, axisOf }
// Builds one unit vector per proposition over an axis space defined by the grounded
// coherence structure (never by an external embedder — release invariant, §16).
const activationVectors = (propositions, joins) => {
  const axisIndex = new Map(); // axis key -> column index
  const touches = new Map(propositions.map((p) => [p.id, new Set()]));
  const axisKey = (...parts) => parts.join('|');

  const addTouch = (id, key) => {
    if (!axisIndex.has(key)) axisIndex.set(key, axisIndex.size);
    touches.get(id)?.add(key);
  };

  for (const rel of joins.relations || []) {
    if (!COHERENCE_KINDS.has(rel.kind)) continue;
    const key = axisKey('rel', rel.kind, rel.memberIds.join('+'));
    for (const id of rel.memberIds) addTouch(id, key);
  }
  if (joins.order) {
    const ids = joins.order.memberIds;
    for (let i = 0; i < ids.length - 1; i++) {
      const key = axisKey('order', ids[i], ids[i + 1]);
      addTouch(ids[i], key);
      addTouch(ids[i + 1], key);
    }
  }
  // Anything untouched by a coherence axis gets a private axis of its own.
  for (const p of propositions) {
    if (touches.get(p.id).size === 0) addTouch(p.id, axisKey('solo', p.id));
  }

  const dim = axisIndex.size;
  const vectors = [];
  const weights = [];
  for (const p of propositions) {
    const raw = new Array(dim).fill(0);
    for (const key of touches.get(p.id)) raw[axisIndex.get(key)] = 1;
    const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0)) || 1;
    vectors.push(raw.map((x) => x / norm));
    weights.push(Math.max(1e-9, Number(p.originWeight) || (p.originIds?.length ?? 1)));
  }
  return { vectors, weights };
};

// This caller's own declared reach (docs/universalizing-stance-face.md §7): a row's
// join graph can reach every grain — Ground (nothing rises above noise, or multi-part
// structure with no order to name it by), Figure (one clean axis), Pattern (multi-axis
// structure an OrderSlot actually grounds).
const ROW_CAPABILITY = makeStanceCapability({
  mode: 'Generate',
  reachableGrains: ['Ground', 'Figure', 'Pattern'],
  unreachable: {},
});

// The (mode, domain, grain) each of the four row shapes resolves at. `readout` (a
// single sourced proposition, nothing to measure) is the Relate×Structure Figure cell —
// CON(Link, Binding), the bond that cites a source — never REC; the other three are
// Generate×Interpretation, one per grain.
const SHAPE_FACE = Object.freeze({
  readout:     Object.freeze({ mode: 'Relate',   domain: 'Structure' }),
  cultivating: Object.freeze({ mode: 'Generate', domain: 'Interpretation', grain: 'Ground' }),
  making:      Object.freeze({ mode: 'Generate', domain: 'Interpretation', grain: 'Figure' }),
  composing:   Object.freeze({ mode: 'Generate', domain: 'Interpretation', grain: 'Pattern' }),
});

const cellObjectFor = (mode, domain, grain) => {
  const cell = cellForGrain(mode, domain, grain);
  return cell.refused ? null : Object.freeze({ op: cell.op, site: cell.terrain, stance: cell.stance });
};

// legalCellFor(shape, domainHint) -> { op, site, stance } | null
export const legalCellFor = (shape, domainHint) => {
  const face = SHAPE_FACE[shape];
  if (!face) return null;
  if (shape === 'readout') return cellObjectFor(face.mode, face.domain, 'Figure');
  return cellObjectFor(face.mode, face.domain, face.grain);
};

const SHAPE_OF_GRAIN = Object.freeze({ Figure: 'making', Pattern: 'composing', Ground: 'cultivating' });

// stanceLegality(propositions, options) -> { shape, cell, relations, order } | null
//
//   propositions  PropositionGroup[] — closed fields (id, verdict, subject, predicate,
//                 value, originWeight/originIds, date?, isMeasure?), never free text.
//   options.spans EvidenceSpan[] — passed through to proposeJoin for causal grounding.
//   options.domainHint accepted for backward compatibility; never changes the resolved
//                 cell (see the file header — this caller cannot reach the desert cell).
//
// Returns null for n === 0 (nothing to measure — the caller renders the fixed void
// template, §10.5, not a shape).
export const stanceLegality = (propositions, { spans = [], domainHint = null } = {}) => {
  const props = propositions || [];
  if (props.length === 0) return null;

  if (props.length === 1) {
    return Object.freeze({ shape: 'readout', cell: legalCellFor('readout'), relations: [], order: null });
  }

  const joins = proposeJoin(props, { spans });
  const { vectors, weights } = activationVectors(props, joins);
  const { rho } = buildDensity(vectors, weights);
  const spectrum = eigenLenses(rho).map((l) => l.weight);

  // cleared.length === 0: nothing rises above noise at all — the maximally diffuse
  // reading, the honest reserve regardless of whether a date happens to sequence the
  // propositions (an order over evidence too weak to clear at all is not a regularity).
  // cleared.length === 1: one axis carries real, unshared structure — commit.
  // cleared.length >= 2: genuine multi-part structure — an essay if it is orderable,
  // otherwise the survey (§3.1's degrade clause) — readStanceFace makes exactly this
  // three-way call (core/stance-face.js §4), shared with surfer/stance.js.
  const reading = readStanceFace({
    spectrum, mode: 'Generate', domain: 'Interpretation',
    capability: ROW_CAPABILITY, orderable: Boolean(joins.order),
  });

  const shape = SHAPE_OF_GRAIN[reading.grain];
  return Object.freeze({
    shape,
    cell: legalCellFor(shape, domainHint),
    relations: joins.relations,
    order: shape === 'composing' ? joins.order : null,
  });
};
