// EO: CON·EVA·SEG(Network → Network,Lens, Tracing,Binding,Dissecting) — the DAG + two gates + posture (§3,§4)
// write/scheduler.js — the DAG, the two gates, the posture. (SPEC §3, §4)
//
// Generation is a sequence of CELLS, each an event to realize. Their dependency
// edges are not stylistic — they are TYPE NECESSITIES. Two gates ride the DAG:
//
//   ARITY (HARD, type-level, medium-blind, §3a)
//     A relation has arity; its argument slots cannot be empty. You cannot CON a
//     figure that has not APPEARED as a filled slot. Appearance IS the INS
//     (INS-by-appearance). A CON cell is schedulable IFF every argument Site is in
//     the frontier. A CON with an unfilled slot does not PARSE — it is not "bad
//     style," it is not-an-event. The scheduler enforces this and never relaxes it.
//     SYN closes a holon and PROMOTES the whole to an INS-able figure one grain up;
//     a grain-(g+1) CON is well-formed iff both constituent SYNs have fired — the
//     type constraint recurses up the holon stack.
//
//   RESOLUTION (SOFT, confidence-level, §3b)
//     Resolution PROPAGATES along the DAG; VOID DOMINATES:
//       effectiveRes(cell) = min over deps (void < firm).
//     A SYN over any void-resolved constituent inherits void and must HEDGE.
//     Firming it up is an OVERCLAIM, caught by the witness (§7). This is the
//     elasticity knob made mechanical, and it produces BETTER output — the thesis
//     hedges the metaphysical claim automatically because `meaning` is void.
//
//   INVARIANT. Arity is a type law (unparseable if violated; enforced here).
//   Resolution is a confidence gate (can be void; propagates; witness flags
//   overclaim). Never conflate them — the deferred-introduction / mystery case is
//   a void IDENTITY Resolution over a firm EXISTENCE hash, not an arity violation.
//
// THE SCHEDULER is Kahn's algorithm over the DAG. The DAG is the INVARIANT; the
// linearization is the POSTURE (style). Tie-breaks encode posture: `narrative` =
// source order; `thesis-first` = pull synthesis-related material earlier where
// legal. Both are ZERO-violation linearizations of the SAME DAG. Posture is the
// user's to set, not the system's to guess.
//
// Proven in the sanity kernel: baseline (no gate) = structural violations;
// substrate (gate + propagation) = 0, under ≥2 distinct postures.

import { BANDS, makeResolution, effectiveRes, isVoid, isFirm } from '../../core/index.js';

// ── Cell normalization ───────────────────────────────────────────────────────
// A scheduler cell needs five things; everything else (target, spans) rides along
// untouched for the cursor (§5). We tolerate the kernel's shorthands.
//
//   id        unique cell id
//   op        the operator (INS/CON/SYN/…), a.k.a. kind
//   args      argument Site hashes — the slots the ARITY gate checks (relations)
//   deps      dependency cell ids (and/or hashes resolved to their producer cell)
//   res       this cell's own Resolution band — the INS seed for propagation
//   promotes  SYN only: the hash of the higher-grain figure it mints
//   appears   extra hashes this cell's surface brings into the frontier by use
const opOf   = (c) => c.op ?? c.kind;
const argsOf = (c) => (c.args ?? sitesHashes(c)).filter(Boolean);
const sitesHashes = (c) => {
  const s = c.site ?? c.sites ?? null;
  if (s == null) return [];
  const arr = Array.isArray(s) ? s : [s];
  return arr.map(x => (typeof x === 'string' ? x : x?.hash)).filter(Boolean);
};
const promotesHash = (c) => (typeof c.promotes === 'string' ? c.promotes : c.promotes?.hash) ?? null;
const appearsOf = (c) => (c.appears ?? c.extraAppear ?? []).map(x => (typeof x === 'string' ? x : x?.hash)).filter(Boolean);

// What a cell brings into the frontier when it fires (§3a): an INS appears its
// site; a relation appears its arguments (and any extra it introduces by use); a
// SYN appears its promoted figure.
const appearancesOf = (c) => {
  const op = opOf(c);
  const out = new Set(appearsOf(c));
  if (op === 'INS') for (const h of sitesHashes(c)) out.add(h);
  if (op === 'CON' || op === 'SIG' || op === 'EVA') for (const h of argsOf(c)) out.add(h);
  if ((op === 'SYN' || op === 'REC') && promotesHash(c)) out.add(promotesHash(c));
  return [...out];
};

// ── Resolution propagation (§3b) ─────────────────────────────────────────────
// void dominates along the DAG. INS cells seed from their own band; every other
// cell folds the min (weaker) over its dependency resolutions. Iterated to a
// fixpoint, so a void deep in the stack reaches the top SYN. Returns a Map of
// cell id → Resolution { band, p }.
export const propagateResolution = (cells) => {
  const byId = new Map(cells.map(c => [c.id, c]));
  const res = new Map();
  for (const c of cells) {
    if (opOf(c) === 'INS') res.set(c.id, toRes(c.res));
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of cells) {
      if (opOf(c) === 'INS') continue;
      const deps = (c.deps || []).map(d => res.get(d)).filter(Boolean);
      // a cell with its OWN declared band (a void Site like `meaning`) seeds with it
      const own = c.res != null ? [toRes(c.res)] : [];
      const r = effectiveRes([...own, ...deps]);
      const prev = res.get(c.id);
      if (!prev || prev.band !== r.band || prev.p !== r.p) { res.set(c.id, r); changed = true; }
    }
  }
  // any cell still unresolved (no deps, non-INS) defaults firm
  for (const c of cells) if (!res.has(c.id)) res.set(c.id, toRes(c.res));
  return res;
};

const toRes = (band) =>
  band == null ? makeResolution(BANDS.FIRM)
  : typeof band === 'string' ? makeResolution(band)
  : makeResolution(band.band, band.p);

// ── The arity gate (§3a) ─────────────────────────────────────────────────────
// A relation cell is schedulable IFF every argument Site is in the frontier.
// Non-relations (INS/SYN/DEF/…) carry no two-slot arity obligation, so they gate
// on their dependency edges alone.
export const arityReady = (cell, frontier) => {
  const op = opOf(cell);
  if (op !== 'CON' && op !== 'SIG' && op !== 'EVA') return true;
  return argsOf(cell).every(h => frontier.has(h));
};

// ── The scheduler — Kahn's algorithm + posture tie-break (§4) ─────────────────
// The DAG is the invariant; the posture is the linearization. Returns the ordered
// cells. Throws if the DAG has a cycle (a malformed plan), naming the stuck cells.
export const schedule = (cells, { posture = 'narrative', tiebreak = null } = {}) => {
  const byId = new Map(cells.map(c => [c.id, c]));
  const idx  = new Map(cells.map((c, i) => [c.id, i]));     // source/graph order

  // map a hash to the cell that produces it (INS site / SYN promotes), so a dep
  // expressed as a hash resolves to its producer cell.
  const producer = new Map();
  for (const c of cells) {
    if (opOf(c) === 'INS') for (const h of sitesHashes(c)) producer.set(h, c.id);
    if ((opOf(c) === 'SYN' || opOf(c) === 'REC') && promotesHash(c)) producer.set(promotesHash(c), c.id);
  }
  const normDep = (d) => byId.has(d) ? d : (producer.has(d) ? producer.get(d) : null);

  const indeg = new Map(cells.map(c => [c.id, 0]));
  const out   = new Map(cells.map(c => [c.id, []]));
  for (const c of cells) {
    const deps = new Set((c.deps || []).map(normDep).filter(Boolean));
    for (const d of deps) { out.get(d).push(c.id); indeg.set(c.id, indeg.get(c.id) + 1); }
  }

  const cmp = tiebreak || postureTiebreak(posture, idx);
  const ready = cells.filter(c => indeg.get(c.id) === 0).map(c => c.id);
  const frontier = new Set();
  const order = [];
  while (ready.length) {
    ready.sort(cmp);
    // honor the HARD arity gate at release: prefer a ready cell whose arguments
    // have appeared. In a well-formed DAG the dep edges already guarantee this, but
    // the gate is the invariant, so we never release a relation with an empty slot.
    let pick = ready.findIndex(id => arityReady(byId.get(id), frontier));
    if (pick < 0) pick = 0;                                  // (malformed plan; topo still drains)
    const id = ready.splice(pick, 1)[0];
    const cell = byId.get(id);
    order.push(cell);
    for (const h of appearancesOf(cell)) frontier.add(h);
    for (const m of out.get(id)) if (indeg.set(m, indeg.get(m) - 1).get(m) === 0) ready.push(m);
  }
  if (order.length !== cells.length) {
    const stuck = cells.filter(c => !order.includes(c)).map(c => c.id);
    throw new Error(`schedule: dependency cycle, cannot order ${stuck.join(', ')}`);
  }
  return order;
};

// narrative = graph/source order; thesis-first = pull synthesis-related cells (SYN
// and the top) earlier where legal. Both drain the same DAG to zero violations.
const postureTiebreak = (posture, idx) => (a, b) => {
  if (posture === 'thesis-first') {
    const rank = (id) => (/^s_/.test(id) || id === 'top' || /syn/i.test(id)) ? 0 : 1;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
  }
  return (idx.get(a) ?? 0) - (idx.get(b) ?? 0);
};

// ── The witness as a JUDGE — count structural violations (§3, the sanity kernel) ─
// Independent of any renderer. Walk an emission order against the true frontier and
// count: arity (a relation connecting an un-appeared figure), unsupported-SYN (a
// synthesis over a constituent that has not fired/appeared). A zero count is a legal
// linearization of the DAG.
export const judge = (order) => {
  const appeared = new Set();
  const fired = new Set();
  let arity = 0, unsupported = 0;
  for (const cell of order) {
    const op = opOf(cell);
    if (op === 'CON' || op === 'SIG' || op === 'EVA') {
      for (const h of argsOf(cell)) if (!appeared.has(h)) arity++;
    }
    if (op === 'SYN' || op === 'REC') {
      for (const d of (cell.deps || [])) {
        const depCell = order.find(c => c.id === d);
        if (depCell) { if (!fired.has(d)) unsupported++; }
        else if (!appeared.has(d)) unsupported++;            // a hash dep that never appeared
      }
    }
    for (const h of appearancesOf(cell)) appeared.add(h);
    fired.add(cell.id);
  }
  return { arity, unsupported, total: arity + unsupported };
};

// overclaims — the SOFT gate's failure, counted (§3b). A SYN cell whose PROPAGATED
// resolution is void but which was rendered FIRM is an overclaim. With the
// substrate ON the renderer is handed the propagated band and hedges, so the count
// is 0; with it OFF (a naive always-firm renderer) every void synthesis overclaims.
export const overclaims = (order, resolution, { handedResolution = true } = {}) => {
  if (handedResolution) return 0;                            // the renderer hedged what it was handed
  let n = 0;
  for (const cell of order) {
    const op = opOf(cell);
    if ((op === 'SYN' || op === 'REC') && isVoid(resolution.get(cell.id))) n++;
  }
  return n;
};

// ── collapseGranularity — the knob between sentence-by-sentence and hold-the-
// paragraph (§4/§6). Group the ordered cells into draws of N. Bounded by the
// renderer's working span (open question §13.4); instrument it.
export const groupByGranularity = (order, n = 1) => {
  const g = Math.max(1, n | 0);
  const groups = [];
  for (let i = 0; i < order.length; i += g) groups.push(order.slice(i, i + g));
  return groups;
};

export { isVoid, isFirm };
