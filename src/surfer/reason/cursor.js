// EO: SEG·EVA·REC(Field,Network → Network,Lens,Paradigm, Unraveling,Tracing,Composing) — CURSOR_REV, the generalized fold
// reason/cursor.js — CURSOR_REV: the one generalization of the walk's fold.
//
// walk.js's readGraph(log) folded the flat whole on every step. This module owns the
// generalized signature —
//
//     readGraph(log, cursor = IDENTITY)
//     cursor = { upto, scope, grain, origin, door }
//
// — and IDENTITY folds exactly what the ungeneralized function folded: that identity is
// the golden-parity anchor for every capability below (tools/cursor/probe-replay.mjs and
// tools/cursor/golden-walk.json pin it). Every capability is a SPECIALIZATION of the
// parameter, not a new operator:
//
//   upto    time — the graph as the reader stood in it at seq k, recomputed, not stored.
//           Memory is a fold; revision is the diff of two folds (free once upto exists,
//           because Step 0 folds retraction).
//   scope   the modal family — a supposition is an enactor event tagged scope:S, folded
//           ONLY under its scope. No scope on the cursor → scope-tagged events are
//           invisible, which is what keeps an open hypothetical fully inert for the
//           actual walk (the Gate B discipline, now structural).
//   grain   height — filter figures by grain band; summary is the high band, unpacking
//           descends a SYN to its members.
//   origin  standpoint — restrict to figures reachable from an origin within a radius
//           over the bonds. Attention is the origin set; aboutness is the neighborhood.
//   door    reflection — door:'enactor' reads the reader's own committed acts.
//
// THE INTERVENTION IS DEF, NOT A NEW MOVE (Step 6). Setting X = x is a DEF at the holon
// X. The door is the whole difference between reading a term and intervening on one: a
// corpus DEF enters through the perceiver door (witnessed, grounded); a reader's DEF
// enters through the enactor door (canWitness false, a supposition, mine). The one new
// fold rule is SEVER YOUR GROUNDS: a term-set holon's incoming determiner bonds go slack
// in that fold — to set a term is to make it hold on its own authority, so its former
// determiners no longer derive it. The severing falls out of the operator, not a
// mechanism laid over it. Determiner typing reads dag/stance's causal-verb sets when an
// incoming via carries it; otherwise the conservative rule severs every incoming bond —
// the blunt form of the same cut, refined once the typing is read. A counterfactual is a
// database write through the enactor door instead of the perceiver door, then the
// ordinary walk over the scoped fold. There is no do-operator to add.
//
// Everything here is a read (a fold) except dischargeScope, which appends the one REC
// the scope collapses to — and that event rides the enactor door like every other
// committed act. Nothing removes the firewall; a `conditional` grade is a warrant on a
// scope, never a witness.

import { canWitness, fromEnactor } from '../../core/provenance.js';
import { ESSENTIAL_VERBS, ASSOCIATION_VERBS } from '../dag/stance.js';

export const CURSOR_REV = 1;

export const IDENTITY = Object.freeze({ upto: Infinity, scope: null, grain: null, origin: null, door: null });

const pairKey = (a, b) => (String(a) < String(b) ? `${a}~${b}` : `${b}~${a}`);

// A via is a DETERMINER when it carries causal typing (dag/stance.js's verb sets — the
// causal-incoming edges dag/causal.js reads). Open vias ('employs', 'partners') carry
// none, and for those the conservative cut applies.
const isDeterminerVia = (via) => {
  const w = String(via || '').toLowerCase().split(/\s+/);
  return w.some((t) => ESSENTIAL_VERBS.has(t) || ASSOCIATION_VERBS.has(t));
};

// ── readGraph — the generalized fold ──────────────────────────────────────────
export const readGraph = (log, cursor = IDENTITY) => {
  const { upto = Infinity, scope = null, grain = null, origin = null, door = null } = cursor || {};
  const scopeSet = scope == null ? null : new Set(Array.isArray(scope) ? scope : [scope]);

  // The event gate: time, scope, door. A scope-tagged event folds only under its scope;
  // with no scope on the cursor it is invisible — an open hypothetical never perturbs
  // the actual graph.
  const admit = (e) => {
    if (e.seq > upto) return false;
    if (e.scope != null && (!scopeSet || !scopeSet.has(e.scope))) return false;
    if (door != null && (e.prov?.door ?? 'perceiver') !== door) return false;
    return true;
  };
  const events = log.snapshot().filter(admit);

  // Step 0 — fold retraction: nothing is unwritten, but a SEG retract drops the event at
  // refSeq from every fold that sees the retract. A log with no retracts folds as before.
  const retracted = new Set();
  for (const e of events) if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.add(e.refSeq);

  const figures = new Map();
  let bonds = [];
  const terms = new Map();   // Step 6 — id → { value, door, seq } (a later DEF resets the term)
  for (const e of events) {
    if (retracted.has(e.seq)) continue;
    if ((e.op === 'INS' || e.op === 'SYN') && e.id != null && !figures.has(e.id)) {
      figures.set(e.id, {
        id: e.id, label: String(e.label ?? e.id), door: e.prov?.door ?? 'perceiver', grain: e.grain | 0, seq: e.seq,
        ...(e.scope != null ? { scope: e.scope } : {}),
      });
    }
    if ((e.op === 'CON' || e.op === 'SIG') && e.src != null && (e.tgt ?? e.dst) != null) {
      bonds.push({
        src: e.src, dst: e.tgt ?? e.dst, via: String(e.via || 'rel'), door: e.prov?.door ?? 'perceiver',
        canWitness: canWitness(e.prov ?? null), sentIdx: e.sentIdx ?? null, seq: e.seq,
        ...(e.polarity === '−' ? { polarity: '−' } : {}),
        ...(e.scope != null ? { scope: e.scope } : {}),
      });
    }
    if (e.op === 'DEF' && e.kind == null && e.id != null) {
      terms.set(e.id, {
        value: e.value ?? null, door: e.prov?.door ?? 'perceiver', seq: e.seq,
        ...(e.scope != null ? { scope: e.scope } : {}),
      });
    }
  }

  // Step 6 — sever your grounds. A set term is not a derived one: the holon's FORMER
  // (earlier-seq) incoming determiner bonds go slack in this fold. Slack bonds stay
  // visible (the falsifier reads them) but cannot witness and carry no rule support.
  for (const [id, term] of terms) {
    const f = figures.get(id);
    if (f) f.term = term.value;
    const incoming = bonds.filter((b) => b.dst === id && b.seq < term.seq);
    const typed = incoming.filter((b) => isDeterminerVia(b.via));
    for (const b of (typed.length ? typed : incoming)) b.slack = true;
  }

  // Steps 2 + 3 — standpoint and height, as a keep-set over the figures.
  let keep = null;
  if (grain != null) {
    const min = grain.min ?? -Infinity, max = grain.max ?? Infinity;
    keep = new Set([...figures.values()].filter((f) => f.grain >= min && f.grain <= max).map((f) => f.id));
  }
  if (origin != null) {
    const seeds = Array.isArray(origin.id) ? origin.id : [origin.id ?? origin];
    const radius = origin.radius ?? 1;
    const nbr = new Map();
    for (const b of bonds) {
      if (!nbr.has(b.src)) nbr.set(b.src, []);
      if (!nbr.has(b.dst)) nbr.set(b.dst, []);
      nbr.get(b.src).push(b.dst);
      nbr.get(b.dst).push(b.src);
    }
    const reach = new Set(seeds.filter((s) => figures.has(s)));
    let frontier = [...reach];
    for (let hop = 0; hop < radius && frontier.length; hop++) {
      const next = [];
      for (const id of frontier) for (const n of (nbr.get(id) || [])) {
        if (!reach.has(n)) { reach.add(n); next.push(n); }
      }
      frontier = next;
    }
    keep = keep ? new Set([...keep].filter((id) => reach.has(id))) : reach;
  }
  if (keep) {
    const allFigureIds = new Set(figures.keys());
    for (const id of allFigureIds) if (!keep.has(id)) figures.delete(id);
    const kept = (x) => !allFigureIds.has(x) || figures.has(x);   // non-figure endpoints pass
    bonds = bonds.filter((b) => kept(b.src) && kept(b.dst));
  }

  const grains = new Set([...figures.values()].map((f) => f.grain));
  return { events, figures, bonds, grains, terms, retracted };
};

// ── Step 4 — replayState: the walk's own state, refolded from its committed steps ──
// menu() is a pure function of (graph, { rules, synthesised, bondsSeen }); this refolds
// those three sets from the enactor events with seq <= k, so a PAST menu — the roads not
// taken at step k — is menu(readGraph(log,{upto:k}), replayState(log,k)). Read-only.
export const replayState = (log, k = Infinity) => {
  const rules = [];
  const synthesised = new Set();
  const bondsSeen = new Set();
  for (const e of log.snapshot()) {
    if (e.seq > k) break;
    if ((e.prov?.door ?? 'perceiver') !== 'enactor') continue;
    if (e.op === 'REC' && e.kind == null && e.via != null) rules.push({ via: e.via, support: e.support ?? 0 });
    else if (e.op === 'SYN' && Array.isArray(e.members) && e.members.length >= 2) synthesised.add(pairKey(e.members[0], e.members[1]));
    else if (e.op === 'CON' && e.src != null && (e.tgt ?? e.dst) != null) bondsSeen.add(pairKey(e.src, e.tgt ?? e.dst));
  }
  return { rules, synthesised, bondsSeen };
};

// ── Step 5 — the scope surface ─────────────────────────────────────────────────
// A scope is open the moment a scoped event exists and closed by its discharge REC.
// scopesOf is a pure read; dischargeScope appends the ONE event a scope collapses to.
export const scopesOf = (log) => {
  const scopes = new Map();
  const ensure = (name, seq) => {
    if (!scopes.has(name)) scopes.set(name, { name, openedAt: seq, suppositions: [], consequences: [], discharged: false, dischargedAt: null });
    return scopes.get(name);
  };
  for (const e of log.snapshot()) {
    if (e.scope == null) continue;
    if (e.op === 'REC' && e.kind === 'discharge') {
      const s = ensure(e.scope, e.seq);
      s.discharged = true;
      s.dischargedAt = e.seq;
      continue;
    }
    const s = ensure(e.scope, e.seq);
    (e.supposed ? s.suppositions : s.consequences).push(e);
  }
  return scopes;
};

export const openScopes = (log) =>
  [...scopesOf(log).values()].filter((s) => !s.discharged).map((s) => s.name);

const summarizeEvent = (e) => Object.freeze({
  op: e.op,
  ...(e.id != null ? { id: e.id } : {}),
  ...(e.label != null ? { label: e.label } : {}),
  ...(e.src != null ? { src: e.src, dst: e.tgt ?? e.dst, via: e.via ?? 'rel' } : {}),
  ...(e.value !== undefined && e.op === 'DEF' ? { value: e.value } : {}),
  seq: e.seq,
});

// The discharge event body (no append) — walk.js commits it through its own single
// append path; dischargeScope below appends it for direct callers.
export const buildDischarge = (log, name, { enactment = 'reason' } = {}) => {
  const s = scopesOf(log).get(name);
  if (!s || s.discharged) return null;
  return {
    op: 'REC', kind: 'discharge', scope: name,
    if: s.suppositions.map(summarizeEvent),
    then: s.consequences.map(summarizeEvent),
    prov: fromEnactor(enactment),
  };
};

// DISCHARGE folds S to one conditional claim: S entails its consequences. The claim is
// graded `conditional`, warrant { scope: S }, canWitness false — a warrant on a scope,
// never a witness.
export const dischargeScope = (log, name, opts = {}) => {
  const body = buildDischarge(log, name, opts);
  if (!body) return null;
  const sealed = log.append(body);
  return Object.freeze({
    scope: name, if: body.if, then: body.then, seq: sealed.seq,
    grade: 'conditional', warrant: { scope: name }, canWitness: canWitness(sealed.prov),
  });
};

// ── Step 7 — possibility and necessity, via the contradiction veto ─────────────
// The veto at the walk grain: the same bond both affirmed and denied in one fold (the
// polarity clash detectTensions reads at the document grain). Possibility of P is a
// scope carrying P that folds without a veto; necessity of P is that its negation
// cannot be consistently supposed. Both are READ-ONLY: the supposition rides a snapshot
// shim, never an append.
export const contradictionsIn = (graph) => {
  const byKey = new Map();
  for (const b of graph.bonds) {
    const k = `${b.src}|${b.via}|${b.dst}`;
    if (!byKey.has(k)) byKey.set(k, new Set());
    byKey.get(k).add(b.polarity === '−' ? '−' : '+');
  }
  const out = [];
  for (const [key, pols] of byKey) {
    if (pols.has('+') && pols.has('−')) out.push({ kind: 'polarity-clash', key });
  }
  return out;
};

const shimWith = (log, extra) => ({
  snapshot: () => {
    const base = log.snapshot();
    return [...base, ...extra.map((e, i) => Object.freeze({ ...e, seq: base.length + i }))];
  },
});

export const possible = (log, specs, { scope = '◇', enactment = 'suppose' } = {}) => {
  const prov = fromEnactor(enactment);
  const hypo = (Array.isArray(specs) ? specs : [specs]).map((s) => ({ ...s, scope, supposed: true, prov }));
  const graph = readGraph(shimWith(log, hypo), { scope });
  const conflicts = contradictionsIn(graph);
  return Object.freeze({ possible: conflicts.length === 0, conflicts: Object.freeze(conflicts), scope });
};

export const necessary = (log, spec, opts = {}) => {
  const negated = { ...spec, polarity: spec.polarity === '−' ? '+' : '−' };
  const p = possible(log, [negated], { scope: opts.scope || '□', enactment: opts.enactment });
  return Object.freeze({
    necessary: !p.possible,
    counterexample: p.possible ? Object.freeze(negated) : null,
    conflicts: p.conflicts,
  });
};

// ── Step 8 — reflection: reading turned around, reusing the same cursor ────────
// readGraph(log, { door:'enactor', upto: k-1 }) reads the reader's own committed acts.
// A pass reads acts with seq < k and never its own committing event — stratification by
// log order, no self-reference knot. Each reach is REGRADED against the graph and walk
// state as they stood entering that step (the upto + replayState refolds), so an idle
// reach is surfaced by the same rule that graded it live.
export const reflect = (log, { upto = null } = {}) => {
  const k = upto == null ? log.length : upto;
  const mine = readGraph(log, { door: 'enactor', upto: k - 1 });
  const full = readGraph(log, { upto: k - 1 });

  const idleReaches = [];
  for (const b of mine.bonds) {
    const then = readGraph(log, { upto: b.seq - 1 });
    const state = replayState(log, b.seq - 1);
    const witnessed = then.bonds.some((w) => w.canWitness && !w.slack && w.src === b.src && w.dst === b.dst && w.via === b.via);
    const ruled = state.rules.some((r) => r.via === b.via && r.support >= 2);
    if (!witnessed && !ruled) idleReaches.push({ kind: 'CON', seq: b.seq, src: b.src, dst: b.dst, via: b.via });
  }
  for (const f of mine.figures.values()) {
    if (f.grain <= 0) continue;   // a synthesis is grain >= 1; a plain enactor INS is not a reach
    const state = replayState(log, f.seq - 1);
    const ruled = state.rules.some((r) => r.via === 'coheres' && r.support >= 2);
    if (!ruled) idleReaches.push({ kind: 'SYN', seq: f.seq, id: f.id, label: f.label });
  }
  idleReaches.sort((a, b) => a.seq - b.seq);

  const builtOnSelfChains = [];
  for (const b of mine.bonds) {
    const sf = full.figures.get(b.src), df = full.figures.get(b.dst);
    if (sf?.door === 'enactor' || df?.door === 'enactor') {
      builtOnSelfChains.push({ seq: b.seq, src: b.src, dst: b.dst, via: b.via });
    }
  }

  return Object.freeze({
    upto: k,
    idleReaches: Object.freeze(idleReaches),
    undischargedScopes: Object.freeze(openScopes(log)),
    builtOnSelfChains: Object.freeze(builtOnSelfChains),
  });
};
