// EO: REC·CON(Lens,Link → Lens,Link, Making,Binding) — row-stance legality over ρ
// docs/generate-row-stance-templates.md §3: the row-stance chooser, a direct sibling of
// surfer/stance.js's updateStance — reads the field around a ledger row's own evidence
// and returns the ONE diagonal-legal shape that field supports, never an authored choice.
//
// Implementation note (this file, not the doc): §3's literal pseudocode calls
// core/voidnull.js deriveNull directly on the joined propositions' spectrum. deriveNull
// abstains (returns Infinity) below MIN_SAMPLES=4 background samples — the documented,
// correct behavior for a thin background (voidnull.js: "cold start... the engine then
// holds NUL... rather than forcing a SYN off a null it cannot trust"). A row join is
// almost always 2-6 propositions, i.e. almost always below that floor, so deriveNull
// would abstain on nearly every real row and stanceLegality would never resolve past
// Cultivating. That is not what §3's worked examples (§10.3 n=2→making, §10.4 n=3→
// composing) describe, so this file uses deriveNull only where it has enough background
// to mean something (spectrum.length >= MIN_SAMPLES) and a closed-form structural-rank
// test below that floor: count eigenvalues clearing a fixed epsilon above numerical
// noise. The epsilon test does not ask "does this exceed chance" (there's no chance
// distribution to estimate from 2-3 samples) — it asks "is there real, non-negligible
// mass on this axis at all", which is exactly what a hand-built axis structure (below)
// needs. Composing vs Cultivating is then NOT decided by eigenvalue magnitude at all —
// it is decided by whether the joins that created multi-axis structure are themselves
// ORDERABLE (an OrderSlot grounded, §5) — magnitude only ever decides Making vs
// (Composing|Cultivating), matching §3.1's own "the ordering slot must be filled or this
// degrades to Cultivating" clause, which already anticipated exactly this branch.
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

import { buildDensity, eigenLenses, deriveNull, MIN_SAMPLES, cellAt } from '../../core/index.js';
import { proposeJoin } from './join.js';

const EPS = 0.05; // §3's small-n structural-rank floor — see the file header.

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

// clearedComponents(spectrum) -> number[] — the eigenvalues carrying real, non-negligible
// mass. See the file header for why this is not one uniform rule across every n.
const clearedComponents = (spectrum) => {
  // deriveNull's own leave-one-out drops the background by one sample before checking
  // MIN_SAMPLES, so it only ever produces a finite (non-abstaining) null when the full
  // spectrum has MORE than MIN_SAMPLES entries — `>` here, not `>=`, matches that.
  if (spectrum.length > MIN_SAMPLES) {
    const nul = deriveNull(spectrum, { alpha: 0.05, leaveOut: spectrum[0] });
    return spectrum.filter((w) => w > nul);
  }
  return spectrum.filter((w) => w > EPS);
};

// legalCellFor(shape, domainHint) -> { op, site, stance } | null
// §3.1: the forbidden desert cell. A Cultivating-shaped row whose content sits in the
// Structure domain (a Field-terrain absence) must re-home to the Significance-domain
// Cultivating cell (REC·Atmosphere·Cultivating) — it must never resolve to
// SYN·Field·Cultivating, the one cell core/contract.js's DESERT_CELL forbids outright.
export const legalCellFor = (shape, domainHint) => {
  const CELLS = {
    readout:     { op: 'CON', site: 'Link',      stance: 'Binding' },
    cultivating: { op: 'REC', site: 'Atmosphere', stance: 'Cultivating' },
    making:      { op: 'REC', site: 'Lens',       stance: 'Making' },
    composing:   { op: 'REC', site: 'Paradigm',   stance: 'Composing' },
  };
  const base = CELLS[shape];
  if (!base) return null;
  if (shape === 'cultivating' && domainHint === 'Field') {
    // Never SYN·Field·Cultivating — re-home to the Significance-domain cell instead.
    return legalCellFor('cultivating', null);
  }
  const cell = cellAt(base.op, { site: base.site, stance: base.stance });
  return cell ? Object.freeze({ op: base.op, site: base.site, stance: base.stance }) : null;
};

// stanceLegality(propositions, options) -> { shape, cell, relations, order } | null
//
//   propositions  PropositionGroup[] — closed fields (id, verdict, subject, predicate,
//                 value, originWeight/originIds, date?, isMeasure?), never free text.
//   options.spans EvidenceSpan[] — passed through to proposeJoin for causal grounding.
//   options.domainHint the terrain the joined content's own site resolves to, for §3.1's
//                 desert-cell re-homing (pass 'Field' when the propositions are
//                 themselves about an unstated Structure-domain rule).
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
  const cleared = clearedComponents(spectrum);

  // cleared.length === 0: nothing rises above noise at all — the maximally diffuse
  // reading, the honest reserve regardless of whether a date happens to sequence the
  // propositions (an order over evidence too weak to clear at all is not a regularity).
  // cleared.length === 1: one axis carries real, unshared structure — commit.
  // cleared.length >= 2: genuine multi-part structure — an essay if it is orderable,
  // otherwise the survey (§3.1's degrade clause).
  if (cleared.length === 1) {
    return Object.freeze({
      shape: 'making',
      cell: legalCellFor('making'),
      relations: joins.relations,
      order: null,
    });
  }
  if (cleared.length >= 2 && joins.order) {
    return Object.freeze({
      shape: 'composing',
      cell: legalCellFor('composing'),
      relations: joins.relations,
      order: joins.order,
    });
  }
  return Object.freeze({
    shape: 'cultivating',
    cell: legalCellFor('cultivating', domainHint),
    relations: joins.relations,
    order: null,
  });
};
