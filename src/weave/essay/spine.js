// EO: SYN·CON·SEG(Field,Network → Network, Composing,Tracing,Dissecting) — the spine DAG
// essay/spine.js — the spine: a DAG of section intents, not a list.
//
// Order is for rendering; dependencies are for coherence. The spine is the
// integration substitute: the whole essay never fits one workspace, so the
// spine holds the shape and the carry (carry.js) holds the running state.
//
// The spine may move during generation — that is the mechanism, not the
// exception — but motion is BOUNDED (the revision discipline): reorder,
// insert, split and merge touch only pending sections; replan is the single
// motion that may touch the thesis, and accepted sections survive it
// verbatim. Accepted sections are frozen — they sit in the log with a settled
// carry contribution, so moving one would mean re-deriving every carry after
// it; corrections to them land in reconciliation instead.
//
// Everything here is pure: each motion returns a NEW frozen spine.

export const SECTION_STATES = Object.freeze(['pending', 'exploring', 'consolidating', 'accepted']);

const freeze = Object.freeze;
const list = (xs) => freeze([...(xs || [])]);

// Which projection a section renders, and how the seam INTO it may render.
// Modality is a property of the SLOT in the schema — the form chooses, never
// the model. 'auto' seams resolve in the driver: a phrased transition when a
// model is on hand, an honest divider when not.
export const SECTION_MODALITIES = Object.freeze(['text', 'chart', 'pullquote']);
export const SEAM_MODALITIES = Object.freeze(['auto', 'text', 'divider', 'pullquote', 'chart']);

// A section intent. `anchors` seed retrieval; `dependsOn` are the coherence
// edges re-illuminated on entry; `opens` are the promises this section makes
// (threads, with their due points); `divergence` sets the section's policy
// when candidates diverge after veto: 'commit' (the spine breaks the tie) or
// 'surface' (the divergence is the finding — write it as content).
// `modality` names the projection this slot renders; `seam` names how the
// transition into this section renders (null = auto).
export const makeSection = ({
  id, intent, anchors = [], dependsOn = [], order = 0,
  state = 'pending', opens = [], divergence = 'commit',
  modality = 'text', seam = null,
} = {}) => {
  if (!id) throw new TypeError('makeSection: id required');
  if (!intent) throw new TypeError('makeSection: intent required');
  if (!SECTION_STATES.includes(state)) throw new TypeError(`makeSection: state must be one of ${SECTION_STATES.join('|')}`);
  if (divergence !== 'commit' && divergence !== 'surface') throw new TypeError('makeSection: divergence must be commit|surface');
  if (!SECTION_MODALITIES.includes(modality)) throw new TypeError(`makeSection: modality must be one of ${SECTION_MODALITIES.join('|')}`);
  if (seam != null && !SEAM_MODALITIES.includes(seam.modality)) throw new TypeError(`makeSection: seam.modality must be one of ${SEAM_MODALITIES.join('|')}`);
  return freeze({
    id, intent: String(intent), anchors: list(anchors), dependsOn: list(dependsOn),
    order: order | 0, state, divergence, modality,
    seam: seam == null ? null : freeze({ modality: seam.modality }),
    opens: freeze((opens || []).map((o) => freeze({ text: String(o.text ?? ''), dueBy: o.dueBy ?? null }))),
  });
};

export const makeSpine = ({ thesis, frame = null, sections = [] } = {}) => {
  if (!thesis) throw new TypeError('makeSpine: thesis required (the through-line)');
  const secs = sections.map((s, i) => makeSection({ order: i, ...s }));
  const ids = new Set(secs.map((s) => s.id));
  if (ids.size !== secs.length) throw new TypeError('makeSpine: section ids must be unique');
  for (const s of secs) for (const d of s.dependsOn) {
    if (!ids.has(d)) throw new TypeError(`makeSpine: ${s.id} depends on unknown section ${d}`);
  }
  assertAcyclic(secs);
  return freeze({ thesis: String(thesis), frame: frame ?? null, sections: list(secs) });
};

// dependsOn must stay a DAG — a dependency cycle would make render order
// (and re-illumination) undefined.
const assertAcyclic = (secs) => {
  const deps = new Map(secs.map((s) => [s.id, s.dependsOn]));
  const seen = new Map(); // id -> 0 visiting | 1 done
  const visit = (id, trail) => {
    if (seen.get(id) === 1) return;
    if (seen.get(id) === 0) throw new TypeError(`makeSpine: dependency cycle at ${[...trail, id].join(' -> ')}`);
    seen.set(id, 0);
    for (const d of deps.get(id) || []) visit(d, [...trail, id]);
    seen.set(id, 1);
  };
  for (const s of secs) visit(s.id, []);
};

export const sectionOf = (spine, id) => spine.sections.find((s) => s.id === id) || null;

// Render order: topological over dependsOn (a dependency renders before its
// dependent), tie-broken by `order`, then id — deterministic for a given spine.
export const renderOrder = (spine) => {
  const secs = [...spine.sections].sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1));
  const byId = new Map(secs.map((s) => [s.id, s]));
  const done = new Set();
  const out = [];
  const place = (s, trail) => {
    if (done.has(s.id)) return;
    if (trail.has(s.id)) return; // cycle guarded at makeSpine; belt and braces
    trail.add(s.id);
    for (const d of s.dependsOn) { const dep = byId.get(d); if (dep) place(dep, trail); }
    trail.delete(s.id);
    done.add(s.id);
    out.push(s.id);
  };
  for (const s of secs) place(s, new Set());
  return out;
};

const replaceSections = (spine, sections) =>
  freeze({ thesis: spine.thesis, frame: spine.frame, sections: list(sections) });

export const withState = (spine, id, state) => {
  if (!SECTION_STATES.includes(state)) throw new TypeError(`withState: state must be one of ${SECTION_STATES.join('|')}`);
  if (!sectionOf(spine, id)) throw new TypeError(`withState: unknown section ${id}`);
  return replaceSections(spine, spine.sections.map((s) => (s.id === id ? makeSection({ ...s, state }) : s)));
};

const assertPending = (spine, id, op) => {
  const s = sectionOf(spine, id);
  if (!s) throw new TypeError(`${op}: unknown section ${id}`);
  if (s.state === 'accepted') throw new TypeError(`${op}: ${id} is accepted — accepted sections are frozen`);
  return s;
};

// Reorder: change the render order of pending sections. Cheap; may not move
// an accepted section (their positions are pinned by their accepted order).
export const reorder = (spine, orderedIds) => {
  const accepted = spine.sections.filter((s) => s.state === 'accepted').map((s) => s.id);
  const pending = spine.sections.filter((s) => s.state !== 'accepted').map((s) => s.id);
  const want = [...(orderedIds || [])];
  if (want.length !== pending.length || want.some((id) => !pending.includes(id))) {
    throw new TypeError('reorder: orderedIds must be exactly the non-accepted section ids');
  }
  const orderIndex = new Map();
  // Accepted keep their existing relative order values; pending are renumbered
  // after them in the requested order.
  let n = 0;
  for (const id of accepted) orderIndex.set(id, n++);
  for (const id of want) orderIndex.set(id, n++);
  return replaceSections(spine, spine.sections.map((s) => makeSection({ ...s, order: orderIndex.get(s.id) })));
};

// Insert: a new pending section for a bound claim that serves the thesis and
// fits no existing intent.
export const insert = (spine, section, { afterId = null } = {}) => {
  if (sectionOf(spine, section.id)) throw new TypeError(`insert: section ${section.id} already exists`);
  const anchorOrder = afterId ? (sectionOf(spine, afterId)?.order ?? 0) : Math.max(0, ...spine.sections.map((s) => s.order));
  const sec = makeSection({ ...section, order: anchorOrder, state: 'pending' });
  // Shift everything after the anchor down one so the new section slots in.
  const shifted = spine.sections.map((s) => (s.order > anchorOrder ? makeSection({ ...s, order: s.order + 1 }) : s));
  const placed = makeSection({ ...sec, order: anchorOrder + 1 });
  const next = replaceSections(spine, [...shifted, placed]);
  assertAcyclic(next.sections);
  return next;
};

// Split: divide a pending section whose exploration keeps producing two
// non-coherent claim clusters, both spine-relevant.
export const split = (spine, id, parts) => {
  const of = assertPending(spine, id, 'split');
  if (!parts || parts.length < 2) throw new TypeError('split: at least two parts required');
  const rest = spine.sections.filter((s) => s.id !== id);
  const made = parts.map((p, i) => makeSection({
    dependsOn: of.dependsOn, anchors: of.anchors, divergence: of.divergence,
    ...p, order: of.order + i, state: 'pending',
  }));
  const shifted = rest.map((s) => (s.order > of.order ? makeSection({ ...s, order: s.order + made.length - 1 }) : s));
  const next = replaceSections(spine, [...shifted, ...made]);
  assertAcyclic(next.sections);
  return next;
};

// Merge: fold two thin pending sections whose claim sets overlap in the ledger.
export const merge = (spine, ids, merged) => {
  if (!ids || ids.length < 2) throw new TypeError('merge: at least two ids required');
  const olds = ids.map((id) => assertPending(spine, id, 'merge'));
  const keepOrder = Math.min(...olds.map((s) => s.order));
  const rest = spine.sections.filter((s) => !ids.includes(s.id));
  const sec = makeSection({
    anchors: [...new Set(olds.flatMap((s) => s.anchors))],
    dependsOn: [...new Set(olds.flatMap((s) => s.dependsOn))].filter((d) => !ids.includes(d)),
    opens: olds.flatMap((s) => s.opens),
    ...merged, order: keepOrder, state: 'pending',
  });
  // Re-point any dependent of a merged-away id at the merged section.
  const repointed = rest.map((s) => {
    const dep = s.dependsOn.map((d) => (ids.includes(d) ? sec.id : d));
    return makeSection({ ...s, dependsOn: [...new Set(dep)] });
  });
  const next = replaceSections(spine, [...repointed, sec]);
  assertAcyclic(next.sections);
  return next;
};

// Replan: rebuild the spine from a fresh whole-log fold. Expensive, flagged
// loudly (the driver emits the revise event). The ONLY motion that may touch
// the thesis — and accepted sections must survive verbatim: their settled
// carry contributions cannot be re-derived without re-running every doorway
// after them.
export const replan = (spine, next) => {
  const rebuilt = makeSpine(next);
  for (const s of spine.sections) {
    if (s.state !== 'accepted') continue;
    const kept = sectionOf(rebuilt, s.id);
    if (!kept || kept.state !== 'accepted' || kept.intent !== s.intent) {
      throw new TypeError(`replan: accepted section ${s.id} must survive verbatim (state accepted, same intent)`);
    }
  }
  return rebuilt;
};
