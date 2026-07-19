// EO: SYN·SEG·EVA(Lens → Lens,Paradigm, Composing·Unraveling·Tracing) — the frame channel
// The referent identity channel (perceiver/referents/) recursed up the Domain axis to the
// Significance row (docs/referents-recursed-up-the-domain-axis.md, D5). A referent is a centre
// of mass over surfaces; a FRAME is a centre of mass over readings — and it earns the same
// append-only, defeasible verb-set the referent has, one grain up:
//
//   SYN kind:'frame-denotes' from: readingId to: frameId   — a reading reads under a frame
//   SYN kind:'frame-merge'   from: frameId   to: frameId   — two readings share one frame
//   SYN kind:'frame-split'   from: frameId   to: frameId   — two frames are DISTINCT (blocks merge)
//   SEG kind:'retract'       refSeq: <seq>                 — supersede a prior assertion by seq
//
// The one thing that is genuinely new at this grain is the NEGATIVE evidence a proposal is
// checked against. For referents it is a bornOn conflict, a contested surname, a coordinated
// distinctness (evaluate.js). For frames it is INCOMMENSURABILITY: two readings whose bases do
// not commute past a within-document baseline read in different paradigms, and merging them
// under one frame is the category error the diagonal forbids. Conflict defeats convergence,
// exactly as it does for referents — a proposal converges only when no incommensurability
// conflict, and a split dominates any proposed merge.
//
// A frame id is OPAQUE (`frame-N`), never a slug of a stance or a thesis sentence — identity
// lives in the quotient, not the spelling, the same invariant one Domain down.

import { eigenLenses, projectorFrom, commutator, buildDensity } from '../core/index.js';

const round = (x) => Math.round(x * 1e4) / 1e4;

// ── the incommensurability fact — the frames' negative evidence ─────────────────────────────
// frameIncommensurability(actsA, actsB, { rank }) → { incommensurability, baseline }
// The paradigm commutator (surf.js paradigmReading), read between two readings rather than a
// reading and the corpus: how far the two eigen-bases fail to commute, against the baseline of
// how far the POOLED material's own two halves fail to (two bodies everyone agrees are
// commensurable). Above the baseline the two read in genuinely different frames.
export const frameIncommensurability = (actsA, actsB, { rank = 3 } = {}) => {
  const a = actsA || [], b = actsB || [];
  if (a.length < rank || b.length < rank) return { incommensurability: null, baseline: null };
  const proj = (acts) => projectorFrom(eigenLenses(buildDensity(acts).rho, { k: rank }).map(l => l.lens));
  const pa = proj(a), pb = proj(b);
  const incommensurability = commutator(pa, pb);
  // Baseline: split the POOLED material in two commensurable halves and measure their
  // non-commutation — the chance floor generic non-commutation throws up (surf.js's calibration).
  const pooled = a.concat(b);
  const half = pooled.length >> 1;
  let baseline = null;
  if (half >= rank && pooled.length - half >= rank)
    baseline = commutator(proj(pooled.slice(0, half)), proj(pooled.slice(half)));
  return { incommensurability: round(incommensurability), baseline: baseline == null ? null : round(baseline) };
};

// ── the evaluator — convergence vs conflict, the sibling of referents/evaluate.js ───────────
// evaluateFrameConvergence(a, b, facts, { isSplit }) → { verdict, reason, evidence }
//   facts: { incommensurability, baseline }   hyst: the margin a defeat must clear (cube.md #8)
export const evaluateFrameConvergence = (a, b, facts = {}, { isSplit, hyst = 1.5 } = {}) => {
  // An explicit split is the heaviest signal — a reader/model asserted the frames distinct.
  if (typeof isSplit === 'function' && isSplit(a, b))
    return { verdict: 'conflict', reason: 'asserted-distinct', evidence: ['frame-split'] };

  // Incommensurability past the baseline margin is the paradigm's functional-key conflict: the
  // two read under different frames, so they must not bridge (the 282-mass blob, held apart).
  const { incommensurability: inc, baseline: base } = facts;
  if (Number.isFinite(inc) && Number.isFinite(base)) {
    if (inc > base * hyst)
      return { verdict: 'conflict', reason: 'incommensurable', evidence: ['commutator', round(inc), round(base)] };
    return { verdict: 'converge', reason: 'commensurable', evidence: ['commutator', round(inc), round(base)] };
  }
  // No measurable evidence either way — HELD, never a silent merge (the referent discipline).
  return { verdict: 'held', reason: 'insufficient-evidence', evidence: [] };
};

// ── the quotient fold — the sibling of referents/field.js ───────────────────────────────────
// foldFrames(events) → { readingOf, surfacesOf, roots, rootOf, isSplit }
export const foldFrames = (events = []) => {
  const evs = Array.isArray(events) ? events : [];
  const retracted = new Set();
  for (const e of evs) if (e.op === 'SEG' && e.kind === 'retract' && e.refSeq != null) retracted.add(e.refSeq);

  const keyOf = (a, b) => (a < b ? `${a}␟${b}` : `${b}␟${a}`);
  const splitPairs = new Set();
  for (const e of evs)
    if (e.op === 'SYN' && e.kind === 'frame-split' && !retracted.has(e.seq)) splitPairs.add(keyOf(e.from, e.to));

  const parent = new Map();
  const find = (x) => { let r = x; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r); parent.set(x, r); return r; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const surfToFrame = new Map();
  const rootsSeen = [];
  const see = (r) => { find(r); if (!rootsSeen.includes(r)) rootsSeen.push(r); };
  for (const e of evs) {
    if (e.op !== 'SYN' || e.kind !== 'frame-denotes' || retracted.has(e.seq)) continue;
    surfToFrame.set(e.from, e.to); see(e.to);
  }
  for (const e of evs) {
    if (e.op !== 'SYN' || e.kind !== 'frame-merge' || retracted.has(e.seq)) continue;
    see(e.from); see(e.to);
    if (splitPairs.has(keyOf(find(e.from), find(e.to)))) continue;   // conflict dominates convergence
    union(e.from, e.to);
  }

  const readingOf = (surfaceId) => { const f = surfToFrame.get(surfaceId); return f == null ? null : find(f); };
  const order = [];
  for (const e of evs) if (e.op === 'SYN' && e.kind === 'frame-denotes' && !retracted.has(e.seq)) order.push(e.from);
  const surfacesOf = (frameId) => { const r = find(frameId); return order.filter((s) => readingOf(s) === r); };
  const roots = [...new Set(rootsSeen.map((r) => find(r)))];
  return { readingOf, surfacesOf, roots, rootOf: (f) => find(f), isSplit: (a, b) => splitPairs.has(keyOf(find(a), find(b))) };
};

// A tiny append-only log so the channel is usable standalone (a test, a probe) without the doc
// log; a caller with a real log injects it and the events land there instead.
const memoryLog = () => {
  const events = [];
  return { events, snapshot: () => events, append: (e) => { const ev = { ...e, seq: events.length }; events.push(ev); return ev; } };
};

const minter = (events) => {
  let max = 0;
  for (const e of events) for (const v of [e.to, e.from]) {
    const m = typeof v === 'string' && /^frame-(\d+)$/.exec(v);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return { mint: () => `frame-${++max}` };
};

// ── the builder — the sibling of referents/index.js's proposeCoreference/assert/split/retract ─
export const buildFrameChannel = ({ log = memoryLog() } = {}) => {
  const EMIT = Object.freeze({ src: 'src/surfer/frame-channel.js' });
  const snap = () => (log.snapshot ? log.snapshot() : log.events);
  const fold = () => foldFrames(snap());

  // Ensure a reading has a frame to operate on (mint + denote it) — append-only.
  const ensure = (surfaceId, warrant) => {
    const existing = fold().readingOf(surfaceId);
    if (existing) return existing;
    const id = minter(snap()).mint();
    log.append({ op: 'SYN', kind: 'frame-denotes', from: surfaceId, to: id, warrant: warrant || 'observed', defeasible: true }, EMIT);
    return id;
  };

  return {
    readings: () => fold().roots.map((root) => ({ id: root, surfaces: fold().surfacesOf(root) })),
    readingOf: (surfaceId) => fold().readingOf(surfaceId),
    surfacesOf: (frameId) => fold().surfacesOf(frameId),

    // The mechanical / model proposer — CHECKED against incommensurability (conflict defeats
    // convergence). `facts` carries the { incommensurability, baseline } from frameIncommensurability.
    proposeFrame: (surfaceIds, facts = {}, opts = {}) => {
      const ids = [...new Set(surfaceIds || [])];
      if (ids.length < 2) return { verdict: 'held', reason: 'need-two-surfaces' };
      const a = ensure(ids[0], 'proposal');
      const results = [];
      for (const sid of ids.slice(1)) {
        const b = ensure(sid, 'proposal');
        const ra = fold().readingOf(ids[0]) || a, rb = fold().readingOf(sid) || b;
        const ev = evaluateFrameConvergence(ra, rb, facts, { isSplit: fold().isSplit, hyst: opts.hyst });
        if (ev.verdict === 'converge') {
          const e = log.append({ op: 'SYN', kind: 'frame-merge', from: ra, to: rb,
                                 warrant: opts.warrant || 'proposed-frame', evidence: ev.evidence,
                                 confidence: opts.confidence ?? 0.7, defeasible: true }, EMIT);
          log.append({ op: 'EVA', site: 'Paradigm', ref: e.seq, verdict: 'CORROBORATED', reason: ev.reason }, EMIT);
        } else if (ev.verdict === 'conflict') {
          log.append({ op: 'EVA', site: 'Paradigm', verdict: 'CONTRADICTED', reason: ev.reason, a: ra, b: rb }, EMIT);
        }
        results.push({ surface: sid, ...ev });
      }
      const conflict = results.find((r) => r.verdict === 'conflict');
      if (conflict) return { verdict: 'conflict', reason: conflict.reason, results };
      // No conflict: converge if anything actually merged, else held — a proposal with no
      // measurable evidence never reports convergence (the referent discipline: held is not yes).
      return results.some((r) => r.verdict === 'converge')
        ? { verdict: 'converge', results }
        : { verdict: 'held', reason: 'insufficient-evidence', results };
    },

    // The reader / model channel — authoritative. Unify the frames of the selected readings.
    assertFrame: (surfaceIds, metadata = {}) => {
      const ids = [...new Set(surfaceIds || [])];
      if (ids.length < 2) return { ok: false, reason: 'need-two-surfaces' };
      const anchor = ensure(ids[0], 'user-assert');
      const seqs = [];
      for (const sid of ids.slice(1)) {
        const other = ensure(sid, 'user-assert');
        const a = fold().readingOf(ids[0]) || anchor, b = fold().readingOf(sid) || other;
        if (a === b) continue;
        const e = log.append({ op: 'SYN', kind: 'frame-merge', from: a, to: b, user: true,
                               warrant: metadata.warrant || 'reader-frame', confidence: metadata.confidence ?? 1, defeasible: true }, EMIT);
        seqs.push(e.seq);
      }
      return { ok: true, seqs };
    },

    // Assert two readings sit under DISTINCT frames — a split that BLOCKS any proposed re-merge.
    splitFrame: (surfaceIds, metadata = {}) => {
      const ids = [...new Set(surfaceIds || [])];
      if (ids.length < 2) return { ok: false, reason: 'need-two-surfaces' };
      const a = ensure(ids[0], 'user-split');
      let b = fold().readingOf(ids[1]);
      if (b == null || b === a) {
        b = minter(snap()).mint();
        log.append({ op: 'SYN', kind: 'frame-denotes', from: ids[1], to: b, warrant: 'user-split', defeasible: true }, EMIT);
      }
      const e = log.append({ op: 'SYN', kind: 'frame-split', from: a, to: b, user: true,
                             warrant: metadata.warrant || 'reader-distinction' }, EMIT);
      return { ok: true, seq: e.seq };
    },

    // Undo by APPENDING (never a rewrite) — a retraction supersedes the assertion by its seq.
    retractFrame: (assertionId, reason = 'retracted') => {
      if (assertionId == null) return { ok: false, reason: 'no-assertion' };
      const e = log.append({ op: 'SEG', kind: 'retract', refSeq: assertionId, reason }, EMIT);
      return { ok: true, seq: e.seq };
    },
  };
};
