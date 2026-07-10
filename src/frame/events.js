// EO: NUL(Void → Field, Tending) — append-only event log (TaskEvent kinds + bind)
// frame/events.js — the append-only event log of the interior holon
// (docs/frame-holon.md): the spine `src/tasks/` proved on the generation axis,
// factored out so the discourse and prediction axes name the same structure.
//
// A FRAME is a standing DEF — an act plus a subject-set of props — that can
// nest. The whole nested structure is PROJECTED from these events (project.js),
// never stored — re-folding the same log yields the identical tree (replay-
// stable), exactly as the parse graph and the task graph are. Because every
// field here is either a path id, a prop list, or a label, the log carries no
// modality: the holon is interior, below the organs/in membrane, and cannot
// leak one.
//
// Six kinds, append-only, each frozen at entry and never edited. The first five
// are the TaskEvent kinds unchanged (tasks/events.js re-exports them):
//
//   open       a frame enters the tree (the goal/act exists, nothing done yet)
//   decompose  a frame is split — its child ids are declared (the children
//              arrive as their own `open` events; this only records the
//              parent→children edge so the projection knows the node is
//              internal, not a leaf)
//   step       progress on a frame (a note; marks it active before it completes)
//   complete   a LEAF produced output (the reach landed)
//   fail       a frame could not be produced (a leaf the model refused, or an
//              internal node whose children all failed)
//
// and one is added for the reactive side (the generation side never needed it —
// its planner declares the tree top-down; the discourse side DISCOVERS which
// level the next event belongs to as the stream arrives):
//
//   bind       records the CON that an incoming event landed on a frame: event
//              `e` bound to frame `F` at coupling `w`. A bind moves the active
//              leaf; a bind to an ANCESTOR is the pop — there is no explicit
//              pop event, the stack shape is a pure projection of the open and
//              bind events (docs/persistence.md falls out for free: replay the
//              log, recover the stack).
//
// Ids are PATHS, minted by the driver as `${parentId}.${childIndex}` off a root.
// A path id is its own position in the tree, so the log is order-independent to
// project and trivially replay-stable: same stream, same binds, same ids.

export const KIND = Object.freeze({
  OPEN:      'open',
  DECOMPOSE: 'decompose',
  STEP:      'step',
  COMPLETE:  'complete',
  FAIL:      'fail',
  BIND:      'bind',
});

const freeze = (e) => Object.freeze(e);

// A frame enters the tree. `parentId` is null for the root. `depth` is the
// nesting level (root = 0), carried so the depth guard and the UI's indent read
// it straight off the event. `grain` is the declared cube Object grain for this
// goal ('Ground' | 'Figure' | 'Pattern' | null) — the projection checks it
// against the node's structural grain (frame/grain.js). `forced` marks a leaf a
// guard made out of a still-splitting goal: structurally a Figure, declared a
// Pattern, so the confab guard flags it.
//
// The two frame-side fields, unused by the generation side (which passes
// neither): `act` — what the frame is doing ('compose' | 'ground' | …), and
// `subject` — the subject-set of PROPS in scope, the modality-blind floor the
// bind couplings (c_subj, c_anc) measure over.
export const openEvent = ({ id, parentId = null, goal, depth = 0, grain = null, forced = false, act = null, subject = [], t = 0 }) => {
  if (!id) throw new TypeError('openEvent: id required');
  return freeze({
    kind: KIND.OPEN, id, parentId, goal: String(goal ?? ''), depth: depth | 0,
    grain: grain ?? null, forced: !!forced,
    act: act ?? null, subject: Object.freeze([...(subject || [])]), t,
  });
};

// A node is declared internal — these are the children it owns. The children are
// opened by their own `open` events; this edge is what tells the projection the
// node is a branch (rollup status) rather than a leaf (its own complete/fail).
export const decomposeEvent = ({ id, childIds, t = 0 }) => {
  if (!id) throw new TypeError('decomposeEvent: id required');
  return freeze({ kind: KIND.DECOMPOSE, id, childIds: Object.freeze([...(childIds || [])]), t });
};

// Progress on a node — a human-readable note. Marks the node `active` in the
// projection (the reach is underway) before its terminal event arrives.
export const stepEvent = ({ id, note = '', t = 0 }) => {
  if (!id) throw new TypeError('stepEvent: id required');
  return freeze({ kind: KIND.STEP, id, note: String(note), t });
};

// A leaf produced output. `sources` are the cited source indices the generation
// bound to (folded up the tree by the projection), mirroring the arc's
// per-section sources so the tree carries the same provenance.
export const completeEvent = ({ id, output = '', sources = [], t = 0 }) => {
  if (!id) throw new TypeError('completeEvent: id required');
  return freeze({
    kind: KIND.COMPLETE, id, output: String(output ?? ''),
    sources: Object.freeze([...(sources || [])]), t,
  });
};

// A node could not be produced. The error is recorded, never thrown away — a
// blocked leaf is part of the trace, the same way the audit keeps a refusing
// veto rather than hiding it.
export const failEvent = ({ id, error = '', t = 0 }) => {
  if (!id) throw new TypeError('failEvent: id required');
  return freeze({ kind: KIND.FAIL, id, error: String(error ?? ''), t });
};

// An incoming event landed on frame `id` — the reactive analogue of `decompose`.
// `unit` is an opaque reference to the incoming event e (a turn index, a note
// position — the holon never reads inside it); `coupling` is the EVA weight w
// the bind measured; `channel` names the coupling that won ('leaf' | 'subject'
// | 'ancestor' | 'novelty'), kept as trace, not consulted by the projection.
//
// The projection reads binds for ONE thing: the active path. A bind moves the
// active leaf to `id`; open frames left off the new path are marked suspended
// (a digression parked, resumable by a later bind), never closed.
export const bindEvent = ({ id, unit = null, coupling = 0, channel = null, t = 0 }) => {
  if (!id) throw new TypeError('bindEvent: id required');
  return freeze({
    kind: KIND.BIND, id, unit: unit ?? null,
    coupling: Number.isFinite(coupling) ? coupling : 0,
    channel: channel ?? null, t,
  });
};
